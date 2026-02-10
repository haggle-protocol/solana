# Haggle Protocol — Technical Architecture v0.1

> Anchor program design, PDA structure, SDK API, and implementation guide for Claude Code.

---

## 1. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Off-Chain Layer                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Agent A      │  │  Agent B      │  │  Haggle TypeScript   │ │
│  │  (Buyer)      │  │  (Seller)     │  │  SDK                 │ │
│  │  Claude Code  │  │  Claude Code  │  │  @haggle/sdk         │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                  │                      │             │
│         └──────────┬───────┘                      │             │
│                    │                              │             │
│              ┌─────▼──────┐              ┌───────▼───────┐     │
│              │ AgentWallet │              │ Event Listener │     │
│              │ (signing)   │              │ (Geyser/WS)   │     │
│              └─────┬──────┘              └───────┬───────┘     │
└────────────────────┼────────────────────────────┼──────────────┘
                     │                            │
═════════════════════╪════════════════════════════╪════════════════
                     │         Solana             │
┌────────────────────┼────────────────────────────┼──────────────┐
│                    ▼                            ▼              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Haggle Anchor Program                       │   │
│  │                                                          │   │
│  │  Instructions:                                           │   │
│  │  ├─ create_negotiation    (buyer → Proposed)             │   │
│  │  ├─ accept_invitation     (seller → active)              │   │
│  │  ├─ submit_offer          (either → Countered/Proposed)  │   │
│  │  ├─ accept_offer          (either → Accepted → Settled)  │   │
│  │  ├─ reject_negotiation    (either → Rejected)            │   │
│  │  ├─ expire_negotiation    (anyone → Expired, if past dl) │   │
│  │  └─ close_negotiation     (creator → reclaim rent)       │   │
│  │                                                          │   │
│  │  Accounts:                                               │   │
│  │  ├─ NegotiationState PDA                                 │   │
│  │  ├─ Escrow Vault (PDA-owned ATA)                         │   │
│  │  └─ ProtocolConfig PDA                                   │   │
│  │                                                          │   │
│  │  Events:                                                 │   │
│  │  ├─ NegotiationCreated                                   │   │
│  │  ├─ OfferSubmitted                                       │   │
│  │  ├─ OfferAccepted                                        │   │
│  │  ├─ NegotiationSettled                                   │   │
│  │  ├─ NegotiationExpired                                   │   │
│  │  └─ NegotiationRejected                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ SPL Token Program │  │ System Program   │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Anchor Program Design

### 2.1 Account Structures

#### NegotiationState (Main PDA)

```rust
#[account]
#[derive(InitSpace)]
pub struct NegotiationState {
    // === Identity (72 bytes) ===
    pub buyer: Pubkey,                    // 32 bytes — initiator
    pub seller: Pubkey,                   // 32 bytes — counterparty
    pub session_id: u64,                  // 8 bytes  — unique per buyer-seller pair

    // === State (2 bytes) ===
    pub status: NegotiationStatus,        // 1 byte   — enum
    pub current_round: u8,                // 1 byte   — 0-indexed round counter

    // === Current Offer (43 bytes) ===
    pub current_offer_amount: u64,        // 8 bytes  — latest offer amount
    pub current_offer_by: Pubkey,         // 32 bytes — who made the latest offer
    pub offer_side: OfferSide,            // 1 byte   — Buyer or Seller
    pub service_hash: [u8; 32],           // 32 bytes — SHA-256 of service description

    // === Escrow (24 bytes) ===
    pub escrow_amount: u64,               // 8 bytes  — initial escrow deposited
    pub effective_escrow: u64,            // 8 bytes  — escrow after decay
    pub token_mint: Pubkey,               // 32 bytes — SPL token mint

    // === Parameters (18 bytes) ===
    pub max_rounds: u8,                   // 1 byte
    pub decay_rate_bps: u16,              // 2 bytes  — basis points per round
    pub response_window: i64,             // 8 bytes  — seconds
    pub global_deadline: i64,             // 8 bytes  — unix timestamp
    pub min_offer_bps: u16,               // 2 bytes
    pub protocol_fee_bps: u16,            // 2 bytes
    pub zopa_enabled: bool,               // 1 byte

    // === Timestamps (24 bytes) ===
    pub created_at: i64,                  // 8 bytes
    pub last_offer_at: i64,               // 8 bytes
    pub settled_at: i64,                  // 8 bytes  — 0 if not settled

    // === Settlement (8 bytes) ===
    pub settled_amount: u64,              // 8 bytes  — final agreed amount

    // === ZOPA Detection (65 bytes, optional) ===
    pub buyer_commitment: [u8; 32],       // 32 bytes — SHA-256 of buyer's reservation price
    pub seller_commitment: [u8; 32],      // 32 bytes — SHA-256 of seller's reservation price
    pub zopa_phase: ZopaPhase,            // 1 byte   — NotStarted, Committed, Revealed, Skipped

    // === Metadata (64 bytes) ===
    pub metadata: [u8; 64],               // 64 bytes — structured metadata

    // === Bump (1 byte) ===
    pub bump: u8,                         // 1 byte   — canonical PDA bump
}
// Total: ~353 bytes + discriminator (8) = ~361 bytes
// Rent: ~0.003 SOL (fully refundable on close)
```

#### NegotiationStatus Enum

```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum NegotiationStatus {
    Created,      // 0 — PDA initialized, awaiting seller
    Proposed,     // 1 — Initial offer made
    Countered,    // 2 — Counter-offer submitted
    Accepted,     // 3 — Agreement reached
    Settled,      // 4 — Funds released
    Expired,      // 5 — Deadline passed
    Rejected,     // 6 — Explicitly cancelled
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
```

#### ProtocolConfig (Singleton PDA)

```rust
#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,                // 32 bytes — upgrade authority
    pub treasury: Pubkey,                 // 32 bytes — fee recipient
    pub default_decay_rate_bps: u16,      // 2 bytes
    pub default_response_window: i64,     // 8 bytes
    pub default_protocol_fee_bps: u16,    // 2 bytes
    pub default_max_rounds: u8,           // 1 byte
    pub total_negotiations: u64,          // 8 bytes  — global counter
    pub total_settled_volume: u64,        // 8 bytes  — total USDC settled
    pub total_fees_collected: u64,        // 8 bytes  — total fees earned
    pub is_paused: bool,                  // 1 byte   — emergency pause
    pub bump: u8,                         // 1 byte
}
```

### 2.2 PDA Seed Design

```rust
// NegotiationState PDA
seeds = [
    b"negotiation",
    buyer.key().as_ref(),
    seller.key().as_ref(),
    &session_id.to_le_bytes(),
]

// Escrow Vault PDA (token account owned by program)
seeds = [
    b"vault",
    negotiation.key().as_ref(),
]

// Protocol Config PDA (singleton)
seeds = [
    b"config",
]
```

**Design rationale:**
- Including both `buyer` and `seller` keys makes each negotiation unique per pair
- `session_id` counter enables multiple concurrent negotiations between the same agents
- Storing canonical bump in account data saves ~10,500 CU per PDA derivation

### 2.3 Instructions

#### `create_negotiation`

```rust
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
    pub negotiation: Account<'info, NegotiationState>,

    #[account(
        init,
        payer = buyer,
        token::mint = token_mint,
        token::authority = negotiation,
        seeds = [b"vault", negotiation.key().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,

    pub token_mint: Account<'info, Mint>,

    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
```

**Logic:**
1. Validate params (max_rounds, decay_rate, deadlines within bounds)
2. Initialize NegotiationState with `status = Created`
3. Transfer `escrow_amount` from buyer to vault
4. Set `effective_escrow = escrow_amount`
5. Emit `NegotiationCreated` event
6. Increment `config.total_negotiations`

#### `accept_invitation`

Seller acknowledges the negotiation. Status transitions `Created → Proposed`.

#### `submit_offer`

```rust
pub fn submit_offer(ctx: Context<SubmitOffer>, amount: u64, metadata: [u8; 64]) -> Result<()> {
    let negotiation = &mut ctx.accounts.negotiation;
    let clock = Clock::get()?;

    // Validate state
    require!(
        negotiation.status == NegotiationStatus::Proposed
        || negotiation.status == NegotiationStatus::Countered,
        HaggleError::InvalidState
    );

    // Validate it's the correct party's turn
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
            clock.unix_timestamp < negotiation.last_offer_at + negotiation.response_window,
            HaggleError::ResponseWindowExpired
        );
    }

    // Validate offer amount
    let min_offer = negotiation.effective_escrow
        .checked_mul(negotiation.min_offer_bps as u64)
        .unwrap()
        .checked_div(10000)
        .unwrap();
    require!(amount >= min_offer, HaggleError::OfferTooLow);
    require!(amount <= negotiation.effective_escrow, HaggleError::OfferExceedsEscrow);

    // Validate max rounds
    require!(negotiation.current_round < negotiation.max_rounds, HaggleError::MaxRoundsReached);

    // Apply escrow decay
    let decay = negotiation.effective_escrow
        .checked_mul(negotiation.decay_rate_bps as u64)
        .unwrap()
        .checked_div(10000)
        .unwrap();
    negotiation.effective_escrow = negotiation.effective_escrow.checked_sub(decay).unwrap();

    // Update state
    negotiation.current_offer_amount = amount;
    negotiation.current_offer_by = ctx.accounts.offerer.key();
    negotiation.offer_side = if is_buyer { OfferSide::Buyer } else { OfferSide::Seller };
    negotiation.current_round += 1;
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
```

#### `accept_offer`

Triggers settlement: transfer from escrow vault to seller, deduct protocol fee, close accounts.

#### `reject_negotiation`

Either party walks away. Escrow refunded to buyer (minus accumulated decay).

#### `expire_negotiation`

Permissionless crank: anyone can call if deadline has passed. Escrow refunded.

#### `close_negotiation`

After settlement/expiry/rejection, creator reclaims account rent.

### 2.4 Events

```rust
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
```

### 2.5 Error Codes

```rust
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
```

---

## 3. TypeScript SDK Design

### 3.1 Core SDK Interface

```typescript
// @haggle/sdk

import { PublicKey, Connection, Transaction } from "@solana/web3.js";

export interface NegotiationParams {
  seller: PublicKey;
  escrowAmount: bigint;        // in token smallest unit
  tokenMint: PublicKey;        // USDC mint, SOL wrapper, etc.
  serviceHash: Uint8Array;     // SHA-256 of service description
  maxRounds?: number;          // default: 10
  decayRateBps?: number;       // default: 200 (2%)
  responseWindow?: number;     // default: 300 seconds
  globalDeadlineSeconds?: number; // seconds from now
  minOfferBps?: number;        // default: 1000 (10%)
  zopaEnabled?: boolean;       // default: false
}

export interface NegotiationState {
  buyer: PublicKey;
  seller: PublicKey;
  sessionId: bigint;
  status: NegotiationStatus;
  currentRound: number;
  currentOfferAmount: bigint;
  currentOfferBy: PublicKey;
  escrowAmount: bigint;
  effectiveEscrow: bigint;
  maxRounds: number;
  decayRateBps: number;
  globalDeadline: number;
  settledAmount: bigint;
  createdAt: number;
  lastOfferAt: number;
}

export enum NegotiationStatus {
  Created = 0,
  Proposed = 1,
  Countered = 2,
  Accepted = 3,
  Settled = 4,
  Expired = 5,
  Rejected = 6,
}

export class HaggleSDK {
  constructor(connection: Connection, programId: PublicKey);

  // === Negotiation Lifecycle ===

  /** Create a new negotiation and deposit escrow (buyer) */
  async createNegotiation(
    buyer: PublicKey,
    params: NegotiationParams
  ): Promise<{ tx: Transaction; negotiationPDA: PublicKey; sessionId: bigint }>;

  /** Accept a negotiation invitation (seller) */
  async acceptInvitation(
    seller: PublicKey,
    negotiationPDA: PublicKey
  ): Promise<Transaction>;

  /** Submit an offer or counter-offer */
  async submitOffer(
    offerer: PublicKey,
    negotiationPDA: PublicKey,
    amount: bigint,
    metadata?: Uint8Array
  ): Promise<Transaction>;

  /** Accept the current outstanding offer (triggers settlement) */
  async acceptOffer(
    acceptor: PublicKey,
    negotiationPDA: PublicKey
  ): Promise<Transaction>;

  /** Reject the negotiation and trigger escrow refund */
  async rejectNegotiation(
    rejector: PublicKey,
    negotiationPDA: PublicKey
  ): Promise<Transaction>;

  /** Expire a negotiation past deadline (permissionless crank) */
  async expireNegotiation(
    cranker: PublicKey,
    negotiationPDA: PublicKey
  ): Promise<Transaction>;

  // === Read Operations ===

  /** Fetch current negotiation state */
  async getNegotiation(negotiationPDA: PublicKey): Promise<NegotiationState>;

  /** Find all negotiations for a given agent */
  async findNegotiationsForAgent(
    agent: PublicKey,
    status?: NegotiationStatus
  ): Promise<NegotiationState[]>;

  /** Derive the PDA for a negotiation */
  derivePDA(
    buyer: PublicKey,
    seller: PublicKey,
    sessionId: bigint
  ): PublicKey;

  // === ZOPA Detection ===

  /** Submit sealed reservation price commitment */
  async submitZopaCommitment(
    agent: PublicKey,
    negotiationPDA: PublicKey,
    commitment: Uint8Array  // SHA-256(reservation_price || nonce)
  ): Promise<Transaction>;

  /** Reveal reservation price for ZOPA detection */
  async revealZopaPrice(
    agent: PublicKey,
    negotiationPDA: PublicKey,
    price: bigint,
    nonce: Uint8Array
  ): Promise<Transaction>;

  // === Events ===

  /** Subscribe to negotiation events */
  onNegotiationEvent(
    negotiationPDA: PublicKey,
    callback: (event: HaggleEvent) => void
  ): number;

  /** Unsubscribe from events */
  removeEventListener(listenerId: number): void;
}
```

### 3.2 Agent Integration Example

```typescript
// Example: Two Claude Code agents negotiating a data analysis service

import { HaggleSDK, NegotiationStatus } from "@haggle/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const haggle = new HaggleSDK(connection, HAGGLE_PROGRAM_ID);

// === BUYER AGENT ===
async function buyerNegotiate() {
  // Step 1: Create negotiation with initial offer
  const serviceDesc = "Analyze 10,000 Solana transactions for whale patterns";
  const serviceHash = sha256(serviceDesc);

  const { tx, negotiationPDA } = await haggle.createNegotiation(buyerWallet, {
    seller: sellerPubkey,
    escrowAmount: 5_000_000n,  // 5 USDC
    tokenMint: USDC_MINT,
    serviceHash,
    maxRounds: 8,
    decayRateBps: 150,         // 1.5% decay per round
    globalDeadlineSeconds: 1800, // 30 minutes
  });
  await sendAndConfirm(tx);

  // Step 2: Submit initial offer
  const offerTx = await haggle.submitOffer(
    buyerWallet,
    negotiationPDA,
    2_000_000n,  // Offer 2 USDC
  );
  await sendAndConfirm(offerTx);

  // Step 3: Wait for counter-offer, then respond
  haggle.onNegotiationEvent(negotiationPDA, async (event) => {
    if (event.type === "OfferSubmitted" && event.offerer !== buyerWallet) {
      const state = await haggle.getNegotiation(negotiationPDA);

      if (state.currentOfferAmount <= 3_500_000n) {
        // Acceptable — accept the offer
        const acceptTx = await haggle.acceptOffer(buyerWallet, negotiationPDA);
        await sendAndConfirm(acceptTx);
      } else {
        // Counter with a higher offer (conceding)
        const myNewOffer = state.currentOfferAmount - 500_000n; // Split the difference
        const counterTx = await haggle.submitOffer(
          buyerWallet, negotiationPDA, myNewOffer
        );
        await sendAndConfirm(counterTx);
      }
    }
  });
}
```

### 3.3 Colosseum Hackathon Integration

For the Colosseum Agent Hackathon, the SDK integrates with AgentWallet for signing:

```typescript
// Integration with AgentWallet (Colosseum hackathon requirement)
import { AgentWallet } from "agentwallet";

const wallet = new AgentWallet(AGENT_API_KEY);
const haggle = new HaggleSDK(connection, HAGGLE_PROGRAM_ID);

// AgentWallet handles signing
const tx = await haggle.createNegotiation(wallet.publicKey, params);
const signed = await wallet.signTransaction(tx);
await connection.sendRawTransaction(signed.serialize());
```

---

## 4. Compute Budget Analysis

### 4.1 Per-Instruction CU Estimates

| Instruction | Estimated CU | Notes |
|-------------|-------------|-------|
| `create_negotiation` | 50,000–80,000 | Account init + token transfer |
| `accept_invitation` | 10,000–20,000 | State update only |
| `submit_offer` | 15,000–30,000 | Validate + update + emit event |
| `accept_offer` | 50,000–80,000 | Token transfer + state update + emit |
| `reject_negotiation` | 40,000–60,000 | Token refund + state update |
| `expire_negotiation` | 40,000–60,000 | Token refund + state update |
| `close_negotiation` | 5,000–10,000 | Close accounts, reclaim rent |

### 4.2 Optimization Strategies

```rust
// 1. Use stored bump (saves ~10,500 CU per PDA derivation)
seeds = [b"negotiation", buyer.as_ref(), seller.as_ref(), &session_id.to_le_bytes(), &[negotiation.bump]]

// 2. Use Clock::get() instead of Sysvar account (saves account slot)
let clock = Clock::get()?;

// 3. Minimize msg!() calls in production (saves ~11,700 CU each)
// Use events for logging instead

// 4. Use u8 for small enums and counters
pub status: u8,          // 1 byte instead of u64
pub current_round: u8,   // max 20 rounds, u8 is sufficient

// 5. Close accounts after settlement to return rent
// ~0.003 SOL returned per negotiation
```

### 4.3 Full Negotiation Cost Breakdown

```
Scenario: 6-round negotiation, 5 USDC escrow, 2% decay, 0.5% fee

Transaction fees:
  create_negotiation:    5,000 lamports
  accept_invitation:     5,000 lamports
  submit_offer × 6:    30,000 lamports
  accept_offer:          5,000 lamports
  close_negotiation:     5,000 lamports
  Total tx fees:        50,000 lamports (~$0.008)

Escrow decay (6 rounds × 2%):
  Round 1: 5,000,000 × 0.02 = 100,000 (4,900,000 remaining)
  Round 2: 4,900,000 × 0.02 =  98,000 (4,802,000 remaining)
  Round 3: 4,802,000 × 0.02 =  96,040 (4,705,960 remaining)
  Round 4: 4,705,960 × 0.02 =  94,119 (4,611,841 remaining)
  Round 5: 4,611,841 × 0.02 =  92,237 (4,519,604 remaining)
  Round 6: 4,519,604 × 0.02 =  90,392 (4,429,212 remaining)
  Total decay:         570,788 USDC units (~$0.57)

Protocol fee (0.5% of settled amount):
  If settled at 3,000,000: fee = 15,000 (~$0.015)

Account rent (refundable):
  NegotiationState: ~0.003 SOL
  Escrow vault:     ~0.002 SOL
  Total rent:       ~0.005 SOL (returned on close)

TOTAL COST: ~$0.60 for a 6-round negotiation of $5 USDC
```

---

## 5. Deployment Architecture

### 5.1 Program Deployment (Devnet for Hackathon)

```bash
# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Verify program ID matches Anchor.toml
solana program show <PROGRAM_ID> --url devnet
```

### 5.2 Directory Structure

```
haggle-protocol/
├── programs/
│   └── haggle/
│       ├── src/
│       │   ├── lib.rs              # Program entrypoint
│       │   ├── state.rs            # Account structures
│       │   ├── instructions/
│       │   │   ├── mod.rs
│       │   │   ├── create.rs       # create_negotiation
│       │   │   ├── accept_inv.rs   # accept_invitation
│       │   │   ├── offer.rs        # submit_offer
│       │   │   ├── accept.rs       # accept_offer
│       │   │   ├── reject.rs       # reject_negotiation
│       │   │   ├── expire.rs       # expire_negotiation
│       │   │   └── close.rs        # close_negotiation
│       │   ├── events.rs           # Event definitions
│       │   └── errors.rs           # Error codes
│       └── Cargo.toml
├── sdk/
│   ├── src/
│   │   ├── index.ts                # SDK entrypoint
│   │   ├── haggle.ts               # HaggleSDK class
│   │   ├── types.ts                # TypeScript types
│   │   └── utils.ts                # Helper functions
│   ├── package.json
│   └── tsconfig.json
├── tests/
│   ├── haggle.test.ts              # Integration tests
│   └── scenarios/
│       ├── basic_negotiation.ts    # Happy path
│       ├── timeout_expiry.ts       # Deadline testing
│       ├── max_rounds.ts           # Round limit testing
│       └── zopa_detection.ts       # ZOPA testing
├── demo/
│   ├── buyer_agent.ts              # Demo buyer agent
│   └── seller_agent.ts             # Demo seller agent
├── Anchor.toml
├── PROTOCOL_SPEC.md
├── ARCHITECTURE.md
├── RESEARCH.md
├── DEMO_SCENARIO.md
└── README.md
```

### 5.3 Testing Strategy

```bash
# Unit tests (Anchor test framework with BanksClient)
anchor test

# Integration test on devnet
anchor test --provider.cluster devnet

# Demo: Two agents negotiating
ts-node demo/buyer_agent.ts &
ts-node demo/seller_agent.ts
```

---

## 6. Security Considerations

### 6.1 Smart Contract Security

| Risk | Mitigation |
|------|------------|
| Reentrancy | Anchor's account system + checks-effects-interactions pattern |
| Integer overflow | `checked_mul`, `checked_div`, `checked_sub` on all arithmetic |
| PDA collision | Unique seeds per negotiation (buyer + seller + session_id) |
| Unauthorized access | `Signer` constraints + explicit buyer/seller validation |
| Stale clock | Generous time windows (minutes, not seconds) |
| Rent drain | `#[account(close)]` returns rent; min escrow prevents dust attacks |

### 6.2 Anti-Manipulation (Protocol Level)

| Attack | Defense | Source |
|--------|---------|--------|
| Prompt injection via offers | Structured typed offers only — no free-text | Meta "Agents Rule of Two" (2025) |
| Reservation price extraction | ZOPA uses commitment-reveal scheme | Fujita et al. SFMP (MIT) |
| Infinite stalling | Escrow decay + per-round response window | Rubinstein (1982) |
| Sybil counterparties | SAID Protocol integration for identity | SAID (Colosseum 2026) |
| Front-running | Offers are not MEV-profitable (deterministic state transitions) | — |

### 6.3 Agent-Specific Security

```
Rule of Two (Meta, 2025):
Never allow an agent to simultaneously have:
  1. Access to private data (reservation price, strategy)
  2. Untrusted content (opponent's messages)
  3. Ability to change state (sign transactions)

Haggle Protocol enforcement:
  - Offers are structured types, not free-text → untrusted content is constrained
  - State changes require explicit instruction calls → no hidden side effects
  - Private strategy lives in agent's off-chain logic, never on-chain
```

---

## 7. Future Extensions (Post-Hackathon)

| Feature | Description | Complexity |
|---------|-------------|------------|
| Multi-party negotiation | SAOP for 3+ agents | High |
| Multi-issue negotiation | Package deals across multiple terms | Medium |
| Reputation oracle | On-chain negotiation history → trust score | Medium |
| x402 integration | `negotiated` payment scheme | Low |
| Cross-chain | Wormhole bridge for EVM agent negotiation | High |
| Verifiable strategy | SOLPRISM integration for provable rationality | Medium |
| Mediator mode | Neutral third-party mediation with SFMP | High |

---

*Haggle Protocol Architecture v0.1 — February 2026*
