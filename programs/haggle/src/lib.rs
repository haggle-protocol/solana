use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("DRXGcVHj1GZSc7wD4LTnrM8RJ1shWH93s1zKCXtJtGbq");

#[program]
pub mod haggle {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        treasury: Pubkey,
        default_decay_rate_bps: u16,
        default_response_window: i64,
        default_protocol_fee_bps: u16,
        default_max_rounds: u8,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.default_decay_rate_bps = default_decay_rate_bps;
        config.default_response_window = default_response_window;
        config.default_protocol_fee_bps = default_protocol_fee_bps;
        config.default_max_rounds = default_max_rounds;
        config.total_negotiations = 0;
        config.total_settled_volume = 0;
        config.total_fees_collected = 0;
        config.is_paused = false;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn create_negotiation(
        ctx: Context<CreateNegotiation>,
        session_id: u64,
        params: NegotiationParams,
    ) -> Result<()> {
        super::instructions::create::handler(ctx, session_id, params)
    }

    pub fn accept_invitation(ctx: Context<AcceptInvitation>) -> Result<()> {
        super::instructions::accept_inv::handler(ctx)
    }

    pub fn submit_offer(ctx: Context<SubmitOffer>, amount: u64, metadata: [u8; 64]) -> Result<()> {
        super::instructions::offer::handler(ctx, amount, metadata)
    }

    pub fn accept_offer(ctx: Context<AcceptOffer>) -> Result<()> {
        super::instructions::accept::handler(ctx)
    }

    pub fn reject_negotiation(ctx: Context<RejectNegotiation>) -> Result<()> {
        super::instructions::reject::handler(ctx)
    }

    pub fn expire_negotiation(ctx: Context<ExpireNegotiation>) -> Result<()> {
        super::instructions::expire::handler(ctx)
    }

    pub fn close_negotiation(ctx: Context<CloseNegotiation>) -> Result<()> {
        super::instructions::close::handler(ctx)
    }
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}
