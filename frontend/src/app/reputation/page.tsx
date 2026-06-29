"use client";

import { useHealth } from "@/hooks/useHealth";
import { useAgentStream } from "@/hooks/useAgentStream";
import Link from "next/link";

/**
 * Screen 4: Agent Reputation Detail
 *
 * Shows:
 * - Full reputation history from on-chain events
 * - Live Agent Health API JSON response
 * - Tier progression over time
 * - "Verify on-chain" links to both contracts on testnet.cspr.live
 */

function TierBadge({ tier }: { tier: string }) {
  const tierClass = `tier-${tier.toLowerCase()}`;
  const emoji = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎" }[tier] ?? "★";
  return (
    <span
      className={tierClass}
      style={{
        border: "1px solid currentColor",
        borderRadius: "8px",
        padding: "4px 16px",
        fontSize: "1rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
      }}
    >
      {emoji} {tier.toUpperCase()}
    </span>
  );
}

export default function ReputationPage() {
  const { health, loading } = useHealth();
  const { events, connected } = useAgentStream();

  const repEvents = events.filter(
    (e) => e.event_type === "ReputationUpdated"
  );

  return (
    <main style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      {/* Navbar */}
      <nav
        style={{
          borderBottom: "1px solid var(--color-border)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <Link href="/dashboard" style={{ color: "var(--color-muted)", textDecoration: "none", fontSize: "0.9rem" }}>
          ← Dashboard
        </Link>
        <span style={{ color: "var(--color-accent)", fontWeight: 800 }}>
          Agent Reputation
        </span>
        <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: connected ? "var(--color-success)" : "var(--color-muted)" }}>
          {connected ? "● Live" : "○ Offline"}
        </span>
      </nav>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
        {/* Current score */}
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "16px",
            padding: "32px",
            marginBottom: "24px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "32px",
          }}
        >
          <div>
            <p style={{ color: "var(--color-muted)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>
              Current Trust Score
            </p>
            <div style={{ fontSize: "5rem", fontWeight: 900, color: "var(--color-accent)", letterSpacing: "-0.05em", lineHeight: 1 }}>
              {loading ? "…" : `${health?.reputation_score ?? 0}%`}
            </div>
            <div style={{ marginTop: "16px" }}>
              {health?.trust_tier && <TierBadge tier={health.trust_tier} />}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              { label: "Accuracy Score", value: `${health?.reputation_score ?? "—"}%` },
              { label: "Uptime Cycles", value: health?.uptime_cycles ?? "—" },
              { label: "Agent Wallet", value: health?.agent_wallet ? `${health.agent_wallet.slice(0, 10)}…` : "—" },
              { label: "Agent Balance", value: health?.agent_balance ?? "—" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center">
                <span style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>{row.label}</span>
                <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>{String(row.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* On-chain verify links */}
        {health && (
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "16px",
              padding: "20px",
              marginBottom: "24px",
            }}
          >
            <p style={{ color: "var(--color-muted)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>
              Verify On-Chain
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {health.reputation_contract && (
                <a
                  id="verify-reputation-nft"
                  href={`https://testnet.cspr.live/contract/${health.reputation_contract}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "rgba(0,229,204,0.08)",
                    border: "1px solid rgba(0,229,204,0.2)",
                    borderRadius: "10px",
                    padding: "12px 16px",
                    color: "var(--color-accent)",
                    textDecoration: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.85rem",
                  }}
                >
                  <span>Reputation NFT Contract</span>
                  <span>↗ testnet.cspr.live</span>
                </a>
              )}
              {health.casperflow_contract && (
                <a
                  id="verify-casperflow-contract"
                  href={`https://testnet.cspr.live/contract/${health.casperflow_contract}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    background: "rgba(0,229,204,0.04)",
                    border: "1px solid rgba(0,229,204,0.1)",
                    borderRadius: "10px",
                    padding: "12px 16px",
                    color: "var(--color-accent)",
                    textDecoration: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "0.85rem",
                  }}
                >
                  <span>CasperFlow RWA Contract</span>
                  <span>↗ testnet.cspr.live</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Live Agent Health API response */}
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "16px",
            padding: "20px",
            marginBottom: "24px",
          }}
        >
          <p style={{ color: "var(--color-muted)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "16px" }}>
            Agent Health API — Live Response
          </p>
          <pre
            style={{
              background: "#0d1520",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "16px",
              fontSize: "0.78rem",
              color: "#a8b8d8",
              overflowX: "auto",
              lineHeight: 1.6,
            }}
          >
            {loading
              ? "Fetching..."
              : JSON.stringify(health, null, 2)}
          </pre>
          <p style={{ color: "var(--color-muted)", fontSize: "0.75rem", marginTop: "8px" }}>
            Any machine can call{" "}
            <code style={{ color: "var(--color-accent)" }}>
              GET https://api.casperflow.io/health
            </code>{" "}
            before trusting this agent with funds.
          </p>
        </div>

        {/* Reputation update history */}
        <div
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "16px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <p style={{ color: "var(--color-muted)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Reputation Update History
            </p>
          </div>

          {repEvents.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center" }}>
              <p style={{ color: "var(--color-muted)" }}>
                {connected
                  ? "No reputation updates yet — waiting for first distribution cycle."
                  : "Connect agent to see live updates."}
              </p>
            </div>
          ) : (
            repEvents.map((ev, i) => {
              const data = ev.data;
              return (
                <div
                  key={ev.deploy_hash + i}
                  style={{
                    padding: "12px 20px",
                    borderBottom: i < repEvents.length - 1 ? "1px solid rgba(31,41,55,0.4)" : "none",
                    display: "grid",
                    gridTemplateColumns: "140px 80px 100px 1fr",
                    gap: "16px",
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "var(--color-muted)", fontSize: "0.78rem" }}>
                    {new Date(ev.timestamp).toLocaleString()}
                  </span>
                  <span style={{ color: "var(--color-accent)", fontSize: "0.85rem", fontWeight: 600 }}>
                    {data.accuracy_score as number}%
                  </span>
                  <span style={{ fontSize: "0.82rem" }}>
                    Cycle #{data.uptime_cycles as number}
                  </span>
                  {ev.deploy_hash && (
                    <a
                      href={`https://testnet.cspr.live/deploy/${ev.deploy_hash}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--color-muted)", fontSize: "0.75rem", textAlign: "right" }}
                    >
                      ↗ chain
                    </a>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
