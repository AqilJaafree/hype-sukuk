/**
 * NavBar — sticky top nav with mobile menu, Learn popup, and onboarding tour.
 *
 * Pencil import hint:
 *   "Import the NavBar component from app/components/NavBar.tsx"
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import WalletButton from "@/components/WalletButton";
import LearnModal from "@/components/LearnModal";
import OnboardingTour, { TOUR_STORAGE_KEY } from "@/components/OnboardingTour";

const links = [
  { href: "/",          label: "Dashboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/otc",       label: "OTC"       },
  { href: "/claim",     label: "Claim"     },
  { href: "/kyc",       label: "KYC"       },
];

export default function NavBar() {
  const { pathname } = useRouter();
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [tourOpen,  setTourOpen]  = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const openTour = () => {
    // Clear the "done" flag so the tour can be shown again
    if (typeof window !== "undefined") {
      localStorage.removeItem(TOUR_STORAGE_KEY);
    }
    setMenuOpen(false);
    setTourOpen(true);
  };

  return (
    <>
      <nav className="sticky top-0 z-40 bg-surface border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

          {/* wordmark */}
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.2em] text-text hover:opacity-70 transition-opacity"
          >
            HYPE SUKUK
          </Link>

          {/* desktop nav */}
          <div className="hidden sm:flex items-center gap-8">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`text-xs tracking-widest uppercase transition-colors ${
                  isActive(href) ? "text-text" : "text-muted hover:text-text"
                }`}
              >
                {label}
              </Link>
            ))}
            <button
              onClick={() => setLearnOpen(true)}
              className="text-xs tracking-widest uppercase text-muted hover:text-text transition-colors"
            >
              Learn
            </button>
            <button
              onClick={openTour}
              className="text-xs tracking-widest uppercase text-forest hover:opacity-70 transition-opacity"
            >
              Get Started
            </button>
          </div>

          {/* right side */}
          <div className="flex items-center gap-3">
            <WalletButton className="!bg-transparent !border !border-border !text-text !text-xs !px-3 !py-1.5 !rounded !h-auto !font-normal hover:!bg-background transition-colors" />

            {/* hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="sm:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5"
              aria-label="Menu"
            >
              <span className={`block w-5 h-px bg-text transition-transform origin-center ${menuOpen ? "rotate-45 translate-y-[3.5px]" : ""}`} />
              <span className={`block w-5 h-px bg-text transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block w-5 h-px bg-text transition-transform origin-center ${menuOpen ? "-rotate-45 -translate-y-[3.5px]" : ""}`} />
            </button>
          </div>
        </div>

        {/* mobile dropdown */}
        {menuOpen && (
          <div className="sm:hidden border-t border-border bg-surface">
            <div className="px-4 py-4 space-y-1">
              {links.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`block py-2.5 text-xs tracking-widest uppercase transition-colors ${
                    isActive(href) ? "text-text" : "text-muted"
                  }`}
                >
                  {label}
                </Link>
              ))}
              <button
                onClick={() => { setMenuOpen(false); setLearnOpen(true); }}
                className="block w-full text-left py-2.5 text-xs tracking-widest uppercase text-muted"
              >
                Learn
              </button>
              <button
                onClick={openTour}
                className="block w-full text-left py-2.5 text-xs tracking-widest uppercase text-forest"
              >
                Get Started
              </button>
            </div>
          </div>
        )}
      </nav>

      <LearnModal  open={learnOpen} onClose={() => setLearnOpen(false)} />
      <OnboardingTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </>
  );
}
