/**
 * OrderBook — live list of open bid/ask orders from the rollup.
 *
 * Pencil import hint:
 *   "Import the OrderBook component from app/components/OrderBook.tsx"
 */
interface Order {
  owner:     string;
  side:      "bid" | "ask";
  amount:    number;
  priceUsdc: number;
}

const PLACEHOLDER_ORDERS: Order[] = [
  { owner: "7xKX…m3Qp", side: "bid", amount: 500,  priceUsdc: 1.02 },
  { owner: "3tFR…aN1j", side: "ask", amount: 200,  priceUsdc: 1.05 },
  { owner: "9pWZ…bK4s", side: "bid", amount: 1000, priceUsdc: 1.00 },
];

export default function OrderBook() {
  // TODO: fetch open OtcOrder accounts from rollup via getProgramAccounts
  const orders = PLACEHOLDER_ORDERS;

  return (
    <div className="bg-surface border border-border rounded">
      <div className="px-6 pt-6 pb-4">
        <p className="text-xs font-medium tracking-widest uppercase text-muted">
          Order Book
        </p>
      </div>

      {orders.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted text-center py-8">
          No open orders
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-6 pb-3 text-left text-xs font-medium tracking-widest uppercase text-muted">
                Side
              </th>
              <th className="px-6 pb-3 text-right text-xs font-medium tracking-widest uppercase text-muted">
                Amount
              </th>
              <th className="px-6 pb-3 text-right text-xs font-medium tracking-widest uppercase text-muted">
                Price (USDC)
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td
                  className={`px-6 py-4 font-mono text-sm ${
                    o.side === "bid" ? "text-forest" : "text-red"
                  }`}
                >
                  {o.side.toUpperCase()}
                </td>
                <td className="px-6 py-4 text-right font-mono text-sm text-text">
                  {o.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right font-mono text-sm text-text">
                  {o.priceUsdc.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
