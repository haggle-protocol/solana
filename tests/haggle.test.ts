import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Haggle } from "../target/types/haggle";
import { assert } from "chai";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";

async function fundAccount(
  provider: anchor.AnchorProvider,
  to: PublicKey,
  lamports: number
) {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: to,
      lamports,
    })
  );
  await provider.sendAndConfirm(tx);
}

describe("haggle-protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Haggle as Program<Haggle>;

  // Keys
  const authority = provider.wallet as anchor.Wallet;
  const buyer = Keypair.generate();
  const seller = Keypair.generate();
  const treasury = Keypair.generate();

  // Token
  let tokenMint: PublicKey;
  let buyerTokenAccount: PublicKey;
  let sellerTokenAccount: PublicKey;
  let treasuryTokenAccount: PublicKey;

  // PDAs
  let configPda: PublicKey;
  let configBump: number;
  let negotiationPda: PublicKey;
  let negotiationBump: number;
  let vaultPda: PublicKey;
  let vaultBump: number;

  const sessionId = new BN(1);
  const escrowAmount = new BN(5_000_000); // 5 USDC

  before(async () => {
    // Fund accounts from provider wallet
    await fundAccount(provider, buyer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await fundAccount(provider, seller.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await fundAccount(provider, treasury.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);

    // Create token mint
    tokenMint = await createMint(
      provider.connection,
      authority.payer,
      authority.publicKey,
      null,
      6 // USDC decimals
    );

    // Create token accounts
    buyerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      tokenMint,
      buyer.publicKey
    );
    sellerTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      tokenMint,
      seller.publicKey
    );
    treasuryTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      authority.payer,
      tokenMint,
      treasury.publicKey
    );

    // Mint tokens to buyer
    await mintTo(
      provider.connection,
      authority.payer,
      tokenMint,
      buyerTokenAccount,
      authority.publicKey,
      10_000_000 // 10 USDC
    );

    // Derive PDAs
    [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    [negotiationPda, negotiationBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("negotiation"),
        buyer.publicKey.toBuffer(),
        seller.publicKey.toBuffer(),
        sessionId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    [vaultPda, vaultBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), negotiationPda.toBuffer()],
      program.programId
    );
  });

  it("Initializes protocol config", async () => {
    await program.methods
      .initializeConfig(
        treasury.publicKey,
        200, // decay_rate_bps
        new BN(300), // response_window
        50, // protocol_fee_bps
        10 // max_rounds
      )
      .accounts({
        authority: authority.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const config = await program.account.protocolConfig.fetch(configPda);
    assert.equal(config.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(config.treasury.toBase58(), treasury.publicKey.toBase58());
    assert.equal(config.defaultDecayRateBps, 200);
    assert.equal(config.defaultProtocolFeeBps, 50);
    assert.equal(config.totalNegotiations.toNumber(), 0);
    assert.equal(config.isPaused, false);
  });

  it("Creates a negotiation", async () => {
    const serviceHash = Buffer.alloc(32);
    Buffer.from("analyze-whale-patterns").copy(serviceHash);

    const params = {
      escrowAmount: escrowAmount,
      serviceHash: Array.from(serviceHash),
      maxRounds: 8,
      decayRateBps: 200,
      responseWindow: new BN(300),
      globalDeadlineOffset: new BN(1800),
      minOfferBps: 1000,
      protocolFeeBps: 50,
      zopaEnabled: false,
    };

    await program.methods
      .createNegotiation(sessionId, params)
      .accounts({
        buyer: buyer.publicKey,
        seller: seller.publicKey,
        negotiation: negotiationPda,
        escrowVault: vaultPda,
        buyerTokenAccount: buyerTokenAccount,
        tokenMint: tokenMint,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    const neg = await program.account.negotiationState.fetch(negotiationPda);
    assert.equal(neg.buyer.toBase58(), buyer.publicKey.toBase58());
    assert.equal(neg.seller.toBase58(), seller.publicKey.toBase58());
    assert.equal(neg.sessionId.toNumber(), 1);
    assert.deepEqual(neg.status, { created: {} });
    assert.equal(neg.escrowAmount.toNumber(), 5_000_000);
    assert.equal(neg.effectiveEscrow.toNumber(), 5_000_000);
    assert.equal(neg.maxRounds, 8);
    assert.equal(neg.decayRateBps, 200);

    // Verify escrow vault has the funds
    const vault = await getAccount(provider.connection, vaultPda);
    assert.equal(Number(vault.amount), 5_000_000);

    // Verify config counter updated
    const config = await program.account.protocolConfig.fetch(configPda);
    assert.equal(config.totalNegotiations.toNumber(), 1);
  });

  it("Seller accepts invitation", async () => {
    await program.methods
      .acceptInvitation()
      .accounts({
        seller: seller.publicKey,
        negotiation: negotiationPda,
      })
      .signers([seller])
      .rpc();

    const neg = await program.account.negotiationState.fetch(negotiationPda);
    assert.deepEqual(neg.status, { proposed: {} });
  });

  it("Buyer submits first offer (2 USDC)", async () => {
    const metadata = Buffer.alloc(64);
    Buffer.from("initial-offer").copy(metadata);

    await program.methods
      .submitOffer(new BN(2_000_000), Array.from(metadata))
      .accounts({
        offerer: buyer.publicKey,
        negotiation: negotiationPda,
      })
      .signers([buyer])
      .rpc();

    const neg = await program.account.negotiationState.fetch(negotiationPda);
    assert.equal(neg.currentOfferAmount.toNumber(), 2_000_000);
    assert.equal(neg.currentRound, 1);
    assert.deepEqual(neg.offerSide, { buyer: {} });
    assert.deepEqual(neg.status, { proposed: {} });
    // Escrow decayed: 5_000_000 * 200/10000 = 100_000 decay
    assert.equal(neg.effectiveEscrow.toNumber(), 4_900_000);
  });

  it("Seller counters (4.2 USDC)", async () => {
    const metadata = Buffer.alloc(64);

    await program.methods
      .submitOffer(new BN(4_200_000), Array.from(metadata))
      .accounts({
        offerer: seller.publicKey,
        negotiation: negotiationPda,
      })
      .signers([seller])
      .rpc();

    const neg = await program.account.negotiationState.fetch(negotiationPda);
    assert.equal(neg.currentOfferAmount.toNumber(), 4_200_000);
    assert.equal(neg.currentRound, 2);
    assert.deepEqual(neg.offerSide, { seller: {} });
    assert.deepEqual(neg.status, { countered: {} });
    // 4_900_000 * 200/10000 = 98_000 decay → 4_802_000
    assert.equal(neg.effectiveEscrow.toNumber(), 4_802_000);
  });

  it("Buyer counters (2.5 USDC)", async () => {
    const metadata = Buffer.alloc(64);

    await program.methods
      .submitOffer(new BN(2_500_000), Array.from(metadata))
      .accounts({
        offerer: buyer.publicKey,
        negotiation: negotiationPda,
      })
      .signers([buyer])
      .rpc();

    const neg = await program.account.negotiationState.fetch(negotiationPda);
    assert.equal(neg.currentOfferAmount.toNumber(), 2_500_000);
    assert.equal(neg.currentRound, 3);
    assert.deepEqual(neg.status, { proposed: {} });
  });

  it("Seller counters (3.5 USDC)", async () => {
    const metadata = Buffer.alloc(64);

    await program.methods
      .submitOffer(new BN(3_500_000), Array.from(metadata))
      .accounts({
        offerer: seller.publicKey,
        negotiation: negotiationPda,
      })
      .signers([seller])
      .rpc();

    const neg = await program.account.negotiationState.fetch(negotiationPda);
    assert.equal(neg.currentOfferAmount.toNumber(), 3_500_000);
    assert.equal(neg.currentRound, 4);
    assert.deepEqual(neg.status, { countered: {} });
  });

  it("Buyer counters (3.0 USDC)", async () => {
    const metadata = Buffer.alloc(64);

    await program.methods
      .submitOffer(new BN(3_000_000), Array.from(metadata))
      .accounts({
        offerer: buyer.publicKey,
        negotiation: negotiationPda,
      })
      .signers([buyer])
      .rpc();

    const neg = await program.account.negotiationState.fetch(negotiationPda);
    assert.equal(neg.currentOfferAmount.toNumber(), 3_000_000);
    assert.equal(neg.currentRound, 5);
    assert.deepEqual(neg.status, { proposed: {} });
  });

  it("Seller accepts offer at 3.0 USDC (settlement)", async () => {
    const buyerBalanceBefore = await getAccount(
      provider.connection,
      buyerTokenAccount
    );

    await program.methods
      .acceptOffer()
      .accounts({
        acceptor: seller.publicKey,
        negotiation: negotiationPda,
        escrowVault: vaultPda,
        sellerTokenAccount: sellerTokenAccount,
        treasuryTokenAccount: treasuryTokenAccount,
        buyerTokenAccount: buyerTokenAccount,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([seller])
      .rpc();

    const neg = await program.account.negotiationState.fetch(negotiationPda);
    assert.deepEqual(neg.status, { settled: {} });
    assert.equal(neg.settledAmount.toNumber(), 3_000_000);
    assert.ok(neg.settledAt.toNumber() > 0);

    // Verify seller received payment (3_000_000 - fee)
    const sellerBalance = await getAccount(
      provider.connection,
      sellerTokenAccount
    );
    const protocolFee = Math.floor((3_000_000 * 50) / 10000); // 15,000
    assert.equal(Number(sellerBalance.amount), 3_000_000 - protocolFee);

    // Verify treasury received fee
    const treasuryBalance = await getAccount(
      provider.connection,
      treasuryTokenAccount
    );
    assert.equal(Number(treasuryBalance.amount), protocolFee);

    // Verify buyer got refund of remaining escrow
    const buyerBalanceAfter = await getAccount(
      provider.connection,
      buyerTokenAccount
    );
    const refund = 5_000_000 - 3_000_000; // vault had 5M, settled 3M
    assert.equal(
      Number(buyerBalanceAfter.amount),
      Number(buyerBalanceBefore.amount) + refund
    );

    // Verify config updated
    const config = await program.account.protocolConfig.fetch(configPda);
    assert.equal(config.totalSettledVolume.toNumber(), 3_000_000);
    assert.equal(config.totalFeesCollected.toNumber(), protocolFee);
  });

  it("Creator closes negotiation and reclaims rent", async () => {
    await program.methods
      .closeNegotiation()
      .accounts({
        creator: buyer.publicKey,
        negotiation: negotiationPda,
        escrowVault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([buyer])
      .rpc();

    // Verify negotiation account is closed
    try {
      await program.account.negotiationState.fetch(negotiationPda);
      assert.fail("Account should have been closed");
    } catch (e) {
      assert.ok(e.message.includes("Account does not exist"));
    }
  });

  // === Rejection scenario ===
  describe("Rejection flow", () => {
    const sessionId2 = new BN(2);
    let negPda2: PublicKey;
    let vaultPda2: PublicKey;

    before(async () => {
      [negPda2] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("negotiation"),
          buyer.publicKey.toBuffer(),
          seller.publicKey.toBuffer(),
          sessionId2.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );
      [vaultPda2] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), negPda2.toBuffer()],
        program.programId
      );

      // Mint more tokens to buyer
      await mintTo(
        provider.connection,
        authority.payer,
        tokenMint,
        buyerTokenAccount,
        authority.publicKey,
        5_000_000
      );
    });

    it("Creates and rejects a negotiation", async () => {
      const serviceHash = Buffer.alloc(32);
      const params = {
        escrowAmount: new BN(3_000_000),
        serviceHash: Array.from(serviceHash),
        maxRounds: 8,
        decayRateBps: 200,
        responseWindow: new BN(300),
        globalDeadlineOffset: new BN(1800),
        minOfferBps: 1000,
        protocolFeeBps: 50,
        zopaEnabled: false,
      };

      await program.methods
        .createNegotiation(sessionId2, params)
        .accounts({
          buyer: buyer.publicKey,
          seller: seller.publicKey,
          negotiation: negPda2,
          escrowVault: vaultPda2,
          buyerTokenAccount: buyerTokenAccount,
          tokenMint: tokenMint,
          config: configPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      const buyerBalanceBefore = await getAccount(
        provider.connection,
        buyerTokenAccount
      );

      // Seller rejects
      await program.methods
        .rejectNegotiation()
        .accounts({
          rejector: seller.publicKey,
          negotiation: negPda2,
          escrowVault: vaultPda2,
          buyerTokenAccount: buyerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([seller])
        .rpc();

      const neg = await program.account.negotiationState.fetch(negPda2);
      assert.deepEqual(neg.status, { rejected: {} });

      // Verify buyer got full refund
      const buyerBalanceAfter = await getAccount(
        provider.connection,
        buyerTokenAccount
      );
      assert.equal(
        Number(buyerBalanceAfter.amount),
        Number(buyerBalanceBefore.amount) + 3_000_000
      );
    });
  });
});
