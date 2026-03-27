/**
 * Test 02: Registry initialisation + extra account meta list.
 * Runs on localnet.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { SukukHook } from "../target/types/sukuk_hook";
import {
  createSukukMint,
  createMockSbtMint,
  findRegistryPda,
  findExtraMetasPda,
} from "./helpers";

describe("02 — Registry Init", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const program = anchor.workspace.SukukHook as Program<SukukHook>;

  let sukukMint: anchor.web3.PublicKey;
  let zkMeMint: anchor.web3.PublicKey;
  let registryPda: anchor.web3.PublicKey;
  let extraMetasPda: anchor.web3.PublicKey;

  const kycOracle = anchor.web3.Keypair.generate();
  const PROFIT_RATE_BPS = 450;
  const MIN_KYC_LEVEL = 1;
  const LOCK_UNTIL = new anchor.BN(0);

  before(async () => {
    sukukMint    = await createSukukMint(connection, payer, payer.publicKey, PROFIT_RATE_BPS);
    zkMeMint     = await createMockSbtMint(connection, payer, payer.publicKey);
    registryPda  = findRegistryPda(sukukMint);
    extraMetasPda = findExtraMetasPda(sukukMint);
  });

  it("initialises InvestorRegistry", async () => {
    // Anchor 0.32.1 auto-resolves: investorRegistry (PDA), systemProgram (known addr)
    await program.methods
      .initializeRegistry({
        kycOracle:          kycOracle.publicKey,
        zkmeCredentialMint: zkMeMint,
        lockUntil:          LOCK_UNTIL,
        profitRateBps:      PROFIT_RATE_BPS,
        minKycLevel:        MIN_KYC_LEVEL,
      })
      .accounts({ authority: payer.publicKey, mint: sukukMint } as any)
      .rpc();

    const registry = await program.account.investorRegistry.fetch(registryPda);
    assert.equal(registry.authority.toBase58(), payer.publicKey.toBase58());
    assert.equal(registry.kycOracle.toBase58(), kycOracle.publicKey.toBase58());
    assert.equal(registry.zkmeCredentialMint.toBase58(), zkMeMint.toBase58());
    assert.equal(registry.mint.toBase58(), sukukMint.toBase58());
    assert.equal(registry.profitRateBps, PROFIT_RATE_BPS);
    assert.equal(registry.minKycLevel, MIN_KYC_LEVEL);
    assert.equal(registry.investorCount.toNumber(), 0);
    assert.equal(registry.rollupActive, false);
    console.log("  Registry PDA:", registryPda.toBase58());
  });

  it("initialises extra account meta list (6 extra accounts)", async () => {
    // auto-resolves: extraAccountMetaList (PDA), investorRegistry (PDA), systemProgram
    await program.methods
      .initializeExtraAccountMetaList()
      .accounts({ authority: payer.publicKey, mint: sukukMint } as any)
      .rpc();

    const metaAcct = await connection.getAccountInfo(extraMetasPda);
    assert.isNotNull(metaAcct, "extra_account_meta_list PDA not created");
    assert.isAbove(metaAcct!.data.length, 0);
    console.log("  Extra metas PDA size:", metaAcct!.data.length, "bytes");
  });
});
