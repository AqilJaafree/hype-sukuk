/**
 * Test 07: Profit accrual on MagicBlock TEE private ER.
 * Follows the anchor-rock-paper-scissor example pattern (SDK 0.8.0):
 *   - getAuthToken to obtain a per-session TEE connection
 *   - TEE connection: ${TEE_URL}?token=${authToken.token}
 * Requires devnet + SUKUK_MINT env var.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import * as nacl from "tweetnacl";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { SukukRollup } from "../target/types/sukuk_rollup";
import { findRegistryPda, SUKUK_ROLLUP_PROGRAM_ID } from "./helpers";

const SUKUK_MINT_STR = process.env.SUKUK_MINT;
const TEE_URL    = process.env.MAGICBLOCK_TEE_ENDPOINT ?? "https://tee.magicblock.app";
const TEE_WS_URL = TEE_URL.replace("https://", "wss://");

describe("07 — Profit Accrual (TEE rollup)", function () {
  if (!SUKUK_MINT_STR) {
    it.skip("SUKUK_MINT not set — skipping TEE tests");
    return;
  }

  this.timeout(120_000);

  const baseProvider = anchor.AnchorProvider.env();
  anchor.setProvider(baseProvider);

  const sukukMint   = new anchor.web3.PublicKey(SUKUK_MINT_STR);
  const registryPda = findRegistryPda(sukukMint);

  let rollupProgram: anchor.Program<SukukRollup>;

  const holders = [
    anchor.web3.Keypair.generate(),
    anchor.web3.Keypair.generate(),
    anchor.web3.Keypair.generate(),
  ];

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

  it("initialises AccrualState for 3 holders", async () => {
    for (const holder of holders) {
      const [accrualPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("accrual_state"), sukukMint.toBuffer(), holder.publicKey.toBuffer()],
        SUKUK_ROLLUP_PROGRAM_ID
      );
      const holderTokenAccount = getAssociatedTokenAddressSync(
        sukukMint, holder.publicKey, false, TOKEN_2022_PROGRAM_ID
      );

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
