use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::HaggleError;
use crate::events::NegotiationExpired;
use crate::state::*;

#[derive(Accounts)]
pub struct ExpireNegotiation<'info> {
    /// CHECK: Anyone can crank expiry (permissionless)
    pub cranker: Signer<'info>,

    #[account(
        mut,
        seeds = [b"negotiation", negotiation.buyer.as_ref(), negotiation.seller.as_ref(), &negotiation.session_id.to_le_bytes()],
        bump = negotiation.bump,
    )]
    pub negotiation: Account<'info, NegotiationState>,

    #[account(
        mut,
        seeds = [b"vault", negotiation.key().as_ref()],
        bump,
        constraint = escrow_vault.mint == negotiation.token_mint @ HaggleError::InvalidParams,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == negotiation.buyer @ HaggleError::InvalidParams,
        constraint = buyer_token_account.mint == negotiation.token_mint @ HaggleError::InvalidParams,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ExpireNegotiation>) -> Result<()> {
    let negotiation = &ctx.accounts.negotiation;
    let clock = Clock::get()?;

    // Validate state - can expire from Created, Proposed, or Countered
    require!(
        negotiation.status == NegotiationStatus::Created
            || negotiation.status == NegotiationStatus::Proposed
            || negotiation.status == NegotiationStatus::Countered,
        HaggleError::InvalidState
    );

    // Validate deadline has passed
    require!(clock.unix_timestamp >= negotiation.global_deadline, HaggleError::InvalidState);

    // Refund remaining escrow to buyer
    let refund_amount = ctx.accounts.escrow_vault.amount;

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

    let rounds_completed = negotiation.current_round;
    let negotiation = &mut ctx.accounts.negotiation;
    negotiation.status = NegotiationStatus::Expired;

    emit!(NegotiationExpired {
        negotiation_id: ctx.accounts.negotiation.key(),
        refund_amount,
        rounds_completed,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
