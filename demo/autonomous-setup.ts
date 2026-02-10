import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import { HaggleSDK, createServiceHash } from "../sdk";

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const [key, ...vals] = line.split("=");
      if (key && vals.length) process.env[key.trim()] = vals.join("=").trim();
    }
  }
}

async function main() {
  loadEnv();

  console.log("\n  ⚙️  Autonomous Demo — Setup\n");

  const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  // Load deployer
  const walletPath = process.env.ANCHOR_WALLET
    || path.join(process.env.HOME || process.env.USERPROFILE || "", ".config/solana/id.json");
  const deployer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );
  const deployerWallet = new anchor.Wallet(deployer);

  // Generate fresh keypairs
  const buyer = Keypair.generate();
  const seller = Keypair.generate();
  const treasury = Keypair.generate();

  // Fund
  console.log("  Funding wallets...");
  const fundTx = new Transaction();
  for (const kp of [buyer, seller, treasury]) {
    fundTx.add(
      SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: kp.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );
  }
  const provider = new anchor.AnchorProvider(connection, deployerWallet, { commitment: "confirmed" });
  await provider.sendAndConfirm(fundTx);
  console.log("  ✅ Funded");

  // Create mint + token accounts
  console.log("  Creating token mint...");
  const tokenMint = await createMint(connection, deployer, deployer.publicKey, null, 6);
  const buyerAta = await createAssociatedTokenAccount(connection, deployer, tokenMint, buyer.publicKey);
  const sellerAta = await createAssociatedTokenAccount(connection, deployer, tokenMint, seller.publicKey);
  const treasuryAta = await createAssociatedTokenAccount(connection, deployer, tokenMint, treasury.publicKey);
  await mintTo(connection, deployer, tokenMint, buyerAta, deployer.publicKey, 10_000_000);
  console.log("  ✅ Token mint + 10 USDC to buyer");

  // Init config or read existing
  console.log("  Initializing protocol config...");
  const adminSdk = new HaggleSDK({ connection, wallet: deployerWallet });
  let treasuryPubkey = treasury.publicKey;
  try {
    await adminSdk.initializeConfig(treasury.publicKey, 200, new BN(300), 50, 10);
    console.log("  ✅ Config initialized");
  } catch (e: any) {
    if (e.message?.includes("already in use")) {
      console.log("  ⚠️  Config exists, reading existing treasury...");
      const existingConfig = await adminSdk.fetchConfig();
      treasuryPubkey = existingConfig.treasury;
      console.log(`  Treasury from config: ${treasuryPubkey.toBase58()}`);
    } else throw e;
  }

  // Create treasury ATA for the actual config treasury
  let actualTreasuryAta = treasuryAta;
  if (!treasuryPubkey.equals(treasury.publicKey)) {
    const { getAssociatedTokenAddress: getAta } = await import("@solana/spl-token");
    actualTreasuryAta = await getAta(tokenMint, treasuryPubkey);
    // Ensure this ATA exists
    try {
      const { createAssociatedTokenAccount: createAta } = await import("@solana/spl-token");
      actualTreasuryAta = await createAta(connection, deployer, tokenMint, treasuryPubkey);
    } catch (e: any) {
      // Already exists, just get the address
      actualTreasuryAta = await getAta(tokenMint, treasuryPubkey);
    }
    console.log(`  Treasury ATA: ${actualTreasuryAta.toBase58()}`);
  }

  // Create negotiation
  console.log("  Creating negotiation...");
  const buyerSdk = new HaggleSDK({ connection, wallet: new anchor.Wallet(buyer) });
  const sessionId = new BN(Date.now());

  const { tx, negotiationPda, vaultPda } = await buyerSdk.createNegotiation(
    seller.publicKey,
    sessionId,
    tokenMint,
    buyerAta,
    {
      escrowAmount: new BN(5_000_000),
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

  console.log(`  ✅ Negotiation created: ${negotiationPda.toBase58()}`);

  // Save state
  const state = {
    rpcUrl,
    negotiationPda: negotiationPda.toBase58(),
    vaultPda: vaultPda.toBase58(),
    tokenMint: tokenMint.toBase58(),
    sessionId: sessionId.toString(),
    buyerKeypair: Array.from(buyer.secretKey),
    sellerKeypair: Array.from(seller.secretKey),
    treasuryKeypair: Array.from(treasury.secretKey),
    buyerAta: buyerAta.toBase58(),
    sellerAta: sellerAta.toBase58(),
    treasuryAta: actualTreasuryAta.toBase58(),
  };

  const statePath = path.join(__dirname, "demo-state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  console.log(`\n  📁 State saved to: demo-state.json`);
  console.log(`\n  Now run in two separate terminals:`);
  console.log(`    Terminal 1: npx ts-node demo/autonomous-buyer.ts`);
  console.log(`    Terminal 2: npx ts-node demo/autonomous-seller.ts\n`);
}

main().catch((e) => {
  console.error("❌ Setup failed:", e.message || e);
  process.exit(1);
});
