/**
 * useAgentStream.ts — WebSocket hook for live agent event feed
 *
 * Connects to the CasperFlow agent WebSocket server (ws://localhost:3001)
 * and receives real-time contract events streamed from CSPR.cloud.
 */

"use client";

import { useEffect, useState, useRef, useCallback } from "react";

export interface AgentEvent {
  id: number;
  event_type: string;
  contract_hash: string;
  deploy_hash: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface StreamState {
  events: AgentEvent[];
  connected: boolean;
  error: string | null;
}

export function useAgentStream(): StreamState {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const wsUrl =
      process.env.NEXT_PUBLIC_AGENT_WS_URL ?? "ws://localhost:3001";

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      console.log("[stream] Connected to CasperFlow agent");
    };

    ws.onmessage = (msg: MessageEvent) => {
      try {
        const payload = JSON.parse(msg.data as string) as {
          type: "event" | "history";
          event?: AgentEvent;
          events?: AgentEvent[];
        };

        if (payload.type === "history" && payload.events) {
          setEvents(payload.events);
        } else if (payload.type === "event" && payload.event) {
          setEvents((prev) => [payload.event!, ...prev].slice(0, 100));
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      setConnected(false);
    };

    ws.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 5s
      reconnectTimer.current = setTimeout(connect, 5_000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { events, connected, error };
}
