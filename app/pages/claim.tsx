/**
 * Claim Profit — Merkle proof claim after distribution is committed.
 *
 * Pencil import hint:
 *   "Import the Claim page from app/pages/claim.tsx"
 */
import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import ClaimProfitForm from "@/components/ClaimProfitForm";

// TODO: fetch period info from DistributionRoot PDA
const PERIOD_LABEL = "March 2026";
const PERIOD_RANGE = "2026-03-01 — 2026-03-31";

const ClaimPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>HypeSukuk — Claim Profit</title>
      </Head>
      <div className="min-h-screen bg-background">
        <NavBar />
        <main className="max-w-lg mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 sm:space-y-10">
          <div className="space-y-2">
            <p className="text-xs text-muted">
              <Link href="/" className="hover:text-text transition-colors">Dashboard</Link>
              <span className="mx-2 text-border">/</span>
              <span className="text-text">Claim Profit</span>
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Claim Profit
            </h1>
          </div>

          <div className="border border-border rounded p-5 space-y-3">
            <p className="text-xs font-medium tracking-widest uppercase text-muted">
              Distribution Period
            </p>
            <p className="text-sm text-text font-medium">{PERIOD_LABEL}</p>
            <p className="text-sm text-muted leading-relaxed">{PERIOD_RANGE}</p>
          </div>

          <ClaimProfitForm />

          <p className="text-sm text-muted leading-relaxed">
            Profit distributions use a Merkle tree committed on-chain after each
            settlement period. Your proof is generated server-side from the
            distribution snapshot.
          </p>
        </main>
      </div>
    </>
  );
};

export default ClaimPage;
