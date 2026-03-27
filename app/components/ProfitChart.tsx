/**
 * ProfitChart — line chart of accrued profit over time.
 * Loaded client-side only (recharts uses window internally).
 *
 * Pencil import hint:
 *   "Import the ProfitChart component from app/components/ProfitChart.tsx"
 */
import dynamic from "next/dynamic";

const ProfitChartClient = dynamic(() => import("./ProfitChartClient"), {
  ssr: false,
  loading: () => (
    <div className="h-56 bg-background rounded flex items-center justify-center">
      <span className="text-sm text-muted">Loading chart…</span>
    </div>
  ),
});

export default function ProfitChart() {
  return <ProfitChartClient />;
}
