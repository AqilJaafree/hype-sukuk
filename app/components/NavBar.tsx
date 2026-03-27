/**
 * NavBar — top navigation with wallet connect button.
 *
 * Pencil import hint:
 *   "Import the NavBar component from app/components/NavBar.tsx"
 */
import Link from "next/link";
import { useRouter } from "next/router";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const links = [
  { href: "/",          label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/otc",       label: "OTC"       },
  { href: "/claim",     label: "Claim"     },
  { href: "/kyc",       label: "KYC"       },
];

export default function NavBar() {
  const { pathname } = useRouter();

  return (
    <nav className="sticky top-0 z-50 bg-surface border-b border-border">
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="text-sm font-semibold tracking-[0.2em] text-text hover:opacity-70 transition-opacity"
        >
          HYPE SUKUK
        </Link>

        <div className="hidden sm:flex items-center gap-8">
          {links.map(({ href, label }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`text-xs tracking-widest uppercase transition-colors ${
                  isActive ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <WalletMultiButton
          className="!bg-transparent !border !border-border !text-text !text-xs !px-3 !py-1.5 !rounded !h-auto !font-normal hover:!bg-surface transition-colors"
        />
      </div>
    </nav>
  );
}
