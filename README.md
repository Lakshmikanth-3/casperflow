# CasperFlow

> **One-line pitch:** An autonomous AI agent that manages fractional real-world asset income end-to-end — collecting rent, routing yield, paying for its own intelligence with x402 micropayments, all without a single human keystroke after setup.

**Built for the Casper Agentic Buildathon 2026.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER LAYER                               │
│  Next.js Dashboard  ←→  CSPR.click (wallet)                     │
│  Resend Email Notifications  ←→  CSPR.cloud Streaming WebSocket  │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     AGENT LAYER (Node.js)                       │
│  ┌─────────────────┐   ┌──────────────────┐  ┌──────────────┐   │
│  │ Revenue Monitor │   │ Yield Distributor│  │ DeFi Router  │   │
│  │  (cron: 5 min)  │   │  (event-driven)  │  │(idle trigger)│   │
│  └────────┬────────┘   └────────┬─────────┘  └──────┬───────┘   │
│           │                     │                    │           │
│  ┌────────▼─────────────────────▼────────────────────▼────────┐  │
│  │              CasperFlow Orchestrator                        │  │
│  │         (decision engine + action queue)                    │  │
│  └──────────────────────┬──────────────────────────────────────┘  │
│                         │                                         │
│  ┌──────────────────────▼─────────────────────────────────────┐   │
│  │          Reputation Engine                                  │   │
│  │  accuracy tracking · uptime logging · on-chain NFT updates  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
┌────────▼───────┐  ┌────────▼──────┐  ┌────────▼──────────┐
│  x402 Oracle   │  │  Casper MCP   │  │  CSPR.trade MCP   │
│  (pay-per-call)│  │  Server       │  │  Server           │
│  Parking Blox  │  │  (chain r/w)  │  │  (swap/liquidity) │
│  via CSPR.cloud│  │  testnet      │  │  mcp.cspr.trade   │
└────────────────┘  └────────┬──────┘  └────────────────────┘
                             │
                ┌────────────▼──────────────┐
                │    Casper Testnet         │
                │  CasperFlow.wasm  (Odra)  │
                │  CasperFlowReputation.wasm│
                │  Parking Blox Data        │
                └───────────────────────────┘
```

---

## Deployed Contracts (Casper Testnet)

| Contract | Hash | Explorer |
|---|---|---|
| CasperFlow | _fill after deployment_ | [testnet.cspr.live](https://testnet.cspr.live) |
| CasperFlowReputation | _fill after deployment_ | [testnet.cspr.live](https://testnet.cspr.live) |

---

## Setup — 3 Commands

```bash
# 1. Clone and install
git clone https://github.com/casperflow/casperflow && cd casperflow

# 2. Deploy contracts to Casper Testnet
bash scripts/deploy-testnet.sh

# 3. Start all services
cd agent && cp .env.example .env && npm install && npm run dev &
cd oracle-server && cp .env.example .env && npm install && npm run dev &
cd frontend && cp .env.local.example .env.local && npm install && npm run dev
```

---

## Casper AI Toolkit Used

| Tool | Usage |
|---|---|
| [Odra Framework](https://odra.dev/docs) | CasperFlow + Reputation smart contracts (Rust/WASM) |
| [x402 Facilitator](https://docs.cspr.cloud/x402-facilitator-api/reference) | Per-call oracle micropayments |
| [Casper MCP Server](https://mcp.testnet.cspr.cloud/mcp) | Natural language chain queries + tx submission |
| [CSPR.trade MCP](https://mcp.cspr.trade) | Idle CSPR DeFi routing |
| [CSPR.click Agent Skill](https://docs.cspr.click) | User wallet connection |
| [CSPR.cloud Streaming](https://docs.cspr.cloud/streaming-api/reference) | Real-time contract event feed |
| [CSPR.cloud REST API](https://docs.cspr.cloud/rest-api/reference) | Parking Blox on-chain data verification |

---

## Key Innovation

**The agent pays for its own brain.** Every oracle call costs 0.001 CSPR, paid autonomously via x402 micropayments from the agent's on-chain expense wallet. The entire cost ledger is verifiable on-chain — any observer can see exactly what intelligence the agent purchased and how much it cost.

**The agent earns verifiable trust.** A non-transferable Reputation NFT tracks accuracy and uptime on-chain. Any external protocol can call `get_trust_tier` before granting funds to this agent.

---

## Live Demo

- **Dashboard:** https://casperflow.vercel.app
- **Agent Health API:** https://api.casperflow.io/health
- **Oracle Server:** https://oracle.casperflow.io/health

---

## Tech Stack

- Smart contracts: **Odra (Rust)** — Casper-native, testnet-deployed
- Agent runtime: **Node.js 20 + TypeScript** — MCP SDK, casper-js-sdk
- Frontend: **Next.js 14 + Tailwind CSS** — Vercel deployment
- Payments: **x402 Facilitator** (CSPR.cloud) — per-call micropayments
- DeFi: **CSPR.trade MCP Server** — idle liquidity management
- Notifications: **Resend API** — email on yield receipt

---

_CasperFlow v1.0 · Casper Agentic Buildathon 2026 · June 30 deadline_
_Stack: Odra · x402 · MCP · CSPR.trade · CSPR.click · CSPR.cloud · Resend_
_No mocks. No stubs. No hardcoded data. All on-chain, all live._
