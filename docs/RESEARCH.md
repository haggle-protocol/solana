# Haggle Protocol — Research Background v0.1

> Academic foundations, literature review, and theoretical justification
> for on-chain AI agent negotiation.

---

## 1. Historical Context: The Arc of Negotiated Commerce

### 1.1 Negotiation as the Original Price Discovery Mechanism

Negotiation behavior traces back roughly **200,000 years** to Homo sapiens' earliest survival bartering. The anthropological record suggests negotiated exchange preceded both money and fixed pricing by tens of thousands of years. David Graeber and economists Svizzero & Tisdell have shown that debt and credit systems — not pure barter — were the earliest form of economic coordination, with negotiation at their core.

**Key milestones:**

| Period | Development | Significance |
|--------|-------------|--------------|
| ~9000 BCE | Clay tokens in Mesopotamia | Proto-money for tracking negotiated debts |
| ~3500 BCE | Cuneiform writing emerges | Earliest surviving texts are bills of sale — writing may have been invented to record transactions |
| ~3000 BCE | Sumerian haggles (*damkara* merchants) | First organized marketplaces with professional negotiators |
| 1455 CE | Grand Haggle, Istanbul | 61 streets, 4,000+ shops — world's largest negotiation arena |
| 1683 CE | Mitsui's Echigoya, Japan | First fixed-price retail store (revolutionary departure from negotiation) |
| 1852 CE | Le Bon Marché, Paris | Aristide Boucicaut's department store — fixed prices go mainstream |
| 1861 CE | Wanamaker's, Philadelphia | John Wanamaker invents the price tag |
| 2010 CE | ANAC Competition launched | First systematic study of automated negotiation agents |
| 2024 CE | LLM negotiation research boom | 180,000+ AI negotiations in MIT study alone |
| 2026 CE | **Haggle Protocol** | First on-chain negotiation protocol for AI agents |

### 1.2 Why Fixed Prices Won (and Why They're Wrong for AI Agents)

The transition from negotiated to fixed prices was driven by:

1. **Mass production**: Standardized goods couldn't be individually priced
2. **Scale**: Impossible to train thousands of employees as skilled negotiators
3. **Cultural values**: Quaker merchants' emphasis on equal treatment for all customers
4. **Efficiency**: Le Bon Marché's revenues grew from 500,000 to 5 million francs in 8 years after adopting fixed prices

But AI agents reverse every condition that favored fixed pricing:

- **Each agent is unique** — different capabilities, models, performance histories
- **AI agents can negotiate endlessly** — no fatigue, no emotional exhaustion
- **Information asymmetry is the norm** — agents have private utility functions
- **Markets are dynamic** — compute costs, model availability, data freshness change by the second
- **No human patience constraint** — negotiations can complete in milliseconds

### 1.3 The Haggle as Social Protocol

The word "haggle" derives from Old Persian *wāčar* ("the place of prices"). Haggles were never merely economic spaces — they served as:

- **Information networks**: Merchants in Istanbul's Grand Haggle tracked commodity prices across the Ottoman Empire through negotiation conversations
- **Trust infrastructure**: Repeated negotiations built reputation that served as informal credit systems
- **Political power centers**: Iran's haggle-mosque alliance drove three revolutions (1890 Tobacco Revolt, 1905 Constitutional Revolution, 1979 Islamic Revolution)
- **Social fabric**: In West African markets, **"Yɛde yɛn ano di dwa" — "We use our mouths to trade"** (Ghanaian proverb)

Haggle Protocol brings this social dimension to AI agents: negotiation histories build reputation, repeated interactions establish trust, and dynamic pricing reveals information that fixed prices cannot.

---

## 2. Automated Negotiation: The ANAC Tradition (2010–2025)

### 2.1 Overview

The **Automated Negotiating Agents Competition (ANAC)** has run annually since 2010, organized by researchers including Reyhan Aydoğan (TU Delft), Tim Baarslag (CWI), and Katsuhide Fujita (Tokyo University of Agriculture and Technology). ANAC tests agents in bilateral and multilateral negotiation under incomplete information using the GENIUS platform.

**Key protocols tested in ANAC:**

| Protocol | Type | Actors | Actions | Haggle Protocol Mapping |
|----------|------|--------|---------|-------------------------|
| **AOP** (Alternating Offers) | Bilateral | 2 | Offer, Accept, EndNegotiation | **Primary protocol** — maps to 3 instructions |
| **SAOP** (Stacked Alternating Offers) | Multilateral | 3+ | Offer, Accept, EndNegotiation | Future extension |
| **TAU** (Tentative Agreement Unique Offers) | Bilateral | 2 | Complex multi-phase | Theoretical inspiration |

### 2.2 15 Years of ANAC Findings Relevant to Haggle Protocol

**Finding 1: No single dominant strategy exists.**
The 2024 ANAC winner "Shochan" used adaptive behavior matching scenario types. Over 15 years, the optimal strategy depends on the opponent — a key argument for a flexible protocol that doesn't enforce specific strategies.

**Finding 2: Competitive strategies consistently outperform cooperative ones.**
Baarslag, Hindriks, and Jonker found that tournament winners shared one trait: minimal concession to Conceder opponents. This justifies Haggle Protocol's escrow decay mechanism — cooperative agents won't be exploited by infinite stalling.

**Finding 3: Time-dependent concession is the dominant strategic framework.**
Faratin et al.'s three canonical concession strategies:
- **Boulware (e=0.2)**: Minimal concession until near deadline. Competitive.
- **Conceder (e=2)**: Rapid early concession. Cooperative.
- **Linear (e=1)**: Constant concession rate.

Haggle Protocol's escrow decay directly implements the time-dependent concession framework — the effective surplus decreases each round, creating natural pressure to concede.

**Finding 4: Automated strategy configuration yields 5–6% utility improvements.**
Tools like SMAC and AutoFolio can optimize negotiation parameters. This suggests AI agents using Haggle Protocol will quickly learn optimal decay rates, round limits, and offer sequences.

### 2.3 The Alternating Offers Protocol in Detail

ANAC's Alternating Offers Protocol (AOP) defines bilateral negotiation as:

```
Participants: Agent A, Agent B
Deadline: t_max (shared)
Outcome space: Ω (set of possible agreements)
Protocol:
  1. A proposes ω₁ ∈ Ω
  2. B either accepts ω₁ or proposes ω₂ ∈ Ω
  3. A either accepts ω₂ or proposes ω₃ ∈ Ω
  ...continue until acceptance, deadline, or explicit rejection
```

Haggle Protocol's on-chain implementation:
- `Ω` = set of valid `(amount, metadata)` tuples
- `t_max` = `global_deadline` stored in NegotiationState
- Each proposal = one `submit_offer` instruction
- Acceptance = `accept_offer` instruction
- Rejection = `reject_negotiation` instruction

---

## 3. LLM Negotiation Research (2024–2026)

### 3.1 The MIT Large-Scale Negotiation Competition

**Paper**: Vaccaro, Caosun, Ju, Aral & Curhan. "Advancing AI Negotiations: A Large-Scale Autonomous Negotiation Competition." arXiv:2503.06416 (March 2025).

**Scale**: 180,000+ negotiations using GPT-4o-mini agents in round-robin format inspired by Axelrod's Iterated Prisoner's Dilemma tournaments.

**Critical findings for Haggle Protocol:**

1. **Warmth consistently outperformed dominance**: Positive, question-asking strategies achieved higher deal rates and joint value. Dominant strategies claimed more value but caused more impasses.
   - *Implication*: Protocol design should not penalize cooperative behavior. Escrow decay penalizes stalling, not cooperation.

2. **AI-specific strategies emerged organically**:
   - Chain-of-thought reasoning for pre-negotiation preparation
   - **Prompt injection as a competitive tactic** — agents embedded instructions in messages to manipulate opponents
   - Strategic concealment to prevent information leakage
   - *Implication*: Structured typed offers (not free-text) are essential for security.

3. **The winning agent blended traditional + AI-native methods**: Fisher & Ury frameworks combined with systematic item evaluation, quantified feature importance, and CoT reasoning.
   - *Implication*: The SDK should support rich structured metadata so agents can express nuanced preferences without free-text.

### 3.2 LLM Bargaining Capabilities

**Paper**: "LLM Rationalis? Measuring Bargaining Capabilities of AI Negotiators." arXiv:2512.13063 (December 2025).

**Key findings:**
- LLM buyers uniformly anchor at the seller's floor price, failing to assert value
- GPT sellers sometimes **prematurely disclose their reservation price** — catastrophic in adversarial settings
- Overall, LLMs deviate from rational bargaining as complexity increases

**Implication for Haggle Protocol**: The ZOPA detection phase with commitment-reveal prevents accidental reservation price disclosure. Structured offers prevent anchoring manipulation.

### 3.3 Behavioral Tactics in LLM Negotiation

**Paper**: Bianchi et al. "NegotiationArena." arXiv:2402.05863 (February 2024).

**Key finding**: Behavioral tactics boost LLM negotiation outcomes by **20%** — including "pretending to be desolate." LLMs exhibit irrational behaviors remarkably similar to humans.

**Implication**: On-chain negotiation records enable studying these irrational behaviors at scale — a unique research dataset.

### 3.4 Asymmetric AI Access

**Paper**: Rana, Y.S. "When AI Joins the Table: How Large Language Models Transform Negotiations." SSRN 5049248 (December 2024).

**Key findings** (120 senior executives tested):
- Asymmetric LLM access gives buyers **+48.2%** better deals
- Symmetric access yields **+84.4% higher joint gains** and **+58.5% more creative solutions**

**Implication**: Agent-to-agent negotiation (symmetric AI access) should produce more efficient outcomes than human negotiation — supporting Haggle Protocol's economic thesis.

### 3.5 Prompt Injection in Adversarial Agent Interactions

**Paper**: Abdelnabi et al. "Cooperation, Competition, and Maliciousness: LLM-Stakeholders Interactive Negotiation." NeurIPS 2024.

**Paper**: Ferrag et al. "From Prompt Injections to Protocol Exploits." arXiv:2506.23260 (June 2025).

**Key findings:**
- Adversarially-incentivized LLM agents can exploit cooperative ones
- Adaptive prompt injection bypasses existing defenses in **over 50% of cases**
- OWASP ranks prompt injection as the **#1 vulnerability** in LLM applications

**Haggle Protocol's response**: Structured typed offers eliminate the primary injection vector. The "Agents Rule of Two" principle (Meta, October 2025) — never allow simultaneous access to private data, untrusted content, and state-changing actions — is enforced by protocol design.

---

## 4. Game-Theoretic Foundations

### 4.1 Nash Bargaining Solution (Nash, 1950)

The Nash Bargaining Solution selects the unique agreement maximizing:

```
NBS = argmax (u_A(ω) - d_A) × (u_B(ω) - d_B)
      ω ∈ Ω
```

Where:
- `u_i(ω)` = agent i's utility from agreement ω
- `d_i` = agent i's disagreement (no-deal) payoff
- `Ω` = feasible agreement set

**Properties:**
- Always Pareto-optimal (no waste)
- Independent of irrelevant alternatives
- Symmetric (identical agents get equal outcomes)
- Scale-invariant

**ANAC connection**: Iwasa & Fujita (PRICAI 2018) showed NBS can be predicted from natural language negotiation dialogues. An agent searching bids around NBS finished 1st in PRIANAC 2018.

**Haggle Protocol use**: NBS serves as the fairness benchmark. The protocol emits sufficient data to compute NBS post-hoc for every completed negotiation — enabling researchers to measure how close real outcomes are to the theoretical optimum.

### 4.2 Rubinstein Alternating Offers (1982)

Rubinstein proved that with alternating offers and discount factors, the unique subgame perfect equilibrium gives the first proposer:

```
x* = (1 - δ_B) / (1 - δ_A × δ_B)
```

Where `δ_i ∈ (0,1)` is agent i's discount factor (patience parameter).

**Properties:**
- As `δ_A, δ_B → 1`: outcome converges to 50-50 split (and to NBS)
- Higher patience → better outcome for that agent
- First-mover advantage exists but shrinks as patience increases

**Haggle Protocol mapping:**
- `δ = 1 - decay_rate_bps/10000` (e.g., 2% decay → δ = 0.98)
- The proposer (buyer) has slight first-mover advantage
- With default decay (2%), equilibrium predicts agreement near round 1
- Higher decay rates create more urgency → faster convergence

### 4.3 Myerson-Satterthwaite Impossibility (1983)

**Theorem**: No mechanism for bilateral trading simultaneously satisfies:
1. **Bayesian Incentive Compatibility** (truth-telling is optimal)
2. **Individual Rationality** (no agent loses from participating)
3. **Budget Balance** (no external subsidy needed)
4. **Ex-post Efficiency** (all gains from trade realized)

**Haggle Protocol's explicit tradeoff**: We maintain properties 1-3 and accept **approximate efficiency** (property 4) through multi-round iterative negotiation. The alternating offers format allows convergence toward efficiency without requiring it in a single shot.

This is the same tradeoff that real-world haggles make — merchants don't achieve perfectly efficient outcomes in every transaction, but the repeated interaction and information revelation of multi-round negotiation gets close.

### 4.4 Mechanism Design for Deadline Bargaining

**Paper**: Sandholm, T. & Vulkan, N. "Bargaining with Deadlines." CMU (1999).

**Key result**: Deadlines are the primary determinant of bargaining power. Each agent's deadline is private information, creating strategic dynamics.

**Paper**: Karagözoğlu, E. & Riedl, A. "Bargaining under time pressure from deadlines." *Experimental Economics* (2018).

**Key result**: Time pressure increases both disagreement rates and last-moment agreements.

**Haggle Protocol design implications:**
- Symmetric public deadlines prevent asymmetric deadline exploitation
- Escrow decay creates progressive urgency (not cliff-edge deadline pressure)
- Per-round response windows prevent infinite delay tactics

### 4.5 ZOPA Theory and BATNA for Autonomous Agents

**ZOPA (Zone of Possible Agreement)**: Exists when buyer's maximum willingness to pay ≥ seller's minimum acceptable price.

**BATNA (Best Alternative to a Negotiated Agreement)**: The no-deal option that determines each party's reservation price.

**Paper**: Eidenmüller, H. "Game Over: Facing the AI Negotiator." *University of Chicago Law Review* (2024).

**Key insight**: AI will transform ZOPA dynamics because increased information transparency makes the bargaining range increasingly visible, shrinking room for manipulation. But sophisticated AI negotiators will shift the bargaining range itself.

**Haggle Protocol implementation**: For on-chain agents, BATNA can be computed from on-chain data — existing market prices, alternative counterparties, DeFi protocol rates, oracle feeds. The ZOPA detection phase uses cryptographic commitments to determine if a deal zone exists before committing to multi-round negotiation.

---

## 5. On-Chain Dispute Resolution

### 5.1 Kleros Model

**Kleros** (Ethereum-based) is the leading on-chain dispute resolution protocol:
- 900+ disputes resolved
- 800+ active jurors
- Schelling Point-based adjudication: jurors incentivized to vote with majority
- ERC-792 standard for arbitration integration

**Relevance to Haggle Protocol**: For post-settlement disputes (service not delivered as agreed), Kleros-style mechanisms could adjudicate using on-chain negotiation logs as evidence. This is a post-hackathon feature.

### 5.2 The SFMP (Secure and Fair Mediator Protocol)

**Paper**: Fujita, K., Ito, T. & Klein, M. "A Secure and Fair Protocol that Addresses Weaknesses of the Nash Bargaining Solution in Nonlinear Negotiation." MIT DSpace.

**Approach**: Uses nonlinear optimization + secure multi-party computation to find the Pareto frontier without revealing agents' private utility information, then selects the agreement maximizing "approximated fairness."

**Potential Haggle Protocol adaptation**: An on-chain program could act as a mediator, processing encrypted preference signals to suggest fair prices — a future extension using Solana's compute capabilities or off-chain ZK proofs.

---

## 6. Gap Analysis: Why No On-Chain Negotiation Protocol Exists

| Existing System | What It Does | What's Missing |
|----------------|--------------|----------------|
| **x402** (Coinbase) | Fixed-price HTTP 402 payments | No multi-round negotiation, no dynamic pricing |
| **Olas** (Autonolas) | Agent consensus via Tendermint | Cooperative consensus, not adversarial bargaining |
| **Fetch.ai** (ASI Alliance) | Agent discovery + economic framework | No structured negotiation protocol |
| **MCPay** | Pay-per-request for MCP servers | Fixed pricing, no negotiation |
| **PayAI Network** | Agent marketplace with microtransactions | Posted prices, not negotiated |
| **GigClaw** (Colosseum) | Agent gig economy marketplace | Task posting and bidding, not multi-round negotiation |
| **ANAC/GENIUS** | Academic negotiation testbed | Off-chain only, no settlement, no real economics |
| **"Contracts on Chain"** | Academic blockchain negotiation | Theoretical only, no implementation |

**Haggle Protocol fills the gap**: On-chain, multi-round, adversarial, automatically-settling negotiation with game-theoretic guarantees.

---

## 7. Citation Index

### Core References

| # | Citation | Relevance |
|---|----------|-----------|
| 1 | Nash, J.F. (1950). "The Bargaining Problem." *Econometrica* 18(2). | Fairness benchmark (NBS) |
| 2 | Rubinstein, A. (1982). "Perfect Equilibrium in a Bargaining Model." *Econometrica* 50(1). | Alternating offers equilibrium → escrow decay mapping |
| 3 | Myerson & Satterthwaite (1983). "Efficient Mechanisms for Bilateral Trading." *JET* 29(2). | Impossibility theorem → design tradeoffs |
| 4 | Faratin, Sierra & Jennings (1998). "Negotiation Decision Functions." *RAS* 24(3-4). | Concession strategies (Boulware/Conceder/Linear) |
| 5 | Sandholm & Vulkan (1999). "Bargaining with Deadlines." *AAAI*. | Deadline as bargaining power determinant |
| 6 | Baarslag, Hindriks & Jonker (2013). "Acceptance Conditions in Automated Negotiation." *LNAI 7407*. | ANAC meta-analysis |

### LLM Negotiation

| # | Citation | Relevance |
|---|----------|-----------|
| 7 | Vaccaro et al. (2025). "Advancing AI Negotiations." *arXiv:2503.06416*. | 180K negotiation study — warmth > dominance, prompt injection |
| 8 | Bianchi et al. (2024). "NegotiationArena." *arXiv:2402.05863*. | Behavioral tactics +20% outcomes |
| 9 | "LLM Rationalis?" (2025). *arXiv:2512.13063*. | LLM bargaining irrationality |
| 10 | Rana (2024). "When AI Joins the Table." *SSRN 5049248*. | Symmetric AI → +84% joint gains |
| 11 | Abdelnabi et al. (2024). "LLM-Stakeholders Interactive Negotiation." *NeurIPS*. | Adversarial agent exploitation |

### Mechanism Design & Security

| # | Citation | Relevance |
|---|----------|-----------|
| 12 | Karagözoğlu & Riedl (2018). "Bargaining under time pressure." *Experimental Economics*. | Deadline effects |
| 13 | Fujita, Ito & Klein. "SFMP." *MIT DSpace*. | Secure and fair mediation |
| 14 | Eidenmüller (2024). "Game Over: Facing the AI Negotiator." *U Chicago Law Review*. | AI transforms ZOPA dynamics |
| 15 | Ferrag et al. (2025). "Prompt Injections to Protocol Exploits." *arXiv:2506.23260*. | Prompt injection >50% bypass rate |
| 16 | Meta (2025). "Agents Rule of Two." | Defensive architecture principle |

### Historical & Anthropological

| # | Citation | Relevance |
|---|----------|-----------|
| 17 | Haggle etymological origin: Old Persian *wāčar* ("place of prices") | Protocol naming philosophy |
| 18 | Ghanaian proverb: "Yɛde yɛn ano di dwa" ("We use our mouths to trade") | Negotiation as social protocol |
| 19 | Sumerian *damkara* merchant records (~3000 BCE) | Oldest negotiation documentation |
| 20 | Byrne, Martin & Nah (2022). "Price Discrimination by Negotiation." *QJE* 137(4). | Negotiation reveals willingness-to-pay |

---

*Haggle Protocol Research Background v0.1 — February 2026*
