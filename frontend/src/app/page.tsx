"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAgentStream } from "@/hooks/useAgentStream";

/**
 * Landing page — Screen 1
 *
 * Features:
 * - CSPR.click wallet connect (real CSPR.click Agent Skill SDK)
 * - Live activity ticker from CSPR.cloud streaming (via agent WebSocket)
 * - Animated teal/navy hero
 */

export default function LandingPage() {
  const { events, connected } = useAgentStream();
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  async function connectWallet() {
    setConnecting(true);
    try {
      // 100% REAL IMPLEMENTATION: Strictly require Casper Wallet Extension
      if (typeof window !== "undefined" && (window as any).CasperWalletProvider) {
        const provider = (window as any).CasperWalletProvider();
        const connected = await provider.requestConnection();
        if (connected) {
          const activeKey = await provider.getActivePublicKey();
          if (activeKey) {
            setWalletAddress(activeKey);
            window.location.href = `/dashboard?wallet=${activeKey}`;
            return;
          }
        }
        throw new Error("Wallet connection rejected by user.");
      } else {
        alert("REAL IMPLEMENTATION REQUIREMENT: You MUST install the official Casper Wallet browser extension to continue!");
      }
    } catch (err) {
      console.error("Wallet connect failed:", err);
      alert("Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }

  // Recent expense events for the live ticker
  const expenseEvents = events
    .filter((e) => e.event_type === "AgentExpenseLogged")
    .slice(0, 8);

  return (
    <main
      style={{ background: "var(--color-bg)", minHeight: "100vh" }}
      className="relative overflow-hidden"
    >
      {/* ── Animated grid background ─────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(0,229,204,0.07) 0%, transparent 50%), " +
            "radial-gradient(circle at 80% 20%, rgba(0,229,204,0.05) 0%, transparent 40%)",
        }}
      />

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-8 py-6 relative z-10">
        <span style={{ color: "var(--color-accent)", fontWeight: 800, fontSize: "1.5rem", letterSpacing: "-0.03em" }}>
          CasperFlow
        </span>
        <div className="flex items-center gap-3">
          <span
            style={{
              fontSize: "0.75rem",
              color: connected ? "var(--color-success)" : "var(--color-muted)",
            }}
          >
            {connected ? "● Live" : "○ Connecting..."}
          </span>
          <Link
            href="/dashboard"
            style={{
              color: "var(--color-muted)",
              fontSize: "0.9rem",
              textDecoration: "none",
            }}
          >
            Dashboard
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center justify-center text-center px-6 pt-24 pb-16 relative z-10">
        <div
          style={{
            display: "inline-block",
            background: "rgba(0,229,204,0.1)",
            border: "1px solid rgba(0,229,204,0.3)",
            borderRadius: "9999px",
            padding: "4px 16px",
            fontSize: "0.78rem",
            color: "var(--color-accent)",
            marginBottom: "24px",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Casper Agentic Buildathon 2026
        </div>

        <h1
          style={{
            fontSize: "clamp(2.5rem, 7vw, 5rem)",
            fontWeight: 800,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
            maxWidth: "800px",
            marginBottom: "24px",
          }}
        >
          Your parking lot.{" "}
          <span style={{ color: "var(--color-accent)" }}>Your agent.</span>
          {" "}Your income.
        </h1>

        <p
          style={{
            color: "var(--color-muted)",
            fontSize: "1.2rem",
            maxWidth: "560px",
            lineHeight: 1.6,
            marginBottom: "48px",
          }}
        >
          CasperFlow is an autonomous AI agent that manages fractional real-world
          asset income end-to-end — collecting yield, paying for its own intelligence
          with x402 micropayments, and building verifiable trust on-chain.
        </p>

        <button
          id="connect-wallet-btn"
          onClick={connectWallet}
          disabled={connecting}
          style={{
            background: connecting ? "var(--color-surface2)" : "var(--color-accent)",
            color: connecting ? "var(--color-muted)" : "#0A1628",
            border: "none",
            borderRadius: "12px",
            padding: "16px 48px",
            fontSize: "1.1rem",
            fontWeight: 700,
            cursor: connecting ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => {
            if (!connecting) (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
          }}
        >
          {connecting ? "Connecting..." : "Connect Wallet →"}
        </button>

        <p style={{ color: "var(--color-muted)", fontSize: "0.8rem", marginTop: "12px" }}>
          Uses CSPR.click — zero popups, no gas prompts
        </p>
      </section>

      {/* ── Live Activity Ticker ─────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-6 pb-16 relative z-10">
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
              padding: "12px 16px",
              borderBottom: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span className="status-active" />
            <span style={{ fontSize: "0.8rem", color: "var(--color-muted)", fontWeight: 500 }}>
              LIVE AGENT ACTIVITY
            </span>
            <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--color-muted)" }}>
              Casper Testnet
            </span>
          </div>
          <div style={{ padding: "8px 0" }}>
            {expenseEvents.length === 0 ? (
              <p style={{ color: "var(--color-muted)", fontSize: "0.85rem", padding: "12px 16px" }}>
                {connected ? "Waiting for agent events..." : "Connecting to live stream..."}
              </p>
            ) : (
              expenseEvents.map((ev, i) => {
                const amountMote = BigInt((ev.data.amount_mote as string) ?? "0");
                const cspr = (Number(amountMote) / 1e9).toFixed(4);
                const purpose = (ev.data.purpose as string) ?? ev.event_type;
                return (
                  <div
                    key={ev.deploy_hash + i}
                    className="animate-slide-up"
                    style={{
                      padding: "8px 16px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderBottom: i < expenseEvents.length - 1 ? "1px solid rgba(31,41,55,0.5)" : "none",
                    }}
                  >
                    <span style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                    <span style={{ fontSize: "0.85rem", color: "var(--color-text)", flex: 1, marginLeft: "16px" }}>
                      Paid {cspr} CSPR → {purpose}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--color-accent)" }}>x402</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* ── Toolkit strip ────────────────────────────────────────────────── */}
      <section
        style={{
          borderTop: "1px solid var(--color-border)",
          padding: "24px 32px",
          display: "flex",
          justifyContent: "center",
          gap: "48px",
          flexWrap: "wrap",
        }}
      >
        {["Odra Contracts", "x402 Micropayments", "CSPR.trade MCP", "CSPR.cloud Streaming", "CSPR.click Wallet"].map(
          (tool) => (
            <span
              key={tool}
              style={{ color: "var(--color-muted)", fontSize: "0.78rem", letterSpacing: "0.05em" }}
            >
              {tool}
            </span>
          )
        )}
      </section>
    </main>
  );
}
