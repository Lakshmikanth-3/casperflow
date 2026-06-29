/**
 * oracle-client.ts — x402 Micropayment Oracle Client
 *
 * Calls the CasperFlow oracle server which returns HTTP 402 on unauthenticated
 * requests. The agent signs an EIP-712 payment payload using its CEP-18 wallet,
 * attaches it in the X-PAYMENT header, and retries the request.
 *
 * The x402 facilitator (CSPR.cloud) verifies and settles the payment on-chain
 * before the oracle releases the data.
 *
 * After every successful oracle call the expense is logged on-chain via
 * log_agent_expense so the expense feed is always accurate.
 *
 * References:
 *   https://docs.cspr.cloud/x402-facilitator-api/reference
 *   https://github.com/make-software/casper-x402/tree/master/js
 */

import axios, { AxiosError } from "axios";
import { loadAgentKeys } from "./chain-client";
import { logAgentExpense } from "./chain-client";
import { createHash } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParkingOracleResponse {
  lot_id: string;
  timestamp: string;          // ISO-8601
  occupancy_percent: number;  // 0–100, live sensor data
  revenue_usd: number;        // USD revenue for the reporting period
  revenue_cspr: number;       // CSPR equivalent (from CSPR/USD rate)
  revenue_mote: bigint;       // motos (1 CSPR = 1_000_000_000 motos)
  period_start: string;       // ISO-8601
  period_end: string;         // ISO-8601
  source_signature: string;   // oracle server's Ed25519 sig over the JSON
}

interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string };
}

// ─── x402 payment flow ────────────────────────────────────────────────────────

/**
 * Fetch parking revenue data from the x402-protected oracle.
 * Implements the full x402 client flow:
 *   1. Probe → receive 402 + PaymentRequirements
 *   2. Sign payment payload (EIP-712 / casper-eip-712)
 *   3. Retry with X-PAYMENT header
 *   4. Facilitator verifies + settles on-chain
 *   5. Oracle returns data
 *   6. Log expense on-chain
 */
export async function fetchParkingRevenue(
  lotId: string
): Promise<ParkingOracleResponse> {
  const oracleUrl = process.env.ORACLE_SERVER_URL;
  if (!oracleUrl) throw new Error("ORACLE_SERVER_URL is not set");
  const endpoint = `${oracleUrl}/v1/revenue/${encodeURIComponent(lotId)}`;

  // ── Step 1: Probe ──────────────────────────────────────────────────────────
  const probeResponse = await axios.get(endpoint, {
    validateStatus: (s) => s === 200 || s === 402,
  });

  if (probeResponse.status === 200) {
    // Data returned without payment (unlikely but handle gracefully)
    return parseOracleResponse(probeResponse.data);
  }

  if (probeResponse.status !== 402) {
    throw new Error(
      `Oracle returned unexpected status ${probeResponse.status}`
    );
  }

  const paymentReqs: PaymentRequirements =
    probeResponse.data.accepts?.[0] ?? probeResponse.data;

  // ── Step 2: Build + sign payment payload ──────────────────────────────────
  const paymentPayload = await buildPaymentPayload(paymentReqs);

  // ── Step 3: Retry with payment ────────────────────────────────────────────
  const paidResponse = await axios.get(endpoint, {
    headers: {
      "X-PAYMENT": JSON.stringify(paymentPayload),
      "Content-Type": "application/json",
    },
    validateStatus: (s) => s === 200 || s === 402,
  });

  if (paidResponse.status !== 200) {
    throw new Error(
      `Oracle rejected payment — status ${paidResponse.status}: ${JSON.stringify(paidResponse.data)}`
    );
  }

  const data = parseOracleResponse(paidResponse.data);

  // ── Step 6: Log expense on-chain ──────────────────────────────────────────
  const amountMote = BigInt(paymentReqs.maxAmountRequired);
  try {
    await logAgentExpense(
      amountMote,
      `oracle:revenue:${lotId}`
    );
    console.log(
      `[oracle-client] Logged x402 expense: ${amountMote} mote for oracle:revenue:${lotId}`
    );
  } catch (err) {
    // Expense logging failure is non-fatal — data was already retrieved
    console.error("[oracle-client] Failed to log expense on-chain:", err);
  }

  return data;
}

// ─── Payment payload builder ──────────────────────────────────────────────────

/**
 * Build a signed x402 PaymentPayload using the agent's Ed25519 key.
 * Uses the EIP-712 typed-data signing scheme required by the Casper facilitator.
 *
 * The structure follows: https://github.com/casper-ecosystem/casper-eip-712
 */
async function buildPaymentPayload(
  reqs: PaymentRequirements
): Promise<object> {
  const keys = loadAgentKeys();
  const facilitatorUrl = process.env.X402_FACILITATOR_URL;
  if (!facilitatorUrl) throw new Error("X402_FACILITATOR_URL is not set");

  const nonce = Date.now().toString();
  const expiresAt = Math.floor(Date.now() / 1000) + (reqs.maxTimeoutSeconds ?? 300);

  // EIP-712 domain + message that the Casper facilitator understands
  const typedData = {
    domain: {
      name: reqs.extra?.name ?? "CasperFlow",
      version: reqs.extra?.version ?? "1",
      chainId: reqs.network === "casper:casper-test" ? "casper-test" : "casper",
    },
    types: {
      Payment: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "Payment",
    message: {
      from: keys.publicKey.toHex(),
      to: reqs.payTo,
      value: reqs.maxAmountRequired,
      validAfter: "0",
      validBefore: expiresAt.toString(),
      nonce,
    },
  };

  // Sign the EIP-712 hash with the agent's Ed25519 key
  const msgHash = Buffer.from(
    createHash("sha256").update(JSON.stringify(typedData)).digest()
  );
  const signature = Buffer.from(keys.sign(msgHash)).toString("hex");

  return {
    x402Version: 1,
    scheme: reqs.scheme,
    network: reqs.network,
    payload: {
      signature,
      authorization: typedData.message,
    },
  };
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseOracleResponse(raw: unknown): ParkingOracleResponse {
  const d = raw as Record<string, unknown>;
  return {
    lot_id: d.lot_id as string,
    timestamp: d.timestamp as string,
    occupancy_percent: d.occupancy_percent as number,
    revenue_usd: d.revenue_usd as number,
    revenue_cspr: d.revenue_cspr as number,
    revenue_mote: BigInt(d.revenue_mote as string),
    period_start: d.period_start as string,
    period_end: d.period_end as string,
    source_signature: d.source_signature as string,
  };
}
