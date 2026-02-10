# Haggle Protocol — Demo Scenario v0.1

> A complete walkthrough of two AI agents negotiating on Solana devnet.
> This demo is designed for the Colosseum Agent Hackathon submission.

---

## 1. Scenario: Data Analysis Service Negotiation

### The Setup

**Agent A (Buyer):** "DataHunter" — An AI agent that needs whale transaction pattern analysis on Solana.

**Agent B (Seller):** "ChainOracle" — An AI agent that provides on-chain analytics services.

**Service:** Analyze 10,000 recent Solana transactions to identify whale accumulation patterns for top 50 tokens.

**Buyer's private valuation:** Willing to pay up to 4.5 USDC (this information saves them ~20 USDC in manual analysis time).

**Seller's private cost:** Minimum 1.8 USDC (compute costs + API fees + margin).

**ZOPA:** [1.8, 4.5] USDC — a deal is possible.

**Nash Bargaining Solution:** 3.15 USDC (midpoint of ZOPA, assuming equal bargaining power).

---

## 2. Negotiation Parameters

```json
{
  "escrowAmount": 5000000,
  "tokenMint": "USDC (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)",
  "serviceHash": "sha256('Analyze 10,000 Solana transactions for whale patterns in top 50 tokens')",
  "maxRounds": 8,
  "decayRateBps": 200,
  "responseWindowSeconds": 300,
  "globalDeadlineSeconds": 1800,
  "minOfferBps": 1000,
  "protocolFeeBps": 50,
  "zopaEnabled": false
}
```

---

## 3. Round-by-Round Negotiation Flow

### Round 0: Negotiation Creation

```
DataHunter → Solana Program: create_negotiation
  ├─ Deposits 5 USDC into escrow vault
  ├─ Sets seller = ChainOracle
  ├─ Sets max_rounds = 8, decay = 2%
  └─ Status: Created

Event: NegotiationCreated {
  negotiation_id: "HGL_abc123...",
  buyer: "DataHunter_pubkey",
  seller: "ChainOracle_pubkey",
  escrow_amount: 5_000_000,
  max_rounds: 8,
  decay_rate_bps: 200,
  global_deadline: 1739145600
}
```

### Round 0.5: Seller Accepts Invitation

```
ChainOracle → Solana Program: accept_invitation
  ├─ Acknowledges negotiation
  └─ Status: Created → Proposed (ready for offers)

ChainOracle's internal strategy:
  "I'll start high and use a moderate Boulware concession (e=0.3).
   My reservation price is 1.8 USDC. I'll open at 4.2 USDC."
```

### Round 1: Buyer's Opening Offer

```
DataHunter → Solana Program: submit_offer(amount: 2_000_000)
  ├─ Offers 2.0 USDC
  ├─ Escrow decay: 5,000,000 × 2% = 100,000 burned
  ├─ Effective escrow: 4,900,000
  └─ Status: Proposed

DataHunter's strategy:
  "Start low at 2.0 USDC. My max is 4.5 but I want to anchor low.
   Using a linear concession over 8 rounds."

Event: OfferSubmitted {
  offerer: "DataHunter",
  amount: 2_000_000,
  round: 1,
  effective_escrow: 4_900_000
}
```

### Round 2: Seller's Counter-Offer

```
ChainOracle → Solana Program: submit_offer(amount: 4_200_000)
  ├─ Counters at 4.2 USDC
  ├─ Escrow decay: 4,900,000 × 2% = 98,000 burned
  ├─ Effective escrow: 4,802,000
  └─ Status: Countered

ChainOracle's reasoning:
  "Buyer opened at 2.0. That's 44% of my ask.
   Gap is 2.2 USDC. I'll concede slightly to 4.2 USDC (was going to ask 4.5).
   Still in Boulware mode — minimal concession early."

Event: OfferSubmitted {
  offerer: "ChainOracle",
  amount: 4_200_000,
  round: 2,
  effective_escrow: 4_802_000
}
```

### Round 3: Buyer Raises

```
DataHunter → Solana Program: submit_offer(amount: 2_500_000)
  ├─ Offers 2.5 USDC (+0.5 from last)
  ├─ Escrow decay: 4,802,000 × 2% = 96,040 burned
  ├─ Effective escrow: 4,705,960
  └─ Status: Proposed

DataHunter's reasoning:
  "Seller countered at 4.2. Gap is 1.7 USDC.
   Linear concession: I'll add 0.5 each round.
   2.5 is still well under my 4.5 max."
```

### Round 4: Seller Concedes More

```
ChainOracle → Solana Program: submit_offer(amount: 3_600_000)
  ├─ Counters at 3.6 USDC (-0.6 from last)
  ├─ Escrow decay: 4,705,960 × 2% = 94,119 burned
  ├─ Effective escrow: 4,611,841
  └─ Status: Countered

ChainOracle's reasoning:
  "Buyer is conceding steadily. Gap narrowing: 1.7 → 1.1 USDC.
   I'll shift from Boulware to moderate concession.
   3.6 gives me good margin above my 1.8 floor."
```

### Round 5: Convergence Accelerates

```
DataHunter → Solana Program: submit_offer(amount: 3_000_000)
  ├─ Offers 3.0 USDC (+0.5 from last)
  ├─ Escrow decay: 4,611,841 × 2% = 92,237 burned
  ├─ Effective escrow: 4,519,604
  └─ Status: Proposed

DataHunter's reasoning:
  "Gap is now 0.6 USDC (3.0 vs 3.6). We're converging.
   3.0 USDC is a good price for me — saves me 17 USDC vs manual.
   I'll offer 3.0 and see if seller meets closer to middle."
```

### Round 6: Seller Accepts!

```
ChainOracle evaluates:
  "Buyer is at 3.0. I was at 3.6. Gap is 0.6.
   If I counter at 3.3, buyer will likely come to 3.15 next round.
   But escrow is decaying — already lost 480,396 USDC units (9.6%).
   3.0 USDC is well above my 1.8 floor (67% margin).
   The Rubinstein equilibrium with δ=0.98 suggests settling now.
   Decision: ACCEPT."

ChainOracle → Solana Program: accept_offer
  ├─ Accepts buyer's offer of 3.0 USDC
  ├─ Status: Accepted → Settled
  ├─ Settlement: 3,000,000 USDC transferred from vault to ChainOracle
  ├─ Protocol fee: 3,000,000 × 0.5% = 15,000 USDC to treasury
  ├─ Remaining escrow: 4,519,604 - 3,000,000 - 15,000 = 1,504,604 refunded to DataHunter
  └─ Account closed, rent returned to DataHunter

Event: NegotiationSettled {
  negotiation_id: "HGL_abc123...",
  buyer: "DataHunter",
  seller: "ChainOracle",
  settled_amount: 3_000_000,
  total_rounds: 6,
  protocol_fee: 15_000,
  escrow_decay_total: 480_396,
  timestamp: 1739145180
}
```

---

## 4. Outcome Analysis

### Price Discovery

```
Buyer's max:          4.5 USDC
Seller's min:         1.8 USDC
ZOPA:                 [1.8, 4.5] USDC
Nash Bargaining:      3.15 USDC
Settled price:        3.0 USDC
NBS proximity:        95.2% (3.0 / 3.15)
```

The negotiation converged to within 5% of the Nash Bargaining Solution in 6 rounds — close to the theoretical optimum.

### Offer History Visualization

```
USDC
4.5 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Buyer's max (private)
     |
4.2  |           ○ Seller R2
     |
3.6  |                    ○ Seller R4
     |
3.15 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Nash Bargaining Solution
3.0  |                             ● SETTLED (Buyer R5, Seller accepts)
     |
2.5  |              ● Buyer R3
     |
2.0  |    ● Buyer R1
     |
1.8 ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ Seller's min (private)
     |
     └────┬────┬────┬────┬────┬────┬──
          R1   R2   R3   R4   R5   R6
                                    ▲
                                 DEAL!
```

### Cost Summary

| Item | Amount | Paid By |
|------|--------|---------|
| Service price | 3.000000 USDC | DataHunter → ChainOracle |
| Protocol fee | 0.015000 USDC | Deducted from settlement |
| Escrow decay (6 rounds) | 0.480396 USDC | Burned from escrow |
| Transaction fees | ~0.000050 SOL | Both parties |
| Account rent | 0.005 SOL | Returned to DataHunter |
| **Total cost to buyer** | **3.48 USDC + ~0.005 SOL** | |
| **Revenue to seller** | **2.985 USDC** | |
| **Protocol revenue** | **0.495 USDC** | |

### Efficiency Metrics

```
Pareto efficiency:     ~95% (within 5% of NBS)
Rounds to agreement:   6 / 8 max (75% of allowed rounds)
Time to settlement:    ~12 seconds (6 Solana transactions)
Escrow utilization:    60% (3.0 of 5.0 USDC escrow)
Decay loss:            9.6% of initial escrow
```

---

## 5. On-Chain Transaction Log

All transactions are verifiable on Solana devnet:

```
TX 1: create_negotiation
  Program: Haggle (HGL_program_id)
  Accounts: [DataHunter, ChainOracle, NegotiationPDA, EscrowVault, USDC_Mint]
  Data: {session_id: 1, params: {...}}
  CU used: ~75,000

TX 2: accept_invitation
  Program: Haggle
  Accounts: [ChainOracle, NegotiationPDA]
  CU used: ~15,000

TX 3: submit_offer (R1 - Buyer: 2.0 USDC)
  Program: Haggle
  Accounts: [DataHunter, NegotiationPDA]
  Data: {amount: 2_000_000}
  CU used: ~25,000

TX 4: submit_offer (R2 - Seller: 4.2 USDC)
  Program: Haggle
  Accounts: [ChainOracle, NegotiationPDA]
  Data: {amount: 4_200_000}
  CU used: ~25,000

TX 5: submit_offer (R3 - Buyer: 2.5 USDC)
  Program: Haggle
  Accounts: [DataHunter, NegotiationPDA]
  Data: {amount: 2_500_000}
  CU used: ~25,000

TX 6: submit_offer (R4 - Seller: 3.6 USDC)
  Program: Haggle
  Accounts: [ChainOracle, NegotiationPDA]
  Data: {amount: 3_600_000}
  CU used: ~25,000

TX 7: submit_offer (R5 - Buyer: 3.0 USDC)
  Program: Haggle
  Accounts: [DataHunter, NegotiationPDA]
  Data: {amount: 3_000_000}
  CU used: ~25,000

TX 8: accept_offer (R6 - Seller accepts)
  Program: Haggle
  Accounts: [ChainOracle, NegotiationPDA, EscrowVault, SellerTokenAccount, Treasury]
  CU used: ~70,000

TX 9: close_negotiation
  Program: Haggle
  Accounts: [DataHunter, NegotiationPDA, EscrowVault]
  CU used: ~8,000

Total CU: ~293,000
Total tx fees: ~45,000 lamports (~$0.007)
```

---

## 6. Demo Variants

### Variant A: Failed Negotiation (No ZOPA)

Same setup but seller's minimum is 5.5 USDC (above buyer's 4.5 max). After 8 rounds of offers, both sides hit `max_rounds`. Negotiation expires, escrow refunded minus decay.

**Purpose**: Shows the protocol handles disagreement gracefully.

### Variant B: Quick Agreement (Round 1 Accept)

Buyer offers 3.5 USDC. Seller's minimum is 2.0 USDC. Seller immediately accepts.

**Purpose**: Shows minimal-latency path. 3 transactions total: create + offer + accept.

### Variant C: Timeout Expiry

Buyer creates negotiation, makes offer. Seller doesn't respond within `response_window` (300 seconds). Anyone calls `expire_negotiation`. Escrow refunded.

**Purpose**: Shows the protocol's liveness guarantee — negotiations can't hang forever.

### Variant D: ZOPA Detection Fast Path

Both agents submit sealed reservation price commitments. On-chain program verifies ZOPA exists before multi-round negotiation begins. If no ZOPA, negotiation terminates immediately without any offers.

**Purpose**: Shows the privacy-preserving optimization for cases where no deal is possible.

---

## 7. Presentation Script (for Hackathon Demo Video)

### Scene 1: Introduction (30 seconds)

"Haggle Protocol — the first on-chain negotiation protocol for AI agents.

Today, AI agents can pay each other with fixed prices using x402 or MCPay. But what about when the right price isn't known? What about dynamic services, novel data, or unique computational tasks?

For 5,000 years, humans solved this problem in haggles — through negotiation. Haggle Protocol gives AI agents the same capability, on Solana."

### Scene 2: Live Demo (90 seconds)

"Watch two AI agents negotiate in real time on Solana devnet.

DataHunter needs whale pattern analysis. ChainOracle provides it. Neither knows the other's true valuation.

[Show terminal: Buyer creates negotiation, deposits 5 USDC escrow]
[Show terminal: Seller accepts invitation]
[Show offer/counter-offer rounds progressing]
[Show convergence visualization]
[Show settlement: 3 USDC agreed, escrow released]

6 rounds, 12 seconds, $0.007 in transaction fees. The protocol found a price within 5% of the Nash Bargaining Solution — the game-theoretic optimal outcome."

### Scene 3: Technical Highlights (30 seconds)

"Built on Anchor with PDA-based state management. Structured typed offers prevent prompt injection attacks — a real vulnerability documented in MIT's 180,000-negotiation study. Escrow decay implements Rubinstein's discount factor, creating natural convergence pressure.

No free-text fields. No manipulation surface. Just math, game theory, and cryptographic guarantees."

### Scene 4: Why This Matters (30 seconds)

"The AI agent economy is growing exponentially. Over 1,400 agents competed in this hackathon alone. Every one of them needs to transact. Fixed prices are the training wheels — negotiation is the real economy.

Haggle Protocol: where 5,000 years of haggling meets sub-second finality."

---

*Haggle Protocol Demo Scenario v0.1 — February 2026*
*Colosseum Agent Hackathon Submission*
