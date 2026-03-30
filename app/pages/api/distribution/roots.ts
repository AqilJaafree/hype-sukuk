/**
 * GET /api/distribution/roots?mint=<pubkey>
 *
 * Returns all committed DistributionRoot PDAs for the given mint,
 * sorted by period_start ascending.
 *
 * Response: { roots: Array<{ periodStart: number; totalProfitUsdc: number; holderCount: number }> }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Connection, PublicKey } from "@solana/web3.js";

const SUKUK_ROLLUP_PROGRAM_ID = new PublicKey("B6KV6L7ZUC4mNf8P6ccudTneJqrE4Zsf7qQc2yzToqpt");

// DistributionRoot account layout (after 8-byte discriminator):
//   mint:               32 bytes  (offset  8)
//   merkle_root:        32 bytes  (offset 40)
//   total_profit_usdc:   8 bytes  (offset 72)
//   period_start:        8 bytes  (offset 80)
//   period_end:          8 bytes  (offset 88)
//   holder_count:        8 bytes  (offset 96)
//   committed:           1 byte   (offset 104)
//   bump:                1 byte   (offset 105)

function parseDistributionRoot(data: Buffer) {
  const mint              = new PublicKey(data.subarray(8, 40));
  const merkleRoot        = data.subarray(40, 72);
  const totalProfitUsdc   = Number(data.readBigUInt64LE(72));
  const periodStart       = Number(data.readBigInt64LE(80));
  const periodEnd         = Number(data.readBigInt64LE(88));
  const holderCount       = Number(data.readBigUInt64LE(96));
  const committed         = data[104] === 1;
  return { mint, merkleRoot, totalProfitUsdc, periodStart, periodEnd, holderCount, committed };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mint: mintStr } = req.query as { mint?: string };
  if (!mintStr) {
    return res.status(400).json({ error: "Missing mint" });
  }

  let mint: PublicKey;
  try {
    mint = new PublicKey(mintStr);
  } catch {
    return res.status(400).json({ error: "Invalid mint pubkey" });
  }

  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  try {
    // Anchor discriminator = sha256("account:DistributionRoot")[0..8]
    const DISCRIMINATOR = Buffer.from([225, 98, 34, 160, 164, 47, 254, 172]);

    const accounts = await connection.getProgramAccounts(SUKUK_ROLLUP_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: DISCRIMINATOR.toString("base64"), encoding: "base64" } },
        // Filter by mint at offset 8
        { memcmp: { offset: 8, bytes: mint.toBase58() } },
      ],
    });

    const roots = accounts
      .map(({ account }) => parseDistributionRoot(Buffer.from(account.data)))
      .filter((r) => r.committed)
      .sort((a, b) => a.periodStart - b.periodStart)
      .map(({ periodStart, periodEnd, totalProfitUsdc, holderCount }) => ({
        periodStart,
        periodEnd,
        totalProfitUsdc,
        holderCount,
      }));

    return res.status(200).json({ roots });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: "Failed to fetch distribution roots", detail: msg });
  }
}
