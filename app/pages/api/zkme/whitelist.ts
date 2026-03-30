/**
 * POST /api/zkme/whitelist
 *
 * Called by the frontend after zkMe kycFinished fires.
 * Verifies the zkMe KYC grant server-side, then calls add_investor
 * on sukuk_hook to create the InvestorEntry PDA.
 *
 * Body: { wallet: string }  — base58 investor pubkey
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor";
import { verifyKycWithZkMeServices } from "@zkmelabs/widget";
import crypto from "crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require("bs58") as { decode: (s: string) => Uint8Array };
import hookIdl from "../../../lib/idl/sukuk_hook.json";
import { SUKUK_HOOK_PROGRAM_ID as _SUKUK_HOOK_PROGRAM_ID, SUKUK_MINT } from "../../../lib/programs";
import { KYC_LEVEL_STANDARD, ONE_YEAR_SECONDS } from "../../../lib/constants";
import { getErrorMessage } from "../../../lib/errors";

// Re-export to confirm the import path resolves correctly (used implicitly by Program constructor)
void _SUKUK_HOOK_PROGRAM_ID;

const APP_ID = process.env.ZKME_APP_ID ?? "";

function loadOracleKeypair(): Keypair {
  const raw = process.env.AUTHORITY_SECRET_KEY;
  if (!raw) throw new Error("AUTHORITY_SECRET_KEY not set");
  if (raw.trim().startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

function kycProviderHash(appId: string, wallet: PublicKey): number[] {
  return Array.from(
    crypto.createHash("sha256").update(`${appId}:${wallet.toBase58()}`).digest(),
  );
}

function buildOracleWallet(oracle: Keypair) {
  return {
    publicKey: oracle.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if ("sign" in tx && typeof (tx as Transaction).sign === "function") {
        (tx as Transaction).sign(oracle);
      }
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      txs.forEach((tx) => {
        if ("sign" in tx && typeof (tx as Transaction).sign === "function") {
          (tx as Transaction).sign(oracle);
        }
      });
      return txs;
    },
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { wallet: walletStr } = req.body as { wallet?: string };
  if (!walletStr) return res.status(400).json({ error: "Missing wallet" });

  let investor: PublicKey;
  try {
    investor = new PublicKey(walletStr);
  } catch {
    return res.status(400).json({ error: "Invalid wallet pubkey" });
  }

  // Step 1: Verify zkMe KYC server-side
  try {
    const { isGrant } = await verifyKycWithZkMeServices(APP_ID, walletStr);
    if (!isGrant) return res.status(403).json({ error: "KYC not approved for this wallet" });
  } catch (e) {
    return res.status(502).json({ error: "zkMe verification failed", detail: getErrorMessage(e) });
  }

  // Step 2: Load oracle and call add_investor on-chain
  let oracle: Keypair;
  try {
    oracle = loadOracleKeypair();
  } catch (e) {
    return res.status(500).json({ error: "Oracle keypair not configured", detail: getErrorMessage(e) });
  }

  const rpcUrl  = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const provider   = new AnchorProvider(connection, buildOracleWallet(oracle), { commitment: "confirmed" });
  const program    = new Program(hookIdl as Idl, provider);

  const expiry = new BN(Math.floor(Date.now() / 1000) + ONE_YEAR_SECONDS);
  const hash   = kycProviderHash(APP_ID, investor);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = await (program.methods as any)
      .addInvestor(investor, KYC_LEVEL_STANDARD, expiry, hash)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .accounts({ kycOracle: oracle.publicKey, mint: SUKUK_MINT } as any)
      .signers([oracle])
      .rpc({ skipPreflight: false });

    return res.status(200).json({ success: true, signature: sig });
  } catch (e) {
    const msg = getErrorMessage(e);
    // "already in use" means InvestorEntry PDA exists — idempotent success
    if (msg.includes("already in use") || msg.includes("custom program error: 0x0")) {
      return res.status(200).json({ success: true, alreadyWhitelisted: true });
    }
    return res.status(500).json({ error: "add_investor failed" });
  }
}
