/**
 * MagicBlock Private Ephemeral Rollup — TEE Authentication
 *
 * The TEE (Intel TDX) endpoint requires a signed challenge to issue an
 * access token. All rollup transactions are then sent to the token-gated
 * endpoint. The token is ephemeral — refresh when it expires (typically 1h).
 *
 * Endpoint: https://tee.magicblock.app
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import nacl from "tweetnacl";

const TEE_BASE = "https://tee.magicblock.app";
const TEE_WS   = "wss://tee.magicblock.app";

export interface TeeSession {
  authToken: string;
  expiresAt: number;        // unix ms
  connection: Connection;
  provider: AnchorProvider;
}

/**
 * Authenticate with the MagicBlock TEE validator and return a ready-to-use
 * Connection + AnchorProvider pointed at the private ER.
 *
 * @param wallet  The keypair that owns the delegated accounts (authority or
 *                the investor's session key). Must be able to sign.
 * @param walletAdapter  Optional wallet adapter (browser context). If provided,
 *                       it is used for signing instead of raw secretKey.
 */
// ── Helper: Fetch with error handling ─────────────────────────────────────────
async function teePost<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(`${TEE_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`TEE ${endpoint} failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

export async function createTeeSession(
  wallet: Keypair,
): Promise<TeeSession> {
  const publicKey = wallet.publicKey.toBase58();

  // ── Step 1: Request challenge ──────────────────────────────────────────────
  const { challenge } = await teePost<{ challenge: string }>(
    "/challenge",
    { publicKey },
  );

  // ── Step 2: Sign the challenge with the wallet's private key ───────────────
  const challengeBytes = Buffer.from(challenge, "base64");
  const signature = nacl.sign.detached(challengeBytes, wallet.secretKey);

  // ── Step 3: Exchange signature for TEE access token ────────────────────────
  const { authToken, expiresIn } = await teePost<{
    authToken: string;
    expiresIn: number;
  }>("/token", {
    publicKey,
    signature: Buffer.from(signature).toString("base64"),
    challenge,
  });

  const expiresAt = Date.now() + expiresIn * 1000;

  // ── Step 4: Build the token-gated Connection ───────────────────────────────
  const connection = buildTeeConnection(authToken);

  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: async (tx) => {
        tx.sign(wallet);
        return tx;
      },
      signAllTransactions: async (txs) =>
        txs.map((tx) => { tx.sign(wallet); return tx; }),
    },
    { commitment: "confirmed" },
  );

  return { authToken, expiresAt, connection, provider };
}

/**
 * Build a Connection pointed at the TEE endpoint with the given auth token.
 */
export function buildTeeConnection(authToken: string): Connection {
  return new Connection(
    `${TEE_BASE}?token=${authToken}`,
    {
      commitment: "confirmed",
      wsEndpoint: `${TEE_WS}?token=${authToken}`,
    },
  );
}

/**
 * Returns true if the TEE session token has less than 5 minutes remaining.
 */
export function isTeeSessionExpiring(session: TeeSession): boolean {
  return Date.now() > session.expiresAt - 5 * 60 * 1000;
}

/**
 * Refresh a TEE session if it is about to expire.
 * Pass the original wallet keypair used to create the session.
 */
export async function refreshTeeSessionIfNeeded(
  session: TeeSession,
  wallet: Keypair,
): Promise<TeeSession> {
  if (isTeeSessionExpiring(session)) {
    return createTeeSession(wallet);
  }
  return session;
}
