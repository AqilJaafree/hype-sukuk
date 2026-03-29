/**
 * LearnModal — informational popup about HypeSukuk.
 *
 * Pencil import hint:
 *   "Import the LearnModal component from app/components/LearnModal.tsx"
 */
import { useModal } from "@/hooks/useModal";

interface Props {
  open: boolean;
  onClose: () => void;
}

const sections = [
  {
    title: "What is Sukuk?",
    body: "Sukuk are Islamic financial certificates — the Shariah-compliant equivalent of bonds. Instead of paying interest, sukuk represent ownership in an underlying asset and distribute profit from that asset to holders.",
  },
  {
    title: "How HypeSukuk works",
    body: "Sukuk tokens are issued on Solana using Token-2022. Every transfer is checked by an on-chain hook that verifies KYC status and SBT credentials. Profit accrues in real time on a MagicBlock ephemeral rollup, then is committed as a Merkle root on the base chain for investors to claim.",
  },
  {
    title: "zkMe KYC",
    body: "Investors verify their identity through zkMe using zero-knowledge proofs. A Soul Bound Token (SBT) is issued as on-chain proof. No personal data is stored — only a cryptographic attestation that expires after 12 months.",
  },
  {
    title: "OTC Marketplace",
    body: "Whitelisted investors can trade sukuk peer-to-peer on the rollup without going through a centralised exchange. Orders are matched on-chain, and compliance checks run automatically on every trade.",
  },
  {
    title: "Claiming profit",
    body: "At the end of each period, the issuer commits a Merkle distribution root on-chain. Investors submit a Merkle proof to claim their USDC share. A ClaimReceipt PDA prevents double-claiming.",
  },
];

const glossary = [
  { term: "SBT",            def: "Soul Bound Token — non-transferable KYC credential" },
  { term: "Transfer Hook",  def: "On-chain program called on every token transfer" },
  { term: "Ephemeral Rollup", def: "MagicBlock TEE sidechain for high-throughput computation" },
  { term: "Merkle Root",    def: "Cryptographic commitment of the profit distribution tree" },
  { term: "PDA",            def: "Program Derived Address — a deterministic on-chain account" },
];

export default function LearnModal({ open, onClose }: Props) {
  useModal(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-text/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* panel */}
      <div className="relative w-full sm:max-w-xl max-h-[90dvh] bg-surface border border-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden">

        {/* header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border flex-shrink-0">
          <p className="text-xs font-medium tracking-widest uppercase text-muted">
            Learn
          </p>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-background transition-colors text-muted hover:text-text"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* scrollable body */}
        <div className="overflow-y-auto px-6 py-6 space-y-8">

          {sections.map(({ title, body }) => (
            <div key={title} className="space-y-2">
              <p className="text-sm font-semibold text-text">{title}</p>
              <p className="text-sm text-muted leading-relaxed">{body}</p>
            </div>
          ))}

          {/* glossary */}
          <div className="space-y-3">
            <p className="text-xs font-medium tracking-widest uppercase text-muted">
              Glossary
            </p>
            <dl className="space-y-2">
              {glossary.map(({ term, def }) => (
                <div key={term} className="flex gap-3">
                  <dt className="text-sm font-mono text-forest w-36 flex-shrink-0">{term}</dt>
                  <dd className="text-sm text-muted leading-relaxed">{def}</dd>
                </div>
              ))}
            </dl>
          </div>

        </div>
      </div>
    </div>
  );
}
