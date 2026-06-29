/**
 * chain-client.ts — Casper blockchain interface
 *
 * Uses the Casper MCP server (https://mcp.testnet.cspr.cloud/mcp) for
 * natural-language chain queries and the casper-js-sdk for signed deploys.
 *
 * Every deploy is tracked to finality before returning.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CasperClient,
  CLPublicKey,
  Keys,
  RuntimeArgs,
  CLValueBuilder,
  DeployUtil,
  CLU512,
  CLString,
} from "casper-js-sdk";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeployResult {
  deployHash: string;
  status: "success" | "failed";
}

export interface AccountBalance {
  balance: string; // in CSPR (human-readable)
  balanceMote: bigint;
}

// ─── Casper SDK client ────────────────────────────────────────────────────────

let _casperClient: CasperClient | null = null;

function getCasperClient(): CasperClient {
  if (!_casperClient) {
    const nodeUrl = process.env.CASPER_NODE_URL;
    if (!nodeUrl) throw new Error("CASPER_NODE_URL is not set");
    _casperClient = new CasperClient(nodeUrl);
  }
  return _casperClient;
}

// ─── Agent key loading ────────────────────────────────────────────────────────

let _agentKeys: Keys.AsymmetricKey | null = null;

export function loadAgentKeys(): Keys.AsymmetricKey {
  if (_agentKeys) return _agentKeys;
  const keyPath = process.env.AGENT_PRIVATE_KEY_PATH;
  if (!keyPath) throw new Error("AGENT_PRIVATE_KEY_PATH is not set");
  const absPath = path.resolve(keyPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Agent key file not found: ${absPath}`);
  }
  _agentKeys = Keys.Ed25519.loadKeyPairFromPrivateFile(absPath);
  return _agentKeys;
}

// ─── MCP client (for chain queries via natural language) ─────────────────────

let _mcpClient: Client | null = null;

async function getMCPClient(): Promise<Client> {
  if (_mcpClient) return _mcpClient;
  const mcpUrl = process.env.CASPER_MCP_URL;
  if (!mcpUrl) throw new Error("CASPER_MCP_URL is not set");
  const apiKey = process.env.CSPR_CLOUD_API_KEY;
  if (!apiKey) throw new Error("CSPR_CLOUD_API_KEY is not set");

  _mcpClient = new Client({ name: "casperflow-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers: { "X-CSPR-Cloud-Api-Key": apiKey },
    },
  });
  await _mcpClient.connect(transport);
  return _mcpClient;
}

// ─── Balance query ────────────────────────────────────────────────────────────

export async function getAccountBalance(
  publicKeyHex: string
): Promise<AccountBalance> {
  const client = await getMCPClient();
  const result = await client.callTool({
    name: "GetAccountBalance",
    arguments: { public_key: publicKeyHex },
  });
  // Parse result from MCP response
  const content = result.content as Array<{ type: string; text: string }>;
  const text = content.find((c) => c.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text);
  const balanceMote = BigInt(parsed.balance_value ?? "0");
  const balanceCspr = (Number(balanceMote) / 1e9).toFixed(4);
  return { balance: balanceCspr, balanceMote };
}

// ─── Contract call helper ─────────────────────────────────────────────────────

/**
 * Submit a deploy calling a named entry point on a contract.
 * Signs with the agent key and waits for finality.
 */
export async function callContractEntryPoint(
  contractHash: string,
  entryPoint: string,
  args: RuntimeArgs,
  paymentMote: bigint = 3_000_000_000n // 3 CSPR default gas
): Promise<DeployResult> {
  const client = getCasperClient();
  const keys = loadAgentKeys();
  const chainName = process.env.CASPER_CHAIN_NAME ?? "casper-test";

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(
      keys.publicKey,
      chainName,
      1,
      1_800_000, // 30 min TTL
      [],
      Date.now()
    ),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(contractHash.replace("contract-", ""), "hex")),
      entryPoint,
      args
    ),
    DeployUtil.standardPayment(paymentMote)
  );

  const signedDeploy = client.signDeploy(deploy, keys);
  const deployHash = await client.putDeploy(signedDeploy);

  // Poll until finality
  const status = await waitForDeploy(client, deployHash);
  return { deployHash, status };
}

async function waitForDeploy(
  client: CasperClient,
  deployHash: string,
  maxWaitMs: number = 180_000
): Promise<"success" | "failed"> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const result = await client.getDeploy(deployHash);
      if (result[1].execution_results.length > 0) {
        const execResult = result[1].execution_results[0].result;
        if ("Success" in execResult) return "success";
        if ("Failure" in execResult) {
          console.error("[chain-client] Deploy failed:", execResult.Failure);
          return "failed";
        }
      }
    } catch (_) {
      // Not yet included — keep polling
    }
    await sleep(5_000);
  }
  throw new Error(`Deploy ${deployHash} did not finalise within ${maxWaitMs}ms`);
}

// ─── Specific contract calls ──────────────────────────────────────────────────

export async function recordRevenue(
  amountMote: bigint,
  sourceHash: string
): Promise<DeployResult> {
  const contractHash = process.env.CASPERFLOW_CONTRACT_HASH;
  if (!contractHash) throw new Error("CASPERFLOW_CONTRACT_HASH is not set");
  const args = RuntimeArgs.fromMap({
    amount_mote: CLValueBuilder.u512(amountMote.toString()),
    source_hash: CLValueBuilder.string(sourceHash),
  });
  return callContractEntryPoint(contractHash, "record_revenue", args);
}

export async function distributeYield(): Promise<DeployResult> {
  const contractHash = process.env.CASPERFLOW_CONTRACT_HASH;
  if (!contractHash) throw new Error("CASPERFLOW_CONTRACT_HASH is not set");
  return callContractEntryPoint(
    contractHash,
    "distribute_yield",
    RuntimeArgs.fromMap({})
  );
}

export async function logAgentExpense(
  amountMote: bigint,
  purpose: string
): Promise<DeployResult> {
  const contractHash = process.env.CASPERFLOW_CONTRACT_HASH;
  if (!contractHash) throw new Error("CASPERFLOW_CONTRACT_HASH is not set");
  const args = RuntimeArgs.fromMap({
    amount_mote: CLValueBuilder.u512(amountMote.toString()),
    purpose: CLValueBuilder.string(purpose),
  });
  return callContractEntryPoint(contractHash, "log_agent_expense", args);
}

export async function updateReputation(
  accuracy: number,
  distributedDeltaMote: bigint
): Promise<DeployResult> {
  const contractHash = process.env.REPUTATION_CONTRACT_HASH;
  if (!contractHash) throw new Error("REPUTATION_CONTRACT_HASH is not set");
  const args = RuntimeArgs.fromMap({
    accuracy: CLValueBuilder.u8(accuracy),
    distributed_delta: CLValueBuilder.u512(distributedDeltaMote.toString()),
  });
  return callContractEntryPoint(contractHash, "update_reputation", args);
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
