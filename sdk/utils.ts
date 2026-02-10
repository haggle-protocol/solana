import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PROGRAM_ID } from "./types";

export function findConfigPda(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );
}

export function findNegotiationPda(
  buyer: PublicKey,
  seller: PublicKey,
  sessionId: BN,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("negotiation"),
      buyer.toBuffer(),
      seller.toBuffer(),
      sessionId.toArrayLike(Buffer, "le", 8),
    ],
    programId
  );
}

export function findVaultPda(
  negotiation: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), negotiation.toBuffer()],
    programId
  );
}

export function createServiceHash(service: string): number[] {
  const buf = Buffer.alloc(32);
  Buffer.from(service).copy(buf);
  return Array.from(buf);
}

export function createMetadata(data: string): number[] {
  const buf = Buffer.alloc(64);
  Buffer.from(data).copy(buf);
  return Array.from(buf);
}

export function decodeMetadata(metadata: number[]): string {
  const buf = Buffer.from(metadata);
  const end = buf.indexOf(0);
  return buf.subarray(0, end === -1 ? buf.length : end).toString();
}
