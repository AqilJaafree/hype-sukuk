/**
 * KycStatusBadge — shows current whitelist/KYC status for connected wallet.
 *
 * Pencil import hint:
 *   "Import the KycStatusBadge component from app/components/KycStatusBadge.tsx"
 */
type Status = "not-started" | "pending" | "approved" | "expired";

export default function KycStatusBadge() {
  // TODO: read InvestorEntry PDA to derive status
  const status = "not-started" as Status;

  const config: Record<Status, { label: string; cls: string }> = {
    "not-started": { label: "Not Started",  cls: "bg-border text-muted"           },
    "pending":     { label: "Pending",       cls: "bg-gold/10 text-gold"           },
    "approved":    { label: "KYC Approved",  cls: "bg-forestLight text-forest"     },
    "expired":     { label: "KYC Expired",   cls: "bg-red/10 text-red"             },
  };

  const { label, cls } = config[status];

  return (
    <div className="flex items-center gap-3">
      <span
        className={`inline-flex items-center text-xs px-2.5 py-0.5 rounded-full font-medium ${cls}`}
      >
        {label}
      </span>
      {status === "expired" && (
        <p className="text-sm text-muted leading-relaxed">
          Your KYC has expired. Please re-verify below.
        </p>
      )}
    </div>
  );
}
