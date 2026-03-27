/**
 * Portfolio — detailed view of investor's sukuk holdings and accrued profit.
 *
 * Pencil import hint:
 *   "Import the Portfolio page from app/pages/portfolio.tsx"
 */
import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import PortfolioSummary from "@/components/PortfolioSummary";
import AccrualHistory from "@/components/AccrualHistory";
import KycStatusBadge from "@/components/KycStatusBadge";
import ProfitChart from "@/components/ProfitChart";

const PortfolioPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>HypeSukuk — Portfolio</title>
      </Head>
      <div className="min-h-screen bg-background">
        <NavBar />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 sm:space-y-10">
          <div className="space-y-2">
            <p className="text-xs text-muted">
              <Link href="/" className="hover:text-text transition-colors">Dashboard</Link>
              <span className="mx-2 text-border">/</span>
              <span className="text-text">Portfolio</span>
            </p>
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-semibold tracking-tight text-text">
                My Portfolio
              </h1>
              <KycStatusBadge />
            </div>
          </div>

          <PortfolioSummary detailed />

          <ProfitChart />

          <section className="space-y-4">
            <p className="text-xs font-medium tracking-widest uppercase text-muted">
              History
            </p>
            <AccrualHistory />
          </section>
        </main>
      </div>
    </>
  );
};

export default PortfolioPage;
