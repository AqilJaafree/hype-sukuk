import { PublicKey } from "@solana/web3.js";

// ── Time ───────────────────────────────────────────────────────────────────────
export const ONE_HOUR_SECONDS   = 3_600;
export const ONE_YEAR_SECONDS   = 365 * 24 * ONE_HOUR_SECONDS;

// ── Mints ──────────────────────────────────────────────────────────────────────
/** Devnet USDC (Circle faucet) */
export const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

// ── Anchor discriminators (sha256("account:<Name>")[0..8]) ────────────────────
export const DISCRIMINATOR_DISTRIBUTION_ROOT = Buffer.from([225, 98,  34, 160, 164, 47, 254, 172]);
export const DISCRIMINATOR_ACCRUAL_STATE     = Buffer.from([184, 54, 155, 209,  59, 54, 244, 162]);

// ── KYC ───────────────────────────────────────────────────────────────────────
export const KYC_LEVEL_STANDARD = 1;

// ── OTC ───────────────────────────────────────────────────────────────────────
export const OTC_ORDER_TTL_SECONDS = ONE_HOUR_SECONDS;
