use anchor_lang::prelude::*;

use crate::errors::HaggleError;
use crate::events::OfferSubmitted;
use crate::state::*;

#[derive(Accounts)]
pub struct SubmitOffer<'info> {
    pub offerer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"negotiation", negotiation.buyer.as_ref(), negotiation.seller.as_ref(), &negotiation.session_id.to_le_bytes()],
        bump = negotiation.bump,
    )]
    pub negotiation: Account<'info, NegotiationState>,
}

pub fn handler(ctx: Context<SubmitOffer>, amount: u64, metadata: [u8; 64]) -> Result<()> {
    let negotiation = &mut ctx.accounts.negotiation;
    let clock = Clock::get()?;

    // Validate state
    require!(
        negotiation.status == NegotiationStatus::Proposed
            || negotiation.status == NegotiationStatus::Countered,
        HaggleError::InvalidState
    );

    // Validate it's the correct party
    let is_buyer = ctx.accounts.offerer.key() == negotiation.buyer;
    let is_seller = ctx.accounts.offerer.key() == negotiation.seller;
    require!(is_buyer || is_seller, HaggleError::Unauthorized);

    // Enforce alternating turns
    if negotiation.current_round > 0 {
        let expected_side = if negotiation.offer_side == OfferSide::Buyer {
            OfferSide::Seller
        } else {
            OfferSide::Buyer
        };
        require!(
            (is_buyer && expected_side == OfferSide::Buyer)
                || (is_seller && expected_side == OfferSide::Seller),
            HaggleError::NotYourTurn
        );
    }

    // Validate deadline
    require!(clock.unix_timestamp < negotiation.global_deadline, HaggleError::Expired);

    // Validate response window
    if negotiation.last_offer_at > 0 {
        require!(
            clock.unix_timestamp < negotiation.last_offer_at
                .checked_add(negotiation.response_window)
                .ok_or(HaggleError::Overflow)?,
            HaggleError::ResponseWindowExpired
        );
    }

    // Validate max rounds
    require!(negotiation.current_round < negotiation.max_rounds, HaggleError::MaxRoundsReached);

    // Apply escrow decay
    let decay = negotiation.effective_escrow
        .checked_mul(negotiation.decay_rate_bps as u64)
        .ok_or(HaggleError::Overflow)?
        .checked_div(10000)
        .ok_or(HaggleError::Overflow)?;
    negotiation.effective_escrow = negotiation.effective_escrow
        .checked_sub(decay)
        .ok_or(HaggleError::Overflow)?;

    // Validate offer amount
    let min_offer = negotiation.effective_escrow
        .checked_mul(negotiation.min_offer_bps as u64)
        .ok_or(HaggleError::Overflow)?
        .checked_div(10000)
        .ok_or(HaggleError::Overflow)?;
    require!(amount >= min_offer, HaggleError::OfferTooLow);
    require!(amount <= negotiation.effective_escrow, HaggleError::OfferExceedsEscrow);

    // Update state
    negotiation.current_offer_amount = amount;
    negotiation.current_offer_by = ctx.accounts.offerer.key();
    negotiation.offer_side = if is_buyer { OfferSide::Buyer } else { OfferSide::Seller };
    negotiation.current_round = negotiation.current_round
        .checked_add(1)
        .ok_or(HaggleError::Overflow)?;
    negotiation.last_offer_at = clock.unix_timestamp;
    negotiation.metadata = metadata;

    negotiation.status = if is_buyer {
        NegotiationStatus::Proposed
    } else {
        NegotiationStatus::Countered
    };

    emit!(OfferSubmitted {
        negotiation_id: negotiation.key(),
        offerer: ctx.accounts.offerer.key(),
        amount,
        round: negotiation.current_round,
        effective_escrow: negotiation.effective_escrow,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
