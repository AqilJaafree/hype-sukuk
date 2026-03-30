/**
 * GET /api/distribution/roots?mint=<pubkey>
 *
 * Returns all committed DistributionRoot PDAs for the given mint,
 * sorted by period_start ascending.
 *
 * Response: { roots: Array<{ periodStart: number; periodEnd: number; totalProfitUsdc: number; holderCount: number }> }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Connection, PublicKey } from "@solana/web3.js";
import { SUKUK_ROLLUP_PROGRAM_ID } from "../../../lib/programs";
import { DISCRIMINATOR_DISTRIBUTION_ROOT } from "../../../lib/constants";
import { getErrorMessage } from "../../../lib/errors";

// DistributionRoot account layout (after 8-byte discriminator):
//   mint:               32 bytes  (offset  8)
//   merkle_root:        32 bytes  (offset 40)
//   total_profit_usdc:   8 bytes  (offset 72)
//   period_start:        8 bytes  (offset 80)
//   period_end:          8 bytes  (offset 88)
//   holder_count:        8 bytes  (offset 96)
//   committed:           1 byte   (offset 104)
//   bump:                1 byte   (offset 105)

interface DistributionRootAccount {
  mint:            PublicKey;
  merkleRoot:      Buffer;
  totalProfitUsdc: number;
  periodStart:     number;
  periodEnd:       number;
  holderCount:     number;
  committed:       boolean;
}

function parseDistributionRoot(data: Buffer): DistributionRootAccount {
  return {
    mint:            new PublicKey(data.subarray(8, 40)),
    merkleRoot:      data.subarray(40, 72) as unknown as Buffer,
    totalProfitUsdc: Number(data.readBigUInt64LE(72)),
    periodStart:     Number(data.readBigInt64LE(80)),
    periodEnd:       Number(data.readBigInt64LE(88)),
    holderCount:     Number(data.readBigUInt64LE(96)),
    committed:       data[104] === 1,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { mint: mintStr } = req.query as { mint?: string };
  if (!mintStr) return res.status(400).json({ error: "Missing mint" });

  let mint: PublicKey;
  try {
    mint = new PublicKey(mintStr);
  } catch {
    return res.status(400).json({ error: "Invalid mint pubkey" });
  }

  const rpcUrl     = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  try {
    const accounts = await connection.getProgramAccounts(SUKUK_ROLLUP_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: DISCRIMINATOR_DISTRIBUTION_ROOT.toString("base64"), encoding: "base64" } },
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
  } catch (e) {
    return res.status(500).json({ error: "Failed to fetch distribution roots", detail: getErrorMessage(e) });
  }
}
