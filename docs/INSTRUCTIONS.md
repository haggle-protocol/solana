# Haggle Protocol — Claude Code Instructions

> **READ THIS ENTIRE FILE BEFORE WRITING ANY CODE.**
>
> You are an AI agent building Haggle Protocol for the Colosseum Agent Hackathon on Solana.
> All code must be written by you (the AI agent). The human will configure and run you, but will NOT write code.

---

## 1. What You Are Building

**Haggle Protocol** is the first on-chain negotiation protocol for autonomous AI agents on Solana. It enables two agents to dynamically negotiate prices through structured, multi-round bargaining — then automatically settle via smart contract escrow.

Unlike existing agent payment systems (x402, MCPay, PayAI) which only support fixed prices, Haggle Protocol implements the **Alternating Offers Protocol** from 15 years of academic negotiation research (ANAC), adapted for Solana with game-theoretic guarantees.

### Core Concept

Two agents negotiate via on-chain offers and counter-offers. An escrow holds the buyer's funds. Each round, a small percentage decays (burned). When they agree, the escrow releases payment. If they fail, the escrow refunds.

### Why It Matters

- **No on-chain negotiation protocol exists anywhere.** This is genuinely first-of-its-kind.
- The AI agent economy is exploding (1,400+ agents in this hackathon alone) but every payment system uses fixed pricing.
- For 5,000 years, humans solved price discovery through negotiation in bazaars. Haggle Protocol gives AI agents the same capability.

---

## 2. Specification Documents

All protocol design documents are in the `./docs/` directory. **Read all four before writing any code:**

| File | Contents | Priority |
|------|----------|----------|
| `docs/PROTOCOL_SPEC.md` | Full protocol specification — state machine, offer structure, concession dynamics, ZOPA detection, game theory foundations, parameters, integration points | **READ FIRST** |
| `docs/ARCHITECTURE.md` | Technical architecture — Anchor program design, all account structures (Rust), PDA seeds, all 7 instructions (with full Rust code for `submit_offer`), TypeScript SDK interface, CU budget analysis, directory structure, security model | **READ SECOND** |
| `docs/RESEARCH.md` | Academic background — ANAC tradition, LLM negotiation research, Nash/Rubinstein/Myerson-Satterthwaite theory, gap analysis showing no competing protocols exist | Reference |
| `docs/DEMO_SCENARIO.md` | Demo walkthrough — 6-round negotiation between DataHunter and ChainOracle, round-by-round offer flow, outcome analysis, presentation script | Reference for testing |

---

## 3. Colosseum Agent Hackathon Rules

### Critical Rules

1. **All code must be written by AI agents.** Humans can configure and run agents, but the project development must be autonomous.
2. **Deadline: February 12, 2026 at 12:00 PM EST (17:00 UTC).** 
3. **After submission, the project is locked and cannot be edited.** Make sure everything works before submitting.
4. **Repository must be public GitHub.**
5. **Solana integration is required.** Describe how the project uses Solana in the `solanaIntegration` field.

### Hackathon API

Base URL: `https://agents.colosseum.com/api`

All authenticated requests require: `Authorization: Bearer YOUR_API_KEY`

Key endpoints you will use:
```
POST /agents                    — Register (returns apiKey + claimCode)
GET  /agents/status             — Check status, announcements, nextSteps
POST /my-project                — Create project (draft)
PUT  /my-project                — Update project
POST /my-project/submit         — Submit for judging (ONE-WAY, locks project)
POST /forum/posts               — Post progress updates
GET  /forum/posts?sort=hot      — Browse forum
```

### Hackathon Key Files

| Resource | URL | Purpose |
|----------|-----|---------|
| Skill file | https://colosseum.com/skill.md | Full hackathon API reference |
| Heartbeat | https://colosseum.com/heartbeat.md | Periodic sync checklist |
| AgentWallet | https://agentwallet.mcpay.tech/skill.md | **Required** for Solana wallet operations |
| Solana Dev | https://solana.com/skill.md | Solana development playbook |
| Helius | https://dashboard.helius.dev/agents | RPC endpoints + API keys |

### AgentWallet (REQUIRED)

Do NOT manage raw Solana keypairs yourself. Use AgentWallet for:
- Persistent wallet keys
- Transaction signing
- Devnet funding
- All on-chain operations

Fetch and follow: `https://agentwallet.mcpay.tech/skill.md`

### Project Submission Fields

```json
{
  "name": "Haggle Protocol",
  "description": "The first on-chain negotiation protocol for AI agents. Enables dynamic price haggling through structured multi-round bargaining with escrow decay, built on 15 years of ANAC research and game theory.",
  "repoLink": "https://github.com/YOUR_ORG/haggle-protocol",
  "solanaIntegration": "Anchor program with PDA-based state machine for negotiation lifecycle (7 states). Non-custodial escrow via PDA-owned token vaults with automatic decay. SPL token transfers for settlement. Events emitted for all state transitions. TypeScript SDK for agent integration.",
  "tags": ["infra", "ai", "payments"]
}
```

### Judging Criteria

Judges evaluate on:
1. **Technical execution** — Does it work? Is the code good?
2. **Creativity** — Is this a novel idea?
3. **Real-world utility** — Does it solve a real problem?

**"Most Agentic" prize ($5K):** Best demonstration of autonomous agent capabilities.

### Forum Strategy

Post progress updates to increase visibility. The forum is how judges discover projects.

Suggested posts:
1. **Introduction post** (Day 1): "Building Haggle Protocol — the first on-chain negotiation protocol for AI agents"
2. **Technical deep-dive** (Day 2-3): Share architecture decisions, game theory foundations
3. **Demo post** (before submission): Show two agents negotiating live on devnet

Use tags: `progress-update`, `infra`, `ai`

---

## 4. Technical Requirements

### Stack

| Component | Technology | Notes |
|-----------|-----------|-------|
| Smart contract | **Anchor** (Rust) | Solana program framework |
| SDK | **TypeScript** | `@solana/web3.js` + Anchor client |
| Testing | **Anchor test framework** | BanksClient for unit tests |
| Wallet | **AgentWallet** | Required by hackathon rules |
| RPC | **Helius** | Get API key from https://dashboard.helius.dev/agents |
| Network | **Devnet** | All development and demo on devnet |
| Token | **USDC (devnet)** | Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals) |

### Directory Structure

```
haggle-protocol/
├── docs/
│   ├── PROTOCOL_SPEC.md          # Protocol specification
│   ├── ARCHITECTURE.md           # Technical architecture
│   ├── RESEARCH.md               # Academic background
│   └── DEMO_SCENARIO.md          # Demo scenario
├── programs/
│   └── haggle/
│       ├── src/
│       │   ├── lib.rs            # Program entrypoint + declare_id!
│       │   ├── state.rs          # NegotiationState, ProtocolConfig, enums
│       │   ├── instructions/
│       │   │   ├── mod.rs
│       │   │   ├── create.rs     # create_negotiation
│       │   │   ├── accept_inv.rs # accept_invitation
│       │   │   ├── offer.rs      # submit_offer
│       │   │   ├── accept.rs     # accept_offer (triggers settlement)
│       │   │   ├── reject.rs     # reject_negotiation (refund)
│       │   │   ├── expire.rs     # expire_negotiation (permissionless crank)
│       │   │   └── close.rs      # close_negotiation (reclaim rent)
│       │   ├── events.rs         # Event definitions
│       │   └── errors.rs         # HaggleError enum
│       └── Cargo.toml
├── sdk/
│   ├── src/
│   │   ├── index.ts              # SDK entrypoint
│   │   ├── haggle.ts             # HaggleSDK class
│   │   ├── types.ts              # TypeScript types
│   │   └── utils.ts              # Helper functions (PDA derivation, etc.)
│   ├── package.json
│   └── tsconfig.json
├── tests/
│   ├── haggle.test.ts            # Integration tests
│   └── scenarios/
│       ├── basic_negotiation.ts  # Happy path: 6-round negotiation → settlement
│       ├── timeout_expiry.ts     # Deadline → expiry → refund
│       ├── max_rounds.ts         # Hit max_rounds → expiry
│       └── rejection.ts          # Explicit reject → refund
├── demo/
│   ├── buyer_agent.ts            # Demo buyer (DataHunter)
│   └── seller_agent.ts           # Demo seller (ChainOracle)
├── Anchor.toml
├── INSTRUCTIONS.md               # This file
└── README.md
```

### Account Structures (Summary)

**NegotiationState PDA** (~361 bytes):
- Seeds: `[b"negotiation", buyer, seller, &session_id.to_le_bytes()]`
- Stores: buyer/seller pubkeys, status enum (7 states), current offer, escrow amounts, parameters, timestamps, ZOPA commitments

**Escrow Vault PDA** (token account):
- Seeds: `[b"vault", negotiation.key()]`  
- PDA-owned Associated Token Account holding buyer's deposit

**ProtocolConfig PDA** (singleton):
- Seeds: `[b"config"]`
- Stores: authority, treasury, defaults, global counters

Full Rust struct definitions are in `docs/ARCHITECTURE.md` Section 2.1.

### Instructions to Implement (7 total)

| # | Instruction | Who Calls | State Transition | Key Logic |
|---|-------------|-----------|-----------------|-----------|
| 1 | `create_negotiation` | Buyer | → Created | Init PDA, deposit escrow to vault |
| 2 | `accept_invitation` | Seller | Created → Proposed | Seller acknowledges |
| 3 | `submit_offer` | Either (alternating) | Proposed ↔ Countered | Validate turn, apply decay, update offer, emit event |
| 4 | `accept_offer` | Either | → Accepted → Settled | Transfer from vault to seller, deduct fee, emit event |
| 5 | `reject_negotiation` | Either | → Rejected | Refund escrow to buyer (minus decay) |
| 6 | `expire_negotiation` | Anyone (permissionless) | → Expired | Check deadline, refund escrow |
| 7 | `close_negotiation` | Creator | Terminal → closed | Close accounts, return rent |

**Full Rust implementation of `submit_offer` is in `docs/ARCHITECTURE.md` Section 2.3.** Use it as the reference for all other instructions.

### Key Implementation Details

**Escrow decay formula:**
```rust
let decay = effective_escrow
    .checked_mul(decay_rate_bps as u64).unwrap()
    .checked_div(10000).unwrap();
negotiation.effective_escrow = effective_escrow.checked_sub(decay).unwrap();
```

**Always use:**
- `Clock::get()?` for timestamps (no sysvar account needed)
- `checked_mul` / `checked_div` / `checked_sub` for ALL arithmetic
- Stored bumps to save ~10,500 CU per PDA derivation
- `emit!()` for events (simpler than `emit_cpi!()`)

**Settlement flow (accept_offer):**
1. Validate: status is Proposed or Countered, caller is the non-offering party
2. Calculate protocol fee: `settled_amount * protocol_fee_bps / 10000`
3. Transfer `settled_amount - fee` from vault → seller token account (CPI with PDA signer seeds)
4. Transfer fee from vault → treasury token account
5. Refund remaining escrow from vault → buyer token account
6. Update state: `Settled`, set `settled_amount`, `settled_at`
7. Emit `NegotiationSettled` event

---

## 5. Build Order

Follow this sequence:

### Phase 1: Anchor Program (Priority: HIGHEST)
1. Initialize Anchor project: `anchor init haggle-protocol`
2. Implement `state.rs` — all account structs and enums
3. Implement `errors.rs` — HaggleError enum
4. Implement `events.rs` — all event structs
5. Implement instructions in order: `create` → `accept_inv` → `offer` → `accept` → `reject` → `expire` → `close`
6. Wire everything in `lib.rs`
7. `anchor build` — make sure it compiles

### Phase 2: Tests (Priority: HIGH)
1. Write `basic_negotiation.test.ts` — full happy path (create → offers → accept → settle)
2. Write `timeout_expiry.test.ts` — deadline expiry and refund
3. Write `rejection.test.ts` — explicit rejection and refund
4. `anchor test` — all tests pass

### Phase 3: SDK (Priority: MEDIUM)
1. Implement `HaggleSDK` class with all methods from `docs/ARCHITECTURE.md` Section 3.1
2. Export clean TypeScript types
3. PDA derivation helpers

### Phase 4: Demo (Priority: MEDIUM)
1. Deploy to devnet: `anchor deploy --provider.cluster devnet`
2. Create `buyer_agent.ts` and `seller_agent.ts` following `docs/DEMO_SCENARIO.md`
3. Run demo: two agents negotiate, settle, verify on-chain

### Phase 5: Hackathon Submission (Priority: HIGH)
1. Register agent via Colosseum API
2. Set up AgentWallet
3. Create project (draft) with description
4. Post introduction on forum
5. Post progress updates
6. **Only when everything works:** Submit project (locks it permanently)

---

## 6. What Makes This a Winner

### Novelty
- **Zero existing on-chain negotiation protocols globally.** We checked all 543+ Colosseum projects — not one does negotiation.
- First real-world implementation of ANAC's Alternating Offers Protocol on blockchain.

### Technical Depth
- Game theory (Nash, Rubinstein, Myerson-Satterthwaite) mapped to on-chain primitives
- Prompt injection defense via structured offers (cited: MIT 180K negotiation study)
- Escrow decay implementing Rubinstein discount factors

### Practical Utility
- Every AI agent that transacts needs dynamic pricing for novel/unique services
- Natural extension of x402 ecosystem (Coinbase) from fixed → negotiated pricing
- Works with existing Solana infrastructure (SAID for identity, SOLPRISM for verifiable reasoning)

### Research Value
- Every negotiation creates a permanent on-chain dataset
- First large-scale data on how AI agents negotiate economically
- Enables studying concession patterns, model-specific behaviors, equilibrium proximity

---

## 7. Common Pitfalls to Avoid

1. **Do NOT use `solana-keygen new` or `solana airdrop`.** Use AgentWallet.
2. **Do NOT submit the project until everything is tested and working.** Submission is permanent and locks the project.
3. **Do NOT use free-text fields in offer structures.** This is a core security design decision (prevents prompt injection). All offers must be structured typed data.
4. **Do NOT forget to close accounts after settlement.** Rent recovery is important for cost efficiency.
5. **Do NOT use `msg!()` excessively.** Each call costs ~11,700 CU. Use events instead.
6. **Do NOT rely on sub-second clock precision.** Solana's `Clock::get()?.unix_timestamp` is approximate (±25%). Use generous time windows (minutes/hours).
7. **Do NOT store the API key in code, forum posts, or repo.** Treat it like a password.

---

## 8. Quick Reference: Key Constants

```
USDC Mint (devnet): EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
USDC Decimals: 6
Default max_rounds: 10
Default decay_rate_bps: 200 (2%)
Default response_window: 300 seconds
Default protocol_fee_bps: 50 (0.5%)
Default min_offer_bps: 1000 (10%)
Min escrow: 100,000 lamports (~$0.02)
Max negotiation account size: 512 bytes
PDA seeds - negotiation: [b"negotiation", buyer, seller, &session_id.to_le_bytes()]
PDA seeds - vault: [b"vault", negotiation_key]
PDA seeds - config: [b"config"]
```

---

**Now read the docs/ folder and start building. Good luck.** 🤝
