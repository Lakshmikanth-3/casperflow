/**
 * event-stream.ts — CSPR.cloud Streaming API integration
 *
 * Subscribes to contract-level events from both deployed contracts using
 * CSPR.cloud Streaming SSE endpoint. Events are fanned out to:
 *   - SQLite (for dashboard API queries)
 *   - WebSocket clients (for live dashboard feed)
 *   - Notification service (email + toast triggers)
 *
 * Streaming API docs: https://docs.cspr.cloud/streaming-api/contract-level-events
 * SSE endpoint: https://event-stream-testnet.make.services/events/deploys
 */

const EventSourceModule = require("eventsource");
const ES = EventSourceModule.default || EventSourceModule.EventSource || EventSourceModule;
import { WebSocketServer, WebSocket } from "ws";
import { db } from "./db";
import { sendYieldNotification } from "./notification-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContractEvent {
  eventType: string;
  contractHash: string;
  deployHash: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── WebSocket broadcast server ───────────────────────────────────────────────

let _wss: WebSocketServer | null = null;

export function startWebSocketServer(port: number = 3001): WebSocketServer {
  _wss = new WebSocketServer({ port });
  console.log(`[event-stream] WebSocket server started on port ${port}`);

  _wss.on("connection", (ws: WebSocket) => {
    console.log("[event-stream] Dashboard client connected");

    // Send last 20 events immediately on connect
    const recent = db.prepare(
      `SELECT * FROM contract_events ORDER BY ts DESC LIMIT 20`
    ).all();
    ws.send(JSON.stringify({ type: "history", events: recent }));
  });

  return _wss;
}

function broadcast(event: ContractEvent): void {
  if (!_wss) return;
  const message = JSON.stringify({ type: "event", event });
  _wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ─── CSPR.cloud SSE stream ────────────────────────────────────────────────────

export function startEventStream(): void {
  const streamUrl = process.env.CSPR_CLOUD_STREAM_URL;
  const apiKey = process.env.CSPR_CLOUD_API_KEY;
  const casperflowHash = process.env.CASPERFLOW_CONTRACT_HASH;
  const reputationHash = process.env.REPUTATION_CONTRACT_HASH;

  if (!streamUrl || !apiKey || !casperflowHash) {
    throw new Error(
      "Missing CSPR_CLOUD_STREAM_URL / CSPR_CLOUD_API_KEY / CASPERFLOW_CONTRACT_HASH"
    );
  }

  // CSPR.cloud streaming URL format:
  // https://event-stream-testnet.make.services/events/deploys
  // Filter by contract hash using query params
  const hashes = [casperflowHash, reputationHash].filter(Boolean).join(",");
  const url = `${streamUrl}?contract_package_hash=${hashes}`;

  console.log(`[event-stream] Connecting to CSPR.cloud stream: ${url}`);

  const es = new ES(url, {
    headers: { "x-cspr-cloud-api-key": apiKey },
  });

  es.onopen = () => {
    console.log("[event-stream] Connected to CSPR.cloud streaming ✓");
  };

  es.onmessage = (msg: MessageEvent) => {
    try {
      const raw = JSON.parse(msg.data as string);
      handleStreamEvent(raw);
    } catch (err) {
      console.error("[event-stream] Parse error:", err);
    }
  };

  es.onerror = (err: Event) => {
    console.error("[event-stream] SSE error:", err);
    // EventSource auto-reconnects; log but don't crash
  };
}

// ─── Event handler ────────────────────────────────────────────────────────────

function handleStreamEvent(raw: Record<string, unknown>): void {
  const eventName = raw.event_type as string ?? raw.type as string ?? "unknown";
  const deployHash = raw.deploy_hash as string ?? "";
  const contractHash = raw.contract_hash as string ?? "";
  const eventData = raw.data as Record<string, unknown> ?? raw;
  const timestamp = new Date().toISOString();

  const event: ContractEvent = {
    eventType: eventName,
    contractHash,
    deployHash,
    data: eventData,
    timestamp,
  };

  console.log(`[event-stream] Event received: ${eventName} deploy=${deployHash}`);

  // Persist to SQLite
  db.prepare(`
    INSERT INTO contract_events (event_type, contract_hash, deploy_hash, data, ts)
    VALUES (?, ?, ?, ?, ?)
  `).run(eventName, contractHash, deployHash, JSON.stringify(eventData), Date.now());

  // Broadcast to all connected dashboard WebSocket clients
  broadcast(event);

  // Trigger notifications for relevant events
  if (eventName === "YieldDistributed" || eventName === "yield_distributed") {
    const totalMotes = eventData.total_motes as string ?? "0";
    sendYieldNotification(BigInt(totalMotes)).catch(console.error);
  }
}
