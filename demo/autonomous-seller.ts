import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import {
  HaggleSDK,
  NegotiationAccount,
  NegotiationStatus,
  parseStatus,
  createMetadata,
} from "../sdk";
import { OpenRouterClient, MockLLMClient, LLMClient, LLMMessage } from "./llm";

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const [key, ...vals] = line.split("=");
      if (key && vals.length) process.env[key.trim()] = vals.join("=").trim();
    }
  }
}

function log(msg: string) {
  const ts = new Date().toLocaleTimeString();
  console.log(`  [${ts}] 🔮 ChainOracle | ${msg}`);
}

interface DemoState {
  rpcUrl: string;
  negotiationPda: string;
  buyerKeypair: number[];
  sellerKeypair: number[];
  buyerAta: string;
  sellerAta: string;
  treasuryAta: string;
  tokenMint: string;
}

const POLL_INTERVAL = 3000;

async function main() {
  loadEnv();

  console.log(`
  ╭──────────────────────────────────────╮
  │  🔮 ChainOracle — Autonomous Seller │
  │  Monitoring chain state...           │
  ╰──────────────────────────────────────╯
  `);

  // Load state
  const statePath = path.join(__dirname, "demo-state.json");
  if (!fs.existsSync(statePath)) {
    console.error("  ❌ demo-state.json not found. Run autonomous-setup.ts first.");
    process.exit(1);
  }
  const state: DemoState = JSON.parse(fs.readFileSync(statePath, "utf-8"));

  const connection = new Connection(state.rpcUrl, "confirmed");
  const keypair = Keypair.fromSecretKey(Uint8Array.from(state.sellerKeypair));
  const wallet = new anchor.Wallet(keypair);
  const sdk = new HaggleSDK({ connection, wallet });
  const negotiationPda = new PublicKey(state.negotiationPda);

  // LLM
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const llm: LLMClient = apiKey ? new OpenRouterClient(apiKey, model) : new MockLLMClient();

  log(`Wallet: ${keypair.publicKey.toBase58().slice(0, 12)}...`);
  log(`Negotiation: ${negotiationPda.toBase58().slice(0, 12)}...`);
  log(`LLM: ${apiKey ? model : "disabled"}`);
  log("Watching for incoming negotiation...\n");

  const offerHistory: { round: number; side: string; amount: number }[] = [];
  let lastRound = -1;
  let hasAcceptedInvitation = false;

  while (true) {
    try {
      const neg = await sdk.fetchNegotiation(negotiationPda);
      const status = parseStatus(neg.status);

      // Terminal states
      if ([NegotiationStatus.Settled, NegotiationStatus.Expired, NegotiationStatus.Rejected].includes(status)) {
        log(`🏁 Negotiation ended: ${status.toUpperCase()}`);
        if (status === NegotiationStatus.Settled) {
          log(`   Settled at: ${(neg.settledAmount.toNumber() / 1e6).toFixed(2)} USDC`);
          log(`   Rounds: ${neg.currentRound}`);
          const fee = Math.floor((neg.settledAmount.toNumber() * 50) / 10000);
          log(`   My earnings: ${((neg.settledAmount.toNumber() - fee) / 1e6).toFixed(4)} USDC`);
        }
        break;
      }

      // Step 1: Accept invitation if Created
      if (status === NegotiationStatus.Created && !hasAcceptedInvitation) {
        log("📨 Received negotiation invitation!");
        log(`   Service: whale-pattern-analysis`);
        log(`   Escrow: ${(neg.escrowAmount.toNumber() / 1e6).toFixed(2)} USDC`);
        log("   Accepting invitation...");

        const tx = await sdk.acceptInvitation(negotiationPda);
        log(`✅ Invitation accepted!`);
        log(`   Tx: ${tx}`);
        hasAcceptedInvitation = true;
        lastRound = 0;
        await sleep(POLL_INTERVAL);
        continue;
      }

      // Skip if same round
      if (neg.currentRound === lastRound) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      // Check if it's our turn
      const isMyTurn = sdk.isMyTurn(neg, keypair.publicKey);
      if (!isMyTurn) {
        if (neg.currentRound !== lastRound) {
          log(`⏳ Waiting for DataHunter's offer... (round ${neg.currentRound + 1})`);
          lastRound = neg.currentRound;
        }
        await sleep(POLL_INTERVAL);
        continue;
      }

      // Record opponent's last offer
      if (neg.currentOfferAmount.toNumber() > 0 && neg.currentRound > offerHistory.length) {
        offerHistory.push({
          round: neg.currentRound,
          side: Object.keys(neg.offerSide)[0],
          amount: neg.currentOfferAmount.toNumber(),
        });
        log(`📥 Received offer: ${(neg.currentOfferAmount.toNumber() / 1e6).toFixed(2)} USDC (round ${neg.currentRound})`);
      }

      // Get LLM decision
      log(`🧠 Evaluating offer... (round ${neg.currentRound + 1})`);
      const decision = await getDecision(llm, neg, offerHistory);
      log(`💭 ${decision.reasoning}`);

      if (decision.action === "offer" && decision.amount) {
        const tx = await sdk.submitOffer(
          negotiationPda,
          new BN(decision.amount),
          createMetadata(`ChainOracle-r${neg.currentRound + 1}`)
        );
        log(`📤 Counter-offered ${(decision.amount / 1e6).toFixed(2)} USDC`);
        log(`   Tx: ${tx}`);
        offerHistory.push({
          round: neg.currentRound + 1,
          side: "seller",
          amount: decision.amount,
        });
        lastRound = neg.currentRound + 1;
      } else if (decision.action === "accept") {
        const tx = await sdk.acceptOffer(
          negotiationPda,
          new PublicKey(state.sellerAta),
          new PublicKey(state.treasuryAta),
          new PublicKey(state.buyerAta)
        );
        log(`✅ Accepted! Deal closed at ${(neg.currentOfferAmount.toNumber() / 1e6).toFixed(2)} USDC!`);
        log(`   Tx: ${tx}`);
        break;
      } else {
        const tx = await sdk.rejectNegotiation(
          negotiationPda,
          new PublicKey(state.buyerAta)
        );
        log(`❌ Rejected negotiation`);
        log(`   Tx: ${tx}`);
        break;
      }
    } catch (e: any) {
      log(`⚠️  Error: ${e.message?.slice(0, 80)}`);
    }

    await sleep(POLL_INTERVAL);
  }

  log("\n  ChainOracle shutting down. 👋\n");
}

async function getDecision(
  llm: LLMClient,
  neg: NegotiationAccount,
  history: { round: number; side: string; amount: number }[]
): Promise<{ action: "offer" | "accept" | "reject"; amount?: number; reasoning: string }> {
  const escrow = neg.escrowAmount.toNumber() / 1e6;
  const effective = neg.effectiveEscrow.toNumber() / 1e6;
  const currentOffer = neg.currentOfferAmount.toNumber() / 1e6;
  const round = neg.currentRound;
  const maxRounds = neg.maxRounds;

  const historyStr = history
    .map((h) => `Round ${h.round}: ${h.side} offered ${h.amount / 1e6} USDC`)
    .join("\n");

  const messages: LLMMessage[] = [
    {
      role: "system",
      content: `You are ChainOracle, a premium blockchain analytics AI. You are the SELLER in a negotiation on Solana. You provide high-quality whale pattern analysis.

You MUST respond with EXACTLY one JSON (no other text):
{"action":"offer","amount":<number>,"reasoning":"<1-2 sentences>"}
{"action":"accept","reasoning":"<1-2 sentences>"}

Rules:
- Original escrow: ${escrow} USDC, effective after decay: ${effective} USDC
- Round: ${round}/${maxRounds}. Escrow decays 2% each round — delay costs both parties.
- Your counter-offers must be between ${(effective * 0.1).toFixed(2)} and ${effective.toFixed(2)} USDC.
- As a seller, you want to earn MORE. Start high, concede gradually.
- If the buyer's price is reasonable (above 55% of escrow), consider accepting.
- If running out of rounds (round ${maxRounds - 2}+), be more flexible to avoid total loss.
- Your analytics are premium quality — don't sell too cheaply.`,
    },
    {
      role: "user",
      content: `${historyStr ? `History:\n${historyStr}\n` : ""}
Buyer's current offer: ${currentOffer} USDC
Your move:`,
    },
  ];

  try {
    const response = await llm.chat(messages);
    const jsonMatch = response.match(/\{[^}]+\}/);
    if (!jsonMatch) throw new Error("No JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.action === "offer" && typeof parsed.amount === "number") {
      return {
        action: "offer",
        amount: Math.floor(parsed.amount * 1e6),
        reasoning: parsed.reasoning || "Premium analytics justify this price.",
      };
    }
    if (parsed.action === "accept") {
      return { action: "accept", reasoning: parsed.reasoning || "Fair price for quality analytics." };
    }
    throw new Error("Invalid response");
  } catch (e: any) {
    // Fallback strategy
    const targetPrice = escrow * 0.65;
    if (currentOffer >= targetPrice) {
      return { action: "accept", reasoning: `Price ${currentOffer} meets minimum threshold.` };
    }
    const startHigh = escrow * 0.85;
    const concession = (escrow * 0.05) * round;
    const offer = Math.max(startHigh - concession, effective * 0.5);
    return {
      action: "offer",
      amount: Math.floor(offer * 1e6),
      reasoning: `Counter at ${offer.toFixed(2)} USDC — premium analytics are worth this.`,
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error("❌ Seller agent failed:", e.message || e);
  process.exit(1);
});
