/**
 * Dual-connection client for the Sukuk Platform.
 *
 * Base layer (Helius devnet)  ──► sukuk_hook instructions, token transfers,
 *                                  investor registry reads, delegation tx
 *
 * Private ER (TEE devnet)    ──► sukuk_rollup instructions on delegated
 *                                  accounts (accrue_profit, OTC, commit, etc.)
 *
 * NEVER mix connections — sending a rollup instruction to the base RPC
 * results in account-not-found errors, and vice versa.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { DELEGATION_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import type { TeeSession } from "./magicblock-tee";

// ── Base layer (Helius devnet) ─────────────────────────────────────────────────
export function createBaseConnection(): Connection {
  const raw = process.env.SOLANA_RPC_URL ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!raw) throw new Error("SOLANA_RPC_URL is not set");
  // In the browser, NEXT_PUBLIC_SOLANA_RPC_URL may be a relative path ("/api/rpc").
  // @solana/web3.js needs an absolute URL, so resolve against window.location.origin.
  const url =
    typeof window !== "undefined" && raw.startsWith("/")
      ? `${window.location.origin}${raw}`
      : raw;
  return new Connection(url, { commitment: "confirmed" });
}

export function createBaseProvider(
  connection: Connection,
  wallet: AnchorProvider["wallet"],
): AnchorProvider {
  return new AnchorProvider(connection, wallet, { commitment: "confirmed" });
}

/**
 * Build a base provider from wallet adapter hooks (for client components).
 * Requires connected wallet with signTransaction support.
 */
export function createProviderFromWallet(
  connection: Connection,
  publicKey: import("@solana/web3.js").PublicKey,
  signTransaction: <T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(tx: T) => Promise<T>,
  signAllTransactions: <T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(txs: T[]) => Promise<T[]>,
): AnchorProvider {
  return new AnchorProvider(
    connection,
    { publicKey, signTransaction, signAllTransactions },
    { commitment: "confirmed" },
  );
}

// ── Private ER (TEE) helpers ───────────────────────────────────────────────────

/**
 * Extract the ready-to-use Connection from an active TeeSession.
 * Prefer this over constructing a new Connection directly.
 */
export function erConnectionFromSession(session: TeeSession): Connection {
  return session.connection;
}

export function erProviderFromSession(session: TeeSession): AnchorProvider {
  return session.provider;
}

// ── Transaction routing guide ──────────────────────────────────────────────────
//
//  Action                          | Send to        | Provider
// ─────────────────────────────────┼────────────────┼─────────────────────────
//  initialize_sukuk_mint           | Base layer     | baseProvider
//  initialize_registry             | Base layer     | baseProvider
//  initialize_extra_account_metas  | Base layer     | baseProvider
//  add_investor / remove_investor  | Base layer     | baseProvider
//  delegate_sukuk_vault            | Base layer     | baseProvider  ← delegation always base
//  transfer_checked (OTC settle)   | Base layer     | baseProvider
//
//  initialize_accrual_state        | Private ER TEE | erProvider
//  schedule_profit_crank           | Private ER TEE | erProvider
//  accrue_profit (crank)           | Private ER TEE | erProvider
//  place_otc_order                 | Private ER TEE | erProvider
//  match_otc_order                 | Private ER TEE | erProvider
//  commit_distribution             | Private ER TEE | erProvider
//  undelegate_and_settle           | Private ER TEE | erProvider
//

// ── Delegation status check ────────────────────────────────────────────────────

/**
 * Returns true if the account has been delegated to the MagicBlock
 * delegation program (i.e. its owner is now DELEGATION_PROGRAM_ID).
 */
export async function isDelegated(
  connection: Connection,
  pubkey: PublicKey,
): Promise<boolean> {
  const info = await connection.getAccountInfo(pubkey);
  if (!info) return false;
  return info.owner.equals(DELEGATION_PROGRAM_ID);
}
