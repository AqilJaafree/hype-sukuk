/**
 * WalletButton — SSR-safe wrapper around WalletMultiButton.
 * Must be loaded client-side only to avoid hydration mismatch.
 */
import dynamic from "next/dynamic";

const WalletButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default WalletButton;
