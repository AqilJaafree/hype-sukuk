/**
 * One-time devnet setup: creates a persistent sukuk mint, initialises the
 * InvestorRegistry, and initialises the extra account meta list.
 *
 * Prints the mint address at the end — paste it into .env as SUKUK_MINT.
 *
 * Run:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   npx ts-node scripts/setup-devnet.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { createSukukMint, findRegistryPda, findExtraMetasPda } from "../tests/helpers";

const ZKME_CREDENTIAL_MINT = new PublicKey(
  process.env.ZKME_CREDENTIAL_MINT ?? "AzqQfZpr3H9u4swvRD9cXzyWV9qACn3tvqNvcjMGNZ48"
);
const PROFIT_RATE_BPS = 450;   // 4.50% annual
const MIN_KYC_LEVEL   = 1;
const LOCK_UNTIL      = new anchor.BN(0); // no lock for dev

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const payer = (provider.wallet as anchor.Wallet).payer;

  // ── 1. Load programs ────────────────────────────────────────────────────────
  const hookIdl     = require("../target/idl/sukuk_hook.json");
  const hookProgram = new anchor.Program(hookIdl, provider);

  // ── 2. Create Token-2022 sukuk mint ────────────────────────────────────────
  console.log("Creating sukuk mint…");
  const sukukMint = await createSukukMint(
    provider.connection, payer, payer.publicKey, PROFIT_RATE_BPS
  );
  console.log("  Mint:", sukukMint.toBase58());

  const registryPda  = findRegistryPda(sukukMint);
  const extraMetaPda = findExtraMetasPda(sukukMint);
  console.log("  Registry PDA:", registryPda.toBase58());

  // ── 3. Initialise InvestorRegistry ─────────────────────────────────────────
  console.log("Initialising InvestorRegistry…");
  await (hookProgram.methods as any)
    .initializeRegistry({
      kycOracle:          payer.publicKey, // for dev: authority acts as oracle
      zkmeCredentialMint: ZKME_CREDENTIAL_MINT,
      lockUntil:          LOCK_UNTIL,
      profitRateBps:      PROFIT_RATE_BPS,
      minKycLevel:        MIN_KYC_LEVEL,
    })
    .accounts({ authority: payer.publicKey, mint: sukukMint } as any)
    .rpc({ commitment: "confirmed" });
  console.log("  Registry initialised ✓");

  // ── 4. Initialise extra account meta list ───────────────────────────────────
  console.log("Initialising extra account meta list…");
  await (hookProgram.methods as any)
    .initializeExtraAccountMetaList()
    .accounts({ authority: payer.publicKey, mint: sukukMint } as any)
    .rpc({ commitment: "confirmed" });
  console.log("  Extra metas initialised ✓");

  // ── Done ────────────────────────────────────────────────────────────────────
  console.log("\n✅ Setup complete. Add to .env:");
  console.log(`SUKUK_MINT=${sukukMint.toBase58()}`);
  console.log(`SUKUK_HOOK_PROGRAM_ID=3MrobtssgGyiuLVgheCqTSWJGWQxXDbPvMtip7tuMQkv`);
  console.log(`SUKUK_ROLLUP_PROGRAM_ID=B6KV6L7ZUC4mNf8P6ccudTneJqrE4Zsf7qQc2yzToqpt`);
}

main().catch(err => { console.error(err); process.exit(1); });
