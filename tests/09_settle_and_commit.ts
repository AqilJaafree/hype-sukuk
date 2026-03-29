/**
 * Test 09: Commit distribution + undelegate and settle.
 * Follows the anchor-rock-paper-scissor example pattern (SDK 0.8.0):
 *   - getAuthToken for TEE connection
 *   - undelegate_and_settle now passes mint + sukuk_hook_program for CPI
 * Requires devnet + SUKUK_MINT env var.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import * as nacl from "tweetnacl";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import { SukukRollup } from "../target/types/sukuk_rollup";
import { SukukHook } from "../target/types/sukuk_hook";
import { findRegistryPda, SUKUK_ROLLUP_PROGRAM_ID, SUKUK_HOOK_PROGRAM_ID } from "./helpers";

const SUKUK_MINT_STR = process.env.SUKUK_MINT;
const TEE_URL    = process.env.MAGICBLOCK_TEE_ENDPOINT ?? "https://tee.magicblock.app";
const TEE_WS_URL = TEE_URL.replace("https://", "wss://");

describe("09 — Settle and Commit (TEE → base)", function () {
  if (!SUKUK_MINT_STR) {
    it.skip("SUKUK_MINT not set — skipping TEE tests");
    return;
  }

  this.timeout(180_000);

  const baseProvider = anchor.AnchorProvider.env();
  anchor.setProvider(baseProvider);

  const sukukMint   = new anchor.web3.PublicKey(SUKUK_MINT_STR);
  const registryPda = findRegistryPda(sukukMint);
  const periodStart = new BN(Math.floor(Date.now() / 1000) - 3600);
  const periodEnd   = new BN(Math.floor(Date.now() / 1000));

  const [distributionRootPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("distribution_root"),
      sukukMint.toBuffer(),
      Buffer.from(periodStart.toArray("le", 8)),
    ],
    SUKUK_ROLLUP_PROGRAM_ID
  );

  const hookProgram = anchor.workspace.SukukHook as Program<SukukHook>;
  let rollupProgram: anchor.Program<SukukRollup>;

  before("build authenticated TEE connection", async () => {
    const wallet = (baseProvider.wallet as any).payer as anchor.web3.Keypair;
    let teeRpc = TEE_URL;

    try {
      const authToken = await getAuthToken(
        TEE_URL,
        wallet.publicKey,
        (message: Uint8Array) =>
          Promise.resolve(nacl.sign.detached(message, wallet.secretKey))
      );
      teeRpc = `${TEE_URL}?token=${authToken.token}`;
      console.log("  TEE auth token obtained");
    } catch (e: any) {
      console.log("  TEE auth skipped (TEE unavailable):", e.message?.slice(0, 80));
    }

    const teeProvider = new anchor.AnchorProvider(
      new anchor.web3.Connection(teeRpc, { wsEndpoint: TEE_WS_URL }),
      baseProvider.wallet,
      { commitment: "confirmed", skipPreflight: true }
    );
    rollupProgram = new anchor.Program<SukukRollup>(
      (anchor.workspace.SukukRollup as Program<SukukRollup>).idl,
      teeProvider
    );
  });

  it("commit_distribution writes Merkle root and marks committed=true", async () => {
    await (rollupProgram.methods as any)
      .commitDistribution({ periodStart, periodEnd })
      .accounts({
        authority:        baseProvider.wallet.publicKey,
        mint:             sukukMint,
        investorRegistry: registryPda,
      } as any)
      .rpc({ skipPreflight: true });

    const root = await (rollupProgram.account as any).distributionRoot.fetch(distributionRootPda);
    assert.equal(root.committed, true);
    console.log(
      "  Distribution committed. Root:",
      Buffer.from(root.merkleRoot).toString("hex").slice(0, 16) + "..."
    );
  });

  it("undelegate_and_settle returns ownership to base Solana", async () => {
    // undelegate_and_settle now requires mint + sukuk_hook_program for the
    // set_rollup_state CPI (rollup_active = false).
    await (rollupProgram.methods as any)
      .undelegateAndSettle()
      .accounts({
        authority:        baseProvider.wallet.publicKey,
        mint:             sukukMint,
        investorRegistry: registryPda,
        distributionRoot: distributionRootPda,
        sukukHookProgram: SUKUK_HOOK_PROGRAM_ID,
      } as any)
      .rpc({ skipPreflight: true });

    // Wait for settlement to propagate from TEE to base chain
    await new Promise(r => setTimeout(r, 30_000));

    const registry = await hookProgram.account.investorRegistry.fetch(registryPda);
    assert.equal(registry.rollupActive, false, "rollup_active should be false after settlement");

    const rootOnBase = await baseProvider.connection.getAccountInfo(distributionRootPda);
    assert.isNotNull(rootOnBase, "distribution_root not found on base Solana");

    console.log("  Settlement complete. rollup_active =", registry.rollupActive);
  });
});
