/**
 * Shared helpers for the sukuk test suite.
 */
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeTransferHookInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializePermanentDelegateInstruction,
  createInitializeInterestBearingMintInstruction,
  ExtensionType,
  getMintLen,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getMint,
} from "@solana/spl-token";
import crypto from "crypto";

export { getMint, ExtensionType, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };

export const SUKUK_HOOK_PROGRAM_ID = new PublicKey(
  "3MrobtssgGyiuLVgheCqTSWJGWQxXDbPvMtip7tuMQkv"
);
export const SUKUK_ROLLUP_PROGRAM_ID = new PublicKey(
  "B6KV6L7ZUC4mNf8P6ccudTneJqrE4Zsf7qQc2yzToqpt"
);

export function findRegistryPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("investor_registry"), mint.toBuffer()],
    SUKUK_HOOK_PROGRAM_ID
  )[0];
}

export function findEntryPda(registry: PublicKey, wallet: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("investor_entry"), registry.toBuffer(), wallet.toBuffer()],
    SUKUK_HOOK_PROGRAM_ID
  )[0];
}

export function findExtraMetasPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    SUKUK_HOOK_PROGRAM_ID
  )[0];
}

export function kycProviderHash(appId: string, wallet: PublicKey): number[] {
  const hash = crypto
    .createHash("sha256")
    .update(`${appId}:${wallet.toBase58()}`)
    .digest();
  return Array.from(hash);
}

export function oneYearFromNow(): anchor.BN {
  return new anchor.BN(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
}

/**
 * Creates a Token-2022 sukuk mint with all 4 required extensions.
 * Extension order: TransferHook → MetadataPointer → PermanentDelegate → InterestBearingMint
 */
export async function createSukukMint(
  connection: Connection,
  payer: Keypair,
  authority: PublicKey,
  profitRateBps: number,
  hookProgramId: PublicKey = SUKUK_HOOK_PROGRAM_ID
): Promise<PublicKey> {
  const mintKeypair = Keypair.generate();

  const extensions: ExtensionType[] = [
    ExtensionType.TransferHook,
    ExtensionType.MetadataPointer,
    ExtensionType.PermanentDelegate,
    ExtensionType.InterestBearingConfig,
  ];

  const mintLen = getMintLen(extensions);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferHookInstruction(
      mintKeypair.publicKey,
      authority,
      hookProgramId,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMetadataPointerInstruction(
      mintKeypair.publicKey,
      authority,
      mintKeypair.publicKey,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializePermanentDelegateInstruction(
      mintKeypair.publicKey,
      authority,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeInterestBearingMintInstruction(
      mintKeypair.publicKey,
      authority,
      profitRateBps,
      TOKEN_2022_PROGRAM_ID
    ),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      6,
      authority,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair]);
  return mintKeypair.publicKey;
}

/**
 * Creates a simple Token-2022 mint (for mock zkMe SBT).
 */
export async function createMockSbtMint(
  connection: Connection,
  payer: Keypair,
  authority: PublicKey
): Promise<PublicKey> {
  const mintKeypair = Keypair.generate();
  const mintLen = getMintLen([]);
  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      0,
      authority,
      null,
      TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair]);
  return mintKeypair.publicKey;
}

/**
 * Creates an ATA for a wallet and mints `amount` tokens to it (Token-2022).
 */
export async function mintSbt(
  connection: Connection,
  payer: Keypair,
  mintAuthority: Keypair,
  sbtMint: PublicKey,
  wallet: PublicKey,
  amount: number = 1
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(
    sbtMint,
    wallet,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  const accountInfo = await connection.getAccountInfo(ata);
  const tx = new Transaction();

  if (!accountInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        wallet,
        sbtMint,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
  }

  tx.add(
    createMintToInstruction(
      sbtMint, ata, mintAuthority.publicKey, amount, [], TOKEN_2022_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(connection, tx, [payer, mintAuthority]);
  return ata;
}
