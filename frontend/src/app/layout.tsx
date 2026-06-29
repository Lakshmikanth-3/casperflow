import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CasperFlow — Autonomous RWA Income Agent",
  description:
    "The first AI agent that manages tokenized real-world assets end-to-end. Pays for its own intelligence with x402 micropayments. Built on Casper AI Toolkit.",
  keywords: [
    "CasperFlow", "Casper Network", "RWA", "real-world assets", "x402",
    "DeFi", "autonomous agent", "yield", "blockchain", "CSPR",
  ],
  openGraph: {
    title: "CasperFlow — Autonomous RWA Income Agent",
    description: "Your parking lot. Your agent. Your income. Powered by Casper AI Toolkit.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
