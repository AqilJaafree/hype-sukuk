/**
 * ProfitBanner — sticky alert when a distribution is ready to claim.
 *
 * Pencil import hint:
 *   "Import the ProfitBanner component from app/components/ProfitBanner.tsx"
 */
import Link from "next/link";

export default function ProfitBanner() {
  // TODO: fetch DistributionRoot PDA to check committed flag
  const hasClaimable = false;
  if (!hasClaimable) return null;

  return (
    <div className="w-full bg-goldLight border border-gold/30 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block flex-shrink-0" />
        <span className="text-sm text-text">Distribution ready</span>
      </div>
      <Link
        href="/claim"
        className="text-sm text-forest font-medium hover:opacity-70 transition-opacity"
      >
        Claim &rarr;
      </Link>
    </div>
  );
}
