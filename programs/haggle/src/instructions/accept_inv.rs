use anchor_lang::prelude::*;

use crate::errors::HaggleError;
use crate::state::*;

#[derive(Accounts)]
pub struct AcceptInvitation<'info> {
    pub seller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"negotiation", negotiation.buyer.as_ref(), seller.key().as_ref(), &negotiation.session_id.to_le_bytes()],
        bump = negotiation.bump,
        constraint = negotiation.seller == seller.key() @ HaggleError::Unauthorized,
        constraint = negotiation.status == NegotiationStatus::Created @ HaggleError::InvalidState,
    )]
    pub negotiation: Account<'info, NegotiationState>,
}

pub fn handler(ctx: Context<AcceptInvitation>) -> Result<()> {
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < ctx.accounts.negotiation.global_deadline, HaggleError::Expired);

    let negotiation = &mut ctx.accounts.negotiation;
    negotiation.status = NegotiationStatus::Proposed;
    negotiation.last_offer_at = clock.unix_timestamp;

    Ok(())
}
