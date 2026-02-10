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

  const walletPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".config/solana/id.json");
  const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8"))));
  const deployerWallet = new anchor.Wallet(deployer);
  const provider = new anchor.AnchorProvider(connection, deployerWallet, { commitment: "confirmed" });

  console.log("Deployer:", deployer.publicKey.toBase58());
  console.log("Balance:", (await connection.getBalance(deployer.publicKey)) / LAMPORTS_PER_SOL, "SOL\n");

  const adminSdk = new HaggleSDK({ connection, wallet: deployerWallet });
  const config = await adminSdk.fetchConfig();
  console.log("Config treasury:", config.treasury.toBase58());

  console.log("\n━━━ Extended Negotiation (8 turns) ━━━");

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
  const treasuryAta = (await getOrCreateAssociatedTokenAccount(connection, deployer, mint, config.treasury)).address;
  await mintTo(connection, deployer, mint, buyerAta, deployer.publicKey, 10_000_000);
  console.log("  Token setup done");

  // Create negotiation with maxRounds=10
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
      serviceHash: createServiceHash("Extended Negotiation"),
      maxRounds: 10,
      decayRateBps: 150,
      responseWindow: new BN(600),
      globalDeadlineOffset: new BN(3600),
      minOfferBps: 1000,
      protocolFeeBps: 50,
      zopaEnabled: false,
    }
  );
  console.log("  Negotiation:", negotiationPda.toBase58());

  // Seller accepts
  await sellerSdk.acceptInvitation(negotiationPda);
  console.log("  Seller accepted");

  // 8 turns of negotiation — slow convergence
  // Buyer: 1.00 → 1.50 → 2.00 → 2.80 → 3.20
  // Seller: 4.90 → 4.50 → 4.00 → 3.20 (accept)
  // decay=150bps per turn, escrow starts at 5.00
  // eff: 4.925 → 4.851 → 4.778 → 4.706 → 4.635 → 4.566 → 4.497 → 4.429
  const offers = [
    { sdk: buyerSdk, amount: 1_000_000, label: "T1: Buyer 1.00" },
    { sdk: sellerSdk, amount: 4_800_000, label: "T2: Seller 4.80" },
    { sdk: buyerSdk, amount: 1_800_000, label: "T3: Buyer 1.80" },
    { sdk: sellerSdk, amount: 4_400_000, label: "T4: Seller 4.40" },
    { sdk: buyerSdk, amount: 2_300_000, label: "T5: Buyer 2.30" },
    { sdk: sellerSdk, amount: 3_800_000, label: "T6: Seller 3.80" },
    { sdk: buyerSdk, amount: 2_800_000, label: "T7: Buyer 2.80" },
    { sdk: sellerSdk, amount: 3_200_000, label: "T8: Seller 3.20" },
  ];

  for (const o of offers) {
    await o.sdk.submitOffer(negotiationPda, new BN(o.amount));
    console.log(`  ${o.label}`);
  }

  // Buyer accepts seller's last offer of 3.20
  await buyerSdk.acceptOffer(negotiationPda, sellerAta, treasuryAta, buyerAta);
  console.log("  Buyer accepted -> Settled at 3.20");

  console.log("\n━━━ RESULT ━━━");
  console.log(`Extended Negotiation: ${negotiationPda.toBase58()} (Settled)`);
}

main().catch(e => { console.error(e); process.exit(1); });
