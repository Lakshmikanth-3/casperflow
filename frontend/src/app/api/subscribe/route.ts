/**
 * POST /api/subscribe — Email notification opt-in
 *
 * Forwards subscriber details to the agent's notification service
 * via a local HTTP call. The agent persists email in SQLite (never on-chain).
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { walletAddress, email } = await req.json() as {
      walletAddress: string;
      email: string;
    };

    if (!walletAddress || !email) {
      return NextResponse.json(
        { error: "walletAddress and email are required" },
        { status: 400 }
      );
    }

    // Forward to the agent's internal subscribe endpoint
    const agentUrl =
      process.env.AGENT_INTERNAL_URL ?? "http://localhost:3002";

    const res = await fetch(`${agentUrl}/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, email }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Agent subscription failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
