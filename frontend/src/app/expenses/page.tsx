"use client";

import { useHealth } from "@/hooks/useHealth";
import { useAgentStream } from "@/hooks/useAgentStream";
import Link from "next/link";

/**
 * Screen 3: Agent Expense Detail — Full x402 micropayment ledger
 *
 * Shows every on-chain expense the agent ever made with:
 * - Deploy hash (links to testnet.cspr.live)
 * - Purpose (oracle type / DeFi / distribution gas)
 * - Amount in CSPR and USD
 * - ROI: total agent cost vs total yield generated
 */

export default function ExpensePage() {
  const { health } = useHealth();
  const { events, connected } = useAgentStream();

  const expenseEvents = events.filter(
    (e) => e.event_type === "AgentExpenseLogged"
  );

  const totalExpenseMote = expenseEvents.reduce(
    (acc, e) => acc + BigInt((e.data.amount_mote as string) ?? "0"),
    0n
  );
  const totalExpenseCspr = Number(totalExpenseMote) / 1e9;

  const totalDistributedCspr = health?.last_distribution
    ? parseFloat(health.last_distribution.amount_cspr)
    : 0;

  const roi =
    totalExpenseCspr > 0
      ? ((totalDistributedCspr / totalExpenseCspr) * 100).toFixed(0)
      : "∞";

  const purposeGroups: Record<string, { count: number; totalMote: bigint }> = {};
  expenseEvents.forEach((e) => {
    const purpose = ((e.data.purpose as string) ?? "unknown")
      .split(":")[0];
    if (!purposeGroups[purpose]) {
      purposeGroups[purpose] = { count: 0, totalMote: 0n };
    }
    purposeGroups[purpose].count++;
    purposeGroups[purpose].totalMote += BigInt(
      (e.data.amount_mote as string) ?? "0"
    );
  });

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
          Agent Expense Ledger
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.75rem",
            color: connected ? "var(--color-success)" : "var(--color-muted)",
          }}
        >
          {connected ? "● Live" : "○ Offline"}
        </span>
      </nav>

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px 24px" }}>
        {/* Summary stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "32px",
          }}
        >
          {[
            {
              label: "Total Agent Spend",
              value: `${totalExpenseCspr.toFixed(6)} CSPR`,
              sub: `${expenseEvents.length} payments`,
              color: "var(--color-warning)",
            },
            {
              label: "Total Yield Generated",
              value: `${totalDistributedCspr.toFixed(4)} CSPR`,
              sub: "distributed to holders",
              color: "var(--color-success)",
            },
            {
              label: "Agent ROI",
              value: `${roi}×`,
              sub: "yield per CSPR spent",
              color: "var(--color-accent)",
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "16px",
                padding: "20px",
              }}
            >
              <p style={{ color: "var(--color-muted)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>
                {s.label}
              </p>
              <p style={{ fontSize: "1.8rem", fontWeight: 800, color: s.color, letterSpacing: "-0.03em" }}>
                {s.value}
              </p>
              <p style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Breakdown by type */}
        {Object.keys(purposeGroups).length > 0 && (
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
              Breakdown by Type
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {Object.entries(purposeGroups).map(([type, info]) => (
                <div key={type} className="flex items-center justify-between">
                  <span style={{ fontSize: "0.9rem", textTransform: "capitalize" }}>{type}</span>
                  <div className="flex gap-6">
                    <span style={{ color: "var(--color-muted)", fontSize: "0.82rem" }}>{info.count} calls</span>
                    <span style={{ color: "var(--color-accent)", fontSize: "0.82rem", fontFamily: "monospace" }}>
                      {(Number(info.totalMote) / 1e9).toFixed(6)} CSPR
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full ledger */}
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
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <p style={{ color: "var(--color-muted)", fontSize: "0.72rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              All Micropayments (newest first)
            </p>
            <span style={{ color: "var(--color-muted)", fontSize: "0.78rem" }}>
              {expenseEvents.length} entries
            </span>
          </div>

          {expenseEvents.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <p style={{ color: "var(--color-muted)" }}>
                {connected
                  ? "No expense events yet — the agent hasn't made any x402 payments."
                  : "Connect agent to see live expenses."}
              </p>
            </div>
          ) : (
            <div>
              {expenseEvents.map((ev, i) => {
                const amountMote = BigInt((ev.data.amount_mote as string) ?? "0");
                const cspr = (Number(amountMote) / 1e9).toFixed(6);
                const purpose = (ev.data.purpose as string) ?? "";
                return (
                  <div
                    key={ev.deploy_hash + i}
                    style={{
                      padding: "12px 20px",
                      borderBottom:
                        i < expenseEvents.length - 1
                          ? "1px solid rgba(31,41,55,0.4)"
                          : "none",
                      display: "grid",
                      gridTemplateColumns: "120px 1fr 120px 80px",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <span style={{ color: "var(--color-muted)", fontSize: "0.78rem" }}>
                      {new Date(ev.timestamp).toLocaleString()}
                    </span>
                    <span style={{ fontSize: "0.85rem" }}>{purpose}</span>
                    <span
                      style={{
                        color: "var(--color-accent)",
                        fontSize: "0.85rem",
                        fontFamily: "monospace",
                        textAlign: "right",
                      }}
                    >
                      {cspr} CSPR
                    </span>
                    <div style={{ textAlign: "right" }}>
                      {ev.deploy_hash && (
                        <a
                          href={`https://testnet.cspr.live/deploy/${ev.deploy_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--color-muted)", fontSize: "0.75rem" }}
                        >
                          ↗ chain
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
