/**
 * AccrualHistory — table of past profit accrual snapshots for the investor.
 *
 * Pencil import hint:
 *   "Import the AccrualHistory component from app/components/AccrualHistory.tsx"
 */
interface Snapshot {
  date:        string;
  balanceLamp: number;
  profitUsdc:  number;
}

const PLACEHOLDER: Snapshot[] = [
  { date: "2026-03-01", balanceLamp: 1_000_000, profitUsdc: 12.33 },
  { date: "2026-02-01", balanceLamp: 1_000_000, profitUsdc: 11.89 },
  { date: "2026-01-01", balanceLamp: 750_000,   profitUsdc: 8.71  },
];

export default function AccrualHistory() {
  // TODO: fetch AccrualState PDA from rollup to build history
  const snapshots = PLACEHOLDER;

  return (
    <div className="bg-surface border border-border rounded">
      <div className="px-6 pt-6 pb-4">
        <p className="text-xs font-medium tracking-widest uppercase text-muted">
          Accrual History
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-6 pb-3 text-left text-xs font-medium tracking-widest uppercase text-muted">
              Period
            </th>
            <th className="px-6 pb-3 text-right text-xs font-medium tracking-widest uppercase text-muted">
              Balance (micro)
            </th>
            <th className="px-6 pb-3 text-right text-xs font-medium tracking-widest uppercase text-muted">
              Profit (USDC)
            </th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="px-6 py-4 text-sm text-text">{s.date}</td>
              <td className="px-6 py-4 text-right font-mono text-sm text-muted">
                {s.balanceLamp.toLocaleString()}
              </td>
              <td className="px-6 py-4 text-right font-mono text-sm text-forest">
                {s.profitUsdc.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
