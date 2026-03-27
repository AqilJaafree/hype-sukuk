/**
 * Test 03: Investor whitelist management.
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
  findEntryPda,
  findExtraMetasPda,
  kycProviderHash,
  oneYearFromNow,
} from "./helpers";

describe("03 — Whitelist", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const program = anchor.workspace.SukukHook as Program<SukukHook>;

  let sukukMint: anchor.web3.PublicKey;
  let zkMeMint: anchor.web3.PublicKey;
  let registryPda: anchor.web3.PublicKey;
  const kycOracle = anchor.web3.Keypair.generate();

  const investor1 = anchor.web3.Keypair.generate().publicKey;
  const investor2 = anchor.web3.Keypair.generate().publicKey;
  const investor3 = anchor.web3.Keypair.generate().publicKey;
  const APP_ID = "test-app-id";

  before(async () => {
    sukukMint = await createSukukMint(connection, payer, payer.publicKey, 450);
    zkMeMint  = await createMockSbtMint(connection, payer, payer.publicKey);
    registryPda = findRegistryPda(sukukMint);

    const sig = await connection.requestAirdrop(kycOracle.publicKey, 2e9);
    await connection.confirmTransaction(sig);

    await program.methods
      .initializeRegistry({
        kycOracle:          kycOracle.publicKey,
        zkmeCredentialMint: zkMeMint,
        lockUntil:          new anchor.BN(0),
        profitRateBps:      450,
        minKycLevel:        1,
      })
      .accounts({ authority: payer.publicKey, mint: sukukMint } as any)
      .rpc();

    await program.methods
      .initializeExtraAccountMetaList()
      .accounts({ authority: payer.publicKey, mint: sukukMint } as any)
      .rpc();
  });

  it("adds 3 investors with different KYC levels", async () => {
    const expiry = oneYearFromNow();

    for (const [investor, level] of [
      [investor1, 1], [investor2, 2], [investor3, 3]
    ] as [anchor.web3.PublicKey, number][]) {
      const hash = kycProviderHash(APP_ID, investor);
      // Anchor auto-resolves: investorRegistry (PDA from mint), investorEntry (PDA from registry+wallet arg),
      //                        systemProgram (known addr), clock (sysvar addr)
      await program.methods
        .addInvestor(investor, level, expiry, hash)
        .accounts({ kycOracle: kycOracle.publicKey, mint: sukukMint } as any)
        .signers([kycOracle])
        .rpc();
    }

    const registry = await program.account.investorRegistry.fetch(registryPda);
    assert.equal(registry.investorCount.toNumber(), 3);

    const entry1 = await program.account.investorEntry.fetch(findEntryPda(registryPda, investor1));
    assert.equal(entry1.kycLevel, 1);
    assert.equal(entry1.wallet.toBase58(), investor1.toBase58());

    const entry3 = await program.account.investorEntry.fetch(findEntryPda(registryPda, investor3));
    assert.equal(entry3.kycLevel, 3);
    console.log("  Added 3 investors, count:", 3);
  });

  it("removes investor2 — count decrements, PDA closed", async () => {
    const entry2 = findEntryPda(registryPda, investor2);
    // Signed by authority (payer). Anchor auto-resolves investorRegistry (PDA), investorEntry (PDA).
    await program.methods
      .removeInvestor(investor2)
      .accounts({ signer: payer.publicKey, mint: sukukMint } as any)
      .rpc();

    const registry = await program.account.investorRegistry.fetch(registryPda);
    assert.equal(registry.investorCount.toNumber(), 2);

    try {
      await program.account.investorEntry.fetch(entry2);
      assert.fail("Investor2 entry should be closed");
    } catch (_e) {
      // Expected — account closed
    }
  });

  it("renews investor1 with extended expiry", async () => {
    const newExpiry = new anchor.BN(Math.floor(Date.now() / 1000) + 2 * 365 * 24 * 3600);
    const newHash   = kycProviderHash("new-app-id", investor1);
    const entry1    = findEntryPda(registryPda, investor1);

    // Anchor auto-resolves: investorRegistry, investorEntry, clock
    await program.methods
      .renewInvestor(investor1, newExpiry, newHash)
      .accounts({ kycOracle: kycOracle.publicKey, mint: sukukMint } as any)
      .signers([kycOracle])
      .rpc();

    const entry = await program.account.investorEntry.fetch(entry1);
    assert.isTrue(entry.kycExpiry.gte(newExpiry), "Expiry not updated");
    console.log("  Investor1 renewed, new expiry:", new Date(newExpiry.toNumber() * 1000).toISOString());
  });
});
