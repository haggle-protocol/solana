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
} from "@solana/spl-token";
import BN from "bn.js";
import * as fs from "fs";
import * as path from "path";
import { HaggleSDK, createServiceHash } from "../sdk";

const RPC = "https://api.devnet.solana.com";

async function main() {
  const connection = new Connection(RPC, "confirmed");

  const walletPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".config/solana/id.json");
  const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
  const deployerWallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, deployerWallet, { commitment: "confirmed" });

  console.log("Deployer:", deployer.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(deployer.publicKey)) / LAMPORTS_PER_SOL, "SOL\n");

  const adminSdk = new HaggleSDK({ connection, wallet: deployerWallet });
  const config = await adminSdk.fetchConfig();

  console.log("\n━━━ Rejected After 6 Turns ━━━");

  const buyer = Keypair.generate();
  const seller = Keypair.generate();

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

  const mint = await createMint(connection, deployer, deployer.publicKey, null, 6);
  const buyerAta = await createAssociatedTokenAccount(connection, deployer, mint, buyer.publicKey);
  const sellerAta = await createAssociatedTokenAccount(connection, deployer, mint, seller.publicKey);
  const treasuryAta = (await getOrCreateAssociatedTokenAccount(connection, deployer, mint, config.treasury)).address;
  await mintTo(connection, deployer, mint, buyerAta, deployer.publicKey, 10_000_000);
  console.log("  Token setup done");

  const sessionId = new BN(Date.now());
  const buyerSdk = new HaggleSDK({ connection, wallet: new anchor.Wallet(buyer) });
  const sellerSdk = new HaggleSDK({ connection, wallet: new anchor.Wallet(seller) });

  const { negotiationPda } = await buyerSdk.createNegotiation(
    seller.publicKey,
    sessionId,
    mint,
    buyerAta,
    {
      escrowAmount: new BN(5_000_000),
      serviceHash: createServiceHash("Stubborn Buyer Rejected"),
      maxRounds: 10,
      decayRateBps: 200,
      responseWindow: new BN(600),
      globalDeadlineOffset: new BN(3600),
      minOfferBps: 1000,
      protocolFeeBps: 50,
      zopaEnabled: false,
    }
  );
  console.log("  Negotiation:", negotiationPda.toBase58());

  await sellerSdk.acceptInvitation(negotiationPda);
  console.log("  Seller accepted");

  // 6 turns: buyer barely moves, seller loses patience
  // decay=200bps: 5.0 → 4.90 → 4.802 → 4.706 → 4.612 → 4.520 → 4.429
  const offers = [
    { sdk: buyerSdk, amount: 1_000_000, label: "T1: Buyer 1.00" },
    { sdk: sellerSdk, amount: 4_500_000, label: "T2: Seller 4.50" },
    { sdk: buyerSdk, amount: 1_200_000, label: "T3: Buyer 1.20" },
    { sdk: sellerSdk, amount: 4_200_000, label: "T4: Seller 4.20" },
    { sdk: buyerSdk, amount: 1_300_000, label: "T5: Buyer 1.30" },
    { sdk: sellerSdk, amount: 4_000_000, label: "T6: Seller 4.00" },
  ];

  for (const o of offers) {
    await o.sdk.submitOffer(negotiationPda, new BN(o.amount));
    console.log(`  ${o.label}`);
  }

  // Seller rejects — buyer is not negotiating in good faith
  await sellerSdk.rejectNegotiation(negotiationPda, buyerAta);
  console.log("  Seller rejected -> Escrow refunded");

  console.log("\n━━━ RESULT ━━━");
  console.log(`Rejected: ${negotiationPda.toBase58()}`);
}

main().catch(e => { console.error(e); process.exit(1); });
