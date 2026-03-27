/**
 * ProfitChartClient — recharts implementation (client-only).
 * Imported exclusively via ProfitChart.tsx dynamic wrapper.
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipProps,
} from "recharts";

// TODO: replace with on-chain AccrualState snapshots
const PLACEHOLDER_DATA = [
  { month: "Oct",  profit: 3.12 },
  { month: "Nov",  profit: 6.44 },
  { month: "Dec",  profit: 9.81 },
  { month: "Jan",  profit: 8.71 },
  { month: "Feb",  profit: 11.89 },
  { month: "Mar",  profit: 12.33 },
];

export default function ProfitChartClient() {
  return (
    <div className="bg-surface border border-border rounded p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-widest uppercase text-muted">
          Accrued Profit
        </p>
        <p className="text-xs text-muted">USDC / month</p>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart
          data={PLACEHOLDER_DATA}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="#E2E0DB"
            strokeDasharray="0"
          />
          <XAxis
            dataKey="month"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#76726B", fontFamily: "inherit" }}
            dy={8}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: "#76726B", fontFamily: "inherit" }}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#E2E0DB", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="profit"
            stroke="#1D5C3A"
            strokeWidth={1.5}
            dot={{ r: 3, fill: "#1D5C3A", strokeWidth: 0 }}
            activeDot={{ r: 4, fill: "#1D5C3A", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded px-3 py-2 shadow-sm">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="font-mono text-sm text-text">
        ${payload[0].value?.toFixed(2)} <span className="text-muted text-xs">USDC</span>
      </p>
    </div>
  );
}
