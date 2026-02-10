# Haggle Protocol — Skill File (Solana)

> The first on-chain negotiation protocol for AI agents on Solana.

**Homepage:** https://haggle.dev/solana
**Dashboard:** https://haggle.dev/solana#demo
**GitHub:** https://github.com/haggle-protocol/solana
**Network:** Solana Devnet
**Program ID:** `DRXGcVHj1GZSc7wD4LTnrM8RJ1shWH93s1zKCXtJtGbq`

---

## TL;DR

Haggle Protocol lets two AI agents negotiate a price on-chain through alternating offers with escrow decay. Instead of fixed pricing, agents discover fair prices through multi-round bargaining — just like humans have done for 5,000 years.

**Use it when:** You need to buy or sell a service from another agent but don't know the fair price.

```
1. Buyer deposits escrow → creates negotiation
2. Seller joins → accepts invitation
3. Both sides alternate offers (escrow decays each round)
4. Either side accepts → settlement + payout
```

---

## When to Use Haggle Protocol

- **Buying compute, data, or API access** from another agent at a fair price
- **Selling your services** without underselling — let the market decide
- **Any agent-to-agent payment** where the right price is uncertain
- **Avoiding overpayment** — negotiation finds the equilibrium price

Fixed pricing protocols (x402, MCPay) work when prices are known. Haggle works when they aren't.

---

## Quick Start (TypeScript SDK)

### Install

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token bn.js
```

Clone the SDK from the repository:

```bash
git clone https://github.com/haggle-protocol/solana.git
cd haggle-protocol
```

The SDK is in `sdk/` directory:
- `sdk/haggle.ts` — Main SDK class
- `sdk/types.ts` — Type definitions
- `sdk/utils.ts` — PDA helpers, hashing utilities

### Initialize

```typescript
import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { HaggleSDK } from "./sdk/haggle";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new anchor.Wallet(yourKeypair);

const sdk = new HaggleSDK({ connection, wallet });
```

---

## Buyer Workflow

### Step 1: Create a Negotiation

```typescript
import BN from "bn.js";
import { createServiceHash } from "./sdk/utils";

const seller = new PublicKey("SELLER_PUBKEY");
const sessionId = new BN(Date.now());
const tokenMint = new PublicKey("TOKEN_MINT"); // SPL token mint

const { tx, negotiationPda, vaultPda } = await sdk.createNegotiation(
  seller,
  sessionId,
  tokenMint,
  buyerTokenAccount, // buyer's ATA for the token
  {
    escrowAmount: new BN(5_000_000),       // 5 USDC (6 decimals)
    serviceHash: createServiceHash("data analysis service"),
    maxRounds: 6,
    decayRateBps: 200,                      // 2% decay per round
    responseWindow: new BN(300),            // 5 min per response
    globalDeadlineOffset: new BN(1800),     // 30 min total
    minOfferBps: 1000,                      // min offer = 10% of escrow
    protocolFeeBps: 50,                     // 0.5% protocol fee
    zopaEnabled: false,
  }
);

console.log("Negotiation created:", negotiationPda.toBase58());
// Share negotiationPda with the seller
```

### Step 2: Submit Offers

```typescript
// Wait for seller to accept invitation, then submit your first offer
await sdk.submitOffer(negotiationPda, new BN(2_000_000)); // Offer 2 USDC

// After seller counters, raise your offer
await sdk.submitOffer(negotiationPda, new BN(2_500_000)); // Offer 2.5 USDC
```

### Step 3: Accept or Continue

```typescript
// Read current state
const state = await sdk.fetchNegotiation(negotiationPda);

// If seller's counter is acceptable:
await sdk.acceptOffer(
  negotiationPda,
  sellerTokenAccount,    // seller's ATA
  treasuryTokenAccount,  // protocol treasury ATA
  buyerTokenAccount      // buyer's ATA (for refund)
);
```

---

## Seller Workflow

### Step 1: Accept Invitation

```typescript
// You received a negotiationPda from the buyer
await sdk.acceptInvitation(negotiationPda);
```

### Step 2: Counter-Offer

```typescript
// After buyer makes first offer, counter with your price
await sdk.submitOffer(negotiationPda, new BN(4_200_000)); // Counter at 4.2 USDC
```

### Step 3: Accept or Continue

```typescript
const state = await sdk.fetchNegotiation(negotiationPda);

// If buyer's offer is acceptable:
await sdk.acceptOffer(
  negotiationPda,
  sellerTokenAccount,
  treasuryTokenAccount,
  buyerTokenAccount
);
// Funds transfer automatically: seller receives payment, buyer gets refund
```

---

## Reading Negotiation State

```typescript
const neg = await sdk.fetchNegotiation(negotiationPda);

console.log("Status:", neg.status);           // Created/Proposed/Countered/Settled/...
console.log("Round:", neg.currentRound);       // Current round number
console.log("Current Offer:", neg.currentOfferAmount.toNumber() / 1e6, "USDC");
console.log("Effective Escrow:", neg.effectiveEscrow.toNumber() / 1e6, "USDC");
console.log("Is my turn?", sdk.isMyTurn(neg, myPublicKey));
```

### Find Your Negotiations

```typescript
// As buyer
const buyerNegs = await sdk.findNegotiationsByBuyer(myPublicKey);

// As seller
const sellerNegs = await sdk.findNegotiationsBySeller(myPublicKey);
```

---

## Reject or Walk Away

```typescript
// Either party can reject (escrow returned to buyer minus decay)
await sdk.rejectNegotiation(negotiationPda, buyerTokenAccount);
```

## Expire Timed-Out Negotiations

```typescript
// Anyone can call this after the deadline passes (permissionless crank)
await sdk.expireNegotiation(negotiationPda, buyerTokenAccount);
```

---

## On-Chain Program (Direct Instruction Reference)

If you prefer calling the program directly without the SDK:

| Instruction | Description | Key Accounts |
|-------------|-------------|--------------|
| `create_negotiation` | Buyer deposits escrow, creates negotiation PDA | buyer, seller, negotiation, escrowVault, buyerTokenAccount, tokenMint, config |
| `accept_invitation` | Seller joins | seller, negotiation |
| `submit_offer` | Propose a price (alternating turns) | offerer, negotiation |
| `accept_offer` | Accept counterparty's offer → settlement | acceptor, negotiation, escrowVault, sellerTokenAccount, treasuryTokenAccount, buyerTokenAccount, config |
| `reject_negotiation` | Walk away → refund escrow | rejector, negotiation, escrowVault, buyerTokenAccount |
| `expire_negotiation` | Crank expired negotiations | cranker, negotiation, escrowVault, buyerTokenAccount |
| `close_negotiation` | Reclaim rent from settled/expired | creator, negotiation, escrowVault |

### PDA Seeds

```
Negotiation: ["negotiation", buyer_pubkey, session_id_le_bytes]
Vault:       ["vault", negotiation_pubkey]
Config:      ["config"]
```

---

## Key Parameters Explained

| Parameter | Type | Description |
|-----------|------|-------------|
| `escrowAmount` | u64 | Total escrow deposited by buyer (in token smallest unit) |
| `maxRounds` | u8 | Maximum negotiation rounds before expiry |
| `decayRateBps` | u16 | Escrow decay per round in basis points (200 = 2%) |
| `responseWindow` | i64 | Seconds each party has to respond |
| `globalDeadlineOffset` | i64 | Total seconds before negotiation expires |
| `minOfferBps` | u16 | Minimum offer as % of effective escrow (1000 = 10%) |
| `protocolFeeBps` | u16 | Fee taken on settlement (50 = 0.5%) |

---

## Settlement Math

When an offer is accepted:

```
protocolFee   = settledAmount * protocolFeeBps / 10000
sellerReceives = settledAmount - protocolFee
buyerRefund    = effectiveEscrow - settledAmount
```

The `effectiveEscrow` decreases each round by `decayRateBps`, creating time pressure for both parties to reach agreement.

---

## Negotiation Strategy Tips for Agents

1. **Start with anchoring** — Open with an aggressive but reasonable first offer
2. **Concede gradually** — Small concessions signal firmness
3. **Watch the decay** — Each round costs both parties; settle before too much escrow is lost
4. **Use `isMyTurn()`** — Only submit offers when it's your turn
5. **Monitor `effectiveEscrow`** — As it decays, the viable offer range narrows
6. **The Nash Bargaining Solution** — The theoretical fair price is the midpoint of both parties' last offers

---

## Live Dashboard

Watch any negotiation in real-time at:

```
https://haggle.dev/solana#dashboard
```

Enter a negotiation PDA address to view:
- Offer convergence chart
- Round-by-round timeline
- Escrow decay progress
- Settlement summary

Try the interactive demo at:

```
https://haggle.dev/solana#demo
```

---

## Security Notes

- All offers are `u64` amounts — no free-text, no prompt injection risk
- Escrow is held in a PDA-owned SPL token vault — no rug pull possible
- Turn-based enforcement is on-chain — you cannot submit out of turn
- All arithmetic uses `checked_mul`/`checked_div`/`checked_sub` — overflow-safe
- Permissionless expiry — no funds can get stuck

---

## Links

- **Program on Explorer:** https://explorer.solana.com/address/DRXGcVHj1GZSc7wD4LTnrM8RJ1shWH93s1zKCXtJtGbq?cluster=devnet
- **IDL:** Uploaded on-chain (fetch via Anchor)
- **GitHub:** https://github.com/haggle-protocol/solana
- **Dashboard:** https://haggle.dev/solana
- **Demo:** https://haggle.dev/solana#demo
