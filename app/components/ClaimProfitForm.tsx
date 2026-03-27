/**
 * ClaimProfitForm — submits a Merkle proof claim via claim_profit instruction.
 *
 * Pencil import hint:
 *   "Import the ClaimProfitForm component from app/components/ClaimProfitForm.tsx"
 */
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

export default function ClaimProfitForm() {
  const { connected } = useWallet();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  // TODO: fetch claimable amount + proof from /api/distribution/proof endpoint
  const claimableUsdc = "—";
  const isCommitted   = false;

  const handleClaim = async () => {
    setStatus("loading");
    try {
      // TODO: call claim_profit instruction with Merkle proof
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  if (!connected) {
    return (
      <p className="text-sm text-muted leading-relaxed">
        Connect your wallet to claim profit.
      </p>
    );
  }

  return (
    <div className="bg-surface border border-border rounded p-8 space-y-8">
      <div className="space-y-1">
        <p className="text-xs font-medium tracking-widest uppercase text-muted">
          Claimable Amount
        </p>
        <p className="font-mono text-3xl font-light text-text">
          {claimableUsdc} <span className="text-lg text-muted">USDC</span>
        </p>
      </div>

      {!isCommitted && (
        <p className="text-sm text-muted leading-relaxed">
          Distribution has not been committed yet — check back after settlement.
        </p>
      )}

      <div className="space-y-3">
        <button
          onClick={handleClaim}
          disabled={!isCommitted || status === "loading"}
          className="w-full bg-forest text-white text-xs tracking-widest uppercase py-3 rounded-none disabled:opacity-40 hover:bg-forest/90 transition-colors"
        >
          {status === "loading" ? "Claiming…" : "Claim USDC Profit"}
        </button>

        {status === "success" && (
          <p className="text-sm text-forest text-center">Profit claimed successfully.</p>
        )}
        {status === "error" && (
          <p className="text-sm text-red text-center">Claim failed. Please try again.</p>
        )}
      </div>
    </div>
  );
}
