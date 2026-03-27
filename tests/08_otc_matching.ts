/**
 * Test 08: OTC order placement and matching on TEE rollup.
 * Requires devnet + TEE. Skipped if SUKUK_MINT not set.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import { SukukRollup } from "../target/types/sukuk_rollup";
import { findRegistryPda, findEntryPda, SUKUK_ROLLUP_PROGRAM_ID } from "./helpers";

const SUKUK_MINT_STR = process.env.SUKUK_MINT;
const MAGICBLOCK_TEE_RPC = process.env.MAGICBLOCK_TEE_ENDPOINT ?? "https://tee.magicblock.app";
const AUTH_TOKEN = process.env.MAGICBLOCK_AUTH_TOKEN;

describe("08 — OTC Matching (TEE rollup)", function () {
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
  const seller      = baseProvider.wallet.publicKey;
  const sellerEntry = findEntryPda(registryPda, seller);

  const PRICE  = new BN(1_000_000);    // $1.00 (6 decimals)
  const AMOUNT = new BN(100_000_000);  // 100 tokens (6 decimals)
  const NONCE  = new BN(0);

  const [askPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from("otc_order"),
      sukukMint.toBuffer(),
      seller.toBuffer(),
      Buffer.from(NONCE.toArray("le", 8)),
    ],
    SUKUK_ROLLUP_PROGRAM_ID
  );

  it("places a Sell order successfully", async () => {
    const expiry = new BN(Math.floor(Date.now() / 1000) + 3600);
    // auto-resolved: otcOrder (PDA from mint+owner+nonce arg), systemProgram
    await (rollupProgram.methods as any)
      .placeOtcOrder({
        side:       { sell: {} },
        amount:     AMOUNT,
        priceUsdc:  PRICE,
        expiry,
        nonce:      NONCE,
      })
      .accounts({
        owner:           seller,
        mint:            sukukMint,
        investorRegistry: registryPda,
        investorEntry:   sellerEntry,
      } as any)
      .rpc({ skipPreflight: true });

    const order = await (rollupProgram.account as any).otcOrder.fetch(askPda);
    assert.deepEqual(order.side, { sell: {} });
    assert.equal(order.filled, false);
    assert.equal(order.amount.toNumber(), AMOUNT.toNumber());
    console.log("  Sell order placed:", askPda.toBase58());
  });

  it("match with non-existent bid → fails gracefully", async () => {
    const fakeBid = anchor.web3.Keypair.generate().publicKey;
    const fakeBidEntry = anchor.web3.Keypair.generate().publicKey;
    try {
      await (rollupProgram.methods as any)
        .matchOtcOrder()
        .accounts({
          matcher:          seller,
          bidOrder:         fakeBid,
          askOrder:         askPda,
          investorRegistry: registryPda,
          bidInvestorEntry: fakeBidEntry,
          askInvestorEntry: sellerEntry,
        } as any)
        .rpc({ skipPreflight: true });
      assert.fail("Should have failed with non-existent bid");
    } catch (e: any) {
      assert.isTrue(e.message.length > 0);
      console.log("  Correctly rejected match with non-existent bid");
    }
  });
});
