/**
 * notification-service.ts — Email + WebSocket notification system
 *
 * Uses the Resend API (https://resend.com) for email delivery.
 * WebSocket push is handled through the event-stream WebSocket server.
 *
 * Users opt-in to email at wallet connect; email addresses are stored
 * in the local SQLite DB only (never on-chain).
 */

import { Resend } from "resend";
import { db } from "./db";

const resend = new Resend(process.env.RESEND_API_KEY);

// ─── Email notifications ──────────────────────────────────────────────────────

export async function sendYieldNotification(totalMote: bigint): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[notifications] RESEND_API_KEY not set — skipping email");
    return;
  }

  const cspr = (Number(totalMote) / 1e9).toFixed(4);
  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL ?? "agent@casperflow.io";

  // Fetch all opted-in subscribers
  const subscribers = db.prepare(
    `SELECT email FROM notification_subscribers WHERE opted_in = 1`
  ).all() as Array<{ email: string }>;

  if (subscribers.length === 0) {
    console.log("[notifications] No opted-in subscribers — skipping email");
    return;
  }

  for (const sub of subscribers) {
    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: sub.email,
        subject: `💰 Your CasperFlow yield just arrived — ${cspr} CSPR`,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #00E5CC;">Yield Distribution Complete</h1>
            <p>Your CasperFlow autonomous agent just distributed yield from your parking lot investment.</p>
            <div style="background: #111827; border-radius: 12px; padding: 24px; margin: 24px 0;">
              <p style="color: #6B7280; margin: 0;">Total distributed this cycle</p>
              <p style="color: #F9FAFB; font-size: 32px; font-weight: bold; margin: 8px 0;">${cspr} CSPR</p>
            </div>
            <p style="color: #6B7280;">
              Your share has been sent directly to your wallet — no claim required.
              <a href="https://casperflow.io/dashboard" style="color: #00E5CC;">View dashboard →</a>
            </p>
            <hr style="border-color: #1F2937; margin: 24px 0;" />
            <p style="color: #4B5563; font-size: 12px;">
              CasperFlow · Casper Testnet ·
              <a href="https://casperflow.io/unsubscribe" style="color: #6B7280;">Unsubscribe</a>
            </p>
          </div>
        `,
      });
      if (error) {
        console.error(`[notifications] Resend error for ${sub.email}:`, error);
      } else {
        console.log(`[notifications] Email sent to ${sub.email}: id=${data?.id}`);
      }
    } catch (err) {
      console.error(`[notifications] Failed to send to ${sub.email}:`, err);
    }
  }
}

export async function sendAgentStatusNotification(
  status: "active" | "idle" | "error",
  detail: string
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const fromEmail = process.env.NOTIFICATION_FROM_EMAIL ?? "agent@casperflow.io";
  const subscribers = db.prepare(
    `SELECT email FROM notification_subscribers WHERE opted_in = 1`
  ).all() as Array<{ email: string }>;

  for (const sub of subscribers) {
    await resend.emails.send({
      from: fromEmail,
      to: sub.email,
      subject: `CasperFlow Agent Status: ${status.toUpperCase()}`,
      html: `
        <p>Your CasperFlow agent status has changed to <strong>${status}</strong>.</p>
        <p>${detail}</p>
        <a href="https://casperflow.io/dashboard">View dashboard</a>
      `,
    });
  }
}

// ─── Subscriber management ────────────────────────────────────────────────────

export function subscribeEmail(walletAddress: string, email: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO notification_subscribers (wallet_address, email, opted_in, created_at)
    VALUES (?, ?, 1, ?)
  `).run(walletAddress, email, Date.now());
  console.log(`[notifications] Subscribed ${email} for wallet ${walletAddress}`);
}

export function unsubscribeEmail(email: string): void {
  db.prepare(`UPDATE notification_subscribers SET opted_in = 0 WHERE email = ?`)
    .run(email);
}
