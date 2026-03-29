/**
 * OnboardingTour — step-by-step first-time user guide.
 *
 * Automatically shown once on first visit (tracked via localStorage).
 * Re-openable via NavBar "Get Started" button.
 *
 * Pencil import hint:
 *   "Import the OnboardingTour component from app/components/OnboardingTour.tsx"
 */
import { useState, useEffect } from "react";
import Link from "next/link";
import { useModal } from "@/hooks/useModal";

export const TOUR_STORAGE_KEY = "hype_sukuk_tour_done";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Step {
  step:   number;
  title:  string;
  body:   string;
  action?: { label: string; href: string };
  tip?:   string;
}

const STEPS: Step[] = [
  {
    step:  1,
    title: "Welcome to HypeSukuk",
    body:  "HypeSukuk is a Shariah-compliant bond platform on Solana. Sukuk tokens represent ownership in an underlying asset — instead of interest, you receive profit from that asset distributed in USDC.",
    tip:   "This tour takes about 2 minutes.",
  },
  {
    step:  2,
    title: "Connect your wallet",
    body:  "You'll need a Solana wallet to get started. Phantom and Solflare both work. Click the wallet button in the top-right corner of any page and approve the connection request.",
    tip:   "Your wallet address acts as your investor identity on-chain. No email or password required.",
  },
  {
    step:  3,
    title: "Complete KYC",
    body:  "All sukuk transfers require on-chain KYC compliance. HypeSukuk uses zkMe — a zero-knowledge identity provider. Your personal data never leaves your device; only a cryptographic proof is stored.",
    action: { label: "Go to KYC →", href: "/kyc" },
    tip:   "KYC approval mints a Soul Bound Token (SBT) to your wallet. It expires after 12 months and can be renewed.",
  },
  {
    step:  4,
    title: "Your portfolio",
    body:  "Once KYC is approved and sukuk tokens are allocated to you, your portfolio page shows your live balance, accrued profit for the current period, and transfer history.",
    action: { label: "View Portfolio →", href: "/portfolio" },
    tip:   "Profit accrues in real time on MagicBlock's private rollup. It's committed on-chain at the end of each period.",
  },
  {
    step:  5,
    title: "OTC Marketplace",
    body:  "Whitelisted investors can trade sukuk peer-to-peer without a centralised exchange. Place a bid or ask, and orders are matched automatically on the rollup. Every trade runs the same KYC compliance checks.",
    action: { label: "Open OTC Market →", href: "/otc" },
    tip:   "OTC orders are placed on the MagicBlock TEE rollup — your wallet will prompt you to sign a challenge to authenticate.",
  },
  {
    step:  6,
    title: "Claim your profit",
    body:  "At the end of each distribution period, the issuer commits a Merkle root on-chain. Come to the Claim page, and if you have a claimable amount, a single transaction moves your USDC share to your wallet.",
    action: { label: "Go to Claim →", href: "/claim" },
    tip:   "A ClaimReceipt PDA prevents claiming the same period twice — it's safe to retry if a transaction fails.",
  },
];

export default function OnboardingTour({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const isFirst = step === 0;

  const handleClose = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    }
    onClose();
  };

  useModal(open, handleClose);

  // Reset to step 0 each time modal opens
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-text/20 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* panel */}
      <div className="relative w-full sm:max-w-md bg-surface border border-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-forest">
              {current.step} / {STEPS.length}
            </span>
            <p className="text-xs font-medium tracking-widest uppercase text-muted">
              Getting Started
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-background transition-colors text-muted hover:text-text"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* progress bar */}
        <div className="h-0.5 bg-border">
          <div
            className="h-full bg-forest transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* body */}
        <div className="px-6 py-8 space-y-5">
          <h2 className="text-lg font-semibold tracking-tight text-text">
            {current.title}
          </h2>
          <p className="text-sm text-muted leading-relaxed">
            {current.body}
          </p>

          {current.tip && (
            <div className="border-l-2 border-forest/40 pl-3">
              <p className="text-xs text-muted leading-relaxed">
                {current.tip}
              </p>
            </div>
          )}

          {current.action && (
            <Link
              href={current.action.href}
              onClick={handleClose}
              className="inline-block text-xs tracking-widest uppercase text-forest hover:opacity-70 transition-opacity"
            >
              {current.action.label}
            </Link>
          )}
        </div>

        {/* footer nav */}
        <div className="px-6 py-5 border-t border-border flex items-center justify-between">
          <button
            onClick={() => setStep((s) => s - 1)}
            disabled={isFirst}
            className="text-xs tracking-widest uppercase text-muted hover:text-text transition-colors disabled:opacity-0"
          >
            ← Back
          </button>

          {/* step dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === step ? "bg-text" : "bg-border hover:bg-muted"
                }`}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={handleClose}
              className="text-xs tracking-widest uppercase text-forest hover:opacity-70 transition-opacity font-medium"
            >
              Done
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="text-xs tracking-widest uppercase text-text hover:text-forest transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
