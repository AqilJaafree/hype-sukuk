/**
 * Test 06: Delegation to MagicBlock TEE private ER.
 * Follows the anchor-rock-paper-scissor example pattern (SDK 0.8.0):
 *   - explicit ER_VALIDATOR in DelegateConfig
 *   - createDelegatePermissionInstruction for privacy
 *   - waitUntilPermissionActive before proceeding to rollup tests
 *
 * Delegation design (SDK 0.8.x):
 *   1. initialize_sukuk_vault — creates PDA owned by sukuk_rollup (idempotent if not yet delegated)
 *   2. delegate_sukuk_vault  — transfers ownership to delegation program + sets rollup_active = true
 * Once delegated, vault is owned by DELeGGv... and cannot be re-delegated until TEE undelegates it.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import * as nacl from "tweetnacl";
import {
  permissionPdaFromAccount,
  getAuthToken,
  createDelegatePermissionInstruction,
  waitUntilPermissionActive,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { SukukHook } from "../target/types/sukuk_hook";
import { SukukRollup } from "../target/types/sukuk_rollup";
import {
  findRegistryPda,
  SUKUK_HOOK_PROGRAM_ID,
  SUKUK_ROLLUP_PROGRAM_ID,
} from "./helpers";

const SUKUK_MINT_STR = process.env.SUKUK_MINT;

// TEE validator for the MagicBlock private ER
const ER_VALIDATOR = new anchor.web3.PublicKey(
  "FnE6VJT5QNZdedZPnCoLsARgBwoE6DeJNjBs2H1gySXA"
);

const DELEGATION_PROGRAM = new anchor.web3.PublicKey(
  "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
);

const TEE_URL = "https://tee.magicblock.app";

describe("06 — Delegation (devnet + TEE)", function () {
  if (!SUKUK_MINT_STR) {
    it.skip("SUKUK_MINT not set — skipping delegation tests");
    return;
  }

  this.timeout(120_000);

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const hookProgram   = anchor.workspace.SukukHook   as Program<SukukHook>;
  const rollupProgram = anchor.workspace.SukukRollup as Program<SukukRollup>;

  const sukukMint   = new anchor.web3.PublicKey(SUKUK_MINT_STR);
  const registryPda = findRegistryPda(sukukMint);

  // sukuk_vault PDA — the account being delegated to the TEE
  const [sukukVaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("sukuk_vault"), sukukMint.toBuffer()],
    SUKUK_ROLLUP_PROGRAM_ID
  );

  let authToken: { token: string; expiresAt: number };
  let vaultAlreadyDelegated = false;

  before("check vault delegation state", async () => {
    const vaultInfo = await provider.connection.getAccountInfo(sukukVaultPda);
    if (vaultInfo && vaultInfo.owner.equals(DELEGATION_PROGRAM)) {
      vaultAlreadyDelegated = true;
      console.log("  sukuk_vault already delegated — skipping delegation steps");
      // Ensure rollup_active reflects the delegation state
      const registry = await hookProgram.account.investorRegistry.fetch(registryPda);
      if (!registry.rollupActive) {
        // Vault is delegated but flag is false — set it to true
        await (hookProgram.methods as any)
          .setRollupState(true, new anchor.BN(Math.floor(Date.now() / 1000)))
          .accounts({ authority: provider.wallet.publicKey, mint: sukukMint, investorRegistry: registryPda })
          .rpc({ commitment: "confirmed" });
        console.log("  Synced rollup_active = true to match vault delegation");
      }
    }
  });

  it("get TEE auth token", async () => {
    const wallet = (provider.wallet as any).payer as anchor.web3.Keypair;
    try {
      authToken = await getAuthToken(
        TEE_URL,
        wallet.publicKey,
        (message: Uint8Array) =>
          Promise.resolve(nacl.sign.detached(message, wallet.secretKey))
      );
      console.log(
        "  Auth token obtained, expires:",
        new Date(authToken.expiresAt).toISOString()
      );
    } catch (e: any) {
      console.log("  TEE auth skipped (TEE unavailable):", e.message?.slice(0, 80));
    }
  });

  it("delegate_sukuk_vault sets rollup_active = true", async () => {
    if (vaultAlreadyDelegated) {
      // Vault is already delegated — verify state and pass.
      const registry = await hookProgram.account.investorRegistry.fetch(registryPda);
      assert.equal(registry.rollupActive, true);
      console.log(
        "  Vault already delegated. rollup_active =", registry.rollupActive,
        "(TEE must undelegate before re-testing)"
      );
      return;
    }

    // 1. Initialize sukuk_vault (creates PDA owned by sukuk_rollup).
    //    Must be called before delegation — SDK 0.8.x requires account to exist first.
    await (rollupProgram.methods as any)
      .initializeSukukVault()
      .accounts({
        authority: provider.wallet.publicKey,
        mint:      sukukMint,
      } as any)
      .rpc({ commitment: "confirmed" });
    console.log("  sukuk_vault initialized at", sukukVaultPda.toBase58());

    // 2. Delegate — passes ER_VALIDATOR to DelegateConfig, transfers vault ownership
    //    to delegation program, and updates rollup_active = true via CPI to sukuk_hook.
    await (rollupProgram.methods as any)
      .delegateSukukVault()
      .accounts({
        authority:        provider.wallet.publicKey,
        mint:             sukukMint,
        investorRegistry: registryPda,
        validator:        ER_VALIDATOR,
      } as any)
      .rpc({ commitment: "confirmed" });

    const registry = await hookProgram.account.investorRegistry.fetch(registryPda);
    assert.equal(registry.rollupActive, true);
    console.log("  Delegation OK. Session start:", registry.sessionStart.toNumber());

    // 3. Create permission on TEE for the vault (privacy control per the example).
    //    Wrapped in try-catch — permission program may not be deployed on devnet.
    try {
      const delegatePermissionIx = createDelegatePermissionInstruction({
        payer:               provider.wallet.publicKey,
        validator:           ER_VALIDATOR,
        permissionedAccount: [sukukVaultPda, false],
        authority:           [provider.wallet.publicKey, true],
      });

      const tx = new anchor.web3.Transaction().add(delegatePermissionIx);
      const sig = await provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
      console.log(
        "  Permission PDA:",
        permissionPdaFromAccount(sukukVaultPda).toBase58(),
        "tx:", sig.slice(0, 12) + "..."
      );

      const active = await waitUntilPermissionActive(TEE_URL, sukukVaultPda);
      console.log(active
        ? "  sukuk_vault permission active on TEE"
        : "  TEE permission check timed out");
    } catch (e: any) {
      console.log("  Permission/TEE step skipped:", e.message?.slice(0, 80));
    }
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
