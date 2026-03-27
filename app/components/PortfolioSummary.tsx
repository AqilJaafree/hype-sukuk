/**
 * PortfolioSummary — sukuk balance + accrued profit cards.
 *
 * Pencil import hint:
 *   "Import the PortfolioSummary component from app/components/PortfolioSummary.tsx"
 */
interface Props {
  detailed?: boolean;
}

export default function PortfolioSummary({ detailed = false }: Props) {
  // TODO: wire to on-chain read via useConnection + useWallet
  const balance       = "—";
  const accruedUsdc   = "—";
  const profitRateBps = 450;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <StatCard
        label="Sukuk Balance"
        value={`${balance} SUKUK`}
        sub="Token-2022"
        positive={false}
      />
      <StatCard
        label="Accrued Profit"
        value={`${accruedUsdc} USDC`}
        sub="Current period"
        positive={false}
      />
      <StatCard
        label="Profit Rate"
        value={`${(profitRateBps / 100).toFixed(2)}% p.a.`}
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
