# Hype Sukuk

A compliant sukuk (Islamic bond) tokenisation platform on Solana using Token-2022, MagicBlock Private Ephemeral Rollups, and zkMe zkKYC.

---

## The Problem

### Islamic finance is locked out of DeFi

The global sukuk market exceeds **$800 billion** in outstanding issuance, yet virtually none of it lives on-chain. The reason is not a lack of demand — it is a lack of infrastructure that can satisfy the three non-negotiable requirements of Islamic capital markets:

| Requirement | Why it matters | What DeFi currently offers |
|---|---|---|
| **Sharia compliance** | Every token transfer must be restricted to verified, permissioned investors. Unrestricted trading is prohibited. | Open, permissionless tokens — no transfer controls |
| **Regulatory KYC/AML** | Investors must be identity-verified before receiving any sukuk. Credentials must expire and be revocable. | Pseudonymous wallets, no identity layer |
| **Investor privacy** | OTC order books, accrual balances, and profit distributions must not be visible to third parties on a public ledger | All state is public on-chain |

Existing tokenisation attempts bolt compliance on at the application layer — a frontend that checks a list and hopes users don't bypass it. This is not compliance. Any wallet can call a smart contract directly.

### What Hype Sukuk does differently

Compliance is **enforced at the protocol layer**, not the UI layer:

**1. Uncheckable transfer hook**
Every `transfer_checked` on the sukuk token — regardless of which wallet, app, or program initiates it — fires `sukuk_hook` on-chain. Five checks run atomically: whitelist, zkMe SBT presence, KYC expiry, KYC level, and lock period. There is no code path that bypasses this. A malicious actor calling the Token-2022 program directly faces the same hook as a retail investor using the frontend.

**2. Zero-knowledge KYC with on-chain attestation**
Identity verification is done via zkMe's zkKYC — investors prove citizenship and AML clearance without exposing personal data. The on-chain record is a single hash (`SHA-256(appId:wallet)`) and a Soul Bound Token (SBT). No PII touches Solana. KYC credentials expire after 12 months and can be revoked instantly via a Helius webhook watching for SBT burn events.

**3. Private profit accrual and OTC via MagicBlock TEE**
Profit accrues every 30 seconds inside a MagicBlock Private Ephemeral Rollup secured by Intel TDX. This means:
- **Zero base-chain fees** for the high-frequency accrual ticks
- **Private order book** — OTC bids and asks are not visible to other applications or front-runners
- **MEV protection** — matching happens inside the TEE before settlement touches the public chain

**4. Scalable profit distribution via Merkle proofs**
At settlement, one 32-byte Merkle root is written on-chain. Each investor independently claims their share with a proof. The issuer does not need to send N transactions for N holders.

### Who this is for

- **Sukuk issuers** who need a compliant, auditable tokenisation rail without building custom transfer restriction infrastructure
- **Institutional investors** who require KYC-gated access and privacy guarantees before participating in on-chain fixed income
- **Retail Muslim investors** who are currently excluded from sukuk markets due to high minimum investment sizes that tokenisation removes

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              BASE LAYER — Solana devnet                  │
│                                                         │
│  sukuk_hook (Anchor program)                            │
│  ├── Token-2022 mint (TransferHook + MetadataPointer    │
│  │   + PermanentDelegate + InterestBearingMint)         │
│  ├── InvestorRegistry PDA — whitelist + zkMe config     │
│  ├── InvestorEntry PDA per wallet — KYC level + expiry  │
│  └── transfer_hook — fires on every transfer_checked    │
└────────────────────┬────────────────────────────────────┘
                     │ delegate / undelegate
┌────────────────────▼────────────────────────────────────┐
│         PRIVATE ER — MagicBlock TEE devnet               │
│                                                         │
│  sukuk_rollup (Anchor program)                          │
│  ├── accrue_profit — native crank, zero base fees       │
│  ├── place_otc_order / match_otc_order                  │
│  ├── commit_distribution — Merkle root of accruals      │
│  └── undelegate_and_settle — write state to base        │
└────────────────────┬────────────────────────────────────┘
                     │ zkMe SBT mint / KYC webhook
┌────────────────────▼────────────────────────────────────┐
│              OFF-CHAIN LAYER                             │
│                                                         │
│  ├── zkMe Widget — investor KYC flow                    │
│  ├── Backend oracle — add_investor on-chain             │
│  ├── Helius webhooks — SBT burn → auto-revocation       │
│  └── TEE auth — signed challenge → access token         │
└─────────────────────────────────────────────────────────┘
```

**Design rules:**
- Compliance always on base Solana — `InvestorRegistry` and `InvestorEntry` are never delegated
- zkMe SBT is the primary proof of KYC — `transfer_hook` verifies it on every transfer
- Rollup handles only operational state: accruals, OTC orders, distribution roots
- All token transfers go through base Solana `transfer_checked`, enforcing TransferHook

---

## Tech Stack

| Layer | Tool | Version |
|---|---|---|
| Smart contracts | Anchor | `0.32.1` |
| Token standard | Token-2022 | `7.0` |
| Private Rollup | MagicBlock TEE (`tee.magicblock.app`) | `ephemeral-rollups-sdk 0.6.5` |
| zkKYC | zkMe | `@zkmelabs/widget latest` |
| Merkle tree | `rs_merkle` | `1.4.2` |
| RPC (base) | Helius devnet | — |
| RPC (rollup) | MagicBlock TEE devnet | `tee.magicblock.app` |
| Frontend | Next.js 14 + Tailwind CSS + Recharts | `14.2.x` |
| Design tool | Pencil.dev (two-way code↔design sync) | — |
| Wallet UI | `@solana/wallet-adapter-react-ui` | `0.9.x` |

---

## Project Structure

```
hype-sukuk/
├── programs/
│   ├── sukuk_hook/          # Base-chain program — KYC, whitelist, TransferHook
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── errors.rs
│   │       ├── instructions/
│   │       └── state/
│   └── sukuk_rollup/        # Rollup program — accrual, OTC, distribution
│       └── src/
│           ├── lib.rs
│           ├── errors.rs
│           ├── instructions/
│           └── state/
├── app/                     # Next.js investor frontend
│   ├── components/
│   │   ├── NavBar.tsx        # Sticky nav, mobile hamburger, Learn popup
│   │   ├── LearnModal.tsx    # Informational popup (Sukuk 101 + glossary)
│   │   ├── PortfolioSummary.tsx
│   │   ├── ProfitChart.tsx   # Line chart — accrued profit over time
│   │   ├── ProfitBanner.tsx  # Alert when distribution is claimable
│   │   ├── KycStatusBadge.tsx
│   │   ├── ZkMeWidget.tsx    # zkMe KYC stepper
│   │   ├── ClaimProfitForm.tsx
│   │   ├── PlaceOrderForm.tsx
│   │   ├── OrderBook.tsx
│   │   ├── AccrualHistory.tsx
│   │   └── WalletButton.tsx  # SSR-safe WalletMultiButton wrapper
│   ├── pages/
│   │   ├── index.tsx         # Dashboard
│   │   ├── portfolio.tsx     # Holdings + accrual history
│   │   ├── kyc.tsx           # KYC onboarding flow
│   │   ├── otc.tsx           # OTC marketplace
│   │   ├── claim.tsx         # Merkle proof profit claim
│   │   └── api/
│   │       ├── zkme/         # zkMe webhook → add_investor
│   │       └── webhooks/     # Helius SBT burn → revocation
│   ├── lib/
│   │   ├── connections.ts    # Dual-connection client (base + TEE)
│   │   └── magicblock-tee.ts # TEE auth flow
│   ├── styles/globals.css
│   ├── tailwind.config.ts
│   └── package.json
├── design.pen               # Pencil.dev canvas (two-way design↔code sync)
├── scripts/
│   └── schedule-crank.ts    # One-time crank scheduler
├── tests/                   # Anchor test suite (01–09)
├── Anchor.toml
├── Cargo.toml
└── package.json
```

---

## Prerequisites

- [Rust](https://rustup.rs/) `1.85.0+`
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) `2.3.13+`
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) `0.32.1`
- Node.js `24.10.0+` / pnpm
- A [Helius](https://dashboard.helius.dev) devnet API key
- A [zkMe](https://dashboard.zk.me) account (with On-chain Mint enabled for Solana devnet)

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/AqilJaafree/hype-sukuk.git
cd hype-sukuk
pnpm install          # root (tests + scripts)
pnpm app:install      # frontend (app/)
```

### 2. Configure environment

```bash
cp .env.example .env
cp app/.env.local.example app/.env.local
```

Fill in `.env`:

```env
ZKME_API_KEY=...
ZKME_APP_ID=...
ZKME_CREDENTIAL_MINT=...
SOLANA_RPC_URL=https://devnet.helius-rpc.com?api-key=<key>
MAGICBLOCK_TEE_ENDPOINT=https://tee.magicblock.app
KYC_ORACLE_SECRET_KEY=...
AUTHORITY_SECRET_KEY=[...]
HELIUS_API_KEY=...
```

### 3. Build programs

```bash
anchor build
```

After build, copy the generated program IDs into `declare_id!` in each `lib.rs` and update `Anchor.toml`, then rebuild:

```bash
anchor build
```

### 4. Deploy to devnet

```bash
anchor deploy --provider.cluster devnet
```

Update `.env` with `SUKUK_HOOK_PROGRAM_ID` and `SUKUK_ROLLUP_PROGRAM_ID`.

### 5. Initialise on-chain state

Run the setup scripts in order:

```bash
# 1. Create Token-2022 mint with all extensions
yarn ts-mocha tests/01_mint_setup.ts

# 2. Init registry + extra account meta list
yarn ts-mocha tests/02_registry_init.ts
```

Update `.env` with `SUKUK_MINT`.

### 6. Delegate and schedule crank

```bash
# Delegate sukuk_vault to the TEE private ER
yarn ts-mocha tests/06_delegation.ts

# Schedule native profit-accrual crank (runs automatically every 30s)
yarn crank:schedule
```

---

## Frontend — Investor UI

A Scandinavian minimalist Next.js app for investors, built with Tailwind CSS and Recharts.

### Pages

| Route | Description |
|---|---|
| `/` | Dashboard — portfolio summary, profit chart, quick actions |
| `/portfolio` | Holdings, accrual history, KYC status |
| `/kyc` | zkMe identity verification flow |
| `/otc` | OTC bid/ask order placement and live order book |
| `/claim` | Merkle proof profit distribution claim |

### Design system

| Token | Value | Usage |
|---|---|---|
| `background` | `#F7F6F3` | Warm linen canvas |
| `surface` | `#FFFFFF` | Cards |
| `border` | `#E2E0DB` | Hairline separators |
| `forest` | `#1D5C3A` | Primary actions, positive values |
| `gold` | `#A8832A` | Distribution alerts |
| `muted` | `#76726B` | Labels, secondary text |

### Running locally

```bash
pnpm app:install   # install app/node_modules
pnpm app:dev       # starts at localhost:3000
```

### Deploying to Netlify

Add a `netlify.toml` at the repo root:

```toml
[build]
  base    = "app"
  command = "pnpm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

Netlify dashboard settings:
- **Base directory:** `app`
- **Build command:** `pnpm run build`
- **Publish directory:** `app/.next`

Required environment variables:

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com?api-key=<key>
```

### Pencil.dev (design↔code sync)

The `design.pen` file at the repo root is the Pencil canvas. Open it in VS Code or Cursor with the Pencil extension installed. Use `Ctrl+K` on the canvas to import components:

```
Import the Dashboard page from app/pages/index.tsx
Import the NavBar component from app/components/NavBar.tsx
```

Each component file contains a `Pencil import hint:` comment with the exact prompt.

---

## Transaction Routing

| Instruction | Program | Send to |
|---|---|---|
| `initialize_sukuk_mint` | sukuk_hook | Base (Helius) |
| `initialize_registry` | sukuk_hook | Base (Helius) |
| `add_investor` / `remove_investor` | sukuk_hook | Base (Helius) |
| `delegate_sukuk_vault` | sukuk_rollup | Base (Helius) |
| `transfer_checked` (OTC settle) | Token-2022 | Base (Helius) |
| `initialize_accrual_state` | sukuk_rollup | Private ER (TEE) |
| `schedule_profit_crank` | sukuk_rollup | Private ER (TEE) |
| `accrue_profit` | sukuk_rollup | Private ER (TEE) |
| `place_otc_order` | sukuk_rollup | Private ER (TEE) |
| `match_otc_order` | sukuk_rollup | Private ER (TEE) |
| `commit_distribution` | sukuk_rollup | Private ER (TEE) |
| `undelegate_and_settle` | sukuk_rollup | Private ER (TEE) |

---

## MagicBlock Private ER (TEE)

This project uses MagicBlock's TEE-secured private ephemeral rollup (`tee.magicblock.app`) for rollup operations. This provides:

- **Confidentiality** — OTC order books and per-holder accruals are not visible to other applications
- **Isolation** — dedicated validator for this sukuk platform
- **MEV protection** — no front-running of OTC matches

### TEE Authentication Flow

```
Authority keypair
      │
      ▼  POST /challenge
tee.magicblock.app ──► { challenge }
      │
      ▼  nacl.sign(challenge, secretKey)
      │
      ▼  POST /token
tee.magicblock.app ──► { authToken, expiresIn }
      │
      ▼
Connection("https://tee.magicblock.app?token=<authToken>")
```

See `app/lib/magicblock-tee.ts` for implementation.

---

## Transfer Hook — Compliance Checks

Every `transfer_checked` on the sukuk token triggers 5 on-chain checks (in order):

1. **Whitelist** — destination wallet must have an `InvestorEntry` PDA
2. **zkMe SBT** — destination must hold a valid zkMe credential SBT
3. **KYC expiry** — credential must not be expired
4. **KYC level** — investor level must meet the platform minimum
5. **Lock period** — transfers blocked until `lock_until` timestamp passes

If any check fails, the entire transfer reverts.

---

## Running Tests

```bash
# Full test suite against devnet
anchor test --provider.cluster devnet

# Individual test files
yarn ts-mocha tests/04_transfer_hook.ts
yarn ts-mocha tests/07_profit_accrual.ts
```

Tests 01–05 run against localnet. Tests 06–09 require devnet + MagicBlock TEE RPC.

---

## Key Program IDs (devnet)

| Program | Address |
|---|---|
| `sukuk_hook` | Set after `anchor build` |
| `sukuk_rollup` | Set after `anchor build` |
| Delegation Program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` |
| Magic Program | `Magic11111111111111111111111111111111111111` |
| Magic Context | `MagicContext1111111111111111111111111111111` |

---

## License

MIT
