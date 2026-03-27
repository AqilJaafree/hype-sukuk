/**
 * PlaceOrderForm — place a bid or ask OTC order on the rollup.
 *
 * Pencil import hint:
 *   "Import the PlaceOrderForm component from app/components/PlaceOrderForm.tsx"
 */
import { useState, type FormEvent } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

type Side = "bid" | "ask";

export default function PlaceOrderForm() {
  const { connected } = useWallet();
  const [side, setSide]     = useState<Side>("bid");
  const [amount, setAmount] = useState("");
  const [price, setPrice]   = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    try {
      // TODO: call place_otc_order instruction via TEE RPC
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  if (!connected) {
    return (
      <p className="text-sm text-muted leading-relaxed">
        Connect wallet to place orders.
      </p>
    );
  }

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
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent border-b border-border pb-2 text-sm text-text placeholder-muted focus:outline-none focus:border-text transition-colors font-mono"
            required
          />
        </label>

        <button
          type="submit"
          disabled={status === "loading"}
          className="w-full bg-forest text-white text-xs tracking-widest uppercase py-3 rounded-none disabled:opacity-40 hover:bg-forest/90 transition-colors"
        >
          {status === "loading"
            ? "Submitting…"
            : `Place ${side === "bid" ? "Buy" : "Sell"} Order`}
        </button>

        {status === "success" && (
          <p className="text-sm text-forest text-center">Order placed.</p>
        )}
        {status === "error" && (
          <p className="text-sm text-red text-center">Failed. Try again.</p>
        )}
      </form>
    </div>
  );
}
