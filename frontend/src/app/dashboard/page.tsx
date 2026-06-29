"use client";

import { useSearchParams } from "next/navigation";
import { useHealth } from "@/hooks/useHealth";
import { useAgentStream } from "@/hooks/useAgentStream";
import { Suspense } from "react";

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentStatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  const isWorking = status === "working";
  return (
    <span className="flex items-center gap-2">
      <span className={isActive ? "status-active" : isWorking ? "status-working" : "status-idle"} />
      <span style={{ color: isActive ? "var(--color-success)" : isWorking ? "var(--color-accent)" : "var(--color-warning)", fontWeight: 600, fontSize: "0.85rem" }}>
        {status.toUpperCase()}
      </span>
    </span>
  );
}

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const tierClass = `tier-${tier.toLowerCase()}`;
  const tierEmoji = { Bronze: "🥉", Silver: "🥈", Gold: "🥇", Platinum: "💎" }[tier] ?? "★";
  return (
    <span
      className={tierClass}
      style={{
        border: "1px solid currentColor",
        borderRadius: "6px",
        padding: "2px 10px",
        fontSize: "0.8rem",
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      {tierEmoji} {tier.toUpperCase()}
    </span>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "16px",
        padding: "20px",
      }}
    >
      <p
        style={{
          color: "var(--color-muted)",
          fontSize: "0.72rem",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "12px",
        }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

// ── Dashboard page ────────────────────────────────────────────────────────────

function DashboardContent() {
  const params = useSearchParams();
  const walletAddress = params.get("wallet") ?? "";
  const shortWallet = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : "Not connected";

  const { health, loading: healthLoading } = useHealth();
  const { events, connected } = useAgentStream();

  // Expense events for the live feed
  const expenseEvents = events
    .filter((e) => e.event_type === "AgentExpenseLogged")
    .slice(0, 10);

  const totalExpenses = expenseEvents.reduce((acc, e) => {
    return acc + BigInt((e.data.amount_mote as string) ?? "0");
  }, 0n);

  return (
    <main style={{ background: "var(--color-bg)", minHeight: "100vh" }}>
      {/* ── Navbar ──────────────────────────────────────────────────────── */}
      <nav
        style={{
          borderBottom: "1px solid var(--color-border)",
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "var(--color-accent)", fontWeight: 800, fontSize: "1.2rem" }}>
          CasperFlow
        </span>
        <div className="flex items-center gap-3">
          <span className={connected ? "status-active" : "status-idle"} />
          <code
            style={{
              background: "var(--color-surface2)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "4px 12px",
              fontSize: "0.8rem",
              color: "var(--color-muted)",
            }}
          >
            {shortWallet}
          </code>
        </div>
      </nav>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "16px",
          }}
        >
          {/* ── My Yield ──────────────────────────────────────────────── */}
          <Card title="My Yield">
            {health?.last_distribution ? (
              <>
                <p style={{ fontSize: "2.2rem", fontWeight: 800, color: "var(--color-success)", letterSpacing: "-0.03em" }}>
                  {health.last_distribution.amount_cspr} CSPR
                </p>
                <p style={{ color: "var(--color-muted)", fontSize: "0.82rem", marginTop: "4px" }}>
                  Last distribution {new Date(health.last_distribution.at).toLocaleString()}
                </p>
                <a
                  href={`https://testnet.cspr.live/deploy/${health.last_distribution.deploy_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--color-accent)", fontSize: "0.78rem", display: "block", marginTop: "8px" }}
                >
                  Verify on-chain ↗
                </a>
              </>
            ) : (
              <p style={{ color: "var(--color-muted)" }}>
                {healthLoading ? "Loading..." : "No distributions yet"}
              </p>
            )}
          </Card>

          {/* ── Agent Status ───────────────────────────────────────────── */}
          <Card title="Agent Status">
            <AgentStatusBadge status={health?.agent_status ?? "idle"} />
            <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="flex justify-between">
                <span style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>Last action</span>
                <span style={{ fontSize: "0.82rem" }}>{health?.last_action ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>At</span>
                <span style={{ fontSize: "0.82rem" }}>
                  {health?.last_action_at
                    ? new Date(health.last_action_at).toLocaleTimeString()
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>Chain</span>
                <span style={{ fontSize: "0.82rem", color: "var(--color-accent)" }}>{health?.chain ?? "—"}</span>
              </div>
            </div>
          </Card>

          {/* ── Agent Reputation ──────────────────────────────────────── */}
          <Card title="Agent Reputation">
            <div className="flex items-center justify-between mb-3">
              <TierBadge tier={health?.trust_tier ?? null} />
              <span style={{ fontSize: "1.8rem", fontWeight: 800, color: "var(--color-accent)" }}>
                {health?.reputation_score ?? "—"}%
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="flex justify-between">
                <span style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>Uptime cycles</span>
                <span style={{ fontSize: "0.82rem" }}>{health?.uptime_cycles ?? 0}</span>
              </div>
              {health?.reputation_contract && (
                <a
                  href={`https://testnet.cspr.live/contract/${health.reputation_contract}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--color-accent)", fontSize: "0.78rem", marginTop: "4px" }}
                >
                  Verify NFT on-chain ↗
                </a>
              )}
            </div>
          </Card>

          {/* ── Asset Health ───────────────────────────────────────────── */}
          <Card title="Asset Health">
            {events.find((e) => e.event_type === "RevenueRecorded") ? (() => {
              const ev = events.find((e) => e.event_type === "RevenueRecorded")!;
              return (
                <>
                  <p style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                    Parking Blox — Lot #7
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>Chicago, IL · On-chain</p>
                  <div style={{ marginTop: "12px" }}>
                    <div className="flex justify-between">
                      <span style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>Revenue (mote)</span>
                      <span style={{ fontSize: "0.82rem" }}>{ev.data.amount_mote as string}</span>
                    </div>
                  </div>
                </>
              );
            })() : (
              <p style={{ color: "var(--color-muted)" }}>Waiting for oracle data...</p>
            )}
          </Card>

          {/* ── x402 Expense Feed ─────────────────────────────────────── */}
          <Card title="Agent Expense Feed (x402)" className="col-span-full md:col-span-2">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>
                Total expenses logged: {(Number(totalExpenses) / 1e9).toFixed(6)} CSPR
              </span>
              <span style={{ fontSize: "0.78rem", color: connected ? "var(--color-success)" : "var(--color-muted)" }}>
                {connected ? "● Live" : "○ Offline"}
              </span>
            </div>

            {expenseEvents.length === 0 ? (
              <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
                {connected ? "Waiting for agent x402 payments..." : "Connecting..."}
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {expenseEvents.map((ev, i) => {
                  const amountMote = BigInt((ev.data.amount_mote as string) ?? "0");
                  const cspr = (Number(amountMote) / 1e9).toFixed(6);
                  const purpose = (ev.data.purpose as string) ?? "";
                  return (
                    <div
                      key={ev.deploy_hash + i}
                      className="animate-slide-up flex items-center gap-4"
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid rgba(31,41,55,0.5)",
                      }}
                    >
                      <span style={{ color: "var(--color-muted)", fontSize: "0.78rem", minWidth: "60px" }}>
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                      <span style={{ color: "var(--color-accent)", fontSize: "0.82rem", fontFamily: "monospace" }}>
                        {cspr} CSPR
                      </span>
                      <span style={{ color: "var(--color-text)", fontSize: "0.82rem", flex: 1 }}>
                        {purpose}
                      </span>
                      {ev.deploy_hash && (
                        <a
                          href={`https://testnet.cspr.live/deploy/${ev.deploy_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--color-muted)", fontSize: "0.72rem" }}
                        >
                          ↗
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* ── Contract Info ─────────────────────────────────────────── */}
          <Card title="On-Chain Contracts">
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {health?.casperflow_contract && (
                <div>
                  <p style={{ color: "var(--color-muted)", fontSize: "0.72rem" }}>CasperFlow Contract</p>
                  <a
                    href={`https://testnet.cspr.live/contract/${health.casperflow_contract}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--color-accent)", fontSize: "0.78rem", fontFamily: "monospace", wordBreak: "break-all" }}
                  >
                    {health.casperflow_contract}
                  </a>
                </div>
              )}
              {health?.reputation_contract && (
                <div>
                  <p style={{ color: "var(--color-muted)", fontSize: "0.72rem", marginTop: "8px" }}>Reputation NFT Contract</p>
                  <a
                    href={`https://testnet.cspr.live/contract/${health.reputation_contract}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "var(--color-accent)", fontSize: "0.78rem", fontFamily: "monospace", wordBreak: "break-all" }}
                  >
                    {health.reputation_contract}
                  </a>
                </div>
              )}
              {!health?.casperflow_contract && (
                <p style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>
                  Agent not connected. Start the agent first.
                </p>
              )}
            </div>
          </Card>

          {/* ── Multi-Asset Preview ──────────────────────────────────── */}
          <Card title="Coming in Phase 2 — Mainnet" className="col-span-full">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
              }}
            >
              {[
                { icon: "☀️", name: "Solar Panel Arrays", yield: "8–14% APY", phase: "Q3 2026" },
                { icon: "🏪", name: "Storage Units", yield: "6–10% APY", phase: "Q4 2026" },
                { icon: "🏢", name: "Commercial Real Estate", yield: "5–9% APY", phase: "Q1 2027" },
              ].map((asset) => (
                <div
                  key={asset.name}
                  style={{
                    background: "var(--color-surface2)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "12px",
                    padding: "16px",
                  }}
                >
                  <span style={{ fontSize: "1.8rem" }}>{asset.icon}</span>
                  <p style={{ fontWeight: 600, marginTop: "8px" }}>{asset.name}</p>
                  <p style={{ color: "var(--color-success)", fontSize: "0.85rem" }}>{asset.yield}</p>
                  <p style={{ color: "var(--color-muted)", fontSize: "0.75rem" }}>{asset.phase}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div style={{ background: "var(--color-bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "var(--color-muted)" }}>Loading...</span>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
