/**
 * ZkMeWidget — embeds the zkMe KYC verification flow.
 * On completion calls the /api/zkme/verify endpoint which triggers add_investor.
 *
 * Pencil import hint:
 *   "Import the ZkMeWidget component from app/components/ZkMeWidget.tsx"
 */
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import WalletButton from "@/components/WalletButton";
import type { KycResults, Provider, ZkMeWidget as ZkMeWidgetClass } from "@zkmelabs/widget";
// bs58 has no @types package — declare it inline
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bs58 = require("bs58") as { encode: (buf: Uint8Array) => string };

const APP_ID = process.env.NEXT_PUBLIC_ZKME_APP_ID ?? "";
// zkMe widget v0.3.x expects "solana" — it uses chainId.includes("solana")
// internally to select the Solana signing path. The old hex "0x65" triggers
// an EVM network check and returns "Unsupported network".
const SOLANA_CHAIN_ID = "solana";

type KycStatus = "idle" | "checking" | "verified" | "unverified" | "error";

const steps = [
  { n: 1, label: "Connect wallet" },
  { n: 2, label: "Complete identity verification" },
  { n: 3, label: "Whitelisted as sukuk investor" },
];

export default function ZkMeWidget() {
  const { connected, publicKey, signMessage } = useWallet();
  const [kycStatus, setKycStatus] = useState<KycStatus>("idle");
  const widgetRef = useRef<ZkMeWidgetClass | null>(null);

  // Check existing KYC status whenever the wallet changes
  useEffect(() => {
    if (!connected || !publicKey) {
      setKycStatus("idle");
      return;
    }

    setKycStatus("checking");

    import("@zkmelabs/widget")
      .then(({ verifyKycWithZkMeServices }) =>
        verifyKycWithZkMeServices(APP_ID, publicKey.toBase58()),
      )
      .then(({ isGrant }) => setKycStatus(isGrant ? "verified" : "unverified"))
      .catch(() => setKycStatus("unverified"));
  }, [connected, publicKey?.toBase58()]);

  // Cleanup widget on unmount
  useEffect(() => {
    return () => {
      widgetRef.current?.destroy();
    };
  }, []);

  async function launchWidget() {
    if (!publicKey || !signMessage) return;

    const { ZkMeWidget: Widget } = await import("@zkmelabs/widget");

    const provider: Provider = {
      async getUserAccounts() {
        return [publicKey.toBase58()];
      },

      async getAccessToken() {
        const res = await fetch("/api/zkme/access-token", { method: "POST" });
        if (!res.ok) throw new Error("Failed to obtain zkMe access token");
        const { accessToken } = await res.json();
        return accessToken as string;
      },

      async signSolanaMessage(payload: Uint8Array) {
        const signatureBytes = await signMessage(payload);
        return {
          signature: bs58.encode(signatureBytes),
          publicKey: publicKey.toBase58(),
        };
      },
    };

    widgetRef.current?.destroy();

    const widget = new Widget(APP_ID, "HypeSukuk", SOLANA_CHAIN_ID, provider, {
      lv: "zkKYC",
      theme: "light",
    });

    widget.on("kycFinished", (results: KycResults) => {
      if (results.isGrant) {
        setKycStatus("verified");
      }
    });

    widgetRef.current = widget;
    widget.launch();
  }

  const activeStep =
    !connected
      ? 0
      : kycStatus === "verified"
      ? 3
      : 1;

  if (!connected) {
    return (
      <div className="bg-surface border border-border rounded p-8 space-y-6">
        <StepList activeStep={activeStep} />
        <div className="border-t border-border pt-6 flex flex-col items-start gap-3">
          <p className="text-sm text-muted leading-relaxed">
            Connect your wallet to begin KYC verification.
          </p>
          <WalletButton className="!bg-transparent !border !border-border !text-text !text-xs !px-3 !py-1.5 !rounded !h-auto !font-normal hover:!bg-background transition-colors" />
        </div>
      </div>
    );
  }

  if (kycStatus === "verified") {
    return (
      <div className="bg-surface border border-border rounded p-8 space-y-6">
        <StepList activeStep={3} />
        <div className="border-t border-border pt-6 space-y-2">
          <p className="text-sm font-medium text-forest">
            Identity verified. Your wallet is whitelisted for sukuk transfers.
          </p>
          <p className="font-mono text-xs text-muted break-all">
            {publicKey?.toBase58()}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded p-8 space-y-6">
      <StepList activeStep={activeStep} />

      <div className="border-t border-border pt-6 space-y-4">
        <div>
          <p className="text-xs font-medium tracking-widest uppercase text-muted mb-1">
            Wallet
          </p>
          <p className="font-mono text-sm text-text break-all">
            {publicKey?.toBase58()}
          </p>
        </div>

        {kycStatus === "checking" ? (
          <div className="h-10 flex items-center">
            <span className="text-sm text-muted">Checking KYC status…</span>
          </div>
        ) : (
          <button
            onClick={launchWidget}
            className="w-full py-2.5 px-4 bg-forest text-white text-sm font-medium rounded hover:bg-forest/90 transition-colors"
          >
            {kycStatus === "error" ? "Retry Verification" : "Start Verification"}
          </button>
        )}

        <p className="text-sm text-muted leading-relaxed">
          Your identity is verified with zero-knowledge proofs. No personal
          data is stored on-chain.
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
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
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
