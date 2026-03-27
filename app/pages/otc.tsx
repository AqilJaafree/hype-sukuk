/**
 * OTC Market — place and browse bid/ask orders on the rollup.
 *
 * Pencil import hint:
 *   "Import the OTC page from app/pages/otc.tsx"
 */
import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import OrderBook from "@/components/OrderBook";
import PlaceOrderForm from "@/components/PlaceOrderForm";

const OtcPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>HypeSukuk — OTC Market</title>
      </Head>
      <div className="min-h-screen bg-background">
        <NavBar />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8 sm:space-y-10">
          <div className="space-y-2">
            <p className="text-xs text-muted">
              <Link href="/" className="hover:text-text transition-colors">Dashboard</Link>
              <span className="mx-2 text-border">/</span>
              <span className="text-text">OTC Market</span>
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              OTC Marketplace
            </h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-start">
            <PlaceOrderForm />
            <OrderBook />
          </div>
        </main>
      </div>
    </>
  );
};

export default OtcPage;
