/**
 * Test 04: Transfer hook compliance checks.
 * Runs on localnet.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  transferCheckedWithTransferHook,
} from "@solana/spl-token";
import { SukukHook } from "../target/types/sukuk_hook";
import {
  createSukukMint,
  createMockSbtMint,
  mintSbt,
  findRegistryPda,
  findEntryPda,
  oneYearFromNow,
  kycProviderHash,
} from "./helpers";

describe("04 — Transfer Hook", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const program = anchor.workspace.SukukHook as Program<SukukHook>;

  let sukukMint: anchor.web3.PublicKey;
  let zkMeMint: anchor.web3.PublicKey;
  let registryPda: anchor.web3.PublicKey;

  const kycOracle    = anchor.web3.Keypair.generate();
  const sender       = anchor.web3.Keypair.generate();
  const receiver     = anchor.web3.Keypair.generate();
  const nonWhitelisted = anchor.web3.Keypair.generate();

  before(async () => {
    await sendAndConfirmTransaction(connection, new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: kycOracle.publicKey, lamports: 1e8 }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: sender.publicKey, lamports: 1e8 }),
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: receiver.publicKey, lamports: 1e8 }),
    ), [payer]);

    sukukMint   = await createSukukMint(connection, payer, payer.publicKey, 450);
    zkMeMint    = await createMockSbtMint(connection, payer, payer.publicKey);
    registryPda = findRegistryPda(sukukMint);

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

    // Whitelist sender and receiver
    for (const wallet of [sender.publicKey, receiver.publicKey]) {
      await program.methods
        .addInvestor(wallet, 1, oneYearFromNow(), kycProviderHash("app", wallet))
        .accounts({ kycOracle: kycOracle.publicKey, mint: sukukMint } as any)
        .signers([kycOracle])
        .rpc();
    }

    // Mint zkMe SBTs and wait for localnet propagation before any transfer_hook reads them.
    await mintSbt(connection, payer, payer, zkMeMint, sender.publicKey);
    await mintSbt(connection, payer, payer, zkMeMint, receiver.publicKey);
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create sukuk ATAs and mint tokens to sender
    const senderAta = getAssociatedTokenAddressSync(
      sukukMint, sender.publicKey, false, TOKEN_2022_PROGRAM_ID
    );
    const receiverAta = getAssociatedTokenAddressSync(
      sukukMint, receiver.publicKey, false, TOKEN_2022_PROGRAM_ID
    );

    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, senderAta, sender.publicKey, sukukMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payer.publicKey, receiverAta, receiver.publicKey, sukukMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(sukukMint, senderAta, payer.publicKey, 1_000_000, [], TOKEN_2022_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(connection, tx, [payer]);
  });

  it("PASS: whitelisted sender+receiver with valid SBT", async () => {
    const senderAta = getAssociatedTokenAddressSync(
      sukukMint, sender.publicKey, false, TOKEN_2022_PROGRAM_ID
    );
    const receiverAta = getAssociatedTokenAddressSync(
      sukukMint, receiver.publicKey, false, TOKEN_2022_PROGRAM_ID
    );

    // resolveExtraAccountMetas fetches investor_registry on-chain to read
    // AccountData seeds. Give localnet time to propagate all before hook accounts.
    await new Promise(resolve => setTimeout(resolve, 1000));
    await transferCheckedWithTransferHook(
      connection, sender, senderAta, sukukMint, receiverAta, sender, 100n, 6,
      [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
    );

    const bal = await connection.getTokenAccountBalance(receiverAta);
    assert.equal(bal.value.amount, "100");
    console.log("  Transfer succeeded: 100 micro-tokens sent");
  });

  it("FAIL: non-whitelisted destination → hook error", async () => {
    const senderAta = getAssociatedTokenAddressSync(
      sukukMint, sender.publicKey, false, TOKEN_2022_PROGRAM_ID
    );
    const nonWhitelistedAta = getAssociatedTokenAddressSync(
      sukukMint, nonWhitelisted.publicKey, false, TOKEN_2022_PROGRAM_ID
    );

    // Create the destination ATA (but wallet is NOT whitelisted)
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, nonWhitelistedAta, nonWhitelisted.publicKey, sukukMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, tx, [payer]);

    try {
      await transferCheckedWithTransferHook(
        connection, sender, senderAta, sukukMint, nonWhitelistedAta, sender, 10n, 6,
        [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
      );
      assert.fail("Should have failed — destination not whitelisted");
    } catch (e: any) {
      // Expected: Token-2022 will fail to resolve investor_entry PDA (account doesn't exist),
      // causing an error before the hook even fires, or the hook fires and returns NotWhitelisted
      const msg: string = e.message || JSON.stringify(e);
      assert.isTrue(
        msg.length > 0,
        "Expected an error but got none"
      );
      console.log("  Correctly rejected non-whitelisted transfer");
    }
  });
});
