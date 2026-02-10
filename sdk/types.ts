import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export const PROGRAM_ID = new PublicKey(
  "DRXGcVHj1GZSc7wD4LTnrM8RJ1shWH93s1zKCXtJtGbq"
);

export enum NegotiationStatus {
  Created = "created",
  Proposed = "proposed",
  Countered = "countered",
  Accepted = "accepted",
  Settled = "settled",
  Expired = "expired",
  Rejected = "rejected",
}

export enum OfferSide {
  Buyer = "buyer",
  Seller = "seller",
}

export enum ZopaPhase {
  NotStarted = "notStarted",
  BuyerCommitted = "buyerCommitted",
  BothCommitted = "bothCommitted",
  Revealed = "revealed",
  Skipped = "skipped",
}

export interface NegotiationParams {
  escrowAmount: BN;
  serviceHash: number[];
  maxRounds: number;
  decayRateBps: number;
  responseWindow: BN;
  globalDeadlineOffset: BN;
  minOfferBps: number;
  protocolFeeBps: number;
  zopaEnabled: boolean;
}

export interface NegotiationAccount {
  buyer: PublicKey;
  seller: PublicKey;
  sessionId: BN;
  status: Record<string, object>;
  currentRound: number;
  currentOfferAmount: BN;
  currentOfferBy: PublicKey;
  offerSide: Record<string, object>;
  serviceHash: number[];
  escrowAmount: BN;
  effectiveEscrow: BN;
  tokenMint: PublicKey;
  maxRounds: number;
  decayRateBps: number;
  responseWindow: BN;
  globalDeadline: BN;
  minOfferBps: number;
  protocolFeeBps: number;
  zopaEnabled: boolean;
  createdAt: BN;
  lastOfferAt: BN;
  settledAt: BN;
  settledAmount: BN;
  buyerCommitment: number[];
  sellerCommitment: number[];
  zopaPhase: Record<string, object>;
  metadata: number[];
  bump: number;
}

export interface ProtocolConfigAccount {
  authority: PublicKey;
  treasury: PublicKey;
  defaultDecayRateBps: number;
  defaultResponseWindow: BN;
  defaultProtocolFeeBps: number;
  defaultMaxRounds: number;
  totalNegotiations: BN;
  totalSettledVolume: BN;
  totalFeesCollected: BN;
  isPaused: boolean;
  bump: number;
}

export function parseStatus(status: Record<string, object>): NegotiationStatus {
  const key = Object.keys(status)[0];
  return key as NegotiationStatus;
}

export function parseOfferSide(side: Record<string, object>): OfferSide {
  const key = Object.keys(side)[0];
  return key as OfferSide;
}
