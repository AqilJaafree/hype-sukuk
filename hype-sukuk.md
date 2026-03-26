# Sukuk Platform — Complete Project Spec
### Token-2022 · MagicBlock Private Ephemeral Rollup · zkMe zkKYC · Solana

---

## Architecture overview

This platform uses a three-layer hybrid architecture:

```
┌─────────────────────────────────────────────────────────┐
│              BASE LAYER — Solana mainnet/devnet          │
│                                                         │
│  sukuk_hook program                                     │
│  ├── Token-2022 mint (TransferHook + MetadataPointer    │
│  │   + PermanentDelegate + InterestBearingMint)         │
│  ├── InvestorRegistry PDA (whitelist + zkMe config)     │
│  ├── InvestorEntry PDA per wallet (kyc_level + expiry)  │
│  ├── transfer_hook: whitelist + zkMe SBT + expiry +     │
│  │   level + lock period — fires on EVERY transfer      │
│  └── Principal vault (USDC escrow)                      │
└────────────────────┬────────────────────────────────────┘
                     │ delegate / undelegate
┌────────────────────▼────────────────────────────────────┐
│         EPHEMERAL ROLLUP — MagicBlock private validator  │
│                                                         │
│  sukuk_rollup program                                   │
│  ├── accrue_profit: high-freq ticks, zero base fees     │
│  ├── place_otc_order / match_otc_order: whitelist-gated │
│  ├── commit_distribution: Merkle root of accruals       │
│  └── undelegate_and_settle: write final state to base   │
└────────────────────┬────────────────────────────────────┘
                     │ SBT mint events / KYC webhook
┌────────────────────▼────────────────────────────────────┐
│              OFF-CHAIN LAYER                             │
│                                                         │
│  ├── zkMe Widget (frontend) — investor KYC flow         │
│  ├── Backend oracle — token exchange + add_investor     │
│  ├── Helius webhooks — SBT burn → auto-revocation       │
│  └── Crank service — profit accrual ticks in rollup     │
└─────────────────────────────────────────────────────────┘
```

**Key design rules:**
- Compliance always on base Solana — `InvestorRegistry` and `InvestorEntry` are NEVER delegated to the rollup
- zkMe SBT is the primary proof of KYC — `transfer_hook` verifies it on every transfer
- Rollup handles only operational state: accruals, OTC orders, distribution roots
- All token transfers (including OTC settlement) go through base Solana `transfer_checked`, enforcing TransferHook

---

## Tech stack

| Layer | Tool | Version |
|---|---|---|
| Smart contracts | Anchor | `0.30.1` |
| Token standard | Token-2022 (`spl-token-2022`) | `3.0.4` |
| Rollup | MagicBlock ephemeral rollups SDK | `0.4.0` |
| zkKYC | zkMe (`@zkmelabs/widget`) | latest |
| ZK verify ABI | `@zkmelabs/verify-abi` | latest |
| Hook interface | `spl-transfer-hook-interface` | `0.7.4` |
| Account resolution | `spl-tlv-account-resolution` | `0.7.4` |
| Merkle tree | `rs_merkle` | `1.4.2` |
| Hashing | `sha2` | `0.10.8` |
| Anchor TS client | `@coral-xyz/anchor` | `0.30.1` |
| Solana SPL token | `@solana/spl-token` | `0.4.6` |
| RPC (base) | Helius devnet | `https://devnet.helius-rpc.com?api-key=<key>` |
| RPC (rollup) | MagicBlock devnet | `https://devnet.magicblock.app` |

---

## Workspace structure

```
sukuk-platform/
├── Anchor.toml
├── Cargo.toml                            # workspace
├── package.json
├── programs/
│   ├── sukuk_hook/                       # base-chain program
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs
│   │       ├── errors.rs
│   │       ├── instructions/
│   │       │   ├── mod.rs
│   │       │   ├── initialize_mint.rs
│   │       │   ├── initialize_registry.rs
│   │       │   ├── initialize_extra_metas.rs
│   │       │   ├── transfer_hook.rs
│   │       │   ├── add_investor.rs
│   │       │   ├── remove_investor.rs
│   │       │   ├── renew_investor.rs
│   │       │   └── update_lock_period.rs
│   │       └── state/
│   │           ├── mod.rs
│   │           ├── investor_registry.rs
│   │           └── investor_entry.rs
│   └── sukuk_rollup/                     # ephemeral rollup program
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── errors.rs
│           ├── instructions/
│           │   ├── mod.rs
│           │   ├── delegate_accounts.rs
│           │   ├── initialize_accrual_state.rs
│           │   ├── accrue_profit.rs
│           │   ├── place_otc_order.rs
│           │   ├── match_otc_order.rs
│           │   ├── commit_distribution.rs
│           │   └── undelegate_and_settle.rs
│           └── state/
│               ├── mod.rs
│               ├── accrual_state.rs
│               ├── otc_order.rs
│               └── distribution_root.rs
├── app/                                  # Next.js frontend
│   ├── components/
│   │   └── KycGate.tsx
│   └── pages/
│       └── api/
│           ├── zkme/
│           │   ├── token.ts
│           │   └── kyc-complete.ts
│           └── webhooks/
│               └── zkme-revocation.ts
└── tests/
    ├── 01_mint_setup.ts
    ├── 02_registry_init.ts
    ├── 03_whitelist.ts
    ├── 04_transfer_hook.ts
    ├── 05_zkme_kyc.ts
    ├── 06_delegation.ts
    ├── 07_profit_accrual.ts
    ├── 08_otc_matching.ts
    └── 09_settle_and_commit.ts
```

---

## Program 1: `sukuk_hook` (base chain only)

### State accounts

#### `InvestorRegistry`

```rust
#[account]
pub struct InvestorRegistry {
    pub authority: Pubkey,            // 32 — issuer; controls lifecycle + mint
    pub kyc_oracle: Pubkey,           // 32 — backend oracle; can only add/remove/renew investors
    pub zkme_credential_mint: Pubkey, // 32 — zkMe SBT mint pubkey for this program
    pub mint: Pubkey,                 // 32 — the sukuk token mint
    pub lock_until: i64,              // 8  — no transfers before this unix timestamp
    pub profit_rate_bps: u16,         // 2  — annual rate, e.g. 450 = 4.50%
    pub min_kyc_level: u8,            // 1  — platform minimum (1=retail, 2=accredited, 3=institutional)
    pub investor_count: u64,          // 8
    pub rollup_active: bool,          // 1  — set true when accounts delegated to rollup
    pub session_start: i64,           // 8  — unix ts of rollup session start
    pub bump: u8,                     // 1
}
// seeds: ["investor_registry", sukuk_mint]
// space: 8 + 32 + 32 + 32 + 32 + 8 + 2 + 1 + 8 + 1 + 8 + 1 = 165
```

#### `InvestorEntry`

```rust
#[account]
pub struct InvestorEntry {
    pub wallet: Pubkey,               // 32
    pub approved_at: i64,             // 8
    pub kyc_level: u8,                // 1  — 1=retail, 2=accredited, 3=institutional
    pub kyc_expiry: i64,              // 8  — re-verify deadline (default: +1 year)
    pub kyc_provider_hash: [u8; 32],  // 32 — SHA-256(zkMe appId + ":" + wallet)
                                      //       links to off-chain record, no PII on-chain
    pub bump: u8,                     // 1
}
// seeds: ["investor_entry", investor_registry, wallet]
// space: 8 + 32 + 8 + 1 + 8 + 32 + 1 = 90
```

---

### Instructions

#### `initialize_sukuk_mint`

Create a Token-2022 mint. Extensions must be added in this exact order:

1. `TransferHookExtension` → `sukuk_hook` program ID
2. `MetadataPointer` → mint itself
3. `PermanentDelegate` → `authority` pubkey
4. `InterestBearingMint` → `profit_rate_bps`

After creation, write metadata fields via `token_metadata_initialize` then `update_field`:
- `name`, `symbol`, `uri`
- Custom fields: `tenor` (unix ts string), `profit_rate_bps`, `underlying_asset`, `shariah_advisor_hash`

Accounts: `payer`, `mint` (new keypair), `authority`, `system_program`, `token_program` (Token-2022), `rent`

#### `initialize_registry`

Called once after `initialize_sukuk_mint`. Initialises `InvestorRegistry`.

```rust
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitRegistryParams {
    pub kyc_oracle: Pubkey,
    pub zkme_credential_mint: Pubkey,  // obtained from zkMe dashboard after program creation
    pub lock_until: i64,
    pub profit_rate_bps: u16,
    pub min_kyc_level: u8,
}
```

Only `authority` signs. Sets `rollup_active = false`, `investor_count = 0`.

#### `initialize_extra_account_meta_list`

Must be called after `initialize_registry` and before any minting.

Registers **4 extra accounts** Token-2022 will inject on every `transfer_checked`:

| Index | Account | Derivation |
|---|---|---|
| 0 | `investor_registry` PDA | seeds `["investor_registry", mint]` |
| 1 | `investor_entry` PDA | seeds `["investor_entry", registry, destination_owner]` |
| 2 | clock sysvar | hardcoded pubkey |
| 3 | zkMe SBT ATA | ATA of destination_owner for `zkme_credential_mint` |

> **Spec-defined seed:** `extra_account_meta_list` PDA seeds are always `["extra-account-metas", mint]`. Unchangeable.

For index 3, the zkMe SBT ATA is derived client-side as `getAssociatedTokenAddress(destination_owner, zkme_credential_mint, false, TOKEN_2022_PROGRAM_ID)` and passed as a remaining account when building transfer instructions. Register it using `ExtraAccountMeta::new_with_pubkey` resolved at instruction build time, or use the `ExtraAccountMeta` ATA program seed resolution pattern.

#### `transfer_hook`

Called by Token-2022 on every `transfer_checked`. **Read-only — no writes.**

Account order (positions 0–4 are Token-2022 spec, positions 5–8 are extra metas):

```rust
pub source_token: InterfaceAccount<'info, TokenAccount>,   // 0
pub mint: InterfaceAccount<'info, Mint>,                    // 1
pub destination_token: InterfaceAccount<'info, TokenAccount>, // 2
pub owner: SystemAccount<'info>,                            // 3
pub extra_account_meta_list: AccountInfo<'info>,            // 4
pub investor_registry: Account<'info, InvestorRegistry>,    // 5 — extra[0]
pub investor_entry: Account<'info, InvestorEntry>,          // 6 — extra[1]
pub clock: Sysvar<'info, Clock>,                            // 7 — extra[2]
pub zkme_sbt_account: AccountInfo<'info>,                   // 8 — extra[3]
```

**Logic (5 checks, in order):**

```rust
pub fn handler(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
    let registry = &ctx.accounts.investor_registry;
    let entry    = &ctx.accounts.investor_entry;
    let clock    = &ctx.accounts.clock;

    // 1. Whitelist check
    require!(
        entry.wallet == ctx.accounts.destination_token.owner,
        SukukError::NotWhitelisted
    );

    // 2. zkMe SBT check — destination must hold a valid zkMe credential
    {
        let sbt_data = ctx.accounts.zkme_sbt_account.try_borrow_data()?;
        require!(
            sbt_data.len() >= spl_token_2022::state::Account::LEN,
            SukukError::NoZkCredential
        );
        let sbt = spl_token_2022::state::Account::unpack(&sbt_data)?;
        require!(sbt.mint == registry.zkme_credential_mint, SukukError::InvalidCredentialMint);
        require!(sbt.owner == ctx.accounts.destination_token.owner, SukukError::CredentialOwnerMismatch);
        require!(sbt.amount >= 1, SukukError::NoZkCredential);
    }

    // 3. KYC expiry
    require!(clock.unix_timestamp < entry.kyc_expiry, SukukError::KycExpired);

    // 4. KYC level gate
    require!(entry.kyc_level >= registry.min_kyc_level, SukukError::InsufficientKycLevel);

    // 5. Lock period
    require!(clock.unix_timestamp >= registry.lock_until, SukukError::TransferLocked);

    emit!(TransferApproved {
        mint: ctx.accounts.mint.key(),
        from: ctx.accounts.source_token.owner,
        to: ctx.accounts.destination_token.owner,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
```

#### `add_investor(wallet, kyc_level, kyc_expiry, kyc_provider_hash)`

Signed by `kyc_oracle` (not `authority`). Creates `InvestorEntry` PDA.

- `kyc_provider_hash` = `SHA-256(zkMe appId + ":" + wallet.toBase58())`
- Default `kyc_expiry` = `clock.unix_timestamp + 365 * 24 * 3600`
- Increments `investor_registry.investor_count`

#### `remove_investor(wallet)`

Signed by `kyc_oracle` OR `authority`. Closes `InvestorEntry` PDA via `close = authority`.
Decrements `investor_count`. Called on AML freeze or SC regulatory order.

#### `renew_investor(new_kyc_expiry, new_kyc_provider_hash)`

Signed by `kyc_oracle`. Updates `kyc_expiry`, `kyc_provider_hash`, `approved_at` on existing `InvestorEntry`.

#### `update_lock_period(new_lock_until)`

Signed by `authority`. Updates `registry.lock_until`.

---

### Errors (`sukuk_hook`)

```rust
#[error_code]
pub enum SukukError {
    #[msg("Destination wallet is not on the investor whitelist")]
    NotWhitelisted,
    #[msg("Sukuk transfers are locked until the lock period expires")]
    TransferLocked,
    #[msg("Insufficient KYC level for this transfer")]
    InsufficientKycLevel,
    #[msg("KYC credential has expired — investor must re-verify")]
    KycExpired,
    #[msg("No valid zkMe credential SBT found on destination wallet")]
    NoZkCredential,
    #[msg("Credential SBT mint does not match registry zkMe program mint")]
    InvalidCredentialMint,
    #[msg("Credential SBT owner does not match destination token account owner")]
    CredentialOwnerMismatch,
    #[msg("Signer is not the registry authority")]
    UnauthorizedAuthority,
    #[msg("Rollup session is already active")]
    RollupAlreadyActive,
    #[msg("KYC expiry timestamp must be in the future")]
    InvalidExpiry,
}
```

### Events (`sukuk_hook`)

```rust
#[event] pub struct TransferApproved { pub mint: Pubkey, pub from: Pubkey, pub to: Pubkey, pub timestamp: i64 }
#[event] pub struct InvestorAdded    { pub registry: Pubkey, pub wallet: Pubkey, pub kyc_level: u8, pub kyc_expiry: i64 }
#[event] pub struct InvestorRemoved  { pub registry: Pubkey, pub wallet: Pubkey }
#[event] pub struct InvestorRenewed  { pub registry: Pubkey, pub wallet: Pubkey, pub new_expiry: i64 }
```

---

## Program 2: `sukuk_rollup` (ephemeral rollup)

### How MagicBlock delegation works

1. `delegate_accounts` — CPI to MagicBlock delegation program locks base-chain PDAs into the rollup
2. All writes to delegated accounts happen on the ephemeral validator: instant, feeless, sub-second
3. `commit_distribution` — finalises accrual state into a Merkle root PDA
4. `undelegate_and_settle` — commits state back to base Solana with a validity proof, returns ownership

**MagicBlock Delegation Program ID (devnet):** `DELeGGvXpWV2fqJuvC2quh6MuFWqeQMSvG62LVpELhP`

**Critical:** `InvestorRegistry` and `InvestorEntry` are **NEVER delegated**. Whitelist checks always run on base Solana. The rollup cannot bypass compliance.

Accounts delegated to rollup:

| Account | Why |
|---|---|
| `sukuk_vault` | Profit pool balance updated during accrual |
| `accrual_state` (per holder) | Updated every tick |
| `otc_order` PDAs | Created/matched/closed in rollup |
| `distribution_root` | Written at settlement |

### State accounts

#### `AccrualState`

```rust
#[account]
pub struct AccrualState {
    pub holder: Pubkey,                   // 32
    pub mint: Pubkey,                     // 32
    pub accrued_profit_usdc: u64,         // 8  — 6 decimals (USDC)
    pub last_tick: i64,                   // 8  — unix ts of last accrual update
    pub token_balance_snapshot: u64,      // 8  — sukuk token balance at last snapshot
    pub bump: u8,                         // 1
}
// seeds: ["accrual_state", mint, holder]
// space: 8 + 32 + 32 + 8 + 8 + 8 + 1 = 97
```

#### `OtcOrder`

```rust
#[account]
pub struct OtcOrder {
    pub owner: Pubkey,        // 32
    pub mint: Pubkey,         // 32
    pub side: OrderSide,      // 1  (Buy = 0, Sell = 1)
    pub amount: u64,          // 8  — token units
    pub price_usdc: u64,      // 8  — per token, 6 decimals
    pub expiry: i64,          // 8
    pub filled: bool,         // 1
    pub bump: u8,             // 1
}
// seeds: ["otc_order", mint, owner, nonce_as_le_bytes]
// space: 8 + 32 + 32 + 1 + 8 + 8 + 8 + 1 + 1 = 99

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum OrderSide { Buy = 0, Sell = 1 }
```

#### `DistributionRoot`

```rust
#[account]
pub struct DistributionRoot {
    pub mint: Pubkey,             // 32
    pub merkle_root: [u8; 32],    // 32
    pub total_profit_usdc: u64,   // 8
    pub period_start: i64,        // 8
    pub period_end: i64,          // 8
    pub holder_count: u64,        // 8
    pub committed: bool,           // 1
    pub bump: u8,                  // 1
}
// seeds: ["distribution_root", mint, period_start_as_le_bytes]
// space: 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 = 106
```

### Instructions

#### `delegate_accounts`

Signed by `authority`. Delegates `sukuk_vault` and any existing `accrual_state` PDAs to rollup.

Uses MagicBlock delegation CPI for each account:

```rust
magicblock_delegation::cpi::delegate(
    CpiContext::new(
        ctx.accounts.delegation_program.to_account_info(),
        magicblock_delegation::cpi::accounts::Delegate {
            payer: ctx.accounts.authority.to_account_info(),
            pda: ctx.accounts.sukuk_vault.to_account_info(),
            owner_program: ctx.program_id.to_account_info(),
            buffer: ctx.accounts.delegation_buffer.to_account_info(),
            delegation_record: ctx.accounts.delegation_record.to_account_info(),
            delegation_metadata: ctx.accounts.delegation_metadata.to_account_info(),
            delegation_program: ctx.accounts.delegation_program.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info(),
        },
    ),
    &[],
    vec![],
    i64::MAX,
)?;
```

Sets `investor_registry.rollup_active = true` and `session_start = clock.unix_timestamp`.

**Note:** `investor_registry` and all `investor_entry` PDAs are NOT delegated here. The rollup cannot modify whitelist state.

#### `initialize_accrual_state(holder: Pubkey)`

Creates `AccrualState` PDA inside the rollup session. Must be called after `delegate_accounts` and before any profit ticks for the holder.

Sets `last_tick = clock.unix_timestamp`, `accrued_profit_usdc = 0`, `token_balance_snapshot` from the holder's current sukuk token balance.

#### `accrue_profit(holders: Vec<Pubkey>)`

Core tick instruction — called by a crank service every 30 seconds inside the rollup.

```rust
// For each holder (up to 10 per instruction via remaining accounts):
let elapsed = clock.unix_timestamp - accrual_state.last_tick;
let daily_rate = (registry.profit_rate_bps as f64) / 10_000.0 / 365.0;
let period_profit = ((accrual_state.token_balance_snapshot as f64)
    * daily_rate
    * (elapsed as f64)
    / 86_400.0) as u64;

accrual_state.accrued_profit_usdc += period_profit;
accrual_state.last_tick = clock.unix_timestamp;
```

Zero base-chain fees — runs entirely on MagicBlock ephemeral validator.

#### `place_otc_order(side, amount, price_usdc, expiry)`

Creates `OtcOrder` PDA inside rollup. Validates:
- `order.owner` is present in `investor_registry` (query base Solana — registry is NOT delegated, so this is a cross-program read)
- `expiry > clock.unix_timestamp`
- `amount > 0`, `price_usdc > 0`

OTC orders are only accessible to whitelisted investors. The rollup cannot bypass this check because `investor_registry` is always on base Solana.

#### `match_otc_order(bid_order, ask_order)`

Matches a bid and ask inside the rollup. Records intent only — actual token transfer happens post-undelegate on base Solana via `transfer_checked` (enforcing TransferHook).

Validations:
- `bid.side == Buy && ask.side == Sell`
- `bid.price_usdc >= ask.price_usdc`
- `bid.mint == ask.mint`
- `!bid.filled && !ask.filled`
- Both `bid.owner` and `ask.owner` exist in `investor_registry`
- `clock.unix_timestamp < bid.expiry && clock.unix_timestamp < ask.expiry`

On success: set `bid.filled = true`, `ask.filled = true`. Emit `OtcMatched`.

#### `commit_distribution`

Builds Merkle root of all `AccrualState` accounts and writes to `DistributionRoot`.

```rust
// Each leaf: sha256(holder_pubkey_bytes || accrued_profit_usdc.to_le_bytes())
use rs_merkle::{MerkleTree, algorithms::Sha256};
use sha2::{Sha256 as Sha256Hasher, Digest};

let leaves: Vec<[u8; 32]> = accrual_states.iter().map(|a| {
    let mut hasher = Sha256Hasher::new();
    hasher.update(a.holder.as_ref());
    hasher.update(&a.accrued_profit_usdc.to_le_bytes());
    hasher.finalize().into()
}).collect();

let tree = MerkleTree::<Sha256>::from_leaves(&leaves);
let root = tree.root().expect("non-empty tree");
```

Sets `distribution_root.committed = true`. Called once per profit period before undelegating.

#### `undelegate_and_settle`

Calls MagicBlock `commit_accounts` then `undelegate` CPIs to write rollup state back to base Solana. After undelegation:
- `distribution_root` is available on base chain for Merkle claim
- Sets `investor_registry.rollup_active = false`
- `sukuk_vault` and `accrual_state` accounts return to base Solana ownership

### Errors (`sukuk_rollup`)

```rust
#[error_code]
pub enum RollupError {
    #[msg("Account is not delegated to the rollup")]
    AccountNotDelegated,
    #[msg("Order has expired")]
    OrderExpired,
    #[msg("Order is already filled")]
    OrderAlreadyFilled,
    #[msg("Bid price is below ask price")]
    PriceMismatch,
    #[msg("Both orders must be on opposite sides")]
    BothSidesMustBeOpposite,
    #[msg("Counterparty is not on the investor whitelist")]
    CounterpartyNotWhitelisted,
    #[msg("Distribution for this period has already been committed")]
    DistributionAlreadyCommitted,
    #[msg("No active rollup session")]
    RollupNotActive,
}
```

### Events (`sukuk_rollup`)

```rust
#[event] pub struct ProfitAccrued       { pub holder: Pubkey, pub amount_usdc: u64, pub timestamp: i64 }
#[event] pub struct OtcMatched          { pub bid_owner: Pubkey, pub ask_owner: Pubkey, pub amount: u64, pub price_usdc: u64, pub timestamp: i64 }
#[event] pub struct DistributionCommitted { pub mint: Pubkey, pub merkle_root: [u8; 32], pub total_usdc: u64, pub period_end: i64 }
#[event] pub struct RollupSettled        { pub mint: Pubkey, pub timestamp: i64 }
```

---

## zkMe zkKYC integration

### Prerequisites — zkMe dashboard setup

Before writing any code:

1. Register at https://dashboard.zk.me with a company email
2. Email `contact@zk.me` requesting:
   - Chain: Solana mainnet + devnet
   - Credentials: `zkKYC` (PoC + zkAML) and `zkOBS` (PAI for accredited tier)
   - Decentralization level: **On-chain Mint**
3. Create a Program in the dashboard. Note:
   - `appId` (also called `mchNo`)
   - `cooperator` address
   - `API_KEY`
   - `zkme_credential_mint` — the SBT mint pubkey on Solana (provided after On-chain Mint is enabled)

### zkMe credentials used

| Credential | Type | Maps to `kyc_level` |
|---|---|---|
| Proof-of-Citizenship (PoC) + zkAML | `zkKYC` | 1 (retail) |
| + Proof-of-Accredited-Investor (PAI) | `zkOBS` | 2 (accredited) |
| + institutional due diligence | `zkKYB` | 3 (institutional) |

### Frontend widget (`app/components/KycGate.tsx`)

```tsx
import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { ZkMeWidget, verifyKycWithZkMeServices, type Provider } from '@zkmelabs/widget'
import '@zkmelabs/widget/dist/style.css'

const APP_ID = process.env.NEXT_PUBLIC_ZKME_APP_ID!

export function KycGate({ onVerified }: { onVerified: () => void }) {
  const { publicKey } = useWallet()
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (!publicKey) return
    verifyKycWithZkMeServices(APP_ID, publicKey.toBase58()).then(ok => {
      if (ok) { setVerified(true); onVerified() }
    })
  }, [publicKey])

  async function launchWidget() {
    if (!publicKey) return

    const provider: Provider = {
      async getAccessToken() {
        // Always fetch from your backend — never expose API_KEY client-side
        const res = await fetch('/api/zkme/token', { method: 'POST' })
        return (await res.json()).accessToken
      },
      async getUserAccounts() {
        return [publicKey.toBase58()]
      },
    }

    const widget = new ZkMeWidget(APP_ID, 'Sukuk Platform', '501', provider, {
      lv: 'zkKYC',
      theme: 'auto',
      locale: 'en',
    })

    widget.on('kycFinished', async ({ isKYC }) => {
      if (isKYC) {
        await fetch('/api/zkme/kyc-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: publicKey.toBase58() }),
        })
        setVerified(true)
        onVerified()
        widget.destroy()
      }
    })

    widget.launch()
  }

  if (verified) return <p>Verified. You may access sukuk investments.</p>

  return (
    <div>
      <h2>Identity verification required</h2>
      <p>Complete a one-time KYC. Your personal data never leaves your device.</p>
      <button onClick={launchWidget} disabled={!publicKey}>Start verification</button>
    </div>
  )
}
```

### Backend: token exchange (`app/pages/api/zkme/token.ts`)

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const response = await fetch('https://nest.zk.me/zkme-dapp/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: process.env.ZKME_API_KEY,
      appId: process.env.ZKME_APP_ID,
      apiModePermission: 0,
      lv: 1,
    }),
  })
  const data = await response.json()
  if (!data.data?.accessToken) return res.status(500).json({ error: 'Token fetch failed' })
  res.json({ accessToken: data.data.accessToken })
}
```

### Backend: KYC complete handler (`app/pages/api/zkme/kyc-complete.ts`)

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { AnchorProvider, Program, BN, web3 } from '@coral-xyz/anchor'
import crypto from 'crypto'
import { IDL } from '../../../target/types/sukuk_hook'

const PROGRAM_ID = new PublicKey(process.env.SUKUK_HOOK_PROGRAM_ID!)
const oracle = Keypair.fromSecretKey(Buffer.from(process.env.KYC_ORACLE_SECRET_KEY!, 'base58'))

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { wallet } = req.body

  // 1. Verify via zkMe API server-side
  const token = await getAccessToken()
  const vRes = await fetch(
    `https://nest.zk.me/zkme-dapp/v2/user/verify?appId=${process.env.ZKME_APP_ID}&userAccount=${wallet}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const vData = await vRes.json()
  if (!vData.data?.isKYC) return res.status(400).json({ error: 'KYC not completed' })

  // 2. Determine kyc_level
  const kycLevel = vData.data.isPAI ? 2 : 1

  // 3. Set expiry (+1 year)
  const kycExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600

  // 4. Compute provider hash (no PII on-chain)
  const kycProviderHash = Array.from(
    crypto.createHash('sha256').update(`${process.env.ZKME_APP_ID}:${wallet}`).digest()
  )

  // 5. Derive PDAs
  const walletPk = new PublicKey(wallet)
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('investor_registry'), new PublicKey(process.env.SUKUK_MINT!).toBuffer()],
    PROGRAM_ID
  )
  const [entryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('investor_entry'), registryPda.toBuffer(), walletPk.toBuffer()],
    PROGRAM_ID
  )

  // 6. Submit add_investor on-chain
  const connection = new Connection(process.env.SOLANA_RPC_URL!, 'confirmed')
  const provider = new AnchorProvider(connection, {
    publicKey: oracle.publicKey,
    signTransaction: async (tx) => { tx.sign(oracle); return tx },
    signAllTransactions: async (txs) => txs.map(tx => { tx.sign(oracle); return tx }),
  }, { commitment: 'confirmed' })

  const program = new Program(IDL, provider)
  const sig = await program.methods
    .addInvestor(walletPk, kycLevel, new BN(kycExpiry), kycProviderHash)
    .accounts({ authority: oracle.publicKey, investorRegistry: registryPda, investorEntry: entryPda, systemProgram: web3.SystemProgram.programId })
    .signers([oracle])
    .rpc()

  res.json({ success: true, signature: sig })
}

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://nest.zk.me/zkme-dapp/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: process.env.ZKME_API_KEY, appId: process.env.ZKME_APP_ID, apiModePermission: 0, lv: 1 }),
  })
  return (await res.json()).data.accessToken
}
```

### Backend: SBT burn revocation webhook (`app/pages/api/webhooks/zkme-revocation.ts`)

```typescript
import type { NextApiRequest, NextApiResponse } from 'next'
// Import your removeInvestorOnChain helper here

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const transactions = req.body  // Helius enriched transaction array

  for (const tx of transactions) {
    for (const transfer of tx.tokenTransfers ?? []) {
      if (
        transfer.mint === process.env.ZKME_CREDENTIAL_MINT &&
        transfer.toUserAccount === '' &&        // burn = destination is empty
        transfer.tokenAmount > 0
      ) {
        const revokedWallet = transfer.fromUserAccount
        console.log(`Revoking: ${revokedWallet}`)
        await removeInvestorOnChain(revokedWallet)
      }
    }
  }

  res.status(200).end()
}
```

Configure Helius webhook:
- **URL:** `https://yourdomain.com/api/webhooks/zkme-revocation`
- **Transaction type:** `TOKEN_BURN`
- **Account filter:** `[process.env.ZKME_CREDENTIAL_MINT]`

---

## RPC switching pattern

```typescript
// Base Solana — for sukuk_hook instructions and token transfers
const baseRpc = 'https://devnet.helius-rpc.com?api-key=<key>'
const baseConnection = new Connection(baseRpc, 'confirmed')

// MagicBlock ephemeral validator — for sukuk_rollup instructions
const rollupRpc = 'https://devnet.magicblock.app'
const rollupConnection = new Connection(rollupRpc, 'confirmed')

// Build a provider for each
const baseProvider   = new AnchorProvider(baseConnection, wallet, {})
const rollupProvider = new AnchorProvider(rollupConnection, wallet, {})

// Use the correct provider per program call
const hookProgram   = new Program(HOOK_IDL,   baseProvider)
const rollupProgram = new Program(ROLLUP_IDL, rollupProvider)
```

Always switch connection before submitting instructions. Mixing RPCs causes account-not-found errors.

---

## Cargo.toml dependencies

### `programs/sukuk_hook/Cargo.toml`

```toml
[dependencies]
anchor-lang    = { version = "0.30.1", features = ["init-if-needed"] }
anchor-spl     = { version = "0.30.1", features = ["token_2022", "token_2022_extensions"] }
spl-token-2022 = { version = "3.0.4",  features = ["no-entrypoint"] }
spl-tlv-account-resolution  = "0.7.4"
spl-transfer-hook-interface = "0.7.4"
spl-type-length-value       = "0.4.4"
```

### `programs/sukuk_rollup/Cargo.toml`

```toml
[dependencies]
anchor-lang          = { version = "0.30.1", features = ["init-if-needed"] }
anchor-spl           = { version = "0.30.1", features = ["token_2022"] }
ephemeral-rollups-sdk = { version = "0.4.0" }
rs_merkle            = "1.4.2"
sha2                 = "0.10.8"
```

### `package.json`

```json
{
  "dependencies": {
    "@zkmelabs/widget": "latest",
    "@zkmelabs/verify-abi": "latest"
  },
  "devDependencies": {
    "@magicblock-labs/ephemeral-rollups-sdk": "^0.4.0",
    "@solana/spl-token": "^0.4.6",
    "@coral-xyz/anchor": "^0.30.1",
    "mocha": "^10.2.0",
    "ts-mocha": "^10.0.0",
    "typescript": "^5.3.0"
  }
}
```

---

## Anchor.toml

```toml
[features]
seeds = true
skip-lint = false

[programs.devnet]
sukuk_hook   = "HookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
sukuk_rollup = "RollXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet  = "~/.config/solana/id.json"

[scripts]
test = "yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
```

---

## Environment variables

### `.env` (backend / server-side only)

```env
# zkMe — NEVER expose to frontend
ZKME_API_KEY=your_api_key_from_dashboard
ZKME_APP_ID=your_mchno_from_dashboard
ZKME_CREDENTIAL_MINT=zkMe_SBT_mint_pubkey_on_solana

# Solana
SOLANA_RPC_URL=https://devnet.helius-rpc.com?api-key=<key>
MAGICBLOCK_RPC_URL=https://devnet.magicblock.app
SUKUK_HOOK_PROGRAM_ID=HookXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SUKUK_ROLLUP_PROGRAM_ID=RollXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SUKUK_MINT=SukukMintPubkeyXXXXXXXXXXXXXXXXXXXXXXXXXX

# Oracle keypair — base58 secret key, never commit
KYC_ORACLE_SECRET_KEY=your_oracle_keypair_base58

# Helius
HELIUS_API_KEY=your_helius_api_key
```

### `.env.local` (frontend only)

```env
NEXT_PUBLIC_ZKME_APP_ID=your_mchno_from_dashboard
```

---

## Test suite

### `01_mint_setup.ts`
- Creates Token-2022 mint with all 4 extensions in correct order
- Verifies each extension is present via `getMint`
- Verifies metadata fields (name, symbol, tenor, profit_rate_bps, shariah_advisor_hash)

### `02_registry_init.ts`
- Calls `initialize_registry` with `kyc_oracle`, `zkme_credential_mint`, `lock_until`, `profit_rate_bps`, `min_kyc_level`
- Calls `initialize_extra_account_meta_list` (registers 4 extra metas including zkMe SBT ATA)
- Verifies registry PDA fields

### `03_whitelist.ts`
- Adds 3 investor wallets with `kyc_level` 1, 2, 3 and different expiries
- Verifies `InvestorEntry` PDAs have correct `kyc_expiry` and `kyc_provider_hash`
- Removes one investor; verifies PDA closed and count decremented
- Renews one investor; verifies updated expiry

### `04_transfer_hook.ts`
- **Pass:** whitelisted + valid SBT + not expired + level OK + past lock → succeeds
- **Fail:** non-whitelisted wallet → `NotWhitelisted`
- **Fail:** no SBT (account empty) → `NoZkCredential`
- **Fail:** SBT amount = 0 (burned) → `NoZkCredential`
- **Fail:** wrong SBT mint → `InvalidCredentialMint`
- **Fail:** expired `kyc_expiry` → `KycExpired`
- **Fail:** `kyc_level` below `min_kyc_level` → `InsufficientKycLevel`
- **Fail:** transfer during lock period → `TransferLocked`

### `05_zkme_kyc.ts`
- Mints a mock zkMe SBT to investor ATA (simulating zkMe On-chain Mint)
- Calls `add_investor` with correct `kyc_provider_hash`
- Verifies transfer to that investor succeeds
- Burns the mock SBT; verifies transfer now fails with `NoZkCredential`
- Calls `renew_investor`; verifies updated expiry and re-fetch

### `06_delegation.ts`
- Calls `delegate_accounts` — verifies delegation records created
- Verifies `investor_registry.rollup_active = true`
- Confirms `investor_registry` and `investor_entry` are NOT delegated (reads still work from base Solana)

### `07_profit_accrual.ts`
- Switches to rollup RPC (`https://devnet.magicblock.app`)
- Initialises `AccrualState` for 3 holders
- Calls `accrue_profit` 3× with time advancement (manipulate Clock sysvar in test)
- Verifies `accrued_profit_usdc` increases proportionally to token balance and elapsed time

### `08_otc_matching.ts`
- Places sell order (whitelisted seller)
- Places buy order (whitelisted buyer) at matching price → `match_otc_order` succeeds
- Both orders marked `filled = true`, `OtcMatched` event emitted
- Attempt match with non-whitelisted counterparty → fails `CounterpartyNotWhitelisted`
- Attempt match with price mismatch → fails `PriceMismatch`
- Attempt match with expired order → fails `OrderExpired`

### `09_settle_and_commit.ts`
- Calls `commit_distribution` → verifies `DistributionRoot` written with correct Merkle root and `committed = true`
- Calls `undelegate_and_settle` → switches back to base RPC
- Verifies `distribution_root` now exists on base Solana
- Verifies `investor_registry.rollup_active = false`
- Verifies `sukuk_vault` account no longer delegated

---

## Critical implementation notes

1. **Token-2022 extension order is enforced.** Always: TransferHook → MetadataPointer → PermanentDelegate → InterestBearingMint. Any other order causes a silent runtime error.

2. **`extra_account_meta_list` PDA seed is spec-defined.** Seeds must be exactly `["extra-account-metas", mint]`. Unchangeable.

3. **`transfer_hook` account list must match execute interface exactly.** First 5 accounts are positional. Extra accounts must follow in the exact order registered in `initialize_extra_account_meta_list`.

4. **No writes in `transfer_hook`.** Hook is read-only. Writing to accounts causes undefined behaviour with Token-2022's CPI flow.

5. **Mint → `initialize_extra_account_meta_list` → then mint tokens.** The hook must be registered before any token accounts or minting.

6. **Use `InterfaceAccount` not `Account` for Token-2022 mints and token accounts.** Legacy `Account<'info, Mint>` does not handle Token-2022 extension data.

7. **Never delegate `InvestorRegistry` or `InvestorEntry`.** These are the compliance firewall. Delegating them would allow the rollup to bypass TransferHook whitelist checks.

8. **Rollup RPC for rollup instructions, base RPC for base instructions.** Mixing causes account-not-found errors. Always switch `Connection` before submitting.

9. **`commit_distribution` before `undelegate`.** Undelegating without committing loses in-rollup accrual state permanently.

10. **`accrual_state` PDAs must be initialised inside the rollup session.** Create them after `delegate_accounts`, not before.

11. **OTC matched trades require base-chain token transfers post-undelegate.** `match_otc_order` records intent only. The actual `transfer_checked` (which fires TransferHook) happens after `undelegate_and_settle`.

12. **`zkme_credential_mint` must be set in `InvestorRegistry` before any investor is added.** The `transfer_hook` reads it from the registry — if it's zero/unset, all SBT checks will fail.

13. **`kyc_oracle` key must never have authority over the vault or mint.** Compromise of the oracle allows whitelist manipulation but cannot drain funds or force-burn tokens.

14. **SBT burn = automatic revocation.** When zkMe burns an investor's SBT (AML hit), the next `transfer_checked` to that wallet fails at check 2 with `NoZkCredential`. The Helius burn webhook and `remove_investor` call is optional but recommended to clean up the `InvestorEntry` PDA and block rollup OTC access too.

---

## Deliverables

- [ ] `sukuk_hook` program — all 8 instructions, compiles with `anchor build`
- [ ] `sukuk_rollup` program — all 8 instructions, compiles with `anchor build`
- [ ] All state accounts with correct seeds and space calculations
- [ ] All errors and events in both programs
- [ ] Frontend `KycGate.tsx` component with `@zkmelabs/widget`
- [ ] Backend API routes: `/api/zkme/token`, `/api/zkme/kyc-complete`, `/api/webhooks/zkme-revocation`
- [ ] Full 9-file TypeScript test suite passing with `anchor test`
- [ ] `README.md` with setup order, deploy instructions, zkMe onboarding steps, and RPC switching guide