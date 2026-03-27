/**
 * Test 06: Delegation to MagicBlock TEE private ER.
 * Requires devnet + MagicBlock TEE. Skipped if SUKUK_MINT not set.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { SukukHook } from "../target/types/sukuk_hook";
import { SukukRollup } from "../target/types/sukuk_rollup";
import { findRegistryPda, SUKUK_HOOK_PROGRAM_ID, SUKUK_ROLLUP_PROGRAM_ID } from "./helpers";

const SUKUK_MINT_STR = process.env.SUKUK_MINT;

describe("06 — Delegation (devnet + TEE)", function () {
  if (!SUKUK_MINT_STR) {
    it.skip("SUKUK_MINT not set — skipping delegation tests");
    return;
  }

  this.timeout(120_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const hookProgram   = anchor.workspace.SukukHook as Program<SukukHook>;
  const rollupProgram = anchor.workspace.SukukRollup as Program<SukukRollup>;

  const sukukMint  = new anchor.web3.PublicKey(SUKUK_MINT_STR);
  const registryPda = findRegistryPda(sukukMint);

  it("delegate_sukuk_vault sets rollup_active = true", async () => {
    // auto-resolved: bufferSukukVault (PDA), delegationRecordSukukVault (PDA),
    //               delegationMetadataSukukVault (PDA), sukukVault (PDA),
    //               systemProgram, ownerProgram, delegationProgram
    await (rollupProgram.methods as any)
      .delegateSukukVault()
      .accounts({
        authority:       provider.wallet.publicKey,
        mint:            sukukMint,
        investorRegistry: registryPda,
      } as any)
      .rpc({ commitment: "confirmed" });

    const registry = await hookProgram.account.investorRegistry.fetch(registryPda);
    assert.equal(registry.rollupActive, true);
    console.log("  Delegation OK. Session start:", registry.sessionStart.toNumber());
  });

  it("InvestorRegistry stays under sukuk_hook ownership (not delegated)", async () => {
    const info = await provider.connection.getAccountInfo(registryPda);
    assert.isNotNull(info);
    assert.equal(
      info!.owner.toBase58(),
      SUKUK_HOOK_PROGRAM_ID.toBase58(),
      "InvestorRegistry must NOT be owned by delegation program"
    );
  });
});
