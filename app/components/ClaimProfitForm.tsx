/**
 * ClaimProfitForm — submits a Merkle proof claim via claim_profit instruction.
 *
 * The claim runs on the base layer (devnet) after a distribution_root has
 * been committed by the issuer following TEE settlement.
 *
 * Proof is fetched from /api/distribution/proof?wallet=<pubkey>&periodStart=<unix_ts>
 *
 * Pencil import hint:
 *   "Import the ClaimProfitForm component from app/components/ClaimProfitForm.tsx"
 */
import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { useTransactionStatus } from "@/hooks/useTransactionStatus";
import TransactionResult from "@/components/TransactionResult";
import { createProviderFromWallet } from "@/lib/connections";
import {
  createRollupProgram,
  findVaultPda,
  findDistributionRootPda,
  findClaimReceiptPda,
  SUKUK_MINT,
} from "@/lib/programs";

// Devnet USDC
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

const PERIOD_LABEL = "March 2026";
const PERIOD_RANGE = "2026-03-01 — 2026-03-31";

interface DistributionProof {
  amount:      number;
  leafIndex:   number;
  proof:       number[][];  // Merkle proof as array of 32-byte arrays
  periodStart: number;      // Unix timestamp used in PDA seed
}

interface DistributionRootInfo {
  periodStart: number;
  committed:   boolean;
}

export default function ClaimProfitForm() {
  const { connected, publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const tx = useTransactionStatus();

  const [proof,         setProof]         = useState<DistributionProof | null>(null);
  const [rootInfo,      setRootInfo]      = useState<DistributionRootInfo | null>(null);
  const [proofLoading,  setProofLoading]  = useState(false);

  // Discover the latest committed DistributionRoot and fetch proof
  useEffect(() => {
    if (!connected || !publicKey) {
      setProof(null);
      setRootInfo(null);
      return;
    }

    let cancelled = false;
    setProofLoading(true);

    // Discover latest root via API (scans getProgramAccounts server-side)
    fetch(`/api/distribution/roots?mint=${SUKUK_MINT.toBase58()}`)
      .then((r) => r.ok ? r.json() : null)
      .then((r) => r?.roots ?? null)
      .then(async (roots: DistributionRootInfo[] | null) => {
        if (cancelled || !roots || roots.length === 0) {
          if (!cancelled) setRootInfo(null);
          return;
        }

        // Use the most recent committed root
        const latest = roots[roots.length - 1];
        if (!cancelled) setRootInfo(latest);

        // Fetch Merkle proof for this wallet
        const res = await fetch(
          `/api/distribution/proof?wallet=${publicKey.toBase58()}&periodStart=${latest.periodStart}`,
        );
        if (!cancelled) setProof(res.ok ? await res.json() : null);
      })
      .catch(() => { if (!cancelled) setRootInfo(null); })
      .finally(() => { if (!cancelled) setProofLoading(false); });

    return () => { cancelled = true; };
  }, [connected, publicKey?.toBase58(), connection]);

  const handleClaim = async () => {
    if (!publicKey || !proof || !signTransaction || !signAllTransactions) return;
    tx.startLoading();

    try {
      const provider = createProviderFromWallet(
        connection,
        publicKey,
        signTransaction,
        signAllTransactions,
      );
      const rollupProgram = createRollupProgram(provider);

      const periodStart     = BigInt(proof.periodStart);
      const rootPda         = findDistributionRootPda(SUKUK_MINT, periodStart);
      const vaultPda        = findVaultPda(SUKUK_MINT);
      const claimReceiptPda = findClaimReceiptPda(rootPda, publicKey);
      const vaultUsdcAta    = getAssociatedTokenAddressSync(USDC_MINT, vaultPda, true);
      const holderUsdcAta   = getAssociatedTokenAddressSync(USDC_MINT, publicKey);

      const sig = await (rollupProgram.methods as any)
        .claimProfit({
          amountUsdc: new BN(proof.amount),
          leafIndex:  proof.leafIndex,
          proof:      proof.proof,
        })
        .accounts({
          holder:           publicKey,
          distributionRoot: rootPda,
          sukukVault:       vaultPda,
          vaultUsdcAta,
          holderUsdcAta,
          usdcMint:         USDC_MINT,
          claimReceipt:     claimReceiptPda,
          tokenProgram:     TOKEN_PROGRAM_ID,
          systemProgram:    SystemProgram.programId,
        } as any)
        .rpc({ skipPreflight: false });

      tx.setSuccess(sig);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      tx.setErrorMsg(msg);
    }
  };

  if (!connected) {
    return (
      <p className="text-sm text-muted leading-relaxed">
        Connect your wallet to claim profit.
      </p>
    );
  }

  const claimableDisplay = proof
    ? `${(proof.amount / 1_000_000).toFixed(2)}`
    : "—";

  return (
    <div className="bg-surface border border-border rounded p-8 space-y-8">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-widest uppercase text-muted">
          Claimable Amount
        </p>
        <p className="font-mono text-3xl font-light text-text">
          {proofLoading ? "…" : claimableDisplay}{" "}
          <span className="text-lg text-muted">USDC</span>
        </p>
      </div>

      <div className="border border-border rounded p-4 space-y-2">
        <p className="text-xs font-medium tracking-widest uppercase text-muted">Period</p>
        <p className="text-sm text-text font-medium">{PERIOD_LABEL}</p>
        <p className="text-xs text-muted">{PERIOD_RANGE}</p>
      </div>

      {!rootInfo && !proofLoading && (
        <p className="text-sm text-muted leading-relaxed">
          Distribution has not been committed yet — check back after settlement.
        </p>
      )}

      {rootInfo && !proof && !proofLoading && (
        <p className="text-sm text-muted leading-relaxed">
          No claimable amount found for this wallet in the current period.
        </p>
      )}

      <div className="space-y-3">
        <button
          onClick={handleClaim}
          disabled={!rootInfo || !proof || tx.isLoading}
          className="w-full bg-forest text-white text-xs tracking-widest uppercase py-3 rounded-none disabled:opacity-40 hover:bg-forest/90 transition-colors"
        >
          {tx.isLoading ? "Claiming…" : "Claim USDC Profit"}
        </button>

        <TransactionResult
          status={tx.status}
          txSig={tx.txSig}
          error={tx.error}
          successMessage="Claimed successfully"
        />
      </div>
    </div>
  );
}
