use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateConfig;

use crate::state::cross_program::{read_investor_registry, InvestorRegistry};
use crate::errors::RollupError;

/// Delegates the sukuk_vault to the MagicBlock ephemeral rollup.
/// Must be called on base Solana by the authority before any rollup operations.
///
/// InvestorRegistry and InvestorEntry are intentionally NOT delegated —
/// whitelist checks always run on base Solana regardless of rollup state.
pub fn handler(ctx: Context<DelegateSukukVault>) -> Result<()> {
    // Read current registry state — verify rollup is not already active.
    let registry: InvestorRegistry =
        read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(!registry.rollup_active, RollupError::RollupAlreadyActive);

    // Delegate the sukuk_vault PDA to the ephemeral rollup.
    // Pass explicit validator so the TEE routes to the correct private ER.
    let validator = ctx.accounts.validator.as_ref().map(|v| v.key());
    ctx.accounts.delegate_sukuk_vault(
        &ctx.accounts.authority,
        &[b"sukuk_vault", ctx.accounts.mint.key().as_ref()],
        DelegateConfig {
            validator,
            ..Default::default()
        },
    )?;

    // Update rollup_active = true on the InvestorRegistry via CPI.
    // sukuk_hook owns that account — only it can write to it.
    let session_start = Clock::get()?.unix_timestamp;
    sukuk_hook::cpi::set_rollup_state(
        CpiContext::new(
            ctx.accounts.sukuk_hook_program.to_account_info(),
            sukuk_hook::cpi::accounts::SetRollupState {
                authority:         ctx.accounts.authority.to_account_info(),
                mint:              ctx.accounts.mint.to_account_info(),
                investor_registry: ctx.accounts.investor_registry.to_account_info(),
            },
        ),
        true,
        session_start,
    )?;

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

    /// CHECK: InvestorRegistry from sukuk_hook — read via CPI, not written directly.
    /// Not delegated; stays on base Solana for compliance.
    #[account(mut)]
    pub investor_registry: AccountInfo<'info>,

    /// CHECK: Optional TEE validator pubkey. Passed to DelegateConfig so the SDK
    /// routes the delegation to the correct private ephemeral rollup.
    pub validator: Option<AccountInfo<'info>>,

    /// sukuk_hook program — required for the set_rollup_state CPI.
    pub sukuk_hook_program: Program<'info, sukuk_hook::program::SukukHook>,

    pub system_program: Program<'info, System>,
}
