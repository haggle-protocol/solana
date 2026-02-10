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
  console.log(`  [${ts}] 🔍 DataHunter | ${msg}`);
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
  │  🔍 DataHunter — Autonomous Buyer   │
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
  const keypair = Keypair.fromSecretKey(Uint8Array.from(state.buyerKeypair));
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
  log("Waiting for negotiation to begin...\n");

  const offerHistory: { round: number; side: string; amount: number }[] = [];
  let lastRound = -1;

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
        }
        break;
      }

      // Skip if same round (already acted)
      if (neg.currentRound === lastRound && status !== NegotiationStatus.Created) {
        await sleep(POLL_INTERVAL);
        continue;
      }

      // Check if it's our turn
      const isMyTurn = sdk.isMyTurn(neg, keypair.publicKey);
      if (!isMyTurn) {
        if (neg.currentRound !== lastRound) {
          log(`⏳ Waiting for ChainOracle's response... (round ${neg.currentRound + 1})`);
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
      }

      // Get LLM decision
      log(`🧠 Analyzing... (round ${neg.currentRound + 1})`);
      const decision = await getDecision(llm, neg, offerHistory);
      log(`💭 ${decision.reasoning}`);

      if (decision.action === "offer" && decision.amount) {
        const tx = await sdk.submitOffer(
          negotiationPda,
          new BN(decision.amount),
          createMetadata(`DataHunter-r${neg.currentRound + 1}`)
        );
        log(`📤 Offered ${(decision.amount / 1e6).toFixed(2)} USDC`);
        log(`   Tx: ${tx}`);
        offerHistory.push({
          round: neg.currentRound + 1,
          side: "buyer",
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
        log(`✅ Accepted offer at ${(neg.currentOfferAmount.toNumber() / 1e6).toFixed(2)} USDC!`);
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

  log("\n  DataHunter shutting down. 👋\n");
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
      content: `You are DataHunter, an AI agent that needs on-chain whale transaction analysis. You are the BUYER in a negotiation on Solana. You want to pay a fair but LOW price.

You MUST respond with EXACTLY one JSON (no other text):
{"action":"offer","amount":<number>,"reasoning":"<1-2 sentences>"}
{"action":"accept","reasoning":"<1-2 sentences>"}

Rules:
- Original escrow: ${escrow} USDC, effective after decay: ${effective} USDC
- Round: ${round}/${maxRounds}. Escrow decays 2% each round.
- Your offers must be between ${(effective * 0.1).toFixed(2)} and ${effective.toFixed(2)} USDC.
- As a buyer, you want to pay LESS. Start low, concede slowly.
- If the seller's price is reasonable (within 15% of your target), consider accepting.
- If running out of rounds (round ${maxRounds - 1}+), be more willing to compromise.`,
    },
    {
      role: "user",
      content: `${historyStr ? `History:\n${historyStr}\n` : "This is the first offer.\n"}
Current offer on table: ${currentOffer > 0 ? `${currentOffer} USDC` : "none (your turn to open)"}
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
        reasoning: parsed.reasoning || "Strategic offer based on market analysis.",
      };
    }
    if (parsed.action === "accept") {
      return { action: "accept", reasoning: parsed.reasoning || "Deal accepted." };
    }
    throw new Error("Invalid response");
  } catch (e: any) {
    // Fallback strategy
    const targetPrice = escrow * 0.55;
    if (currentOffer > 0 && currentOffer <= targetPrice * 1.15) {
      return { action: "accept", reasoning: `Price ${currentOffer} is within acceptable range.` };
    }
    const step = (escrow * 0.1) * (round + 1);
    const offer = Math.min(escrow * 0.4 + step * 0.15, effective * 0.9);
    return {
      action: "offer",
      amount: Math.floor(offer * 1e6),
      reasoning: `Offering ${offer.toFixed(2)} USDC — gradual increase to find agreement.`,
    };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error("❌ Buyer agent failed:", e.message || e);
  process.exit(1);
});
