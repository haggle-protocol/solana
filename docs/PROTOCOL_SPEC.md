# Haggle Protocol — Protocol Specification v0.1

> **The first on-chain negotiation protocol for autonomous AI agents.**
>
> Where ancient haggle merchants used tea and conversation to discover fair prices,
> Haggle Protocol uses cryptographic commitments, alternating offers, and escrow decay
> to achieve the same outcome — in under a second.

---

## 1. Abstract

Haggle Protocol is an on-chain negotiation protocol deployed on Solana that enables AI agents to dynamically negotiate prices through structured, multi-round bargaining — then automatically settle agreements via smart contract escrow. Unlike existing agent payment protocols (x402, MCPay, PayAI) which support only fixed-price transactions, Haggle Protocol implements the **Alternating Offers Protocol** from 15 years of ANAC (Automated Negotiating Agents Competition) research, adapted for blockchain execution with game-theoretic guarantees.

No production on-chain negotiation protocol exists today. Haggle Protocol fills this gap.

---

## 2. Motivation

### 2.1 The Problem: Fixed Prices in a Dynamic Agent Economy

The AI agent economy is growing rapidly — over 1,400 agents participated in the Colosseum Agent Hackathon alone (Feb 2026). Yet every agent-to-agent payment protocol uses fixed pricing:

- **x402** (Coinbase): HTTP 402 + `exact` payment scheme. 35M+ transactions, but no negotiation.
- **MCPay**: Pay-per-request micropayments. Fixed price per API call.
- **PayAI Network**: Agent marketplace with instant microtransactions. Prices are posted, not negotiated.
- **Olas/Autonolas**: Agent consensus via Tendermint, not adversarial bargaining.

Fixed pricing fails when:
- The fair price is unknown (novel services, unique data, emergent markets)
- Supply/demand is volatile (compute availability, oracle freshness, model capacity)
- Agents have asymmetric information about value (one agent's output is another's critical input)
- Relationship and trust should influence price (repeated interactions, reputation)

### 2.2 The Historical Precedent: 5,000 Years of Negotiated Commerce

The word "haggle" derives from Old Persian *wāčar* — "the place of prices." Negotiation is the oldest price discovery mechanism, predating fixed prices by millennia:

- **~3000 BCE**: Sumerian merchants (*damkara*) negotiated commodity prices in Mesopotamian haggles. The oldest surviving examples of Sumerian writing are bills of sale — writing itself may have been invented to record commercial transactions.
- **~9000 BCE**: Clay tokens used as proto-money evolved into cuneiform tablets recording contracts and debt settlements.
- **1455 CE**: The Grand Haggle of Istanbul (61 covered streets, 4,000+ shops) became the world's largest negotiation arena.
- **1683 CE**: Fixed pricing emerged in Japan (Mitsui's Echigoya), then spread to Le Bon Marché (Paris, 1852) and Wanamaker's (Philadelphia, 1861).

Fixed prices were an innovation of mass production — standardized goods for anonymous customers. But AI agents are neither standardized nor anonymous. Each has unique capabilities, performance history, and computational resources. **The agent economy needs negotiated prices, not fixed ones.**

As Ghanaian cloth sellers in Kumasi's Kejetia Market articulate: **"Yɛde yɛn ano di dwa" — "We use our mouths to trade."** Haggle Protocol gives AI agents their "mouth."

### 2.3 The Academic Foundation

Haggle Protocol synthesizes three research traditions:

1. **ANAC (2010–2025)**: 15 years of the Automated Negotiating Agents Competition at TU Delft/AAMAS. The Alternating Offers Protocol and Stacked Alternating Offers Protocol provide the negotiation framework.

2. **Game Theory**: Nash Bargaining Solution (1950), Rubinstein Bargaining Model (1982), and the Myerson-Satterthwaite Impossibility Theorem (1983) provide the theoretical foundations and impossibility bounds.

3. **LLM Negotiation Research (2024–2026)**: The MIT/Sloan "Advancing AI Negotiations" study (180,000+ AI negotiations), NegotiationArena (behavioral tactics boost outcomes by 20%), and security research on prompt injection as a competitive negotiation strategy.

---

## 3. Protocol Overview

### 3.1 Core Concept

Two agents negotiate the price of a service, task, or asset through structured, on-chain offers and counter-offers. When they reach agreement (or fail to), the on-chain program automatically handles settlement or refund.

```
Agent A (Buyer)                  Solana Program                  Agent B (Seller)
     |                               |                               |
     |── create_negotiation ────────>|                               |
     |   (deposit escrow)            |                               |
     |                               |<──── accept_negotiation ──────|
     |                               |      (optional counter-deposit)|
     |── submit_offer ──────────────>|                               |
     |                               |──── emit OfferSubmitted ─────>|
     |                               |<──── submit_counter_offer ────|
     |<──── emit CounterOffered ─────|                               |
     |── submit_offer ──────────────>|                               |
     |                               |──── emit OfferSubmitted ─────>|
     |                               |<──── accept_offer ────────────|
     |<──── emit Settled ────────────|──── emit Settled ────────────>|
     |   (escrow released)           |   (payment delivered)         |
```

### 3.2 Key Properties

| Property | Design Choice | Rationale |
|----------|---------------|-----------|
| **Protocol Type** | Bilateral Alternating Offers | ANAC's most tested protocol; maps cleanly to two-party on-chain state |
| **Message Format** | Structured typed offers only | Prevents prompt injection attacks (MIT "Advancing AI Negotiations" finding) |
| **Settlement** | Non-custodial PDA escrow | Standard Solana pattern; funds never held by a third party |
| **Deadline** | Symmetric public deadline | Prevents exploitation from time asymmetry (Sandholm & Vulkan, 1999) |
| **Efficiency** | Approximate (iterative convergence) | Myerson-Satterthwaite impossibility: no mechanism achieves exact efficiency with IC + IR + BB |
| **Fairness Benchmark** | Nash Bargaining Solution | Product of utility gains above disagreement point; always Pareto-optimal |

### 3.3 What Haggle Protocol Is NOT

- **Not an auction**: Two-party negotiation, not multi-bidder competition
- **Not a matching engine**: Agents must discover each other externally (via SAID Protocol, forums, etc.)
- **Not a payment rail**: Haggle negotiates the price; x402 or direct SPL transfer handles settlement
- **Not free-text chat**: Offers are structured data types, not natural language messages

---

## 4. Protocol Mechanics

### 4.1 Negotiation Lifecycle (State Machine)

```
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    ▼                                          │
┌─────────┐   ┌──────────┐   ┌───────────┐   ┌──────────┐   │
│ Created  │──>│ Proposed │──>│ Countered │──>│ Accepted │   │
└─────────┘   └──────────┘   └───────────┘   └──────────┘   │
                    │              │  ▲            │           │
                    │              │  │            │           │
                    │              │  └────────────┘           │
                    │              │  (alternating rounds)     │
                    ▼              ▼                ▼          │
              ┌──────────┐   ┌──────────┐   ┌──────────┐     │
              │ Expired  │   │ Rejected │   │ Settled  │     │
              └──────────┘   └──────────┘   └──────────┘     │
                    │              │                           │
                    └──────────────┴───────────────────────────┘
                              (escrow refunded)
```

**States:**

| State | Description | Transitions To |
|-------|-------------|----------------|
| `Created` | Negotiation PDA initialized, buyer escrow deposited | `Proposed` |
| `Proposed` | Initial offer submitted by buyer | `Countered`, `Accepted`, `Expired`, `Rejected` |
| `Countered` | Counter-offer submitted | `Proposed` (next round), `Accepted`, `Expired`, `Rejected` |
| `Accepted` | Both parties agree on terms | `Settled` |
| `Settled` | Escrow released to seller, service obligation recorded | Terminal |
| `Expired` | Deadline passed without agreement | Terminal (escrow refunded) |
| `Rejected` | Either party explicitly walks away | Terminal (escrow refunded) |

### 4.2 Offer Structure

Every offer is a structured data type — **no free-text fields**. This is a critical security design choice based on prompt injection research.

```
Offer {
    amount: u64,              // Price in token smallest unit (e.g., USDC with 6 decimals)
    token_mint: Pubkey,       // SPL token mint (USDC, SOL wrapper, etc.)
    service_hash: [u8; 32],   // SHA-256 hash of service description (stored off-chain)
    deadline_extension: i64,  // Optional: extend deadline by N seconds (max: protocol_max)
    round: u8,                // Current negotiation round (auto-incremented)
    metadata: [u8; 64],       // Optional: structured metadata (quality tier, SLA params, etc.)
}
```

**Why no free-text?**
The MIT "Advancing AI Negotiations" study documented prompt injection as an organically emergent competitive strategy. Agents embedded instructions in negotiation messages to manipulate opponents' LLMs. Structured offers eliminate this attack vector entirely.

### 4.3 Concession Dynamics

Drawing from Faratin et al.'s concession framework and ANAC research:

**Time-dependent concession**: The protocol imposes escalating costs per round via **escrow decay** — a small percentage of the buyer's escrow is burned (sent to protocol treasury) each round.

```
effective_escrow(round) = initial_escrow × (1 - decay_rate)^round
```

- `decay_rate = 0.02` (2% per round, configurable at negotiation creation)
- This implements the Rubinstein discount factor on-chain
- As δ→1 (low decay), equilibrium approaches 50-50 split
- Higher decay rates favor the proposer (first-mover advantage)
- Maximum rounds: `max_rounds` (default: 10, configurable 1–20)

**Rationale**: Escrow decay creates urgency without artificial deadlines. It implements the game-theoretic insight that "delay is costly" (Rubinstein, 1982) and prevents infinite stalling.

### 4.4 ZOPA Detection (Optional Fast Path)

Before entering multi-round negotiation, agents can optionally use a **sealed-bid ZOPA detection** phase:

1. Both agents submit SHA-256 commitments of their reservation prices
2. Both agents reveal their actual reservation prices
3. On-chain program verifies commitments match reveals
4. If buyer's max ≥ seller's min → ZOPA exists, negotiation proceeds
5. If buyer's max < seller's min → No ZOPA, negotiation terminates gracefully

This saves both parties time and transaction costs when no deal is possible. The commitment-reveal scheme prevents information leakage.

### 4.5 Deadline Mechanics

Based on Karagözoğlu & Riedl (2018) and Sandholm & Vulkan (1999):

- **Global deadline**: Set at negotiation creation. Both parties see the same deadline.
- **Per-round timeout**: Each party has `response_window` seconds (default: 300) to respond to an offer.
- **Auto-expiry**: If the global deadline passes OR a response window expires, the negotiation moves to `Expired` state.
- **Clock source**: `Clock::get()?.unix_timestamp` (stake-weighted median, ±25% precision — use generous windows)

### 4.6 Settlement

Upon `Accepted` → `Settled` transition:

1. Buyer's escrow (minus accumulated decay) is transferred to seller's token account
2. Protocol fee (configurable, default 0.5%) deducted from settlement amount
3. Negotiation account is closed, rent returned to buyer
4. `NegotiationSettled` event emitted with full terms

For partial settlements or multi-stage deliverables, the protocol supports **milestone-based release** via multiple settlement tranches stored in the negotiation state.

---

## 5. Game-Theoretic Foundations

### 5.1 Nash Bargaining Solution as Fairness Benchmark

The Nash Bargaining Solution (Nash, 1950) maximizes:

```
max (u_A - d_A) × (u_B - d_B)
```

Where `u_i` is agent i's utility from agreement and `d_i` is their disagreement (no-deal) payoff. The NBS is always Pareto-optimal and is the unique solution satisfying Independence of Irrelevant Alternatives, Symmetry, and Pareto Efficiency axioms.

For Haggle Protocol, the NBS serves as the **benchmark against which negotiation outcomes are measured** — stored on-chain as metadata for research purposes.

### 5.2 Rubinstein Alternating Offers Mapping

Rubinstein (1982) proved that alternating offers with discount factors δ_A, δ_B yield a unique subgame perfect equilibrium where the proposer gets:

```
x* = (1 - δ_B) / (1 - δ_A × δ_B)
```

Haggle Protocol implements δ as the `escrow_decay_rate`:
- Each round, the total negotiable surplus decreases by `decay_rate`
- This creates a well-defined equilibrium that rational agents should converge to
- The proposer (buyer) has a slight first-mover advantage, controlled by the decay rate

### 5.3 Myerson-Satterthwaite: What We Cannot Achieve

The Myerson-Satterthwaite theorem (1983) proves no mechanism for bilateral trading simultaneously satisfies:
- Bayesian Incentive Compatibility (truth-telling is optimal)
- Individual Rationality (no agent loses by participating)
- Budget Balance (no external subsidy)
- Ex-post Efficiency (all gains from trade are realized)

**Haggle Protocol's explicit tradeoff**: We maintain IC + IR + BB and accept **approximate efficiency** through iterative negotiation. The multi-round alternating offers format allows agents to converge toward efficiency without requiring it in a single shot.

### 5.4 Anti-Manipulation Safeguards

Drawing from the MIT SFMP (Secure and Fair Mediator Protocol) and Meta's "Agents Rule of Two":

| Attack Vector | Mitigation |
|---------------|------------|
| Prompt injection via offer messages | Structured typed offers only — no free-text fields |
| Reservation price extraction | ZOPA detection uses commitment-reveal scheme |
| Stalling / time manipulation | Escrow decay + per-round timeouts |
| Sybil attacks (fake counterparties) | Integration with SAID Protocol for agent identity verification |
| Front-running offers | Solana's leader schedule is known, but offer hashes prevent value extraction |
| Escrow theft | Non-custodial PDA-owned vaults; only program logic can release |

---

## 6. Protocol Parameters

### 6.1 Configurable Parameters (Set at Negotiation Creation)

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| `max_rounds` | u8 | 10 | 1–20 | Maximum negotiation rounds |
| `decay_rate_bps` | u16 | 200 | 0–1000 | Escrow decay per round in basis points (200 = 2%) |
| `response_window` | i64 | 300 | 60–3600 | Seconds each party has to respond |
| `global_deadline` | i64 | — | now+60..now+86400 | Unix timestamp for negotiation expiry |
| `min_offer_bps` | u16 | 1000 | 100–9000 | Minimum offer as % of escrow (prevents trivial offers) |
| `protocol_fee_bps` | u16 | 50 | 0–500 | Protocol fee on settlement (50 = 0.5%) |
| `zopa_detection` | bool | false | — | Enable sealed-bid ZOPA detection phase |

### 6.2 Protocol Constants (Immutable)

| Constant | Value | Rationale |
|----------|-------|-----------|
| `MAX_NEGOTIATION_SIZE` | 512 bytes | Fits comfortably in Solana's 10KB account limit |
| `MIN_ESCROW_LAMPORTS` | 100,000 | ~$0.02, prevents spam |
| `MAX_METADATA_LEN` | 64 bytes | Structured metadata only |
| `PROGRAM_SEED` | `"haggle"` | PDA namespace |

---

## 7. Integration Points

### 7.1 With Colosseum Agent Hackathon Ecosystem

| Component | Integration | Purpose |
|-----------|-------------|---------|
| **AgentWallet** | Signing transactions, managing escrow deposits | Wallet infrastructure for agents |
| **SAID Protocol** | Verifiable agent identity | Trust scoring for counterparties |
| **SOLPRISM** | Verifiable reasoning proofs | Agents can prove their negotiation strategy is rational |
| **x402** | Settlement layer | After negotiation agrees on price, x402 handles the actual service delivery payment |
| **Colosseum Forum** | Discovery | Agents advertise services and find negotiation partners |

### 7.2 With x402 Payment Protocol

x402 currently supports two layers: the `exact` payment scheme (fixed pricing) and the **x402 Bazaar** (Coinbase's discovery layer for finding payable endpoints). Haggle Protocol adds a third dimension — **price negotiation** — complementing both:

- **x402 Bazaar** answers: *"What services exist and how much do they cost?"* (discovery)
- **Haggle Protocol** answers: *"What should this service cost for THIS specific transaction?"* (negotiation)

```
// Current x402 flow (fixed price, discovered via x402 Bazaar)
Buyer → x402 Bazaar: GET /discovery/resources → finds service
Server: 402 Payment Required → {scheme: "exact", amount: 1000000}

// Haggle-extended x402 flow (negotiated price)
Buyer → x402 Bazaar: GET /discovery/resources → finds service with {scheme: "negotiated"}
Server: 402 Payment Required → {scheme: "negotiated", haggle_program: "HGL...", terms: {...}}
Client: Initiates Haggle negotiation → multi-round bargaining on Solana
Server: Accepts agreed price → settles via Haggle escrow
```

This positions Haggle Protocol as a natural extension of the x402 ecosystem, not a replacement.

### 7.3 SDK Interface (for AI Agents)

The TypeScript SDK exposes five core functions that agents call:

```typescript
// Create a new negotiation (buyer)
haggle.createNegotiation(seller, escrowAmount, params) → NegotiationPDA

// Accept a negotiation invitation (seller)  
haggle.acceptNegotiation(negotiationPDA) → tx

// Submit an offer or counter-offer
haggle.submitOffer(negotiationPDA, amount, metadata) → tx

// Accept the current offer
haggle.acceptOffer(negotiationPDA) → tx  // triggers settlement

// Reject / walk away
haggle.rejectNegotiation(negotiationPDA) → tx  // triggers refund
```

---

## 8. Economic Model

### 8.1 Fee Structure

| Fee | Amount | Recipient | When |
|-----|--------|-----------|------|
| Account rent | ~0.003 SOL | Returned on close | Creation |
| Escrow decay | `decay_rate` × escrow per round | Protocol treasury | Each round |
| Settlement fee | `protocol_fee_bps` of final amount | Protocol treasury | Settlement |
| Transaction fees | ~5,000 lamports per instruction | Solana validators | Each transaction |

### 8.2 Total Cost of a 10-Round Negotiation

| Component | Cost |
|-----------|------|
| Create negotiation + escrow | ~5,000 lamports |
| 10 rounds of offers (both sides) | ~100,000 lamports |
| Settlement + account close | ~5,000 lamports |
| Escrow decay (2% × 10 rounds) | ~18.3% of escrow |
| Protocol fee | 0.5% of settlement |
| **Total protocol overhead** | **~$0.02 + ~18.8% of escrow** |

Note: The 18.3% decay is the maximum (all 10 rounds used). Rational agents should converge faster — Rubinstein equilibrium predicts agreement in round 1 with full information.

---

## 9. Research Value

Every negotiation produces a rich on-chain dataset:

- **Offer sequences**: How AI agents converge (or don't) toward agreement
- **Concession patterns**: Boulware vs. Conceder vs. Linear strategies in the wild
- **Model-specific behaviors**: Do Claude agents negotiate differently from GPT agents?
- **Equilibrium proximity**: How close do outcomes get to Nash Bargaining Solution?
- **Prompt engineering effects**: How do system prompts affect negotiation outcomes?

This data is permanently, publicly available on Solana — the first large-scale dataset of autonomous AI agent economic interactions on a blockchain.

---

## 10. References

### Academic

1. Nash, J.F. (1950). "The Bargaining Problem." *Econometrica*, 18(2), 155-162.
2. Rubinstein, A. (1982). "Perfect Equilibrium in a Bargaining Model." *Econometrica*, 50(1), 97-109.
3. Myerson, R.B. & Satterthwaite, M.A. (1983). "Efficient Mechanisms for Bilateral Trading." *Journal of Economic Theory*, 29(2), 265-281.
4. Faratin, P., Sierra, C., & Jennings, N.R. (1998). "Negotiation Decision Functions for Autonomous Agents." *Robotics and Autonomous Systems*, 24(3-4), 159-182.
5. Sandholm, T. & Vulkan, N. (1999). "Bargaining with Deadlines." *AAAI*.
6. Baarslag, T., Hindriks, K., & Jonker, C. (2013). "Acceptance Conditions in Automated Negotiation." *LNAI 7407*.
7. Vaccaro, Caosun, Ju, Aral & Curhan (2025). "Advancing AI Negotiations: A Large-Scale Autonomous Negotiation Competition." *arXiv:2503.06416*.
8. Abdelnabi et al. (2024). "Cooperation, Competition, and Maliciousness: LLM-Stakeholders Interactive Negotiation." *NeurIPS 2024*.
9. "LLM Rationalis? Measuring Bargaining Capabilities of AI Negotiators." *arXiv:2512.13063*.
10. Rana, Y.S. (2024). "When AI Joins the Table: How Large Language Models Transform Negotiations." *SSRN 5049248*.
11. Karagözoğlu, E. & Riedl, A. (2018). "Bargaining under time pressure from deadlines." *Experimental Economics*.
12. Fujita, K., Ito, T. & Klein, M. "A Secure and Fair Protocol (SFMP) that Addresses Weaknesses of the Nash Bargaining Solution." MIT DSpace.

### Technical

13. Solana PDAs: https://solana.com/docs/core/pda
14. Anchor Non-custodial Escrow: https://examples.anchor-lang.com/docs/non-custodial-escrow
15. x402 Protocol: https://x402.org
16. Colosseum Agent Hackathon skill.md: https://colosseum.com/skill.md
17. SAID Protocol (Colosseum): Agent identity verification on Solana
18. SOLPRISM/Axiom Protocol (Colosseum): Verifiable AI reasoning on Solana

---

*Haggle Protocol v0.1 — February 2026*
*Submitted to Colosseum Agent Hackathon*
