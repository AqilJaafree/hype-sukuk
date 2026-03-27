/**
 * Test 09: Commit distribution + undelegate and settle.
 * Requires devnet + TEE. Skipped if SUKUK_MINT not set.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { SukukRollup } from "../target/types/sukuk_rollup";
import { SukukHook } from "../target/types/sukuk_hook";
import { findRegistryPda, SUKUK_ROLLUP_PROGRAM_ID, SUKUK_HOOK_PROGRAM_ID } from "./helpers";

const SUKUK_MINT_STR = process.env.SUKUK_MINT;
const MAGICBLOCK_TEE_RPC = process.env.MAGICBLOCK_TEE_ENDPOINT ?? "https://tee.magicblock.app";
const AUTH_TOKEN = process.env.MAGICBLOCK_AUTH_TOKEN;

describe("09 — Settle and Commit (TEE → base)", function () {
  if (!SUKUK_MINT_STR) {
    it.skip("SUKUK_MINT not set — skipping TEE tests");
    return;
  }

  this.timeout(180_000);

  const baseProvider = anchor.AnchorProvider.env();
  anchor.setProvider(baseProvider);

  const teeRpc = AUTH_TOKEN
    ? `${MAGICBLOCK_TEE_RPC}?token=${AUTH_TOKEN}`
    : MAGICBLOCK_TEE_RPC;
  const teeConnection = new anchor.web3.Connection(teeRpc, "confirmed");
  const teeProvider   = new anchor.AnchorProvider(teeConnection, baseProvider.wallet, {
    commitment:    "confirmed",
    skipPreflight: true,
  });
  const rollupProgram = new anchor.Program<SukukRollup>(
    (anchor.workspace.SukukRollup as Program<SukukRollup>).idl,
    teeProvider
  );
  const hookProgram = anchor.workspace.SukukHook as Program<SukukHook>;

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

  it("commit_distribution writes Merkle root and marks committed=true", async () => {
    // auto-resolved: distributionRoot (PDA from mint+periodStart arg), systemProgram
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
    console.log("  Distribution committed. Root:", Buffer.from(root.merkleRoot).toString("hex").slice(0, 16) + "...");
  });

  it("undelegate_and_settle returns ownership to base Solana", async () => {
    // auto-resolved: sukukVault (PDA), magicProgram (known addr), magicContext (known addr)
    await (rollupProgram.methods as any)
      .undelegateAndSettle()
      .accounts({
        authority:        baseProvider.wallet.publicKey,
        investorRegistry: registryPda,
        distributionRoot: distributionRootPda,
      } as any)
      .rpc({ skipPreflight: true });

    // Wait for settlement to propagate
    await new Promise(r => setTimeout(r, 30_000));

    const registry = await hookProgram.account.investorRegistry.fetch(registryPda);
    assert.equal(registry.rollupActive, false, "rollup_active should be false after settlement");

    const rootOnBase = await baseProvider.connection.getAccountInfo(distributionRootPda);
    assert.isNotNull(rootOnBase, "distribution_root not found on base Solana");

    console.log("  Settlement complete. rollup_active =", registry.rollupActive);
  });
});
