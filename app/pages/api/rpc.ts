/**
 * POST /api/rpc
 *
 * Thin JSON-RPC proxy to Helius devnet. The actual RPC URL (with API key)
 * lives in SOLANA_RPC_URL (server-side only). The browser sends requests
 * to /api/rpc and never sees the key.
 */
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rpcUrl = process.env.SOLANA_RPC_URL;
  if (!rpcUrl) {
    return res.status(500).json({ error: "RPC not configured" });
  }

  try {
    const upstream = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: "RPC proxy error", detail: msg });
  }
}
