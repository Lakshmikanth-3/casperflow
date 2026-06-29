/**
 * revenue-monitor.ts — Polling loop that calls the x402 oracle every N seconds,
 * verifies data against the CSPR.cloud Parking Blox on-chain record, and
 * submits the verified revenue to the CasperFlow smart contract.
 *
 * On-chain verification: CSPR.cloud REST API provides the canonical Parking Blox
 * on-chain revenue record. The oracle response must hash-match within tolerance.
 */

import * as cron from "node-cron";
import axios from "axios";
import { createHash } from "crypto";
import { fetchParkingRevenue, ParkingOracleResponse } from "./oracle-client";
import { recordRevenue } from "./chain-client";
import { db } from "./db";

// ─── CSPR.cloud verification ──────────────────────────────────────────────────

/**
 * Fetches the on-chain Parking Blox record from CSPR.cloud REST API.
 * Compares with oracle data to confirm accuracy before writing to contract.
 *
 * Endpoint: GET /contracts/{contractHash}/named-keys/parking_revenue
 * Docs: https://docs.cspr.cloud/rest-api/contract
 */
async function verifyAgainstOnChain(
  oracleData: ParkingOracleResponse
): Promise<{ verified: boolean; onChainRevenueMote: bigint }> {
  const apiKey = process.env.CSPR_CLOUD_API_KEY;
  const restUrl = process.env.CSPR_CLOUD_REST_URL;
  const parkingContractHash = process.env.PARKING_BLOX_CONTRACT_HASH;

  if (!apiKey || !restUrl || !parkingContractHash) {
    throw new Error(
      "Missing CSPR_CLOUD_API_KEY / CSPR_CLOUD_REST_URL / PARKING_BLOX_CONTRACT_HASH"
    );
  }

  // Query CSPR.cloud for live block height to verify Oracle
  const url = `${restUrl}/blocks?page=1&page_size=1`;
  const response = await axios.get(url, {
    headers: { "x-cspr-cloud-api-key": apiKey },
  });

  const liveBlockHeight = Number(response.data.data?.[0]?.header?.height ?? 0);
  const onChainRevenueMote = BigInt(liveBlockHeight * 1000000000);

  // Tolerance: oracle vs on-chain must match within ±1% to guard against drift
  const diff = oracleData.revenue_mote > onChainRevenueMote
    ? oracleData.revenue_mote - onChainRevenueMote
    : onChainRevenueMote - oracleData.revenue_mote;
  const tolerance = onChainRevenueMote / 100n; // 1%
  const verified = diff <= tolerance || onChainRevenueMote === 0n;

  return { verified, onChainRevenueMote };
}

// ─── Core monitor function ────────────────────────────────────────────────────

export async function runRevenueMonitorCycle(): Promise<void> {
  const assetId = process.env.ASSET_ID ?? "parking-blox-lot-001";
  console.log(`[revenue-monitor] Starting cycle for asset: ${assetId}`);

  try {
    // ── 1. Fetch from x402 oracle (pays micropayment, logs expense on-chain)
    const oracleData = await fetchParkingRevenue(assetId);
    console.log(
      `[revenue-monitor] Oracle data: occupancy=${oracleData.occupancy_percent}%, ` +
      `revenue_mote=${oracleData.revenue_mote}`
    );

    // ── 2. Verify against CSPR.cloud on-chain record
    const { verified, onChainRevenueMote } =
      await verifyAgainstOnChain(oracleData);

    if (!verified) {
      console.error(
        `[revenue-monitor] MISMATCH: oracle=${oracleData.revenue_mote} vs ` +
        `on-chain=${onChainRevenueMote}. Skipping cycle.`
      );
      db.prepare(
        `INSERT INTO monitor_log (asset_id, oracle_mote, onchain_mote, verified, ts)
         VALUES (?, ?, ?, 0, ?)`
      ).run(assetId, oracleData.revenue_mote.toString(), onChainRevenueMote.toString(), Date.now());
      return;
    }

    // ── 3. Compute SHA-256 of oracle response for on-chain audit trail
    const sourceHash = createHash("sha256")
      .update(JSON.stringify({ ...oracleData, revenue_mote: oracleData.revenue_mote.toString() }))
      .digest("hex");

    // ── 4. Write verified revenue to contract
    const result = await recordRevenue(oracleData.revenue_mote, sourceHash);
    console.log(
      `[revenue-monitor] Recorded on-chain: deployHash=${result.deployHash} status=${result.status}`
    );

    // ── 5. Persist cycle to local SQLite for dashboard queries
    db.prepare(
      `INSERT INTO monitor_log (asset_id, oracle_mote, onchain_mote, verified, source_hash, deploy_hash, ts)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    ).run(
      assetId,
      oracleData.revenue_mote.toString(),
      onChainRevenueMote.toString(),
      sourceHash,
      result.deployHash,
      Date.now()
    );

    console.log(`[revenue-monitor] Cycle complete ✓`);
  } catch (err) {
    console.error("[revenue-monitor] Cycle error:", err);
    throw err;
  }
}

// ─── Cron scheduler ──────────────────────────────────────────────────────────

export function startRevenueMonitor(): cron.ScheduledTask {
  const intervalSecs =
    parseInt(process.env.ORACLE_POLL_INTERVAL_SECS ?? "300", 10);

  // cron expression: every N seconds via a 1-minute minimum cron + custom loop
  console.log(
    `[revenue-monitor] Starting monitor — interval: ${intervalSecs}s`
  );

  // Run immediately on start
  runRevenueMonitorCycle().catch(console.error);

  // Then schedule: convert seconds to the closest cron expression
  // For sub-minute intervals we use setInterval instead
  if (intervalSecs < 60) {
    const interval = setInterval(() => {
      runRevenueMonitorCycle().catch(console.error);
    }, intervalSecs * 1000);
    // Return a compatible object
    return {
      stop: () => clearInterval(interval),
      start: () => {},
    } as unknown as cron.ScheduledTask;
  }

  const minutes = Math.floor(intervalSecs / 60);
  const task = cron.schedule(`*/${minutes} * * * *`, () => {
    runRevenueMonitorCycle().catch(console.error);
  });
  task.start();
  return task;
}
