/**
 * ZkMeWidget — embeds the zkMe KYC verification flow.
 * On completion calls the /api/zkme/verify endpoint which triggers add_investor.
 *
 * Pencil import hint:
 *   "Import the ZkMeWidget component from app/components/ZkMeWidget.tsx"
 */
import { useWallet } from "@solana/wallet-adapter-react";
import WalletButton from "@/components/WalletButton";

const steps = [
  { n: 1, label: "Connect wallet" },
  { n: 2, label: "Complete identity verification" },
  { n: 3, label: "Whitelisted as sukuk investor" },
];

export default function ZkMeWidget() {
  const { connected, publicKey } = useWallet();

  if (!connected) {
    return (
      <div className="bg-surface border border-border rounded p-8 space-y-6">
        <StepList activeStep={0} />
        <div className="border-t border-border pt-6 flex flex-col items-start gap-3">
          <p className="text-sm text-muted leading-relaxed">
            Connect your wallet to begin KYC verification.
          </p>
          <WalletButton
            className="!bg-transparent !border !border-border !text-text !text-xs !px-3 !py-1.5 !rounded !h-auto !font-normal hover:!bg-background transition-colors"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded p-8 space-y-6">
      <StepList activeStep={1} />

      <div className="border-t border-border pt-6 space-y-4">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-muted mb-1">
            Wallet
          </p>
          <p className="font-mono text-sm text-text break-all">
            {publicKey?.toBase58()}
          </p>
        </div>

        {/* TODO: mount @zkmelabs/widget here with appId from env */}
        <div className="h-52 bg-background rounded flex items-center justify-center">
          <span className="text-sm text-muted">zkMe widget mounts here</span>
        </div>

        <p className="text-sm text-muted leading-relaxed">
          Your identity is verified with zero-knowledge proofs. No personal data is stored on-chain.
        </p>
      </div>
    </div>
  );
}

function StepList({ activeStep }: { activeStep: number }) {
  return (
    <ol className="space-y-4">
      {steps.map(({ n, label }) => {
        const done    = n - 1 < activeStep;
        const current = n - 1 === activeStep;
        return (
          <li key={n} className="flex items-start gap-4">
            <span
              className={`flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium ${
                done
                  ? "bg-forest border-forest text-white"
                  : current
                  ? "border-text text-text"
                  : "border-border text-muted"
              }`}
            >
              {done ? (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                n
              )}
            </span>
            <span
              className={`text-sm leading-relaxed ${
                done || current ? "text-text" : "text-muted"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
