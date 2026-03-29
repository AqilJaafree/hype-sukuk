/**
 * Authenticates with the MagicBlock TEE private ER and prints the auth token.
 * Paste the token into .env as MAGICBLOCK_AUTH_TOKEN.
 *
 * Run:
 *   npx ts-node scripts/get-tee-token.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import { Keypair } from "@solana/web3.js";
import {
  getAuthToken,
  verifyTeeRpcIntegrity,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import nacl from "tweetnacl";
import * as fs from "fs";
import * as os from "os";

const TEE_URL = process.env.MAGICBLOCK_TEE_ENDPOINT ?? "https://tee.magicblock.app";

async function main() {
  const keyPath = process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
  const secret  = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(secret));

  console.log("Authority :", keypair.publicKey.toBase58());
  console.log("TEE URL   :", TEE_URL);

  // ── 1. Verify the server is running on genuine Intel TDX ──────────────────
  console.log("\nVerifying TEE integrity…");
  const isVerified = await verifyTeeRpcIntegrity(TEE_URL);
  console.log("  Integrity verified:", isVerified);

  // ── 2. Obtain auth token ───────────────────────────────────────────────────
  console.log("Requesting auth token…");
  const { token, expiresAt } = await getAuthToken(
    TEE_URL,
    keypair.publicKey,
    (message: Uint8Array) =>
      Promise.resolve(nacl.sign.detached(message, keypair.secretKey)),
  );

  console.log("\n✅ TEE session established.");
  console.log(`   Expires: ${new Date(expiresAt).toISOString()}`);
  console.log("\nAdd to .env:");
  console.log(`MAGICBLOCK_AUTH_TOKEN=${token}`);
}

main().catch(err => { console.error(err); process.exit(1); });
