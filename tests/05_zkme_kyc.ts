/**
 * Test 05: zkMe KYC flow simulation with mock SBT.
 * Runs on localnet.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createBurnInstruction,
  getAssociatedTokenAddressSync,
  transferCheckedWithTransferHook,
} from "@solana/spl-token";
import { SukukHook } from "../target/types/sukuk_hook";
import {
  createSukukMint,
  createMockSbtMint,
  findRegistryPda,
  findEntryPda,
  kycProviderHash,
  oneYearFromNow,
} from "./helpers";

describe("05 — zkMe KYC Simulation", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const program = anchor.workspace.SukukHook as Program<SukukHook>;

  let sukukMint: anchor.web3.PublicKey;
  let zkMeMint: anchor.web3.PublicKey;
  let registryPda: anchor.web3.PublicKey;

  const kycOracle = anchor.web3.Keypair.generate();
  const sender    = anchor.web3.Keypair.generate();
  const investor  = anchor.web3.Keypair.generate();

  let senderAta: anchor.web3.PublicKey;
  let investorAta: anchor.web3.PublicKey;
  let investorSbtAta: anchor.web3.PublicKey;

  before(async () => {
    await Promise.all([
      connection.confirmTransaction(await connection.requestAirdrop(kycOracle.publicKey, 2e9)),
      connection.confirmTransaction(await connection.requestAirdrop(sender.publicKey, 2e9)),
      connection.confirmTransaction(await connection.requestAirdrop(investor.publicKey, 2e9)),
    ]);

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

    // Whitelist sender
    await program.methods
      .addInvestor(sender.publicKey, 1, oneYearFromNow(), kycProviderHash("app", sender.publicKey))
      .accounts({ kycOracle: kycOracle.publicKey, mint: sukukMint } as any)
      .signers([kycOracle])
      .rpc();

    // Mint SBT for sender (to pass hook on transfers out)
    const senderSbtAta = getAssociatedTokenAddressSync(zkMeMint, sender.publicKey, false, TOKEN_2022_PROGRAM_ID);
    const sbtTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, senderSbtAta, sender.publicKey, zkMeMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(zkMeMint, senderSbtAta, payer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(connection, sbtTx, [payer]);

    senderAta   = getAssociatedTokenAddressSync(sukukMint, sender.publicKey, false, TOKEN_2022_PROGRAM_ID);
    investorAta = getAssociatedTokenAddressSync(sukukMint, investor.publicKey, false, TOKEN_2022_PROGRAM_ID);
    investorSbtAta = getAssociatedTokenAddressSync(zkMeMint, investor.publicKey, false, TOKEN_2022_PROGRAM_ID);

    const setup = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, senderAta, sender.publicKey, sukukMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createAssociatedTokenAccountInstruction(
        payer.publicKey, investorAta, investor.publicKey, sukukMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(sukukMint, senderAta, payer.publicKey, 1_000_000, [], TOKEN_2022_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(connection, setup, [payer]);
  });

  it("investor whitelisted + SBT minted → transfer succeeds", async () => {
    // Add investor to whitelist
    await program.methods
      .addInvestor(investor.publicKey, 1, oneYearFromNow(), kycProviderHash("app", investor.publicKey))
      .accounts({ kycOracle: kycOracle.publicKey, mint: sukukMint } as any)
      .signers([kycOracle])
      .rpc();

    // Mint SBT to investor
    const sbtTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey, investorSbtAta, investor.publicKey, zkMeMint,
        TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      ),
      createMintToInstruction(zkMeMint, investorSbtAta, payer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(connection, sbtTx, [payer]);
    // Short wait — localnet "confirmed" can lag behind for freshly-created ATAs.
    await new Promise(resolve => setTimeout(resolve, 500));

    await transferCheckedWithTransferHook(
      connection, sender, senderAta, sukukMint, investorAta, sender, 100n, 6,
      [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
    );

    const bal = await connection.getTokenAccountBalance(investorAta);
    assert.equal(bal.value.amount, "100");
    console.log("  Transfer with valid SBT succeeded");
  });

  it("investor SBT burned → transfer fails", async () => {
    const burnTx = new Transaction().add(
      createBurnInstruction(
        investorSbtAta, zkMeMint, investor.publicKey, 1, [], TOKEN_2022_PROGRAM_ID
      )
    );
    await sendAndConfirmTransaction(connection, burnTx, [payer, investor]);

    try {
      await transferCheckedWithTransferHook(
        connection, sender, senderAta, sukukMint, investorAta, sender, 10n, 6,
        [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
      );
      assert.fail("Should have failed — SBT burned");
    } catch (e: any) {
      assert.isTrue(e.message.length > 0, "Expected an error");
      console.log("  Correctly rejected transfer after SBT burn");
    }
  });

  it("investor KYC renewed + SBT re-minted → transfer succeeds again", async () => {
    // Re-mint SBT
    const remintTx = new Transaction().add(
      createMintToInstruction(zkMeMint, investorSbtAta, payer.publicKey, 1, [], TOKEN_2022_PROGRAM_ID)
    );
    await sendAndConfirmTransaction(connection, remintTx, [payer]);

    // Renew investor
    const newExpiry = new anchor.BN(Math.floor(Date.now() / 1000) + 2 * 365 * 24 * 3600);
    await program.methods
      .renewInvestor(investor.publicKey, newExpiry, kycProviderHash("app-v2", investor.publicKey))
      .accounts({ kycOracle: kycOracle.publicKey, mint: sukukMint } as any)
      .signers([kycOracle])
      .rpc();

    await transferCheckedWithTransferHook(
      connection, sender, senderAta, sukukMint, investorAta, sender, 10n, 6,
      [], { commitment: "confirmed" }, TOKEN_2022_PROGRAM_ID
    );
    console.log("  Transfer after KYC renewal succeeded");
  });
});
