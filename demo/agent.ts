import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";
import { HaggleSDK, NegotiationAccount, NegotiationStatus, parseStatus } from "../sdk";
import { LLMClient, LLMMessage } from "./llm";

export type AgentMode = "demo" | "autonomous";
export type AgentRole = "buyer" | "seller";

export interface AgentConfig {
  name: string;
  role: AgentRole;
  persona: string;
  keypair: Keypair;
  connection: Connection;
  tokenMint: PublicKey;
  llm: LLMClient;
  mode: AgentMode;
}

export interface OfferDecision {
  action: "offer" | "accept" | "reject";
  amount?: number;
  reasoning: string;
}

export class NegotiationAgent {
  readonly name: string;
  readonly role: AgentRole;
  readonly persona: string;
  readonly keypair: Keypair;
  readonly sdk: HaggleSDK;
  readonly llm: LLMClient;
  readonly mode: AgentMode;
  readonly tokenMint: PublicKey;
  readonly connection: Connection;

  private history: { round: number; side: string; amount: number }[] = [];

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.role = config.role;
    this.persona = config.persona;
    this.keypair = config.keypair;
    this.llm = config.llm;
    this.mode = config.mode;
    this.tokenMint = config.tokenMint;
    this.connection = config.connection;

    const wallet = new anchor.Wallet(config.keypair);
    this.sdk = new HaggleSDK({
      connection: config.connection,
      wallet,
    });
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  async getTokenAccount(): Promise<PublicKey> {
    return getAssociatedTokenAddress(this.tokenMint, this.publicKey);
  }

  log(msg: string) {
    const icon = this.role === "buyer" ? "🔍" : "🔮";
    console.log(`  ${icon} [${this.name}] ${msg}`);
  }

  logThinking(reasoning: string) {
    if (!reasoning || reasoning === "undefined") {
      console.log(`  💭 (analyzing market conditions...)`);
      return;
    }
    const lines = reasoning.split("\n").filter((l) => l.trim());
    console.log(`  💭 ${lines[0] || "(thinking...)"}`);
    for (const line of lines.slice(1)) {
      console.log(`     ${line}`);
    }
  }

  async decide(
    negotiation: NegotiationAccount,
    scriptedDecision: OfferDecision
  ): Promise<OfferDecision> {
    if (this.mode === "demo") {
      const reasoning = await this.getLLMReasoning(negotiation, scriptedDecision);
      return { ...scriptedDecision, reasoning };
    }

    // Autonomous mode: LLM decides everything
    return this.getAutonomousDecision(negotiation);
  }

  private async getLLMReasoning(
    negotiation: NegotiationAccount,
    decision: OfferDecision
  ): Promise<string> {
    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `You are ${this.name}, ${this.persona}. You are a ${this.role} in an on-chain negotiation on Solana. Explain your reasoning for the following decision in 1-2 sentences. Be concise and strategic. Respond in English.`,
      },
      {
        role: "user",
        content: this.buildContext(negotiation, decision),
      },
    ];

    try {
      return await this.llm.chat(messages);
    } catch (e: any) {
      return `(LLM unavailable: ${e.message})`;
    }
  }

  private async getAutonomousDecision(
    negotiation: NegotiationAccount
  ): Promise<OfferDecision> {
    const status = parseStatus(negotiation.status);
    const escrow = negotiation.escrowAmount.toNumber() / 1e6;
    const effective = negotiation.effectiveEscrow.toNumber() / 1e6;
    const currentOffer = negotiation.currentOfferAmount.toNumber() / 1e6;
    const round = negotiation.currentRound;
    const maxRounds = negotiation.maxRounds;

    const historyStr = this.history
      .map((h) => `Round ${h.round}: ${h.side} offered ${h.amount} USDC`)
      .join("\n");

    const messages: LLMMessage[] = [
      {
        role: "system",
        content: `You are ${this.name}, ${this.persona}. You are a ${this.role} in an on-chain negotiation on Solana.

You MUST respond with EXACTLY one of these JSON formats (no other text):
{"action":"offer","amount":<number in USDC>,"reasoning":"<1 sentence>"}
{"action":"accept","reasoning":"<1 sentence>"}
{"action":"reject","reasoning":"<1 sentence>"}

Rules:
- Escrow amount: ${escrow} USDC (effective: ${effective} USDC after decay)
- Current round: ${round}/${maxRounds}
- Escrow decays each round (2%), so waiting costs money
- ${this.role === "buyer" ? "You want to pay LESS" : "You want to earn MORE"}
- Be strategic but reasonable. If the deal is fair enough, accept it.`,
      },
      {
        role: "user",
        content: `Negotiation state:
${historyStr ? `History:\n${historyStr}\n` : "No offers yet.\n"}
Current offer: ${currentOffer > 0 ? `${currentOffer} USDC by ${Object.keys(negotiation.offerSide)[0]}` : "none"}
Status: ${status}
Round: ${round}/${maxRounds}
Effective escrow: ${effective} USDC

What is your move?`,
      },
    ];

    try {
      const response = await this.llm.chat(messages);
      const jsonMatch = response.match(/\{[^}]+\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.action === "offer" && typeof parsed.amount === "number") {
        const amountLamports = Math.floor(parsed.amount * 1e6);
        return {
          action: "offer",
          amount: amountLamports,
          reasoning: parsed.reasoning || response,
        };
      }
      if (parsed.action === "accept" || parsed.action === "reject") {
        return {
          action: parsed.action,
          reasoning: parsed.reasoning || response,
        };
      }
      throw new Error(`Invalid action: ${parsed.action}`);
    } catch (e: any) {
      this.log(`⚠️  LLM parse error, falling back to scripted: ${e.message}`);
      return this.fallbackDecision(negotiation);
    }
  }

  private fallbackDecision(negotiation: NegotiationAccount): OfferDecision {
    const effective = negotiation.effectiveEscrow.toNumber();
    const currentOffer = negotiation.currentOfferAmount.toNumber();
    const round = negotiation.currentRound;
    const maxRounds = negotiation.maxRounds;

    if (round >= maxRounds - 1) {
      return { action: "accept", reasoning: "Final round, accepting to avoid expiry." };
    }

    const midpoint = effective / 2;
    if (this.role === "buyer") {
      const offer = Math.floor(midpoint * 0.8);
      return { action: "offer", amount: offer, reasoning: "Fallback: offering below midpoint." };
    } else {
      const offer = Math.floor(midpoint * 1.2);
      return { action: "offer", amount: offer, reasoning: "Fallback: offering above midpoint." };
    }
  }

  private buildContext(negotiation: NegotiationAccount, decision: OfferDecision): string {
    const escrow = negotiation.escrowAmount.toNumber() / 1e6;
    const effective = negotiation.effectiveEscrow.toNumber() / 1e6;
    const currentOffer = negotiation.currentOfferAmount.toNumber() / 1e6;
    const round = negotiation.currentRound;
    const maxRounds = negotiation.maxRounds;

    const historyStr = this.history
      .map((h) => `  Round ${h.round}: ${h.side} offered ${h.amount} USDC`)
      .join("\n");

    let decisionStr = "";
    if (decision.action === "offer") {
      decisionStr = `I'm about to offer ${(decision.amount! / 1e6).toFixed(1)} USDC.`;
    } else if (decision.action === "accept") {
      decisionStr = `I'm about to accept the current offer of ${currentOffer} USDC.`;
    } else {
      decisionStr = `I'm about to reject this negotiation.`;
    }

    return `Escrow: ${escrow} USDC | Effective: ${effective} USDC | Round: ${round}/${maxRounds}
${historyStr ? `History:\n${historyStr}` : "No prior offers."}
Current offer on table: ${currentOffer > 0 ? currentOffer + " USDC" : "none"}
${decisionStr}
Why am I making this move?`;
  }

  recordOffer(round: number, side: string, amount: number) {
    this.history.push({ round, side, amount: amount / 1e6 });
  }
}
