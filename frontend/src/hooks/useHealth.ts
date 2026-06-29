/**
 * useHealth.ts — Fetches CasperFlow Agent Health API
 *
 * Polls GET /health from the agent server (port 3002) every 30 seconds.
 * Displays: agent_status, last_action, reputation_score, trust_tier,
 * uptime_cycles, contract addresses.
 */

"use client";

import { useEffect, useState } from "react";

export interface AgentHealth {
  agent_status: "active" | "idle" | "error";
  last_action: string;
  last_action_at: string | null;
  last_distribution: {
    amount_cspr: string;
    deploy_hash: string;
    at: string;
  } | null;
  reputation_score: number | null;
  trust_tier: string | null;
  uptime_cycles: number;
  agent_wallet: string;
  agent_balance: string;
  casperflow_contract: string;
  reputation_contract: string;
  chain: string;
  oracle: string;
  timestamp: string;
}

export function useHealth(): {
  health: AgentHealth | null;
  loading: boolean;
  error: string | null;
} {
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    const healthUrl =
      process.env.NEXT_PUBLIC_AGENT_HEALTH_URL ?? "http://localhost:3002/health";
    try {
      const res = await fetch(healthUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`Health API returned ${res.status}`);
      const data = (await res.json()) as AgentHealth;
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  return { health, loading, error };
}
