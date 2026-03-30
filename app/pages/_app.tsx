import type { AppProps } from "next/app";
import { useMemo, useEffect, useState } from "react";
import { Inter } from "next/font/google";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import "@zkmelabs/widget/dist/style.css";
import "../styles/globals.css";
import OnboardingTour, { TOUR_STORAGE_KEY } from "@/components/OnboardingTour";
import { resolveRpcUrl } from "@/lib/connections";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const RAW_RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export default function App({ Component, pageProps }: AppProps) {
  const wallets = useMemo(() => [], []);
  // Resolve at useMemo time (client) so ConnectionProvider gets an absolute URL.
  // /api/rpc is the proxy route that hides the Helius API key from the browser.
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
