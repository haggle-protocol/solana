use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount};

use crate::errors::HaggleError;
use crate::state::*;

#[derive(Accounts)]
pub struct CloseNegotiation<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"negotiation", negotiation.buyer.as_ref(), negotiation.seller.as_ref(), &negotiation.session_id.to_le_bytes()],
        bump = negotiation.bump,
        constraint = negotiation.buyer == creator.key() @ HaggleError::Unauthorized,
        close = creator,
    )]
    pub negotiation: Account<'info, NegotiationState>,

    #[account(
        mut,
        seeds = [b"vault", negotiation.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<CloseNegotiation>) -> Result<()> {
    let negotiation = &ctx.accounts.negotiation;

    // Can only close terminal states
    require!(
        negotiation.status == NegotiationStatus::Settled
            || negotiation.status == NegotiationStatus::Expired
            || negotiation.status == NegotiationStatus::Rejected,
        HaggleError::InvalidState
    );

    // Close the vault token account
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

    token::close_account(CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        CloseAccount {
            account: ctx.accounts.escrow_vault.to_account_info(),
            destination: ctx.accounts.creator.to_account_info(),
            authority: ctx.accounts.negotiation.to_account_info(),
        },
        signer_seeds,
    ))?;

    Ok(())
}
