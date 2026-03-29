/**
 * MagicBlock Private Ephemeral Rollup — TEE Authentication
 *
 * Uses the official SDK functions:
 *   - verifyTeeRpcIntegrity  — confirms the server runs on genuine Intel TDX
 *   - getAuthToken           — handles challenge/sign/token exchange
 *
 * Endpoint: https://tee.magicblock.app
 */

import { Connection, Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import {
  getAuthToken,
  verifyTeeRpcIntegrity,
} from "@magicblock-labs/ephemeral-rollups-sdk";
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
 * Optionally verifies the TEE server is running on genuine Intel TDX hardware
 * before authenticating (set verifyIntegrity = false to skip in dev).
 */
export async function createTeeSession(
  wallet: Keypair,
  verifyIntegrity = true,
): Promise<TeeSession> {
  // ── Step 1 (optional): Verify the server is genuine Intel TDX ─────────────
  if (verifyIntegrity) {
    const isVerified = await verifyTeeRpcIntegrity(TEE_BASE);
    if (!isVerified) {
      throw new Error("TEE RPC integrity check failed — server may not be running on genuine TDX hardware");
    }
  }

  // ── Step 2: Challenge / sign / token exchange via SDK ─────────────────────
  const { token, expiresAt } = await getAuthToken(
    TEE_BASE,
    wallet.publicKey,
    (message: Uint8Array) =>
      Promise.resolve(nacl.sign.detached(message, wallet.secretKey)),
  );

  // ── Step 3: Build token-gated Connection + AnchorProvider ─────────────────
  const connection = buildTeeConnection(token);

  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        if (tx instanceof Transaction) {
          tx.sign(wallet);
        }
        return tx;
      },
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> =>
        txs.map((tx) => {
          if (tx instanceof Transaction) {
            tx.sign(wallet);
          }
          return tx;
        }),
    },
    { commitment: "confirmed" },
  );

  return { authToken: token, expiresAt, connection, provider };
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
