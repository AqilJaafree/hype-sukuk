/**
 * Anchor program factories, program IDs, and PDA helpers for the browser.
 *
 * Two programs, two deployment targets:
 *   sukuk_hook   — base layer (devnet)  — KYC, whitelist, registry
 *   sukuk_rollup — TEE rollup (ER)      — profit accrual, OTC, settlement
 */

import { PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import hookIdl    from "./idl/sukuk_hook.json";
import rollupIdl  from "./idl/sukuk_rollup.json";

// ── Program IDs ────────────────────────────────────────────────────────────────
export const SUKUK_HOOK_PROGRAM_ID   = new PublicKey("3MrobtssgGyiuLVgheCqTSWJGWQxXDbPvMtip7tuMQkv");
export const SUKUK_ROLLUP_PROGRAM_ID = new PublicKey("B6KV6L7ZUC4mNf8P6ccudTneJqrE4Zsf7qQc2yzToqpt");

// ── Mints ──────────────────────────────────────────────────────────────────────
export const SUKUK_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_SUKUK_MINT ?? "6YhxWGZmbGH67XkwC84tyBqv6Kx5aq88SiyUHvhfLBa2",
);
/** Devnet USDC (Circle faucet) */
export const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// ── PDA helpers ────────────────────────────────────────────────────────────────
export function findRegistryPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("investor_registry"), mint.toBuffer()],
    SUKUK_HOOK_PROGRAM_ID,
  )[0];
}

export function findEntryPda(registry: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("investor_entry"), registry.toBuffer(), wallet.toBuffer()],
    SUKUK_HOOK_PROGRAM_ID,
  )[0];
}

export function findVaultPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sukuk_vault"), mint.toBuffer()],
    SUKUK_ROLLUP_PROGRAM_ID,
  )[0];
}

/** nonce is a u64 as a JS bigint */
export function findOtcOrderPda(mint: PublicKey, owner: PublicKey, nonce: bigint): PublicKey {
  const nonceBuf = Buffer.alloc(8);
  nonceBuf.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("otc_order"), mint.toBuffer(), owner.toBuffer(), nonceBuf],
    SUKUK_ROLLUP_PROGRAM_ID,
  )[0];
}

/** periodStart is a Unix timestamp (seconds, i64) matching DistributionRoot.period_start */
export function findDistributionRootPda(mint: PublicKey, periodStart: bigint): PublicKey {
  const periodBuf = Buffer.alloc(8);
  periodBuf.writeBigInt64LE(periodStart);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("distribution_root"), mint.toBuffer(), periodBuf],
    SUKUK_ROLLUP_PROGRAM_ID,
  )[0];
}

export function findClaimReceiptPda(distributionRoot: PublicKey, holder: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("claim_receipt"), distributionRoot.toBuffer(), holder.toBuffer()],
    SUKUK_ROLLUP_PROGRAM_ID,
  )[0];
}

// ── Program factories ──────────────────────────────────────────────────────────

/** sukuk_hook program — use with base layer (devnet) provider */
export function createHookProgram(provider: AnchorProvider): Program {
  return new Program(hookIdl as Idl, provider);
}

/** sukuk_rollup program — use with TEE provider for ER instructions */
export function createRollupProgram(provider: AnchorProvider): Program {
  return new Program(rollupIdl as Idl, provider);
}
