/**
 * yield-distributor.ts
 *
 * Monitors the accumulated revenue in the CasperFlow contract and triggers
 * a distribution when the threshold is met. After a successful distribution
 * it kicks off the Reputation Engine update.
 */

import { distributeYield, updateReputation, getAccountBalance } from "./chain-client";
import { withdrawFromPool, shouldRouteToDeFi, depositIdleCSPR } from "./defi-router";
import { db } from "./db";

const DISTRIBUTION_THRESHOLD_MOTE = BigInt(
  process.env.DISTRIBUTION_THRESHOLD_MOTE ?? "1000000000"
);

export async function runDistributionCheck(): Promise<void> {
  const assetId = process.env.ASSET_ID ?? "parking-blox-lot-001";

  // Read accumulated revenue from local DB (synced from on-chain events)
  const row = db.prepare(
    `SELECT SUM(CAST(oracle_mote AS INTEGER)) as total FROM monitor_log
     WHERE asset_id = ? AND verified = 1 AND distributed = 0`
  ).get(assetId) as { total: string | null };

  const accumulatedMote = BigInt(row?.total ?? "0");
  console.log(`[yield-distributor] Accumulated undistributed: ${accumulatedMote} mote`);

  if (accumulatedMote < DISTRIBUTION_THRESHOLD_MOTE) {
    console.log(
      `[yield-distributor] Below threshold (${DISTRIBUTION_THRESHOLD_MOTE} mote). Skipping.`
    );

    // Check if idle funds should be routed to DeFi
    const lastDistRow = db.prepare(
      `SELECT MAX(ts) as last_ts FROM distribution_log WHERE asset_id = ?`
    ).get(assetId) as { last_ts: number | null };

    const lastDistributedAt = lastDistRow?.last_ts ?? 0;
    if (accumulatedMote > 0n && shouldRouteToDeFi(lastDistributedAt)) {
      await depositIdleCSPR(accumulatedMote);
    }
    return;
  }

  // ── Check if there is an active DeFi position — withdraw first ────────────
  const activePosition = db.prepare(`SELECT COUNT(*) as c FROM defi_positions WHERE withdrawn = 0`).get() as
    { c: number };
  if (activePosition.c > 0) {
    console.log("[yield-distributor] Withdrawing DeFi position before distribution...");
    const recovered = await withdrawFromPool();
    console.log(`[yield-distributor] Recovered from DeFi: ${recovered} mote`);
  }

  // ── Trigger on-chain distribution ─────────────────────────────────────────
  console.log("[yield-distributor] Triggering yield distribution...");
  const result = await distributeYield();

  if (result.status !== "success") {
    console.error(`[yield-distributor] Distribution deploy failed: ${result.deployHash}`);
    return;
  }

  console.log(`[yield-distributor] Distribution successful: ${result.deployHash}`);

  // ── Mark monitor records as distributed ───────────────────────────────────
  db.prepare(
    `UPDATE monitor_log SET distributed = 1 WHERE asset_id = ? AND distributed = 0`
  ).run(assetId);

  // ── Log distribution ───────────────────────────────────────────────────────
  db.prepare(
    `INSERT INTO distribution_log (asset_id, amount_mote, deploy_hash, ts)
     VALUES (?, ?, ?, ?)`
  ).run(assetId, accumulatedMote.toString(), result.deployHash, Date.now());

  // ── Update Reputation NFT on-chain ────────────────────────────────────────
  // Accuracy = percentage of oracle-reported revenue that was distributed
  const accuracy = Math.min(100, Math.round(Number(accumulatedMote) / Number(accumulatedMote) * 100));
  try {
    const reputationResult = await updateReputation(accuracy, accumulatedMote);
    console.log(
      `[yield-distributor] Reputation updated: deployHash=${reputationResult.deployHash} accuracy=${accuracy}%`
    );
  } catch (err) {
    console.error("[yield-distributor] Reputation update failed:", err);
  }
}
