import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import { HaggleSDK, createServiceHash, createMetadata } from "../sdk";
import { OpenRouterClient, MockLLMClient, LLMClient } from "./llm";
import { NegotiationAgent, AgentMode, OfferDecision } from "./agent";

// ===== Config =====

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const [key, ...vals] = line.split("=");
      if (key && vals.length) {
        process.env[key.trim()] = vals.join("=").trim();
      }
    }
  }
}

// ===== Scripted Offer Sequences =====

const BUYER_OFFERS = [2_000_000, 2_500_000, 3_000_000]; // 2.0, 2.5, 3.0 USDC
const SELLER_OFFERS = [4_200_000, 3_500_000]; // 4.2, 3.5 USDC (then accepts)

// ===== Main =====

async function main() {
  loadEnv();

  const mode: AgentMode = (process.argv[2] as AgentMode) || "demo";
  console.log(`
  ██╗  ██╗ █████╗  ██████╗  ██████╗ ██╗     ███████╗
  ██║  ██║██╔══██╗██╔════╝ ██╔════╝ ██║     ██╔════╝
  ███████║███████║██║  ███╗██║  ███╗██║     █████╗
  ██╔══██║██╔══██║██║   ██║██║   ██║██║     ██╔══╝
  ██║  ██║██║  ██║╚██████╔╝╚██████╔╝███████╗███████╗
  ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝╚══════╝
           P R O T O C O L   ·   L I V E   D E M O
      On-chain AI Agent Negotiation on Solana (Devnet)
  `);
  console.log(`\n  Mode: ${mode === "demo" ? "📋 Scripted + LLM Commentary" : "🤖 Fully Autonomous"}`);

  // Setup connection
  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  console.log(`  RPC: ${rpcUrl}\n`);

  // Load deployer wallet
  const walletPath = process.env.ANCHOR_WALLET
    || path.join(process.env.HOME || process.env.USERPROFILE || "", ".config/solana/id.json");
  const deployerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const deployerWallet = new anchor.Wallet(deployerKeypair);

  // Create agent keypairs
  const buyerKeypair = Keypair.generate();
  const sellerKeypair = Keypair.generate();
  const treasuryKeypair = Keypair.generate();

  // LLM setup
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  const llm: LLMClient = apiKey
    ? new OpenRouterClient(apiKey, model)
    : new MockLLMClient();

  console.log(`  LLM: ${apiKey ? `OpenRouter (${model})` : "Disabled (no API key)"}\n`);

  // ===== Step 1: Fund agents =====
  console.log("━━━ Step 1: Funding agent wallets ━━━");

  const fundTx = new Transaction();
  for (const kp of [buyerKeypair, sellerKeypair, treasuryKeypair]) {
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: deployerKeypair.publicKey,
        toPubkey: kp.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );
  }
  const provider = new anchor.AnchorProvider(connection, deployerWallet, { commitment: "confirmed" });
  await provider.sendAndConfirm(fundTx);
  console.log(`  ✅ Funded 3 wallets (0.1 SOL each)`);
  console.log(`  Buyer:    ${buyerKeypair.publicKey.toBase58()}`);
  console.log(`  Seller:   ${sellerKeypair.publicKey.toBase58()}`);
  console.log(`  Treasury: ${treasuryKeypair.publicKey.toBase58()}\n`);

  // ===== Step 2: Create token mint + accounts =====
  console.log("━━━ Step 2: Setting up test USDC token ━━━");

  const tokenMint = await createMint(connection, deployerKeypair, deployerKeypair.publicKey, null, 6);
  console.log(`  Token Mint: ${tokenMint.toBase58()}`);

  const buyerAta = await createAssociatedTokenAccount(connection, deployerKeypair, tokenMint, buyerKeypair.publicKey);
  const sellerAta = await createAssociatedTokenAccount(connection, deployerKeypair, tokenMint, sellerKeypair.publicKey);
  const treasuryAta = await createAssociatedTokenAccount(connection, deployerKeypair, tokenMint, treasuryKeypair.publicKey);

  await mintTo(connection, deployerKeypair, tokenMint, buyerAta, deployerKeypair.publicKey, 10_000_000);
  console.log(`  ✅ Minted 10 USDC to buyer\n`);

  // ===== Step 3: Initialize protocol config =====
  console.log("━━━ Step 3: Initializing protocol config ━━━");

  const adminSdk = new HaggleSDK({ connection, wallet: deployerWallet });
  try {
    await adminSdk.initializeConfig(
      treasuryKeypair.publicKey,
      200,
      new BN(300),
      50,
      10
    );
    console.log(`  ✅ Protocol config initialized\n`);
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log(`  ⚠️  Config already exists, skipping\n`);
    } else {
      throw e;
    }
  }

  // ===== Step 4: Create agents =====
  console.log("━━━ Step 4: Creating AI agents ━━━");

  const dataHunter = new NegotiationAgent({
    name: "DataHunter",
    role: "buyer",
    persona: "an AI agent that needs on-chain whale transaction analysis. You are cost-conscious but value quality data. You aim to pay a fair but competitive price.",
    keypair: buyerKeypair,
    connection,
    tokenMint,
    llm,
    mode,
  });

  const chainOracle = new NegotiationAgent({
    name: "ChainOracle",
    role: "seller",
    persona: "an AI oracle that provides premium blockchain analytics. Your analysis is high-quality and you know your worth, but you also want to close deals efficiently.",
    keypair: sellerKeypair,
    connection,
    tokenMint,
    llm,
    mode,
  });

  console.log(`  🔍 DataHunter (Buyer) — On-chain data analysis requester`);
  console.log(`  🔮 ChainOracle (Seller) — Premium blockchain analytics provider\n`);

  // ===== Step 5: Start negotiation =====
  console.log("━━━ Step 5: Creating negotiation ━━━");

  const sessionId = new BN(Date.now());
  const escrowAmount = new BN(5_000_000); // 5 USDC

  const { tx: createTx, negotiationPda, vaultPda } = await dataHunter.sdk.createNegotiation(
    sellerKeypair.publicKey,
    sessionId,
    tokenMint,
    buyerAta,
    {
      escrowAmount,
      serviceHash: createServiceHash("whale-pattern-analysis"),
      maxRounds: 8,
      decayRateBps: 200,
      responseWindow: new BN(600),
      globalDeadlineOffset: new BN(3600),
      minOfferBps: 1000,
      protocolFeeBps: 50,
      zopaEnabled: false,
    }
  );

  console.log(`  📝 Negotiation created`);
  console.log(`  PDA: ${negotiationPda.toBase58()}`);
  console.log(`  Escrow: 5.0 USDC | Max rounds: 8 | Decay: 2%/round`);
  console.log(`  Tx: ${createTx}\n`);

  // ===== Step 6: Seller accepts invitation =====
  console.log("━━━ Step 6: Seller accepts invitation ━━━");

  const acceptTx = await chainOracle.sdk.acceptInvitation(negotiationPda);
  console.log(`  ✅ ChainOracle accepted the invitation`);
  console.log(`  Tx: ${acceptTx}\n`);

  // ===== Step 7: Negotiation rounds =====
  console.log("━━━ Step 7: Negotiation rounds ━━━");

  let buyerOfferIdx = 0;
  let sellerOfferIdx = 0;
  let settled = false;

  for (let round = 0; round < 8; round++) {
    const neg = await dataHunter.sdk.fetchNegotiation(negotiationPda);
    const currentAgent = round % 2 === 0 ? dataHunter : chainOracle;
    const isLast = round >= 5;

    console.log(`\n  ── Round ${round + 1} ──`);

    let decision: OfferDecision;

    if (mode === "demo") {
      // Scripted logic
      if (currentAgent.role === "buyer") {
        if (buyerOfferIdx < BUYER_OFFERS.length) {
          decision = await currentAgent.decide(neg, {
            action: "offer",
            amount: BUYER_OFFERS[buyerOfferIdx],
            reasoning: "",
          });
          buyerOfferIdx++;
        } else {
          decision = await currentAgent.decide(neg, {
            action: "accept",
            reasoning: "",
          });
        }
      } else {
        if (sellerOfferIdx < SELLER_OFFERS.length) {
          decision = await currentAgent.decide(neg, {
            action: "offer",
            amount: SELLER_OFFERS[sellerOfferIdx],
            reasoning: "",
          });
          sellerOfferIdx++;
        } else {
          decision = await currentAgent.decide(neg, {
            action: "accept",
            reasoning: "",
          });
        }
      }
    } else {
      // Autonomous mode
      decision = await currentAgent.decide(neg, {
        action: "offer",
        amount: 0,
        reasoning: "",
      });
    }

    currentAgent.logThinking(decision.reasoning);

    if (decision.action === "offer" && decision.amount) {
      const tx = await currentAgent.sdk.submitOffer(
        negotiationPda,
        new BN(decision.amount),
        createMetadata(`${currentAgent.name}-round-${round + 1}`)
      );
      currentAgent.log(
        `📤 Offer: ${(decision.amount / 1e6).toFixed(1)} USDC → ✅ confirmed`
      );
      currentAgent.log(`   Tx: ${tx}`);

      dataHunter.recordOffer(round + 1, currentAgent.role, decision.amount);
      chainOracle.recordOffer(round + 1, currentAgent.role, decision.amount);
    } else if (decision.action === "accept") {
      const tx = await currentAgent.sdk.acceptOffer(
        negotiationPda,
        sellerAta,
        treasuryAta,
        buyerAta
      );
      currentAgent.log(`✅ Accepted the offer! Settlement confirmed.`);
      currentAgent.log(`   Tx: ${tx}`);
      settled = true;
      break;
    } else if (decision.action === "reject") {
      const tx = await currentAgent.sdk.rejectNegotiation(negotiationPda, buyerAta);
      currentAgent.log(`❌ Rejected the negotiation.`);
      currentAgent.log(`   Tx: ${tx}`);
      break;
    }

    // Small delay for readability
    await new Promise((r) => setTimeout(r, 1000));
  }

  // ===== Step 8: Results =====
  console.log("\n━━━ Results ━━━");

  const finalNeg = await dataHunter.sdk.fetchNegotiation(negotiationPda);
  const finalStatus = Object.keys(finalNeg.status)[0];
  const settledAmt = finalNeg.settledAmount.toNumber();
  const escrowDecay = finalNeg.escrowAmount.toNumber() - finalNeg.effectiveEscrow.toNumber();

  console.log(`  Status:          ${finalStatus.toUpperCase()}`);
  console.log(`  Settled amount:  ${(settledAmt / 1e6).toFixed(2)} USDC`);
  console.log(`  Rounds used:     ${finalNeg.currentRound}/8`);
  console.log(`  Escrow decay:    ${(escrowDecay / 1e6).toFixed(4)} USDC`);
  if (settled) {
    const fee = Math.floor((settledAmt * 50) / 10000);
    console.log(`  Protocol fee:    ${(fee / 1e6).toFixed(4)} USDC`);
    console.log(`  Seller received: ${((settledAmt - fee) / 1e6).toFixed(4)} USDC`);
    console.log(`  Buyer refund:    ${((5_000_000 - settledAmt) / 1e6).toFixed(4)} USDC`);
  }

  // ===== Step 9: Close =====
  if (["settled", "rejected", "expired"].includes(finalStatus)) {
    console.log("\n━━━ Closing negotiation ━━━");
    const closeTx = await dataHunter.sdk.closeNegotiation(negotiationPda);
    console.log(`  ✅ Negotiation closed, rent reclaimed`);
    console.log(`  Tx: ${closeTx}`);
  }

  console.log(`
  ┌─────────────────────────────────────────────┐
  │          ✨ Demo Complete!                   │
  │     Haggle Protocol - Powered by Solana     │
  └─────────────────────────────────────────────┘
  `);

  console.log(`  Explorer: https://explorer.solana.com/address/${negotiationPda.toBase58()}?cluster=devnet\n`);
}

main().catch((e) => {
  console.error("\n❌ Demo failed:", e.message || e);
  process.exit(1);
});
