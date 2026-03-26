/**
 * One-time script: connects to the TEE private ER and schedules the native
 * profit-accrual crank for all current holders.
 *
 * Run AFTER delegate_sukuk_vault has been called on base Solana:
 *   npx ts-node scripts/schedule-crank.ts
 *
 * The MagicBlock scheduler then calls accrue_profit every 30 s automatically —
 * no server process needed.
 */

import * as dotenv from "dotenv";
dotenv.config();

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import { MAGIC_PROGRAM_ID } from "@magicblock-labs/ephemeral-rollups-sdk";
import { createTeeSession, refreshTeeSessionIfNeeded } from "../app/lib/magicblock-tee";
import { createBaseConnection, isDelegated } from "../app/lib/connections";

// ── Config from environment ────────────────────────────────────────────────────
interface Config {
  authority: Keypair;
  sukukMint: PublicKey;
  hookProgramId: PublicKey;
  rollupProgramId: PublicKey;
}

function loadConfig(): Config {
  const required = [
    "AUTHORITY_SECRET_KEY",
    "SUKUK_MINT",
    "SUKUK_HOOK_PROGRAM_ID",
    "SUKUK_ROLLUP_PROGRAM_ID",
  ] as const;

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  return {
    authority: Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(process.env.AUTHORITY_SECRET_KEY!)),
    ),
    sukukMint: new PublicKey(process.env.SUKUK_MINT!),
    hookProgramId: new PublicKey(process.env.SUKUK_HOOK_PROGRAM_ID!),
    rollupProgramId: new PublicKey(process.env.SUKUK_ROLLUP_PROGRAM_ID!),
  };
}

// Crank task config
const CRANK_CONFIG = {
  taskId: 1n,
  intervalMs: 30_000n, // 30 seconds
  iterations: BigInt(Number.MAX_SAFE_INTEGER), // run indefinitely
} as const;

async function main() {
  const config = loadConfig();
  const baseConnection = createBaseConnection();

  // ── Verify the vault is delegated ─────────────────────────────────────────
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sukuk_vault"), config.sukukMint.toBuffer()],
    config.rollupProgramId,
  );

  const delegated = await isDelegated(baseConnection, vaultPda);
  if (!delegated) {
    throw new Error(
      "sukuk_vault is not delegated. Run delegate_sukuk_vault first.",
    );
  }

  // ── Authenticate with the TEE private ER ──────────────────────────────────
  console.log("Authenticating with TEE private ER...");
  let teeSession = await createTeeSession(config.authority);
  console.log(`TEE session established. Expires at ${new Date(teeSession.expiresAt).toISOString()}`);

  const erConnection = teeSession.connection;

  // ── Fetch all InvestorEntry PDAs (accrual state holders) ──────────────────
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("investor_registry"), config.sukukMint.toBuffer()],
    config.hookProgramId,
  );

  // Fetch all accrual_state accounts for this mint from the ER
  const accrualAccounts = await erConnection.getProgramAccounts(config.rollupProgramId, {
    filters: [
      { memcmp: { offset: 8 + 32, bytes: config.sukukMint.toBase58() } }, // mint field
    ],
  });

  if (accrualAccounts.length === 0) {
    console.warn("No AccrualState accounts found on the ER. Initialize them first.");
    process.exit(0);
  }

  const accrualPubkeys = accrualAccounts.map((a) => a.pubkey);
  console.log(`Found ${accrualPubkeys.length} AccrualState accounts.`);

  // ── Load IDL and build rollup program client ───────────────────────────────
  const ROLLUP_IDL = require("../target/idl/sukuk_rollup.json");
  const rollupProgram = new Program(ROLLUP_IDL, teeSession.provider);

  // ── Schedule the native crank on the TEE ER ───────────────────────────────
  teeSession = await refreshTeeSessionIfNeeded(teeSession, config.authority);

  const tx = await rollupProgram.methods
    .scheduleProfitCrank({
      taskId: new BN(CRANK_CONFIG.taskId.toString()),
      executionIntervalMillis: new BN(CRANK_CONFIG.intervalMs.toString()),
      iterations: new BN(CRANK_CONFIG.iterations.toString()),
    })
    .accounts({
      payer: config.authority.publicKey,
      investorRegistry: registryPda,
      magicProgram: MAGIC_PROGRAM_ID,
    })
    .remainingAccounts(
      accrualPubkeys.map((pk) => ({
        pubkey: pk,
        isSigner: false,
        isWritable: true,
      })),
    )
    .transaction();

  tx.feePayer = config.authority.publicKey;
  tx.recentBlockhash = (await erConnection.getLatestBlockhash()).blockhash;
  tx.sign(config.authority);

  const sig = await erConnection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
  });

  await erConnection.confirmTransaction(sig, "confirmed");

  console.log(`✅ Crank scheduled! Task ID: ${CRANK_CONFIG.taskId}`);
  console.log(`   Signature: ${sig}`);
  console.log(`   Interval: ${CRANK_CONFIG.intervalMs}ms (${CRANK_CONFIG.intervalMs / 1000n}s)`);
  console.log(`   Holders: ${accrualPubkeys.length}`);
  console.log(
    "\n🤖 MagicBlock scheduler will call accrue_profit automatically.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
