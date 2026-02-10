use anchor_lang::prelude::*;

#[error_code]
pub enum HaggleError {
    #[msg("Invalid negotiation state for this operation")]
    InvalidState,
    #[msg("Not authorized to perform this action")]
    Unauthorized,
    #[msg("Not your turn to make an offer")]
    NotYourTurn,
    #[msg("Negotiation has expired")]
    Expired,
    #[msg("Response window has expired")]
    ResponseWindowExpired,
    #[msg("Offer amount too low")]
    OfferTooLow,
    #[msg("Offer exceeds effective escrow")]
    OfferExceedsEscrow,
    #[msg("Maximum rounds reached")]
    MaxRoundsReached,
    #[msg("Invalid parameters")]
    InvalidParams,
    #[msg("Protocol is paused")]
    Paused,
    #[msg("ZOPA commitment mismatch")]
    ZopaCommitmentMismatch,
    #[msg("No ZOPA exists — buyer max < seller min")]
    NoZopa,
    #[msg("Arithmetic overflow")]
    Overflow,
}
