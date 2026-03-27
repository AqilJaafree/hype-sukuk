# Hype Sukuk — User Flow

A Sharia-compliant sukuk (Islamic bond) tokenisation platform on Solana.
Every token transfer is compliance-gated on-chain. Profit accrues automatically inside a MagicBlock private ephemeral rollup with zero base-chain fees.

---

## Actors

| Actor | Who | Responsibility |
|---|---|---|
| **Issuer** | Bond issuer / authority keypair | Creates and manages the sukuk lifecycle |
| **KYC Oracle** | Backend service (separate keypair) | Bridges zkMe verification to on-chain whitelist |
| **Investor** | Retail / accredited / institutional wallet | Buys, holds, trades, and claims profit |
| **MagicBlock TEE** | Automated rollup validator | Runs profit accrual every 30 seconds, no human needed |

---

## Architecture at a Glance

```
BASE LAYER (Solana devnet — Helius RPC)
│
│  sukuk_hook program
│  ├── InvestorRegistry PDA   — whitelist config, lock period, profit rate
│  ├── InvestorEntry PDA      — per-investor KYC level, expiry, hash
│  └── transfer_hook          — fires on EVERY transfer_checked (5 compliance checks)
│
│  sukuk_rollup program
│  ├── SukukVault PDA         — profit pool (delegated to rollup during session)
│  ├── AccrualState PDA       — per-holder accrued profit (in rollup)
│  ├── OtcOrder PDA           — buy/sell orders (in rollup)
│  ├── DistributionRoot PDA   — Merkle root of all accruals (written to base on settle)
│  └── ClaimReceipt PDA       — proof of claim (prevents double-claiming)
│
└── delegate / undelegate
    │
    EPHEMERAL ROLLUP (MagicBlock TEE — tee.magicblock.app)
    │
    ├── accrue_profit          — native crank, every 30s, zero base fees
    ├── place_otc_order        — whitelist-gated OTC sell/buy
    ├── match_otc_order        — matches bid and ask, records intent
    └── commit_distribution    — builds Merkle tree of all accruals
```

**Compliance guarantee:** `InvestorRegistry` and `InvestorEntry` are never delegated to the rollup. Every token transfer on base Solana fires the `transfer_hook` regardless of which client or program initiates it. The rollup cannot bypass compliance.

---

## Flow 1 — Issuer Setup (One-Time)

```
Issuer
  │
  ├─[1]─ Create Token-2022 mint
  │        Extensions (in order):
  │        • TransferHook      → points to sukuk_hook program
  │        • MetadataPointer   → on-chain metadata (tenor, asset, shariah hash)
  │        • PermanentDelegate → issuer can force-transfer or redeem
  │        • InterestBearingConfig → profit rate recorded on-chain
  │
  ├─[2]─ initialize_registry(kyc_oracle, zkme_credential_mint, lock_until, profit_rate_bps, min_kyc_level)
  │        → InvestorRegistry PDA created
  │        → rollup_active = false, investor_count = 0
  │
  ├─[3]─ initialize_extra_account_meta_list()
  │        → Registers 6 extra accounts Token-2022 injects on every transfer:
  │            [0] investor_registry     (PDA from mint)
  │            [1] investor_entry        (PDA from registry + destination_owner)
  │            [2] clock sysvar
  │            [3] Token-2022 program
  │            [4] Associated Token Program
  │            [5] zkMe SBT ATA          (ATA of destination_owner for zkme_credential_mint)
  │
  ├─[4]─ Mint sukuk tokens to investors via token_2022 mint_to
  │        (First delivery gated by transfer_hook — investor must be KYC'd first)
  │
  ├─[5]─ delegate_sukuk_vault()                          → BASE SOLANA
  │        → SukukVault PDA locked into MagicBlock rollup
  │        → rollup_active = true, session_start = now
  │
  ├─[6]─ initialize_accrual_state(holder) × N            → TEE ROLLUP
  │        → AccrualState PDA created for each investor in the rollup
  │
  └─[7]─ schedule_profit_crank(interval_ms = 30_000)     → TEE ROLLUP
           → Native crank registered in MagicBlock scheduler
           → accrue_profit fires automatically every 30s — no backend needed
```

**Send to:** Steps 1–4 → Helius (base Solana). Steps 5+ → split between base and TEE.

---

## Flow 2 — Investor Onboarding (Per Investor)

```
Investor wallet
  │
  ├─[1]─ Connect wallet (Phantom / Backpack)
  │
  ├─[2]─ Open KycGate.tsx in frontend
  │        → verifyKycWithZkMeServices(APP_ID, wallet) called first
  │        → If already verified → skip widget
  │
  ├─[3]─ Complete zkMe KYC widget
  │        • Level 1 (retail)        — Proof-of-Citizenship + zkAML
  │        • Level 2 (accredited)    — + Proof-of-Accredited-Investor
  │        • Level 3 (institutional) — + institutional due diligence
  │        → zkMe mints SBT (Soul Bound Token) to investor's wallet
  │          (Token-2022 credential token, non-transferable)
  │
  ├─[4]─ zkMe fires webhook → /api/zkme/kyc-complete
  │        → Backend verifies credential via @zkmelabs/verify-abi
  │        → kyc_provider_hash = SHA-256(appId + ":" + wallet.toBase58())
  │
  └─[5]─ KYC oracle calls add_investor(wallet, kyc_level, kyc_expiry, hash)
           → InvestorEntry PDA created on base Solana
           → investor_count incremented in InvestorRegistry
           → Investor is now whitelisted
```

---

## Flow 3 — Transfer Hook (Every Token Transfer)

Triggered automatically by Token-2022 on every `transfer_checked`. Investor takes no action — this is invisible infrastructure.

```
transfer_checked(source, mint, destination, owner, amount)
  │
  Token-2022 runtime injects 6 extra accounts and calls sukuk_hook.fallback()
  │
  sukuk_hook checks (in order — any failure reverts the entire transfer):
  │
  ├─[1]─ WHITELIST
  │        destination wallet must have an InvestorEntry PDA
  │        Error: NotWhitelisted
  │
  ├─[2]─ zkMe SBT
  │        destination wallet must hold ≥ 1 token in zkMe SBT ATA
  │        SBT mint must match registry.zkme_credential_mint
  │        Error: NoZkCredential / InvalidCredentialMint
  │
  ├─[3]─ KYC EXPIRY
  │        clock.unix_timestamp < investor_entry.kyc_expiry
  │        Error: KycExpired
  │
  ├─[4]─ KYC LEVEL
  │        investor_entry.kyc_level >= registry.min_kyc_level
  │        Error: InsufficientKycLevel
  │
  └─[5]─ LOCK PERIOD
           clock.unix_timestamp >= registry.lock_until
           Error: TransferLocked
  │
  All 5 pass → TransferApproved event emitted → transfer completes
```

**Key property:** These checks cannot be circumvented. Any program on Solana that calls `transfer_checked` on this mint will trigger the hook. The rollup's OTC settlement also goes through `transfer_checked` on base Solana.

---

## Flow 4 — Profit Accrual (Automated, No User Action)

```
MagicBlock native crank (fires every 30 seconds inside TEE rollup)
  │
  accrue_profit(remaining_accounts: up to 10 AccrualState PDAs)
  │
  For each AccrualState:
  │
  ├─ elapsed = now - accrual.last_tick
  │
  ├─ period_profit = balance × profit_rate_bps × elapsed
  │                  ─────────────────────────────────────
  │                      10_000 × 365 × 86_400
  │
  │   (u128 fixed-point — no floating-point rounding)
  │
  ├─ accrued_profit_usdc += period_profit  (saturating_add)
  ├─ last_tick = now
  │
  └─ ProfitAccrued event emitted (holder, amount_usdc, timestamp)

Zero base-chain fees. Runs entirely inside MagicBlock TEE validator.
Token balance snapshot is read at each tick — balance changes affect future accrual.
```

---

## Flow 5 — OTC Secondary Market (Optional, Investor → Investor)

```
SELLER
  │
  ├─[1]─ place_otc_order(Sell, amount, price_usdc, expiry, nonce)   → TEE ROLLUP
  │        → Whitelist check: InvestorEntry read from base Solana (cross-program)
  │        → PDA validated: seeds = ["investor_registry", mint] from sukuk_hook
  │        → OtcOrder PDA created in rollup (filled = false)
  │
BUYER
  │
  ├─[2]─ place_otc_order(Buy, amount, price_usdc, expiry, nonce)    → TEE ROLLUP
  │        → Same whitelist + PDA validation as seller
  │
MATCHER (any wallet, often automated)
  │
  ├─[3]─ match_otc_order(bid_order, ask_order)                       → TEE ROLLUP
  │        Validates:
  │        • bid.side == Buy, ask.side == Sell
  │        • bid.price_usdc >= ask.price_usdc  (bid willing to pay ≥ ask price)
  │        • bid.mint == ask.mint
  │        • !bid.filled && !ask.filled
  │        • neither order expired
  │        • both bid.owner and ask.owner in InvestorEntry (PDA-validated)
  │        → bid.filled = true, ask.filled = true
  │        → OtcMatched event emitted (bid_owner, ask_owner, amount, price_usdc)
  │
POST-SETTLEMENT (after undelegate_and_settle)
  │
  └─[4]─ transfer_checked(seller_ata → buyer_ata, amount)            → BASE SOLANA
           → Token-2022 fires transfer_hook on the buyer (all 5 checks)
           → Buyer must be KYC'd, whitelisted, hold SBT
           → Tokens settle on base chain
           → OTC settlement is complete
```

**MEV protection:** OTC order book lives inside MagicBlock's private TEE rollup — not visible to other applications or front-runners.

---

## Flow 6 — Settlement and Profit Distribution

```
Issuer (end of profit period)
  │
  ├─[1]─ commit_distribution(period_start)                           → TEE ROLLUP
  │        → Reads all AccrualState PDAs (passed as remaining_accounts)
  │        → Builds Merkle tree: leaf = SHA-256(holder || accrued_profit_usdc_le)
  │        → Writes DistributionRoot PDA:
  │            merkle_root, total_profit_usdc, period_start/end, holder_count
  │        → committed = true  (cannot be overwritten)
  │
  ├─[2]─ undelegate_and_settle()                                     → TEE ROLLUP
  │        → Validates distribution_root.committed = true
  │        → commit_and_undelegate_accounts() flushes all delegated state to base Solana:
  │            SukukVault, DistributionRoot, all AccrualState PDAs
  │        → rollup_active = false written to InvestorRegistry (base Solana)
  │        → RollupSettled event emitted
  │
  │        Base Solana now has:
  │        ✓ DistributionRoot with sealed Merkle root
  │        ✓ All AccrualState PDAs with final accrued_profit_usdc values
  │        ✓ SukukVault back on base chain (holds USDC for distribution)
  │
INVESTOR (claims their share)
  │
  ├─[3]─ Fetch Merkle proof
  │        → Issuer API or indexer reads all AccrualState PDAs
  │        → Reconstructs Merkle tree and generates proof for this wallet
  │        → Returns: { amount_usdc, leaf_index, proof: [[u8;32]] }
  │
  └─[4]─ claim_profit(amount_usdc, leaf_index, proof)                → BASE SOLANA
           → Verifies leaf: SHA-256(wallet || amount_usdc) at leaf_index
           → Verifies proof path against distribution_root.merkle_root
           → Checks no ClaimReceipt PDA exists yet (prevents double-claim)
           → token::transfer: vault_usdc_ata → investor USDC ATA
           → ClaimReceipt PDA created (seeds: [distribution_root, wallet])
           → ProfitClaimed event emitted
```

---

## Flow 7 — KYC Oracle Maintenance (Ongoing)

```
Annual KYC re-verify:
  → Investor completes zkMe widget again
  → Oracle calls: renew_investor(wallet, new_expiry, new_provider_hash)
  → kyc_expiry extended on InvestorEntry PDA

SBT revocation (AML freeze, regulatory order):
  → Helius webhook detects SBT burn event for this wallet
  → Oracle calls: remove_investor(wallet)
  → InvestorEntry PDA closed, rent returned to authority
  → investor_count decremented
  → Next incoming transfer to this wallet → NotWhitelisted (hook rejects)

SBT expiry with no renewal:
  → No oracle action needed
  → kyc_expiry in InvestorEntry passes
  → Next incoming transfer → KycExpired (hook rejects automatically)
```

---

## End-to-End Timeline

```
T+0    ── SETUP ──────────────────────────────────────────────────────
         Issuer creates Token-2022 mint, initialises registry,
         initialises extra account meta list.

T+1    ── KYC ONBOARDING ────────────────────────────────────────────
         Investors complete zkMe KYC widget.
         SBTs minted to wallets. KYC oracle calls add_investor × N.

T+2    ── PRIMARY ISSUANCE ────────────────────────────────────────────
         Issuer mints sukuk tokens to investors.
         transfer_hook fires on each delivery:
         all 5 compliance checks → tokens land in investor wallets.

T+3    ── ROLLUP SESSION STARTS ────────────────────────────────────────
         delegate_sukuk_vault → session begins.
         initialize_accrual_state × N for all holders.
         schedule_profit_crank → crank fires every 30s from here.

T+3 → T+90d  ── PROFIT ACCRUAL (AUTOMATED) ─────────────────────────
         Every 30s: accrue_profit ticks all AccrualState PDAs.
         Investors hold tokens; accrued_profit_usdc grows continuously.

T+30d  ── OTC MARKET ACTIVITY ──────────────────────────────────────
         Investors place buy/sell orders on TEE rollup.
         Matcher calls match_otc_order → orders filled in rollup.
         Post-settlement: transfer_checked completes OTC on base chain.

T+90d  ── SETTLEMENT ───────────────────────────────────────────────
         commit_distribution → Merkle root sealed.
         undelegate_and_settle → all state back on base Solana.

T+90d+ ── PROFIT CLAIMS ──────────────────────────────────────────────
         Investors fetch Merkle proofs from issuer API.
         Each investor calls claim_profit → USDC transferred on-chain.
         ClaimReceipt PDA prevents double-claiming.

T+91d  ── NEXT PERIOD ──────────────────────────────────────────────
         Issuer calls delegate_sukuk_vault again.
         New rollup session starts. Cycle repeats.
```

---

## Error States and Recovery

| Situation | What Happens | Recovery |
|---|---|---|
| Investor tries to receive tokens without SBT | `NoZkCredential` — transfer reverts | Complete zkMe KYC, get SBT minted |
| Investor's KYC expired | `KycExpired` — all incoming transfers blocked | renew_investor called by oracle after re-verify |
| Transfer before lock period ends | `TransferLocked` — transfer reverts | Wait for `lock_until` timestamp |
| Investor not whitelisted | `NotWhitelisted` — transfer reverts | add_investor called by oracle |
| OTC order expired before matching | `OrderExpired` — match_otc_order reverts | Place new order with future expiry |
| claim_profit called twice | `AccountAlreadyInUse` — ClaimReceipt PDA exists | Nothing to do — already claimed |
| commit_distribution called twice | `DistributionAlreadyCommitted` — reverts | Nothing to do — root already sealed |
| TEE auth token expires (~1 hour) | TEE RPC rejects requests | Re-authenticate via `buildTeeConnection()` |

---

## Transaction Routing Reference

| Instruction | Program | Send to |
|---|---|---|
| `initialize_registry` | sukuk_hook | Base (Helius) |
| `initialize_extra_account_meta_list` | sukuk_hook | Base (Helius) |
| `add_investor` / `remove_investor` / `renew_investor` | sukuk_hook | Base (Helius) |
| `update_lock_period` | sukuk_hook | Base (Helius) |
| `transfer_checked` (any token transfer) | Token-2022 | Base (Helius) |
| `delegate_sukuk_vault` | sukuk_rollup | Base (Helius) |
| `claim_profit` | sukuk_rollup | Base (Helius) |
| `initialize_accrual_state` | sukuk_rollup | TEE Rollup |
| `schedule_profit_crank` | sukuk_rollup | TEE Rollup |
| `accrue_profit` | sukuk_rollup | TEE Rollup (via crank) |
| `place_otc_order` | sukuk_rollup | TEE Rollup |
| `match_otc_order` | sukuk_rollup | TEE Rollup |
| `commit_distribution` | sukuk_rollup | TEE Rollup |
| `undelegate_and_settle` | sukuk_rollup | TEE Rollup |

---

## Key Design Constraints

- **Compliance is uncheckable.** Every token transfer — regardless of who initiates it — runs all 5 hook checks. There is no path around the hook.
- **KYC data is off-chain.** Only the hash (`SHA-256(appId:wallet)`) is stored on-chain. No PII touches Solana.
- **Rollup handles only speed-sensitive state.** Whitelist and KYC data stay on base Solana at all times; the rollup reads them cross-program but cannot write them.
- **Profit claims scale to any number of holders.** The Merkle root pattern means the issuer only writes one 32-byte value on-chain; each holder claims independently with their own proof.
- **OTC orders record intent, not settlement.** `match_otc_order` marks orders filled; actual token movement happens via `transfer_checked` on base chain, which re-runs the hook on the buyer.
