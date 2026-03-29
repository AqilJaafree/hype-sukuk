/**
 * useTeeSession — React hook for MagicBlock TEE authentication.
 *
 * Pattern from Obscura SDK: wallet signs a challenge from the TEE,
 * receives a short-lived token, and builds a token-gated RPC connection.
 *
 * Usage:
 *   const { authenticate, session, isAuthenticated, isLoading, error } = useTeeSession();
 *
 *   // On button click or before a TEE operation:
 *   const sess = await authenticate();
 *   const rollupProgram = createRollupProgram(sess.provider);
 */

import { useState, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";

const TEE_BASE = "https://tee.magicblock.app";
const TEE_WS   = "wss://tee.magicblock.app";
const SESSION_BUFFER_MS = 60_000; // refresh 1 min before expiry

export interface TeeSession {
  token:      string;
  expiresAt:  number;  // unix ms
  connection: Connection;
  provider:   AnchorProvider;
}

export function useTeeSession() {
  const { publicKey, signMessage, signTransaction, signAllTransactions } = useWallet();
  const [session,   setSession]   = useState<TeeSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const cacheRef = useRef<TeeSession | null>(null);

  const isAuthenticated = !!session && session.expiresAt > Date.now();

  const authenticate = useCallback(async (): Promise<TeeSession> => {
    if (!publicKey) throw new Error("Wallet not connected");
    if (!signMessage) throw new Error("Wallet does not support signMessage");
    if (!signTransaction || !signAllTransactions) {
      throw new Error("Wallet does not support transaction signing");
    }

    // Return cached session if still valid
    const cached = cacheRef.current;
    if (cached && cached.expiresAt > Date.now() + SESSION_BUFFER_MS) {
      return cached;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { token, expiresAt } = await getAuthToken(
        TEE_BASE,
        publicKey,
        signMessage,
      );

      const expiry = expiresAt ?? Date.now() + 30 * 60 * 1000;

      const connection = new Connection(
        `${TEE_BASE}?token=${token}`,
        { commitment: "confirmed", wsEndpoint: `${TEE_WS}?token=${token}` },
      );

      const provider = new AnchorProvider(
        connection,
        {
          publicKey,
          signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> =>
            signTransaction(tx),
          signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> =>
            signAllTransactions(txs),
        },
        { commitment: "confirmed" },
      );

      const sess: TeeSession = { token, expiresAt: expiry, connection, provider };
      cacheRef.current = sess;
      setSession(sess);
      return sess;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "TEE authentication failed";
      setError(msg);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage, signTransaction, signAllTransactions]);

  const clearSession = useCallback(() => {
    cacheRef.current = null;
    setSession(null);
    setError(null);
  }, []);

  return { session, authenticate, isAuthenticated, isLoading, error, clearSession };
}
