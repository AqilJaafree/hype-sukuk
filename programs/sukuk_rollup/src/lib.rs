use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::ephemeral;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

// Placeholder ID — replaced by real keypair after `anchor build`
declare_id!("B6KV6L7ZUC4mNf8P6ccudTneJqrE4Zsf7qQc2yzToqpt");

// IMPORTANT: #[ephemeral] must come BEFORE #[program].
// It registers this program with the MagicBlock SDK so the ER runtime
// recognises it as an ephemeral-rollup-aware program.
#[ephemeral]
#[program]
pub mod sukuk_rollup {
    use super::*;

    // ── Base-chain instructions (send to Helius / base Solana RPC) ────────────

    /// Delegates the sukuk_vault PDA to the MagicBlock ephemeral rollup.
    /// Call once, from base Solana, before starting a rollup session.
    pub fn delegate_sukuk_vault(ctx: Context<DelegateSukukVault>) -> Result<()> {
        delegate_accounts::handler(ctx)
    }

    // ── Ephemeral rollup instructions (send to MagicBlock devnet RPC) ─────────

    /// Creates an AccrualState for a new holder inside the rollup session.
    pub fn initialize_accrual_state(
        ctx: Context<InitializeAccrualState>,
        holder: Pubkey,
    ) -> Result<()> {
        initialize_accrual_state::handler(ctx, holder)
    }

    /// Schedules a native rollup crank that calls accrue_profit every N ms.
    /// No external server needed — MagicBlock's scheduler handles timing.
    pub fn schedule_profit_crank(
        ctx: Context<ScheduleProfitCrank>,
        args: ScheduleCrankArgs,
    ) -> Result<()> {
        schedule_profit_crank::handler(ctx, args)
    }

    /// Accrues profit for up to 10 holders (passed as remaining_accounts).
    /// Called automatically by the native rollup crank.
    pub fn accrue_profit<'info>(
        ctx: Context<'_, '_, '_, 'info, AccrueProfit<'info>>,
    ) -> Result<()> {
        accrue_profit::handler(ctx)
    }

    /// Places a Buy or Sell OTC order for whitelisted investors.
    pub fn place_otc_order(
        ctx: Context<PlaceOtcOrder>,
        args: PlaceOtcOrderArgs,
    ) -> Result<()> {
        place_otc_order::handler(ctx, args)
    }

    /// Matches a bid and ask OTC order. Records intent; actual transfer is
    /// executed post-settlement via transfer_checked on base Solana.
    pub fn match_otc_order(ctx: Context<MatchOtcOrder>) -> Result<()> {
        match_otc_order::handler(ctx)
    }

    /// Finalises accruals into a Merkle root. Must be called before undelegating.
    pub fn commit_distribution<'info>(
        ctx: Context<'_, '_, '_, 'info, CommitDistribution<'info>>,
        args: CommitDistributionArgs,
    ) -> Result<()> {
        commit_distribution::handler(ctx, args)
    }

    /// Commits all rollup state to base Solana and undelegates all accounts.
    /// Pass all AccrualState accounts as remaining_accounts.
    pub fn undelegate_and_settle<'info>(
        ctx: Context<'_, '_, '_, 'info, UndelegateAndSettle<'info>>,
    ) -> Result<()> {
        undelegate_and_settle::handler(ctx)
    }

    // ── Post-settlement base-chain instructions ────────────────────────────────

    /// Verifies a Merkle proof against the committed DistributionRoot and
    /// transfers the holder's accrued USDC profit from the vault.
    /// Call on base Solana after undelegate_and_settle.
    pub fn claim_profit(ctx: Context<ClaimProfit>, args: ClaimProfitArgs) -> Result<()> {
        claim_profit::handler(ctx, args)
    }
}
