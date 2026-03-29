/**
 * PlaceOrderForm — place a bid or ask OTC order on the TEE rollup.
 *
 * Flow:
 *   1. User fills in side, amount, price
 *   2. On submit: TEE auth (wallet sign challenge) → place_otc_order instruction
 *
 * Pencil import hint:
 *   "Import the PlaceOrderForm component from app/components/PlaceOrderForm.tsx"
 */
import { useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { useTeeSession } from "@/hooks/useTeeSession";
import { useTransactionStatus } from "@/hooks/useTransactionStatus";
import TransactionResult from "@/components/TransactionResult";
import {
  createRollupProgram,
  findRegistryPda,
  findEntryPda,
  SUKUK_MINT,
} from "@/lib/programs";

type Side = "bid" | "ask";

export default function PlaceOrderForm() {
  const { connected, publicKey } = useWallet();
  const { authenticate, isLoading: teeLoading } = useTeeSession();
  const tx = useTransactionStatus();

  const [side,   setSide]   = useState<Side>("bid");
  const [amount, setAmount] = useState("");
  const [price,  setPrice]  = useState("");
  const [nonce,  setNonce]  = useState(0);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!publicKey) return;
    tx.startLoading();

    try {
      const sess = await authenticate();
      const rollupProgram = createRollupProgram(sess.provider);

      const registryPda = findRegistryPda(SUKUK_MINT);
      const entryPda    = findEntryPda(registryPda, publicKey);

      const amountLamports = new BN(Math.round(parseFloat(amount) * 1_000_000));
      const priceUsdc      = new BN(Math.round(parseFloat(price)  * 1_000_000));
      const expiry         = new BN(Math.floor(Date.now() / 1000) + 3600);

      const sig = await (rollupProgram.methods as any)
        .placeOtcOrder({
          side:      side === "bid" ? { buy: {} } : { sell: {} },
          amount:    amountLamports,
          priceUsdc,
          expiry,
          nonce:     new BN(nonce),
        })
        .accounts({
          owner:            publicKey,
          mint:             SUKUK_MINT,
          investorRegistry: registryPda,
          investorEntry:    entryPda,
        } as any)
        .rpc({ skipPreflight: true });

      tx.setSuccess(sig);
      setNonce((n) => n + 1);
      setAmount("");
      setPrice("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      tx.setErrorMsg(msg);
    }
  };

  if (!connected) {
    return (
      <p className="text-sm text-muted leading-relaxed">
        Connect wallet to place orders.
      </p>
    );
  }

  const busy = tx.isLoading || teeLoading;

  return (
    <div className="bg-surface border border-border rounded p-6 space-y-6">
      <p className="text-xs font-medium tracking-widest uppercase text-muted">
        Place Order
      </p>

      <div className="flex border-b border-border">
        {(["bid", "ask"] as Side[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`flex-1 pb-2.5 text-xs tracking-widest uppercase transition-colors ${
              side === s
                ? "border-b-2 border-forest text-text -mb-px"
                : "text-muted hover:text-text"
            }`}
          >
            {s === "bid" ? "Buy (Bid)" : "Sell (Ask)"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium tracking-widest uppercase text-muted">
            Amount (SUKUK)
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent border-b border-border pb-2 text-sm text-text placeholder-muted focus:outline-none focus:border-text transition-colors font-mono"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium tracking-widest uppercase text-muted">
            Price (USDC per SUKUK)
          </span>
          <input
            type="number"
            min="0"
            step="any"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent border-b border-border pb-2 text-sm text-text placeholder-muted focus:outline-none focus:border-text transition-colors font-mono"
            required
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-forest text-white text-xs tracking-widest uppercase py-3 rounded-none disabled:opacity-40 hover:bg-forest/90 transition-colors"
        >
          {busy
            ? tx.isLoading && !teeLoading
              ? "Submitting…"
              : "Authenticating with TEE…"
            : `Place ${side === "bid" ? "Buy" : "Sell"} Order`}
        </button>

        <TransactionResult
          status={tx.status}
          txSig={tx.txSig}
          error={tx.error}
          successMessage="Order placed"
        />
      </form>
    </div>
  );
}
