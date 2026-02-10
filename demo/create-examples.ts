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
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import { HaggleSDK, createServiceHash, createMetadata } from "../sdk";

const RPC = "https://api.devnet.solana.com";

async function main() {
  const connection = new Connection(RPC, "confirmed");

  // Load deployer wallet
  const walletPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".config/solana/id.json");
  const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
  const deployerWallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, deployerWallet, { commitment: "confirmed" });

  console.log("Deployer:", deployer.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(deployer.publicKey)) / LAMPORTS_PER_SOL, "SOL\n");

  // Read config to get treasury pubkey
  const adminSdk = new HaggleSDK({ connection, wallet: deployerWallet });
  let config;
  try {
    config = await adminSdk.fetchConfig();
    console.log("Config treasury:", config.treasury.toBase58());
  } catch (e) {
    console.log("Config not found, will initialize");
  }

  const scenarios = [
    { name: "Quick Deal (2 rounds)", rounds: "quick" },
    { name: "Rejected by Seller", rounds: "rejected" },
    { name: "Long Negotiation (4 rounds)", rounds: "long" },
  ];

  const results: any[] = [];

  for (const scenario of scenarios) {
    console.log(`\n━━━ ${scenario.name} ━━━`);

    const buyer = Keypair.generate();
    const seller = Keypair.generate();

    // Fund
    const fundTx = new Transaction();
    for (const kp of [buyer, seller]) {
      fundTx.add(SystemProgram.transfer({
        fromPubkey: deployer.publicKey,
        toPubkey: kp.publicKey,
        lamports: 0.05 * LAMPORTS_PER_SOL,
      }));
    }
    await provider.sendAndConfirm(fundTx);
    console.log("  Funded wallets");

    // Token mint
    const mint = await createMint(connection, deployer, deployer.publicKey, null, 6);
    const buyerAta = await createAssociatedTokenAccount(connection, deployer, mint, buyer.publicKey);
    const sellerAta = await createAssociatedTokenAccount(connection, deployer, mint, seller.publicKey);
    // Treasury ATA — use config.treasury owner
    const treasuryAta = (await getOrCreateAssociatedTokenAccount(connection, deployer, mint, config!.treasury)).address;
    await mintTo(connection, deployer, mint, buyerAta, deployer.publicKey, 10_000_000);
    console.log("  Token setup done");

    // Create negotiation
    const sessionId = new BN(Date.now());
    const buyerSdk = new HaggleSDK({ connection, wallet: new anchor.Wallet(buyer) });
    const sellerSdk = new HaggleSDK({ connection, wallet: new anchor.Wallet(seller) });

    const { negotiationPda, vaultPda } = await buyerSdk.createNegotiation(
      seller.publicKey,
      sessionId,
      mint,
      buyerAta,
      {
        escrowAmount: new BN(5_000_000),
        serviceHash: createServiceHash(scenario.name),
        maxRounds: 6,
        decayRateBps: 200,
        responseWindow: new BN(600),
        globalDeadlineOffset: new BN(3600),
        minOfferBps: 1000,
        protocolFeeBps: 50,
        zopaEnabled: false,
      }
    );
    console.log("  Negotiation:", negotiationPda.toBase58());

    // Seller accepts invitation
    await sellerSdk.acceptInvitation(negotiationPda);
    console.log("  Seller accepted");

    if (scenario.rounds === "quick") {
      // Quick: buyer offers 3.5, seller accepts immediately
      await buyerSdk.submitOffer(negotiationPda, new BN(3_500_000));
      console.log("  Buyer offered 3.50");
      await sellerSdk.submitOffer(negotiationPda, new BN(3_800_000));
      console.log("  Seller countered 3.80");
      await buyerSdk.acceptOffer(negotiationPda, sellerAta, treasuryAta, buyerAta);
      console.log("  Buyer accepted -> Settled at 3.80");

    } else if (scenario.rounds === "rejected") {
      // Rejected: buyer lowballs, seller counters, buyer lowballs again, seller rejects
      await buyerSdk.submitOffer(negotiationPda, new BN(1_000_000));
      console.log("  Buyer offered 1.00 (lowball)");
      await sellerSdk.submitOffer(negotiationPda, new BN(4_500_000));
      console.log("  Seller countered 4.50");
      await buyerSdk.submitOffer(negotiationPda, new BN(1_200_000));
      console.log("  Buyer offered 1.20 (still low)");
      await sellerSdk.rejectNegotiation(negotiationPda, buyerAta);
      console.log("  Seller rejected -> Escrow refunded");

    } else if (scenario.rounds === "long") {
      // Long: 4 rounds of back and forth, then settle
      await buyerSdk.submitOffer(negotiationPda, new BN(1_500_000));
      console.log("  R1: Buyer 1.50");
      await sellerSdk.submitOffer(negotiationPda, new BN(4_800_000));
      console.log("  R2: Seller 4.80");
      await buyerSdk.submitOffer(negotiationPda, new BN(2_200_000));
      console.log("  R3: Buyer 2.20");
      await sellerSdk.submitOffer(negotiationPda, new BN(3_900_000));
      console.log("  R4: Seller 3.90");
      await buyerSdk.submitOffer(negotiationPda, new BN(3_000_000));
      console.log("  R5: Buyer 3.00");
      await sellerSdk.acceptOffer(negotiationPda, sellerAta, treasuryAta, buyerAta);
      console.log("  Seller accepted -> Settled at 3.00");
    }

    results.push({
      name: scenario.name,
      pda: negotiationPda.toBase58(),
      outcome: scenario.rounds === "rejected" ? "Rejected" : "Settled",
    });
  }

  console.log("\n\n━━━ RESULTS ━━━\n");
  for (const r of results) {
    console.log(`${r.name}: ${r.pda} (${r.outcome})`);
  }

  // Save results
  const outPath = path.join(__dirname, "examples.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
