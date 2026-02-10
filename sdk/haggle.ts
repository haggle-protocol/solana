import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  Connection,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import { Haggle } from "../target/types/haggle";
import {
  PROGRAM_ID,
  NegotiationParams,
  NegotiationAccount,
  ProtocolConfigAccount,
  parseStatus,
  NegotiationStatus,
} from "./types";
import {
  findConfigPda,
  findNegotiationPda,
  findVaultPda,
  createServiceHash,
  createMetadata,
} from "./utils";

export interface HaggleSDKConfig {
  connection: Connection;
  wallet: anchor.Wallet;
  programId?: PublicKey;
}

export class HaggleSDK {
  readonly program: Program<Haggle>;
  readonly provider: anchor.AnchorProvider;
  readonly programId: PublicKey;

  constructor(config: HaggleSDKConfig) {
    this.programId = config.programId ?? PROGRAM_ID;
    this.provider = new anchor.AnchorProvider(
      config.connection,
      config.wallet,
      { commitment: "confirmed" }
    );
    this.program = new Program<Haggle>(
      require("../target/idl/haggle.json"),
      this.provider
    );
  }

  // ===== PDAs =====

  getConfigPda(): [PublicKey, number] {
    return findConfigPda(this.programId);
  }

  getNegotiationPda(buyer: PublicKey, seller: PublicKey, sessionId: BN): [PublicKey, number] {
    return findNegotiationPda(buyer, seller, sessionId, this.programId);
  }

  getVaultPda(negotiation: PublicKey): [PublicKey, number] {
    return findVaultPda(negotiation, this.programId);
  }

  // ===== Write Operations =====

  async initializeConfig(
    treasury: PublicKey,
    decayRateBps: number,
    responseWindow: BN,
    protocolFeeBps: number,
    maxRounds: number
  ): Promise<string> {
    const [configPda] = this.getConfigPda();

    return this.program.methods
      .initializeConfig(
        treasury,
        decayRateBps,
        responseWindow,
        protocolFeeBps,
        maxRounds
      )
      .accountsStrict({
        authority: this.provider.wallet.publicKey,
        config: configPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }

  async createNegotiation(
    seller: PublicKey,
    sessionId: BN,
    tokenMint: PublicKey,
    buyerTokenAccount: PublicKey,
    params: NegotiationParams
  ): Promise<{ tx: string; negotiationPda: PublicKey; vaultPda: PublicKey }> {
    const buyer = this.provider.wallet.publicKey;
    const [negotiationPda] = this.getNegotiationPda(buyer, seller, sessionId);
    const [vaultPda] = this.getVaultPda(negotiationPda);
    const [configPda] = this.getConfigPda();

    const tx = await this.program.methods
      .createNegotiation(sessionId, params)
      .accountsStrict({
        buyer,
        seller,
        negotiation: negotiationPda,
        escrowVault: vaultPda,
        buyerTokenAccount,
        tokenMint,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { tx, negotiationPda, vaultPda };
  }

  async acceptInvitation(
    negotiationPda: PublicKey
  ): Promise<string> {
    return this.program.methods
      .acceptInvitation()
      .accountsStrict({
        seller: this.provider.wallet.publicKey,
        negotiation: negotiationPda,
      })
      .rpc();
  }

  async submitOffer(
    negotiationPda: PublicKey,
    amount: BN,
    metadata: string | number[] = ""
  ): Promise<string> {
    const metadataArr = typeof metadata === "string"
      ? createMetadata(metadata)
      : metadata;

    return this.program.methods
      .submitOffer(amount, metadataArr)
      .accountsStrict({
        offerer: this.provider.wallet.publicKey,
        negotiation: negotiationPda,
      })
      .rpc();
  }

  async acceptOffer(
    negotiationPda: PublicKey,
    sellerTokenAccount: PublicKey,
    treasuryTokenAccount: PublicKey,
    buyerTokenAccount: PublicKey
  ): Promise<string> {
    const [vaultPda] = this.getVaultPda(negotiationPda);
    const [configPda] = this.getConfigPda();

    return this.program.methods
      .acceptOffer()
      .accountsStrict({
        acceptor: this.provider.wallet.publicKey,
        negotiation: negotiationPda,
        escrowVault: vaultPda,
        sellerTokenAccount,
        treasuryTokenAccount,
        buyerTokenAccount,
        config: configPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  async rejectNegotiation(
    negotiationPda: PublicKey,
    buyerTokenAccount: PublicKey
  ): Promise<string> {
    const [vaultPda] = this.getVaultPda(negotiationPda);

    return this.program.methods
      .rejectNegotiation()
      .accountsStrict({
        rejector: this.provider.wallet.publicKey,
        negotiation: negotiationPda,
        escrowVault: vaultPda,
        buyerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  async expireNegotiation(
    negotiationPda: PublicKey,
    buyerTokenAccount: PublicKey
  ): Promise<string> {
    const [vaultPda] = this.getVaultPda(negotiationPda);

    return this.program.methods
      .expireNegotiation()
      .accountsStrict({
        cranker: this.provider.wallet.publicKey,
        negotiation: negotiationPda,
        escrowVault: vaultPda,
        buyerTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  async closeNegotiation(
    negotiationPda: PublicKey
  ): Promise<string> {
    const [vaultPda] = this.getVaultPda(negotiationPda);

    return this.program.methods
      .closeNegotiation()
      .accountsStrict({
        creator: this.provider.wallet.publicKey,
        negotiation: negotiationPda,
        escrowVault: vaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  // ===== Read Operations =====

  async fetchNegotiation(pda: PublicKey): Promise<NegotiationAccount> {
    return this.program.account.negotiationState.fetch(pda) as Promise<NegotiationAccount>;
  }

  async fetchConfig(): Promise<ProtocolConfigAccount> {
    const [configPda] = this.getConfigPda();
    return this.program.account.protocolConfig.fetch(configPda) as Promise<ProtocolConfigAccount>;
  }

  async findNegotiationsByBuyer(buyer: PublicKey): Promise<{ publicKey: PublicKey; account: NegotiationAccount }[]> {
    return this.program.account.negotiationState.all([
      { memcmp: { offset: 8, bytes: buyer.toBase58() } },
    ]) as any;
  }

  async findNegotiationsBySeller(seller: PublicKey): Promise<{ publicKey: PublicKey; account: NegotiationAccount }[]> {
    return this.program.account.negotiationState.all([
      { memcmp: { offset: 8 + 32, bytes: seller.toBase58() } },
    ]) as any;
  }

  // ===== Helpers =====

  getStatus(negotiation: NegotiationAccount): NegotiationStatus {
    return parseStatus(negotiation.status);
  }

  isTerminal(negotiation: NegotiationAccount): boolean {
    const status = this.getStatus(negotiation);
    return [
      NegotiationStatus.Settled,
      NegotiationStatus.Expired,
      NegotiationStatus.Rejected,
    ].includes(status);
  }

  isMyTurn(negotiation: NegotiationAccount, myKey: PublicKey): boolean {
    if (negotiation.currentRound === 0) {
      return myKey.equals(negotiation.buyer);
    }
    const lastSide = Object.keys(negotiation.offerSide)[0];
    const isBuyer = myKey.equals(negotiation.buyer);
    const isSeller = myKey.equals(negotiation.seller);
    if (lastSide === "buyer") return isSeller;
    if (lastSide === "seller") return isBuyer;
    return false;
  }

  calculateDecay(effectiveEscrow: BN, decayRateBps: number): BN {
    return effectiveEscrow.mul(new BN(decayRateBps)).div(new BN(10000));
  }

  calculateMinOffer(effectiveEscrow: BN, minOfferBps: number): BN {
    return effectiveEscrow.mul(new BN(minOfferBps)).div(new BN(10000));
  }

  calculateProtocolFee(amount: BN, feeBps: number): BN {
    return amount.mul(new BN(feeBps)).div(new BN(10000));
  }
}
