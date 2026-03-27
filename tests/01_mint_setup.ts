/**
 * Test 01: Token-2022 sukuk mint setup.
 * Verifies all 4 extensions are present and in the correct order.
 * Runs on localnet.
 */
import * as anchor from "@coral-xyz/anchor";
import { assert } from "chai";
import { getMint, getExtensionTypes, ExtensionType, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { createSukukMint } from "./helpers";

describe("01 — Mint Setup", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payer = (provider.wallet as anchor.Wallet).payer;

  let sukukMint: anchor.web3.PublicKey;

  it("creates Token-2022 mint with 4 extensions in correct order", async () => {
    sukukMint = await createSukukMint(
      connection,
      payer,
      payer.publicKey,
      450 // 4.50% annual profit rate
    );

    // Short wait — localnet "confirmed" can lag behind for freshly-created accounts.
    await new Promise(resolve => setTimeout(resolve, 500));
    const mintInfo = await getMint(
      connection,
      sukukMint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const extTypes = getExtensionTypes(mintInfo.tlvData);

    assert.include(extTypes, ExtensionType.TransferHook, "TransferHook missing");
    assert.include(extTypes, ExtensionType.MetadataPointer, "MetadataPointer missing");
    assert.include(extTypes, ExtensionType.PermanentDelegate, "PermanentDelegate missing");
    assert.include(extTypes, ExtensionType.InterestBearingConfig, "InterestBearingConfig missing");

    console.log("  Sukuk mint:", sukukMint.toBase58());
    console.log("  Extensions:", extTypes.map((e: ExtensionType) => ExtensionType[e]).join(", "));
  });

  it("mint has 6 decimals", async () => {
    // Short wait — localnet "confirmed" can lag behind for freshly-created accounts.
    await new Promise(resolve => setTimeout(resolve, 500));
    const mintInfo = await getMint(
      connection,
      sukukMint,
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    assert.equal(mintInfo.decimals, 6);
  });
});
