/**
 * defi-router.ts — Idle CSPR liquidity manager via CSPR.trade MCP Server
 *
 * After 24h of undistributed idle CSPR in the contract's accumulated balance,
 * the router queries CSPR.trade for the best liquidity pool APY, deposits idle
 * funds, earns swap fees, and withdraws before the next distribution cycle.
 *
 * CSPR.trade MCP endpoint: https://mcp.cspr.trade
 * Docs: https://www.casper.network/ai#csprtrade-mcp
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { db } from "./db";
import { logAgentExpense } from "./chain-client";

// ─── MCP client for CSPR.trade ────────────────────────────────────────────────

let _tradeMCPClient: Client | null = null;

async function getTradeMCPClient(): Promise<Client> {
  if (_tradeMCPClient) return _tradeMCPClient;
  const mcpUrl = process.env.CSPRTRADE_MCP_URL;
  if (!mcpUrl) throw new Error("CSPRTRADE_MCP_URL is not set");

  _tradeMCPClient = new Client({ name: "casperflow-defi-router", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
  await _tradeMCPClient.connect(transport);
  return _tradeMCPClient;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PoolQuote {
  poolName: string;
  apy: number;
  tokenIn: string;
  tokenOut: string;
  route: string;
  priceImpact: string;
}

interface DefiPosition {
  poolName: string;
  depositedMote: bigint;
  depositedAt: number; // unix ms
  txHash: string;
}

// ─── Core logic ───────────────────────────────────────────────────────────────

/**
 * Query CSPR.trade MCP for the highest APY pool available for CSPR.
 */
export async function getBestPool(): Promise<PoolQuote> {
  const client = await getTradeMCPClient();

  const result = await client.callTool({
    name: "get_quote",
    arguments: {
      token_in: "CSPR",
      token_out: "sCSPR",
      amount: "1000000000000", // 1000 CSPR in motos for quote sizing
      type: "exact_in",
    },
  });

  const content = result.content as Array<{ type: string; text: string }>;
  const text = content.find((c) => c.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text);

  return {
    poolName: parsed.route ?? "CSPR → sCSPR",
    apy: parsed.apy ?? 0,
    tokenIn: "CSPR",
    tokenOut: parsed.token_out ?? "sCSPR",
    route: parsed.route ?? "",
    priceImpact: parsed.price_impact ?? "0%",
  };
}

/**
 * Deposit idle CSPR into the best available CSPR.trade pool.
 * Only called when accumulated balance has been idle > DEFI_IDLE_HOURS.
 */
export async function depositIdleCSPR(idleMote: bigint): Promise<DefiPosition> {
  const client = await getTradeMCPClient();
  const pool = await getBestPool();

  console.log(`[defi-router] Depositing ${idleMote} mote into pool: ${pool.poolName} (APY: ${pool.apy}%)`);

  const result = await client.callTool({
    name: "add_liquidity",
    arguments: {
      token_a: "CSPR",
      token_b: pool.tokenOut,
      amount_a: idleMote.toString(),
      slippage_tolerance: "0.5",
    },
  });

  const content = result.content as Array<{ type: string; text: string }>;
  const text = content.find((c) => c.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text);

  const position: DefiPosition = {
    poolName: pool.poolName,
    depositedMote: idleMote,
    depositedAt: Date.now(),
    txHash: parsed.tx_hash ?? parsed.deploy_hash ?? "",
  };

  // Persist position so we can withdraw later
  db.prepare(`
    INSERT OR REPLACE INTO defi_positions (pool_name, deposited_mote, deposited_at, tx_hash, withdrawn)
    VALUES (?, ?, ?, ?, 0)
  `).run(pool.poolName, idleMote.toString(), Date.now(), position.txHash);

  console.log(`[defi-router] Deposited: txHash=${position.txHash}`);
  return position;
}

/**
 * Withdraw all funds from the active DeFi position before distribution.
 * Returns the total recovered amount (principal + fees earned).
 */
export async function withdrawFromPool(): Promise<bigint> {
  const row = db.prepare(`SELECT * FROM defi_positions WHERE withdrawn = 0 LIMIT 1`).get() as
    | { pool_name: string; deposited_mote: string; tx_hash: string } | undefined;

  if (!row) {
    console.log("[defi-router] No active DeFi position to withdraw.");
    return 0n;
  }

  const client = await getTradeMCPClient();

  const result = await client.callTool({
    name: "remove_liquidity",
    arguments: {
      pool: row.pool_name,
      lp_token_amount: "all",
    },
  });

  const content = result.content as Array<{ type: string; text: string }>;
  const text = content.find((c) => c.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text);

  const recoveredMote = BigInt(parsed.amount_a_received ?? row.deposited_mote);

  db.prepare(`UPDATE defi_positions SET withdrawn = 1, withdrawn_mote = ?, withdrawn_at = ? WHERE tx_hash = ?`)
    .run(recoveredMote.toString(), Date.now(), row.tx_hash);

  const feesEarned = recoveredMote - BigInt(row.deposited_mote);
  console.log(
    `[defi-router] Withdrew from ${row.pool_name}: ` +
    `principal=${row.deposited_mote} mote, fees=${feesEarned} mote`
  );

  return recoveredMote;
}

/**
 * Check whether idle CSPR has been sitting long enough to route to DeFi.
 */
export function shouldRouteToDeFi(lastDistributedAt: number): boolean {
  const idleHours = parseInt(process.env.DEFI_IDLE_HOURS ?? "24", 10);
  const idleMs = idleHours * 60 * 60 * 1000;
  return Date.now() - lastDistributedAt > idleMs;
}
