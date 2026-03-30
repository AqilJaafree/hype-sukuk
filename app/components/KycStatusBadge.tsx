/**
 * KycStatusBadge — shows current whitelist/KYC status for connected wallet.
 *
 * Pencil import hint:
 *   "Import the KycStatusBadge component from app/components/KycStatusBadge.tsx"
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { ONE_YEAR_SECONDS } from "@/lib/constants";

const APP_ID = process.env.NEXT_PUBLIC_ZKME_APP_ID ?? "";

type Status = "not-started" | "checking" | "approved" | "expired";

export default function KycStatusBadge() {
  const { connected, publicKey } = useWallet();
  const [status, setStatus] = useState<Status>("not-started");

  useEffect(() => {
    if (!connected || !publicKey) {
      setStatus("not-started");
      return;
    }

    setStatus("checking");

    import("@zkmelabs/widget")
      .then(({ verifyKycWithZkMeServices }) =>
        verifyKycWithZkMeServices(APP_ID, publicKey.toBase58()),
      )
      .then(({ isGrant, verifyTime }) => {
        if (!isGrant) {
          setStatus("not-started");
          return;
        }
        // If verifyTime is older than 12 months, treat as expired
        if (verifyTime && Date.now() / 1000 - verifyTime > ONE_YEAR_SECONDS) {
          setStatus("expired");
        } else {
          setStatus("approved");
        }
      })
      .catch(() => setStatus("not-started"));
  }, [connected, publicKey?.toBase58()]);

  const config: Record<Status, { label: string; cls: string }> = {
    "not-started": { label: "Not Started",  cls: "bg-border text-muted"       },
    "checking":    { label: "Checking…",    cls: "bg-border text-muted"       },
    "approved":    { label: "KYC Approved", cls: "bg-forestLight text-forest" },
    "expired":     { label: "KYC Expired",  cls: "bg-red/10 text-red"         },
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
