use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::HaggleError;
use crate::events::NegotiationCreated;
use crate::state::*;

#[derive(Accounts)]
#[instruction(session_id: u64, params: NegotiationParams)]
pub struct CreateNegotiation<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller pubkey, validated on accept
    pub seller: UncheckedAccount<'info>,

    #[account(
        init,
        payer = buyer,
        space = 8 + NegotiationState::INIT_SPACE,
        seeds = [b"negotiation", buyer.key().as_ref(), seller.key().as_ref(), &session_id.to_le_bytes()],
        bump,
    )]
    pub negotiation: Box<Account<'info, NegotiationState>>,

    #[account(
        init,
        payer = buyer,
        token::mint = token_mint,
        token::authority = negotiation,
        seeds = [b"vault", negotiation.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = buyer_token_account.owner == buyer.key() @ HaggleError::Unauthorized,
        constraint = buyer_token_account.mint == token_mint.key() @ HaggleError::InvalidParams,
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,

    pub token_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        constraint = !config.is_paused @ HaggleError::Paused,
    )]
    pub config: Box<Account<'info, ProtocolConfig>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateNegotiation>, session_id: u64, params: NegotiationParams) -> Result<()> {
    // Validate params
    require!(params.max_rounds > 0 && params.max_rounds <= 20, HaggleError::InvalidParams);
    require!(params.decay_rate_bps <= 1000, HaggleError::InvalidParams); // max 10%
    require!(params.response_window >= 60, HaggleError::InvalidParams); // min 1 minute
    require!(params.global_deadline_offset >= 300, HaggleError::InvalidParams); // min 5 minutes
    require!(params.escrow_amount >= 100_000, HaggleError::InvalidParams); // min ~$0.10
    require!(params.min_offer_bps >= 100 && params.min_offer_bps <= 10000, HaggleError::InvalidParams);
    require!(params.protocol_fee_bps <= 500, HaggleError::InvalidParams); // max 5%

    let clock = Clock::get()?;
    let global_deadline = clock.unix_timestamp
        .checked_add(params.global_deadline_offset)
        .ok_or(HaggleError::Overflow)?;

    // Initialize negotiation state
    let negotiation = &mut ctx.accounts.negotiation;
    negotiation.buyer = ctx.accounts.buyer.key();
    negotiation.seller = ctx.accounts.seller.key();
    negotiation.session_id = session_id;
    negotiation.status = NegotiationStatus::Created;
    negotiation.current_round = 0;
    negotiation.current_offer_amount = 0;
    negotiation.current_offer_by = Pubkey::default();
    negotiation.offer_side = OfferSide::Buyer;
    negotiation.service_hash = params.service_hash;
    negotiation.escrow_amount = params.escrow_amount;
    negotiation.effective_escrow = params.escrow_amount;
    negotiation.token_mint = ctx.accounts.token_mint.key();
    negotiation.max_rounds = params.max_rounds;
    negotiation.decay_rate_bps = params.decay_rate_bps;
    negotiation.response_window = params.response_window;
    negotiation.global_deadline = global_deadline;
    negotiation.min_offer_bps = params.min_offer_bps;
    negotiation.protocol_fee_bps = params.protocol_fee_bps;
    negotiation.zopa_enabled = params.zopa_enabled;
    negotiation.created_at = clock.unix_timestamp;
    negotiation.last_offer_at = 0;
    negotiation.settled_at = 0;
    negotiation.settled_amount = 0;
    negotiation.buyer_commitment = [0u8; 32];
    negotiation.seller_commitment = [0u8; 32];
    negotiation.zopa_phase = ZopaPhase::Skipped;
    negotiation.metadata = [0u8; 64];
    negotiation.bump = ctx.bumps.negotiation;

    // Transfer escrow from buyer to vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer_token_account.to_account_info(),
                to: ctx.accounts.escrow_vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        params.escrow_amount,
    )?;

    // Update config counter
    let config = &mut ctx.accounts.config;
    config.total_negotiations = config.total_negotiations
        .checked_add(1)
        .ok_or(HaggleError::Overflow)?;

    emit!(NegotiationCreated {
        negotiation_id: negotiation.key(),
        buyer: negotiation.buyer,
        seller: negotiation.seller,
        escrow_amount: negotiation.escrow_amount,
        token_mint: negotiation.token_mint,
        max_rounds: negotiation.max_rounds,
        decay_rate_bps: negotiation.decay_rate_bps,
        global_deadline: negotiation.global_deadline,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
