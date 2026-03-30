/**
 * GET /api/distribution/proof?wallet=<pubkey>&periodStart=<unix_ts>
 *
 * Fetches all AccrualState accounts for the mint, reconstructs the same
 * Merkle tree that commit_distribution built on-chain, and returns the
 * proof for the requesting wallet.
 *
 * Leaf construction matches the Rust implementation:
 *   leaf = sha256(holder_pubkey_bytes || accrued_profit_usdc_le_bytes)
 *
 * Internal node: sha256(left_child || right_child)  — same as rs_merkle default
 *
 * Response: { amount: number; leafIndex: number; proof: number[][] }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Connection, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";

const SUKUK_ROLLUP_PROGRAM_ID = new PublicKey("B6KV6L7ZUC4mNf8P6ccudTneJqrE4Zsf7qQc2yzToqpt");
const SUKUK_MINT_STR = process.env.SUKUK_MINT ?? "6YhxWGZmbGH67XkwC84tyBqv6Kx5aq88SiyUHvhfLBa2";

// ── AccrualState layout (after 8-byte discriminator) ─────────────────────────
//   holder:                  32 bytes  (offset  8)
//   mint:                    32 bytes  (offset 40)
//   accrued_profit_usdc:      8 bytes  (offset 72)
//   last_tick:                8 bytes  (offset 80)
//   token_balance_snapshot:   8 bytes  (offset 88)
//   bump:                     1 byte   (offset 96)

function parseAccrualState(data: Buffer): { holder: PublicKey; mint: PublicKey; accruedProfitUsdc: bigint } {
  const holder           = new PublicKey(data.subarray(8, 40));
  const mint             = new PublicKey(data.subarray(40, 72));
  const accruedProfitUsdc = data.readBigUInt64LE(72);
  return { holder, mint, accruedProfitUsdc };
}

// ── Minimal Merkle tree matching rs_merkle MerkleTree::<Sha256> ──────────────

function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

function buildLeaf(holderPubkey: PublicKey, amountUsdc: bigint): Buffer {
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amountUsdc);
  return sha256(Buffer.concat([holderPubkey.toBuffer(), amountBuf]));
}

/**
 * Build Merkle tree from leaves, return [root, proofPaths].
 * Matches rs_merkle internal structure: pairs are hashed as sha256(left || right).
 * Odd nodes are promoted (duplicated) to make even pairs.
 */
function buildMerkleTree(leaves: Buffer[]): {
  root: Buffer;
  getProof: (leafIndex: number) => Buffer[];
} {
  if (leaves.length === 0) throw new Error("Empty leaves");

  // Store each level: layers[0] = leaves, layers[n] = root
  const layers: Buffer[][] = [leaves.slice()];

  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next: Buffer[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left  = current[i];
      const right = i + 1 < current.length ? current[i + 1] : current[i]; // promote odd node
      next.push(sha256(Buffer.concat([left, right])));
    }
    layers.push(next);
  }

  const root = layers[layers.length - 1][0];

  function getProof(leafIndex: number): Buffer[] {
    const proof: Buffer[] = [];
    let idx = leafIndex;
    for (let level = 0; level < layers.length - 1; level++) {
      const layer     = layers[level];
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      const sibling    = siblingIdx < layer.length ? layer[siblingIdx] : layer[idx]; // odd node
      proof.push(sibling);
      idx = Math.floor(idx / 2);
    }
    return proof;
  }

  return { root, getProof };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wallet: walletStr, periodStart: periodStartStr } = req.query as {
    wallet?: string;
    periodStart?: string;
  };

  if (!walletStr || !periodStartStr) {
    return res.status(400).json({ error: "Missing wallet or periodStart" });
  }

  let walletPubkey: PublicKey;
  try {
    walletPubkey = new PublicKey(walletStr);
  } catch {
    return res.status(400).json({ error: "Invalid wallet pubkey" });
  }

  const periodStart = parseInt(periodStartStr, 10);
  if (isNaN(periodStart)) {
    return res.status(400).json({ error: "Invalid periodStart (must be unix timestamp)" });
  }

  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  try {
    const mint = new PublicKey(SUKUK_MINT_STR);

    // Anchor discriminator = sha256("account:AccrualState")[0..8]
    const ACCRUAL_DISCRIMINATOR = Buffer.from([184, 54, 155, 209, 59, 54, 244, 162]);

    const accounts = await connection.getProgramAccounts(SUKUK_ROLLUP_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 0, bytes: ACCRUAL_DISCRIMINATOR.toString("base64"), encoding: "base64" } },
        // Filter by mint at offset 40
        { memcmp: { offset: 40, bytes: mint.toBase58() } },
      ],
    });

    if (accounts.length === 0) {
      return res.status(404).json({ error: "No accrual states found for this mint" });
    }

    // Parse and sort by holder pubkey bytes (consistent ordering with commit tx)
    const accruals = accounts
      .map(({ account }) => parseAccrualState(Buffer.from(account.data)))
      .sort((a, b) => Buffer.compare(a.holder.toBuffer(), b.holder.toBuffer()));

    // Build Merkle tree with the same leaf construction as commit_distribution
    const leaves = accruals.map(({ holder, accruedProfitUsdc }) =>
      buildLeaf(holder, accruedProfitUsdc),
    );

    const { getProof } = buildMerkleTree(leaves);

    // Find the requesting wallet's leaf index
    const leafIndex = accruals.findIndex((a) => a.holder.equals(walletPubkey));
    if (leafIndex === -1) {
      return res.status(404).json({ error: "Wallet not found in distribution" });
    }

    const accrual = accruals[leafIndex];
    const proofBuffers = getProof(leafIndex);

    // Serialize proof as array of 32-element byte arrays (matches Vec<[u8; 32]> in Rust)
    const proof = proofBuffers.map((buf) => Array.from(buf));

    return res.status(200).json({
      amount:      Number(accrual.accruedProfitUsdc),
      leafIndex,
      proof,
      periodStart,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: "Failed to build Merkle proof", detail: msg });
  }
}
