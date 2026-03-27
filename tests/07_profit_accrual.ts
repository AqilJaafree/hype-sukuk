/**
 * Test 07: Profit accrual on MagicBlock TEE private ER.
 * Requires devnet + TEE. Skipped if SUKUK_MINT not set.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SukukRollup } from "../target/types/sukuk_rollup";
import { findRegistryPda, SUKUK_ROLLUP_PROGRAM_ID } from "./helpers";

const SUKUK_MINT_STR = process.env.SUKUK_MINT;
const MAGICBLOCK_TEE_RPC = process.env.MAGICBLOCK_TEE_ENDPOINT ?? "https://tee.magicblock.app";
const AUTH_TOKEN = process.env.MAGICBLOCK_AUTH_TOKEN;

describe("07 — Profit Accrual (TEE rollup)", function () {
  if (!SUKUK_MINT_STR) {
    it.skip("SUKUK_MINT not set — skipping TEE tests");
    return;
  }

  this.timeout(120_000);

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

  const sukukMint  = new anchor.web3.PublicKey(SUKUK_MINT_STR);
  const registryPda = findRegistryPda(sukukMint);

  const holders = [
    anchor.web3.Keypair.generate(),
    anchor.web3.Keypair.generate(),
    anchor.web3.Keypair.generate(),
  ];

  it("initialises AccrualState for 3 holders", async () => {
    for (const holder of holders) {
      const [accrualPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("accrual_state"), sukukMint.toBuffer(), holder.publicKey.toBuffer()],
        SUKUK_ROLLUP_PROGRAM_ID
      );
      const holderTokenAccount = getAssociatedTokenAddressSync(
        sukukMint, holder.publicKey, false, TOKEN_2022_PROGRAM_ID
      );

      // auto-resolved: accrualState (PDA from mint+holder arg), systemProgram
      await (rollupProgram.methods as any)
        .initializeAccrualState(holder.publicKey)
        .accounts({
          authority:          baseProvider.wallet.publicKey,
          mint:               sukukMint,
          holderTokenAccount,
          investorRegistry:   registryPda,
          tokenProgram:       TOKEN_2022_PROGRAM_ID,
        } as any)
        .rpc({ skipPreflight: true });

      const accrual = await (rollupProgram.account as any).accrualState.fetch(accrualPda);
      assert.equal(accrual.holder.toBase58(), holder.publicKey.toBase58());
      assert.equal(accrual.accruedProfitUsdc.toNumber(), 0);
    }
    console.log("  Initialised AccrualState for", holders.length, "holders");
  });

  it("accrue_profit runs twice and does not throw", async () => {
    const accrualPdas = holders.map(h =>
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("accrual_state"), sukukMint.toBuffer(), h.publicKey.toBuffer()],
        SUKUK_ROLLUP_PROGRAM_ID
      )[0]
    );

    for (let i = 0; i < 2; i++) {
      // auto-resolved: nothing except remainingAccounts
      await (rollupProgram.methods as any)
        .accrueProfit()
        .accounts({ investorRegistry: registryPda } as any)
        .remainingAccounts(
          accrualPdas.map(pda => ({ pubkey: pda, isWritable: true, isSigner: false }))
        )
        .rpc({ skipPreflight: true });
      if (i === 0) await new Promise(r => setTimeout(r, 5000));
    }
    console.log("  Accrual executed 2×");
  });
});
