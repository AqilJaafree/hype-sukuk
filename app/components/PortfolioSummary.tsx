/**
 * PortfolioSummary — sukuk balance + accrued profit cards.
 *
 * Reads sukuk token balance from devnet via Token-2022.
 * Accrued profit is shown once a TEE session is active.
 *
 * Pencil import hint:
 *   "Import the PortfolioSummary component from app/components/PortfolioSummary.tsx"
 */
import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { SUKUK_MINT } from "@/lib/programs";

interface Props {
  detailed?: boolean;
}

const PROFIT_RATE_BPS = 450;

export default function PortfolioSummary({ detailed = false }: Props) {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();

  const [balance,     setBalance]     = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }

    let cancelled = false;
    setBalanceLoading(true);

    const ata = getAssociatedTokenAddressSync(
      SUKUK_MINT,
      publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
    );

    connection
      .getTokenAccountBalance(ata)
      .then(({ value }) => {
        if (!cancelled) setBalance(value.uiAmountString ?? "0");
      })
      .catch(() => {
        if (!cancelled) setBalance("0");
      })
      .finally(() => {
        if (!cancelled) setBalanceLoading(false);
      });

    return () => { cancelled = true; };
  }, [connected, publicKey?.toBase58(), connection]);

  const balanceDisplay = balanceLoading ? "…" : (balance ?? "—");

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <StatCard
        label="Sukuk Balance"
        value={`${balanceDisplay} SUKUK`}
        sub="Token-2022"
        positive={false}
      />
      <StatCard
        label="Accrued Profit"
        value="— USDC"
        sub="Requires TEE session"
        positive={false}
      />
      <StatCard
        label="Profit Rate"
        value={`${(PROFIT_RATE_BPS / 100).toFixed(2)}% p.a.`}
        sub="InterestBearing"
        positive
      />
      {detailed && (
        <>
          <StatCard label="Lock Period"       value="—" sub="Remaining days" positive={false} />
          <StatCard label="KYC Expiry"        value="—" sub="UTC date"       positive={false} />
          <StatCard label="Distribution Root" value="—" sub="Merkle root"    positive={false} />
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub: string;
  positive: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded p-5 space-y-2">
      <p className="text-xs font-medium tracking-widest uppercase text-muted">{label}</p>
      <p className={`font-mono text-3xl font-light leading-none ${positive ? "text-forest" : "text-text"}`}>
        {value}
      </p>
      <p className="text-sm text-muted leading-relaxed">{sub}</p>
    </div>
  );
}
