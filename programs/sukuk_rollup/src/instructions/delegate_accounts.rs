use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::state::cross_program::{read_investor_registry, write_investor_registry, InvestorRegistry};
use crate::errors::RollupError;

/// Delegates the sukuk_vault to the MagicBlock ephemeral rollup.
/// Must be called on base Solana by the authority before any rollup operations.
///
/// InvestorRegistry and InvestorEntry are intentionally NOT delegated —
/// whitelist checks always run on base Solana regardless of rollup state.
pub fn handler(ctx: Context<DelegateSukukVault>) -> Result<()> {
    // Read current registry state — verify rollup is not already active.
    let mut registry: InvestorRegistry =
        read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(!registry.rollup_active, RollupError::RollupAlreadyActive);

    // Delegate the sukuk_vault PDA to the ephemeral rollup.
    ctx.accounts.delegate_sukuk_vault(
        &ctx.accounts.authority,
        &[b"sukuk_vault", ctx.accounts.mint.key().as_ref()],
        DelegateConfig::default(),
    )?;

    // Write rollup_active = true back to the base-chain InvestorRegistry.
    // This account is NOT delegated — the write stays on base Solana.
    registry.rollup_active = true;
    registry.session_start = Clock::get()?.unix_timestamp;
    write_investor_registry(&ctx.accounts.investor_registry, &registry)?;

    Ok(())
}

/// `#[delegate]` injects the MagicBlock delegation program accounts automatically.
/// The account marked `del` is the one being delegated.
#[delegate]
#[derive(Accounts)]
pub struct DelegateSukukVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: sukuk_vault PDA being delegated to the rollup.
    /// Must use AccountInfo (not Account<>) with the `del` constraint — SDK requirement.
    #[account(
        mut, del,
        seeds = [b"sukuk_vault", mint.key().as_ref()],
        bump
    )]
    pub sukuk_vault: AccountInfo<'info>,

    /// CHECK: The sukuk token mint. Used to derive PDA seeds.
    pub mint: AccountInfo<'info>,

    /// CHECK: InvestorRegistry from sukuk_hook — read + written directly.
    /// Not delegated; stays on base Solana for compliance.
    #[account(mut)]
    pub investor_registry: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
