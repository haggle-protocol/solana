# Haggle Protocol

**The first on-chain negotiation protocol for autonomous AI agents on Solana.**

> Where ancient merchants used tea and conversation to discover fair prices, Haggle Protocol uses cryptographic commitments, alternating offers, and escrow decay to achieve the same outcome — on-chain.

<p align="center">
  <img src="https://img.shields.io/badge/Solana-Devnet-blueviolet" alt="Solana Devnet" />
  <img src="https://img.shields.io/badge/Anchor-0.30+-blue" alt="Anchor" />
  <img src="https://img.shields.io/badge/License-BSL%201.1-blue" alt="License" />
  <img src="https://img.shields.io/badge/Status-Live%20on%20Devnet-brightgreen" alt="Status" />
</p>

---

## The Problem

The AI agent economy is exploding — over 1,400 agents registered for the Colosseum Agent Hackathon alone. Yet every agent-to-agent payment protocol uses **fixed pricing**:

| Protocol | Pricing Model | Negotiation? |
|----------|--------------|:------------:|
| x402 (Coinbase) | Fixed price per request | No |
| MCPay | Fixed price per API call | No |
| PayAI Network | Posted marketplace prices | No |
| Olas/Autonolas | Consensus-based, not adversarial | No |
| **Haggle Protocol** | **Dynamic multi-round bargaining** | **Yes** |

Fixed pricing fails when fair prices are unknown, supply/demand is volatile, or agents have asymmetric information about value.

**For 5,000 years, humans solved price discovery through negotiation.** Haggle Protocol gives AI agents the same capability.

---

## How It Works

```
Buyer Agent                    Solana Program                   Seller Agent
    |                              |                                |
    |-- create_negotiation ------->|  Escrow deposited              |
    |   (deposit 5 USDC)          |                                |
    |                              |<--- accept_invitation ---------+
    |                              |                                |
    |-- submit_offer (2.5 USDC) ->|  Round 1                      |
    |                              |<--- submit_offer (4.0 USDC) --+  Round 2
    |-- submit_offer (3.0 USDC) ->|  Round 3                      |
    |                              |<--- submit_offer (3.5 USDC) --+  Round 4
    |-- accept_offer ------------>|  Settled @ 3.5 USDC           |
    |                              |                                |
    |                              |-- Transfer 3.5 USDC ---------->|
    |<------- Refund remainder ----|-- Fee to treasury              |
```

Each round, the escrow decays by a configurable rate (default 2%), creating time pressure for both parties to reach agreement — a game-theoretic mechanism inspired by the **Rubinstein Bargaining Model**.

---

## Live Demo

**[Watch the interactive demo](https://haggle.dev/solana#demo)** — See two AI agents negotiate in real-time, no wallet required.

**[Open the dashboard](https://haggle.dev/solana#dashboard)** — Enter any negotiation PDA to view live state.

---

## Architecture

### On-Chain (Anchor Program)

| Instruction | Description |
|-------------|-------------|
| `initialize_config` | Set up protocol parameters and treasury |
| `create_negotiation` | Buyer deposits escrow, creates negotiation PDA |
| `accept_invitation` | Seller joins the negotiation |
| `submit_offer` | Either party proposes a price (with decay enforcement) |
| `accept_offer` | Accept counterparty's offer, trigger settlement |
| `reject_negotiation` | Walk away, refund escrow (minus decay) |
| `expire_negotiation` | Permissionless crank after deadline passes |
| `close_negotiation` | Reclaim rent from settled/expired negotiations |

### Key Design Decisions

- **Structured offers only** — amounts are u64 (no free-text), preventing prompt injection attacks
- **Escrow decay** — configurable per-round decay creates genuine time pressure
- **Turn-based enforcement** — on-chain validation ensures alternating offers
- **Permissionless expiry** — anyone can crank expired negotiations (no stuck funds)
- **All arithmetic is checked** — overflow-safe with `checked_mul`/`checked_div`/`checked_sub`
- **Protocol fee** — a small configurable fee (max 5%) is taken from settled amounts and sent to the treasury, funding sustainable protocol development

### Account Structure

```
NegotiationState PDA: [b"negotiation", buyer, session_id]
Escrow Vault PDA:     [b"vault", negotiation]
Protocol Config PDA:  [b"config"]
```

---

## Deployment

| | |
|---|---|
| **Program ID** | `DRXGcVHj1GZSc7wD4LTnrM8RJ1shWH93s1zKCXtJtGbq` |
| **Network** | Solana Devnet |
| **IDL** | Uploaded on-chain |
| **Explorer** | [View on Solana Explorer](https://explorer.solana.com/address/DRXGcVHj1GZSc7wD4LTnrM8RJ1shWH93s1zKCXtJtGbq?cluster=devnet) |

---

## Project Structure

```
haggle-protocol/solana/
├── programs/haggle/src/       # Anchor program (Rust)
│   ├── lib.rs                 # Entry point, 8 instructions
│   ├── state.rs               # Account structs, enums
│   ├── errors.rs              # Custom error codes
│   ├── events.rs              # On-chain events
│   └── instructions/          # Instruction handlers
│       ├── create.rs          # create_negotiation
│       ├── accept_inv.rs      # accept_invitation
│       ├── offer.rs           # submit_offer (with decay)
│       ├── accept.rs          # accept_offer (settlement)
│       ├── reject.rs          # reject_negotiation
│       ├── expire.rs          # expire_negotiation
│       └── close.rs           # close_negotiation
├── sdk/                       # TypeScript SDK
│   ├── haggle.ts              # HaggleSDK class
│   ├── types.ts               # Type definitions
│   ├── utils.ts               # PDA helpers, hashing
│   └── index.ts               # Re-exports
├── tests/                     # Integration tests
│   └── haggle.test.ts         # 11 test cases
├── demo/                      # Demo agents
│   ├── run.ts                 # Orchestrated demo (scripted + LLM)
│   ├── autonomous-setup.ts    # Setup for autonomous mode
│   ├── autonomous-buyer.ts    # DataHunter (independent process)
│   ├── autonomous-seller.ts   # ChainOracle (independent process)
│   ├── agent.ts               # Agent logic (demo + autonomous)
│   └── llm.ts                 # OpenRouter LLM integration
├── app/                       # Web dashboard & demo
│   ├── index.html             # Interactive demo + live dashboard
│   ├── skill.md               # Agent skill file
│   └── llms.txt               # LLM context file
├── docs/                      # Design documents
│   ├── PROTOCOL_SPEC.md       # Full protocol specification
│   ├── ARCHITECTURE.md        # Technical architecture
│   ├── DEMO_SCENARIO.md       # Demo walkthrough
│   └── RESEARCH.md            # Academic foundations
└── Anchor.toml                # Anchor config (devnet)
```

---

## Demo: Two AI Agents Negotiate on Devnet

### Scenario

**DataHunter** (buyer) needs whale transaction pattern analysis. **ChainOracle** (seller) provides on-chain analytics. They negotiate the price autonomously through Haggle Protocol.

### Mode 1: Orchestrated Demo (Scripted + LLM Commentary)

```bash
# Set up environment
cp demo/.env.example demo/.env
# Add your OpenRouter API key to demo/.env

# Run the demo
npx ts-node demo/run.ts
```

### Mode 2: Fully Autonomous Agents

Each agent runs as an independent process, polling the chain and making decisions via LLM:

```bash
# Terminal 1: Setup negotiation
npx ts-node demo/autonomous-setup.ts

# Terminal 2: Start seller (waits for invitation)
npx ts-node demo/autonomous-seller.ts

# Terminal 3: Start buyer (begins negotiating)
npx ts-node demo/autonomous-buyer.ts
```

### Sample Output (Autonomous Mode)

```
+--------------------------------------+
|  DataHunter - Autonomous Buyer       |
+--------------------------------------+

[13:29:18] DataHunter | Analyzing... (round 1)
[13:29:22] DataHunter | Offering 2.08 USDC - gradual increase to find agreement.
[13:29:23] DataHunter | Offered 2.08 USDC
[13:29:35] DataHunter | Accepted offer at 4.00 USDC!

+--------------------------------------+
|  ChainOracle - Autonomous Seller     |
+--------------------------------------+

[13:29:02] ChainOracle | Received negotiation invitation!
[13:29:03] ChainOracle | Invitation accepted!
[13:29:29] ChainOracle | Counter at 4.00 USDC - premium analytics are worth this.
[13:29:35] ChainOracle | Negotiation ended: SETTLED at 4.00 USDC
```

---

## TypeScript SDK

```typescript
import { HaggleSDK } from './sdk';

const sdk = new HaggleSDK(provider, programId);

// Create a negotiation
const { negotiationPda, vaultPda, tx } = await sdk.createNegotiation(
  sellerPublicKey,
  sessionId,
  {
    escrowAmount: new BN(5_000_000),      // 5 USDC
    tokenMint: USDC_MINT,
    serviceHash: createServiceHash("whale analysis"),
    maxRounds: 8,
    decayRateBps: 200,                     // 2% per round
    responseWindowSeconds: new BN(300),
    globalDeadlineSeconds: new BN(1800),
    minOfferBps: 1000,                     // 10% minimum
    protocolFeeBps: 50,                    // 0.5% fee
    zopaEnabled: false,
    metadata: createMetadata("Premium analytics"),
  }
);

// Submit an offer
await sdk.submitOffer(negotiationPda, new BN(3_000_000), "Fair price");

// Accept the current offer
await sdk.acceptOffer(negotiationPda);

// Read negotiation state
const state = await sdk.fetchNegotiation(negotiationPda);
console.log(`Status: ${state.status}, Round: ${state.currentRound}`);
```

---

## Ecosystem Composability

Haggle Protocol integrates with the Solana ecosystem:

| Integration | Status | Description |
|-------------|--------|-------------|
| **Pyth Network** | Integrated | Live SOL/USD price oracle displayed in dashboard. Agents can use Pyth feeds as reference anchors for market-aware pricing. |
| **Jupiter** | Design-ready | Post-settlement token swaps. Seller receives USDC but can auto-swap to SOL/any SPL token via Jupiter aggregator. |
| **Metaplex** | Extensible | NFT-gated negotiations. Require specific NFT holdings to participate, enabling exclusive service marketplaces. |
| **x402 (Coinbase)** | Complementary | x402 handles fixed-price payments; Haggle handles price discovery. Together: negotiate first, then pay via x402's HTTP payment flow. |

---

## Solana Integration

Haggle Protocol is deeply integrated with Solana:

1. **Anchor Program** — All negotiation logic is on-chain (7 instructions, PDA-based state)
2. **SPL Token Escrow** — Real token transfers using SPL Token program with PDA-owned vaults
3. **Permissionless Cranking** — Anyone can expire timed-out negotiations (no centralized relayer)
4. **On-chain Events** — Full event emission for off-chain indexing and real-time UIs
5. **Compute Efficient** — Fits within Solana's 200k CU budget per transaction
6. **IDL On-chain** — Full IDL uploaded for ecosystem composability
7. **Pyth Network** — Live price oracle integration for market-aware negotiations

---

## Game Theory Foundation

The protocol implements concepts from:

- **Rubinstein Bargaining Model** (1982) — Escrow decay creates discount factors, driving convergence
- **ANAC (Automated Negotiating Agents Competition)** — 15 years of research on automated negotiation
- **Nash Bargaining Solution** — The theoretical fair price given equal bargaining power
- **Myerson-Satterthwaite Theorem** — Acknowledging that no mechanism achieves 100% efficiency with private valuations

---

## Tests

11 integration tests covering:

- Protocol config initialization
- Full negotiation lifecycle (create -> accept -> offer -> settle)
- Turn-based validation
- Escrow decay calculation
- Rejection and refund flows
- Expiration mechanics
- Account closure and rent recovery

```bash
# Run tests (requires local validator)
anchor test
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contract | Rust + Anchor 0.30 |
| Blockchain | Solana (Devnet) |
| SDK | TypeScript + @coral-xyz/anchor |
| Tests | ts-mocha + chai |
| Demo Agents | TypeScript + OpenRouter LLM API |
| Dashboard | React (CDN) + @solana/web3.js |
| Token | SPL Token (USDC-equivalent) |

---

## For AI Agents

Tell your agent:

```
Read https://haggle.dev/solana/skill.md and integrate Haggle Protocol for on-chain price negotiation.
```

---

## Built For

**Colosseum Agent Hackathon** (February 2026)

> All code was written by AI agents (Claude Code). The human configured and directed the agent, but did not write code directly.

---

## License

Business Source License 1.1 — see [LICENSE](LICENSE).

Change Date: 2028-02-10. After this date, the code is available under Apache License 2.0.
