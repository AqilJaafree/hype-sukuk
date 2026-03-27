/**
 * KYC Onboarding — zkMe widget integration.
 * Flow: wallet connect → zkMe widget → oracle add_investor → whitelisted.
 *
 * Pencil import hint:
 *   "Import the KYC page from app/pages/kyc.tsx"
 */
import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import KycStatusBadge from "@/components/KycStatusBadge";
import ZkMeWidget from "@/components/ZkMeWidget";

const KycPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>HypeSukuk — KYC Onboarding</title>
      </Head>
      <div className="min-h-screen bg-background">
        <NavBar />
        <main className="max-w-5xl mx-auto px-6 py-12">
          <div className="mb-8 space-y-2">
            <p className="text-xs text-muted">
              <Link href="/" className="hover:text-text transition-colors">Dashboard</Link>
              <span className="mx-2 text-border">/</span>
              <span className="text-text">KYC</span>
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              KYC Onboarding
            </h1>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            <div className="space-y-8">
              <div className="space-y-3">
                <p className="text-xs font-medium tracking-widest uppercase text-muted">
                  Current Status
                </p>
                <KycStatusBadge />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium tracking-widest uppercase text-muted">
                  Verification Steps
                </p>
                <ol className="space-y-3">
                  {[
                    "Connect your Solana wallet",
                    "Complete identity verification via zkMe",
                    "Oracle submits add_investor transaction",
                    "Wallet is whitelisted for sukuk transfers",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full border border-border flex items-center justify-center text-xs text-muted mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-sm text-muted leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="border-t border-border pt-6 space-y-2">
                <p className="text-xs font-medium tracking-widest uppercase text-muted">
                  About zkMe
                </p>
                <p className="text-sm text-muted leading-relaxed">
                  zkMe uses zero-knowledge proofs to verify your identity without
                  exposing personal data on-chain. Credentials are cryptographically
                  attested and expire after 12 months.
                </p>
              </div>
            </div>

            <div>
              <ZkMeWidget />
            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default KycPage;
