use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::HaggleError;
use crate::events::NegotiationSettled;
use crate::state::*;

#[derive(Accounts)]
pub struct AcceptOffer<'info> {
    pub acceptor: Signer<'info>,

    #[account(
        mut,
        seeds = [b"negotiation", negotiation.buyer.as_ref(), negotiation.seller.as_ref(), &negotiation.session_id.to_le_bytes()],
        bump = negotiation.bump,
    )]
    pub negotiation: Box<Account<'info, NegotiationState>>,

    #[account(
        mut,
        seeds = [b"vault", negotiation.key().as_ref()],
        bump,
        constraint = escrow_vault.mint == negotiation.token_mint @ HaggleError::InvalidParams,
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = seller_token_account.owner == negotiation.seller @ HaggleError::InvalidParams,
        constraint = seller_token_account.mint == negotiation.token_mint @ HaggleError::InvalidParams,
    )]
    pub seller_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = treasury_token_account.owner == config.treasury @ HaggleError::InvalidParams,
        constraint = treasury_token_account.mint == negotiation.token_mint @ HaggleError::InvalidParams,
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == negotiation.buyer @ HaggleError::InvalidParams,
        constraint = buyer_token_account.mint == negotiation.token_mint @ HaggleError::InvalidParams,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<AcceptOffer>) -> Result<()> {
    let negotiation = &ctx.accounts.negotiation;
    let clock = Clock::get()?;

    // Validate state
    require!(
        negotiation.status == NegotiationStatus::Proposed
            || negotiation.status == NegotiationStatus::Countered,
        HaggleError::InvalidState
    );

    // Validate acceptor is the non-offering party
    let is_buyer = ctx.accounts.acceptor.key() == negotiation.buyer;
    let is_seller = ctx.accounts.acceptor.key() == negotiation.seller;
    require!(is_buyer || is_seller, HaggleError::Unauthorized);

    // Acceptor must NOT be the one who made the current offer
    require!(
        ctx.accounts.acceptor.key() != negotiation.current_offer_by,
        HaggleError::Unauthorized
    );

    // Validate not expired
    require!(clock.unix_timestamp < negotiation.global_deadline, HaggleError::Expired);

    let settled_amount = negotiation.current_offer_amount;

    // Calculate protocol fee
    let protocol_fee = settled_amount
        .checked_mul(negotiation.protocol_fee_bps as u64)
        .ok_or(HaggleError::Overflow)?
        .checked_div(10000)
        .ok_or(HaggleError::Overflow)?;

    let seller_payment = settled_amount
        .checked_sub(protocol_fee)
        .ok_or(HaggleError::Overflow)?;

    // Calculate refund (remaining escrow after settled + fee)
    let vault_balance = ctx.accounts.escrow_vault.amount;
    let refund_amount = vault_balance
        .checked_sub(settled_amount)
        .ok_or(HaggleError::Overflow)?;

    // PDA signer seeds
    let buyer_key = negotiation.buyer;
    let seller_key = negotiation.seller;
    let session_bytes = negotiation.session_id.to_le_bytes();
    let bump = negotiation.bump;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"negotiation",
        buyer_key.as_ref(),
        seller_key.as_ref(),
        &session_bytes,
        &[bump],
    ]];

    // Transfer payment to seller
    if seller_payment > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.seller_token_account.to_account_info(),
                    authority: ctx.accounts.negotiation.to_account_info(),
                },
                signer_seeds,
            ),
            seller_payment,
        )?;
    }

    // Transfer fee to treasury
    if protocol_fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.negotiation.to_account_info(),
                },
                signer_seeds,
            ),
            protocol_fee,
        )?;
    }

    // Refund remaining to buyer
    if refund_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_vault.to_account_info(),
                    to: ctx.accounts.buyer_token_account.to_account_info(),
                    authority: ctx.accounts.negotiation.to_account_info(),
                },
                signer_seeds,
            ),
            refund_amount,
        )?;
    }

    // Update state
    let escrow_decay_total = negotiation.escrow_amount
        .checked_sub(negotiation.effective_escrow)
        .ok_or(HaggleError::Overflow)?;
    let total_rounds = negotiation.current_round;

    let negotiation = &mut ctx.accounts.negotiation;
    negotiation.status = NegotiationStatus::Settled;
    negotiation.settled_amount = settled_amount;
    negotiation.settled_at = clock.unix_timestamp;

    // Update config
    let config = &mut ctx.accounts.config;
    config.total_settled_volume = config.total_settled_volume
        .checked_add(settled_amount)
        .ok_or(HaggleError::Overflow)?;
    config.total_fees_collected = config.total_fees_collected
        .checked_add(protocol_fee)
        .ok_or(HaggleError::Overflow)?;

    emit!(NegotiationSettled {
        negotiation_id: ctx.accounts.negotiation.key(),
        buyer: buyer_key,
        seller: seller_key,
        settled_amount,
        total_rounds,
        protocol_fee,
        escrow_decay_total,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
