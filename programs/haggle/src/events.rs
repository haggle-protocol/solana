use anchor_lang::prelude::*;

#[event]
pub struct NegotiationCreated {
    pub negotiation_id: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub escrow_amount: u64,
    pub token_mint: Pubkey,
    pub max_rounds: u8,
    pub decay_rate_bps: u16,
    pub global_deadline: i64,
    pub timestamp: i64,
}

#[event]
pub struct OfferSubmitted {
    pub negotiation_id: Pubkey,
    pub offerer: Pubkey,
    pub amount: u64,
    pub round: u8,
    pub effective_escrow: u64,
    pub timestamp: i64,
}

#[event]
pub struct NegotiationSettled {
    pub negotiation_id: Pubkey,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub settled_amount: u64,
    pub total_rounds: u8,
    pub protocol_fee: u64,
    pub escrow_decay_total: u64,
    pub timestamp: i64,
}

#[event]
pub struct NegotiationExpired {
    pub negotiation_id: Pubkey,
    pub refund_amount: u64,
    pub rounds_completed: u8,
    pub timestamp: i64,
}

#[event]
pub struct NegotiationRejected {
    pub negotiation_id: Pubkey,
    pub rejected_by: Pubkey,
    pub refund_amount: u64,
    pub rounds_completed: u8,
    pub timestamp: i64,
}
