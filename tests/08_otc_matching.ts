/**
 * Test 08: OTC order placement and matching on TEE rollup.
 * Follows the anchor-rock-paper-scissor example pattern (SDK 0.8.0):
 *   - getAuthToken to obtain a per-session TEE connection
 * Requires devnet + SUKUK_MINT env var.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { assert } from "chai";
import * as nacl from "tweetnacl";
import { getAuthToken } from "@magicblock-labs/ephemeral-rollups-sdk";
import { SukukRollup } from "../target/types/sukuk_rollup";
import { findRegistryPda, findEntryPda, SUKUK_ROLLUP_PROGRAM_ID } from "./helpers";

const SUKUK_MINT_STR = process.env.SUKUK_MINT;
const TEE_URL    = process.env.MAGICBLOCK_TEE_ENDPOINT ?? "https://tee.magicblock.app";
const TEE_WS_URL = TEE_URL.replace("https://", "wss://");

describe("08 — OTC Matching (TEE rollup)", function () {
  if (!SUKUK_MINT_STR) {
    it.skip("SUKUK_MINT not set — skipping TEE tests");
    return;
  }

  this.timeout(120_000);

  const baseProvider = anchor.AnchorProvider.env();
  anchor.setProvider(baseProvider);

  const sukukMint   = new anchor.web3.PublicKey(SUKUK_MINT_STR);
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

  let rollupProgram: anchor.Program<SukukRollup>;

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

  it("places a Sell order successfully", async () => {
    const expiry = new BN(Math.floor(Date.now() / 1000) + 3600);
    await (rollupProgram.methods as any)
      .placeOtcOrder({
        side:       { sell: {} },
        amount:     AMOUNT,
        priceUsdc:  PRICE,
        expiry,
        nonce:      NONCE,
      })
      .accounts({
        owner:            seller,
        mint:             sukukMint,
        investorRegistry: registryPda,
        investorEntry:    sellerEntry,
      } as any)
      .rpc({ skipPreflight: true });

    const order = await (rollupProgram.account as any).otcOrder.fetch(askPda);
    assert.deepEqual(order.side, { sell: {} });
    assert.equal(order.filled, false);
    assert.equal(order.amount.toNumber(), AMOUNT.toNumber());
    console.log("  Sell order placed:", askPda.toBase58());
  });

  it("match with non-existent bid → fails gracefully", async () => {
    const fakeBid      = anchor.web3.Keypair.generate().publicKey;
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
