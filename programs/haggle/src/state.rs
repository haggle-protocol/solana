use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct NegotiationState {
    // === Identity (72 bytes) ===
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub session_id: u64,

    // === State (2 bytes) ===
    pub status: NegotiationStatus,
    pub current_round: u8,

    // === Current Offer (73 bytes) ===
    pub current_offer_amount: u64,
    pub current_offer_by: Pubkey,
    pub offer_side: OfferSide,
    pub service_hash: [u8; 32],

    // === Escrow (48 bytes) ===
    pub escrow_amount: u64,
    pub effective_escrow: u64,
    pub token_mint: Pubkey,

    // === Parameters (22 bytes) ===
    pub max_rounds: u8,
    pub decay_rate_bps: u16,
    pub response_window: i64,
    pub global_deadline: i64,
    pub min_offer_bps: u16,
    pub protocol_fee_bps: u16,
    pub zopa_enabled: bool,

    // === Timestamps (24 bytes) ===
    pub created_at: i64,
    pub last_offer_at: i64,
    pub settled_at: i64,

    // === Settlement (8 bytes) ===
    pub settled_amount: u64,

    // === ZOPA Detection (65 bytes) ===
    pub buyer_commitment: [u8; 32],
    pub seller_commitment: [u8; 32],
    pub zopa_phase: ZopaPhase,

    // === Metadata (64 bytes) ===
    pub metadata: [u8; 64],

    // === Bump (1 byte) ===
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub default_decay_rate_bps: u16,
    pub default_response_window: i64,
    pub default_protocol_fee_bps: u16,
    pub default_max_rounds: u8,
    pub total_negotiations: u64,
    pub total_settled_volume: u64,
    pub total_fees_collected: u64,
    pub is_paused: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum NegotiationStatus {
    Created,
    Proposed,
    Countered,
    Accepted,
    Settled,
    Expired,
    Rejected,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OfferSide {
    Buyer,
    Seller,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum ZopaPhase {
    NotStarted,
    BuyerCommitted,
    BothCommitted,
    Revealed,
    Skipped,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct NegotiationParams {
    pub escrow_amount: u64,
    pub service_hash: [u8; 32],
    pub max_rounds: u8,
    pub decay_rate_bps: u16,
    pub response_window: i64,
    pub global_deadline_offset: i64,
    pub min_offer_bps: u16,
    pub protocol_fee_bps: u16,
    pub zopa_enabled: bool,
}
