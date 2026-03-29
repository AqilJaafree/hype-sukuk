/**
 * POST /api/zkme/access-token
 *
 * Returns a short-lived zkMe access token for the frontend widget.
 * The ZK_ME_PRIVATE_KEY is only ever used server-side — never exposed to the browser.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ZKME_API_KEY;
  const appId = process.env.ZKME_APP_ID;

  if (!apiKey || !appId) {
    return res.status(500).json({ error: "zkMe credentials not configured" });
  }

  const apiKeyHash = crypto
    .createHash("sha256")
    .update(apiKey + appId)
    .digest("hex");

  let zkmeRes: Response;
  try {
    zkmeRes = await fetch("https://nest-api.zk.me/api/token/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, appId, apiKeyHash }),
    });
  } catch {
    return res.status(502).json({ error: "Could not reach zkMe API" });
  }

  if (!zkmeRes.ok) {
    const text = await zkmeRes.text().catch(() => "");
    return res.status(502).json({ error: "zkMe API error", detail: text });
  }

  const json = await zkmeRes.json();
  const accessToken: string | undefined = json?.data?.accessToken;

  if (!accessToken) {
    return res.status(502).json({ error: "Unexpected zkMe response", raw: json });
  }

  return res.status(200).json({ accessToken });
}
