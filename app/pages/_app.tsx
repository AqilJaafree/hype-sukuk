import type { AppProps } from "next/app";
import { useMemo, useEffect, useState } from "react";
import { Inter } from "next/font/google";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import "@zkmelabs/widget/dist/style.css";
import "../styles/globals.css";
import OnboardingTour, { TOUR_STORAGE_KEY } from "@/components/OnboardingTour";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const RAW_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/** Resolve relative paths (e.g. /api/rpc) to absolute URLs at runtime. */
function resolveRpcUrl(raw: string): string {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  // Relative path — only valid in the browser
  if (typeof window !== "undefined") return `${window.location.origin}${raw}`;
  // SSR fallback: use public devnet so the server render doesn't crash
  return "https://api.devnet.solana.com";
}

export default function App({ Component, pageProps }: AppProps) {
  const wallets = useMemo(() => [], []);
  // Re-resolve on client so ConnectionProvider gets the real proxied URL
  const rpcUrl = useMemo(() => resolveRpcUrl(RAW_RPC), []);
  const [tourOpen, setTourOpen] = useState(false);

  // Auto-show tour on first ever visit
  useEffect(() => {
    if (!localStorage.getItem(TOUR_STORAGE_KEY)) {
      setTourOpen(true);
    }
  }, []);

  return (
    <ConnectionProvider endpoint={rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <div className={`${inter.variable} font-sans`}>
            <Component {...pageProps} tourOpen={tourOpen} setTourOpen={setTourOpen} />
            <OnboardingTour open={tourOpen} onClose={() => setTourOpen(false)} />
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
