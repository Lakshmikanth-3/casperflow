/**
 * orchestrator.ts — CasperFlow Agent Main Entry Point
 *
 * Starts all subsystems:
 *   1. SQLite DB
 *   2. CSPR.cloud event stream (SSE + WebSocket broadcast)
 *   3. Revenue Monitor (cron: polls x402 oracle)
 *   4. Distribution Checker (cron: triggers yield + DeFi routing)
 *   5. Health API server (GET /health)
 */

import "dotenv/config";
import * as http from "http";
import * as url from "url";
import { db } from "./db";
import { startRevenueMonitor } from "./revenue-monitor";
import { runDistributionCheck } from "./yield-distributor";
import { startEventStream, startWebSocketServer } from "./event-stream";
import { loadAgentKeys, getAccountBalance } from "./chain-client";
import * as cron from "node-cron";

// ─── Validate required environment ───────────────────────────────────────────

const REQUIRED_VARS = [
  "CASPER_NODE_URL",
  "CASPER_CHAIN_NAME",
  "AGENT_PRIVATE_KEY_PATH",
  "AGENT_PUBLIC_KEY",
  "CASPERFLOW_CONTRACT_HASH",
  "REPUTATION_CONTRACT_HASH",
  "CSPR_CLOUD_API_KEY",
  "CSPR_CLOUD_REST_URL",
  "CSPR_CLOUD_STREAM_URL",
  "ORACLE_SERVER_URL",
  "X402_FACILITATOR_URL",
  "CSPRTRADE_MCP_URL",
  "CASPER_MCP_URL",
];

for (const v of REQUIRED_VARS) {
  if (!process.env[v]) {
    throw new Error(
      `Missing required environment variable: ${v}\nSee agent/.env.example`
    );
  }
}

// ─── Health API ───────────────────────────────────────────────────────────────

async function buildHealthResponse(): Promise<object> {
  const recentEvent = db.prepare(
    `SELECT event_type, ts FROM contract_events ORDER BY ts DESC LIMIT 1`
  ).get() as { event_type: string; ts: number } | undefined;

  const recentDistribution = db.prepare(
    `SELECT amount_mote, deploy_hash, ts FROM distribution_log ORDER BY ts DESC LIMIT 1`
  ).get() as { amount_mote: string; deploy_hash: string; ts: number } | undefined;

  const cycleCount = db.prepare(
    `SELECT COUNT(*) as c FROM monitor_log WHERE verified = 1`
  ).get() as { c: number };

  const reputationRow = db.prepare(
    `SELECT data FROM contract_events WHERE event_type = 'ReputationUpdated' ORDER BY ts DESC LIMIT 1`
  ).get() as { data: string } | undefined;

  let reputationData: Record<string, unknown> = {};
  if (reputationRow) {
    try {
      reputationData = JSON.parse(reputationRow.data);
    } catch (_) {}
  }

  const agentPubKey = process.env.AGENT_PUBLIC_KEY!;
  let agentBalance = "unknown";
  try {
    const balInfo = await getAccountBalance(agentPubKey);
    agentBalance = `${balInfo.balance} CSPR`;
  } catch (_) {}

  return {
    agent_status: "active",
    last_action: recentEvent?.event_type ?? "none",
    last_action_at: recentEvent
      ? new Date(recentEvent.ts).toISOString()
      : null,
    last_distribution: recentDistribution
      ? {
          amount_cspr: (Number(recentDistribution.amount_mote) / 1e9).toFixed(4),
          deploy_hash: recentDistribution.deploy_hash,
          at: new Date(recentDistribution.ts).toISOString(),
        }
      : null,
    reputation_score: reputationData.accuracy_score ?? null,
    trust_tier: reputationData.trust_tier ?? null,
    uptime_cycles: cycleCount.c,
    agent_wallet: agentPubKey,
    agent_balance: agentBalance,
    casperflow_contract: process.env.CASPERFLOW_CONTRACT_HASH,
    reputation_contract: process.env.REPUTATION_CONTRACT_HASH,
    chain: process.env.CASPER_CHAIN_NAME,
    oracle: process.env.ORACLE_SERVER_URL,
    timestamp: new Date().toISOString(),
  };
}

function startHealthServer(port: number = 3002): void {
  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url ?? "/");

    if (parsed.pathname === "/health" && req.method === "GET") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      try {
        const health = await buildHealthResponse();
        res.writeHead(200);
        res.end(JSON.stringify(health, null, 2));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: String(err) }));
      }
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    }
  });

  server.listen(port, () => {
    console.log(`[orchestrator] Health API: http://localhost:${port}/health`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════");
  console.log("  CasperFlow Agent v1.0 — Casper Testnet");
  console.log("═══════════════════════════════════════════════════");

  // Verify agent keys load correctly
  const keys = loadAgentKeys();
  console.log(`[orchestrator] Agent public key: ${keys.publicKey.toHex()}`);

  // Start CSPR.cloud event stream + WebSocket broadcast
  startWebSocketServer(3003);
  startEventStream();

  // Start revenue monitor (cron)
  startRevenueMonitor();

  // Distribution check every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    runDistributionCheck().catch(console.error);
  });

  // Health API
  startHealthServer(3002);

  console.log("[orchestrator] All systems running ✓");
  console.log("[orchestrator] Health: http://localhost:3002/health");
  console.log("[orchestrator] Events: ws://localhost:3003");

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("[orchestrator] SIGTERM received — shutting down");
    db.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("[orchestrator] Fatal error:", err);
  process.exit(1);
});
