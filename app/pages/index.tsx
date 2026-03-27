/**
 * Dashboard — investor landing page.
 * Shows sukuk holdings, accrued profit, and quick links to other flows.
 *
 * Pencil import hint:
 *   "Import the Dashboard page from app/pages/index.tsx"
 */
import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import PortfolioSummary from "@/components/PortfolioSummary";
import ProfitBanner from "@/components/ProfitBanner";
import NavBar from "@/components/NavBar";
import ProfitChart from "@/components/ProfitChart";

const quickActions = [
  { href: "/kyc",       label: "KYC Onboarding" },
  { href: "/portfolio", label: "Portfolio"       },
  { href: "/otc",       label: "OTC Market"      },
  { href: "/claim",     label: "Claim Profit"    },
];

const Dashboard: NextPage = () => {
  const { connected } = useWallet();

  return (
    <>
      <Head>
        <title>HypeSukuk — Investor Dashboard</title>
      </Head>
      <div className="min-h-screen bg-background">
        <NavBar />
        <ProfitBanner />

        {!connected ? (
          <main className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-6 text-center">
            <div className="max-w-lg space-y-8">
              <div className="space-y-4">
                <h1 className="text-2xl font-semibold tracking-tight text-text leading-tight">
                  Islamic Bonds,
                  <br />
                  On-Chain.
                </h1>
                <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">
                  Tokenised sukuk bonds with on-chain KYC compliance, real-time
                  profit accrual, and a Shariah-compliant OTC marketplace.
                </p>
              </div>
            </div>
          </main>
        ) : (
          <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 sm:space-y-10">
            <div>
              <p className="text-xs font-medium tracking-widest uppercase text-muted mb-1">
                Dashboard
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                Overview
              </h1>
            </div>

            <PortfolioSummary />

            <ProfitChart />

            <section className="space-y-4">
              <p className="text-xs font-medium tracking-widest uppercase text-muted">
                Quick Actions
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {quickActions.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center justify-center h-20 bg-surface border border-border rounded text-sm text-text hover:bg-background transition-colors"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </section>
          </main>
        )}
      </div>
    </>
  );
};

export default Dashboard;
