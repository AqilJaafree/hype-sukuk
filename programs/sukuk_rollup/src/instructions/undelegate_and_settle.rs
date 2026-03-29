use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::commit;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;

use crate::state::{SukukVault, DistributionRoot, cross_program::read_investor_registry};
use crate::errors::RollupError;

/// Commits rollup state back to base Solana and undelegates all accounts.
/// Must be called on the MagicBlock ephemeral rollup RPC.
/// After this, distribution_root is on base Solana and claimable.
///
/// MUST call commit_distribution before this — undelegating without a committed
/// distribution root is permanent data loss for accrued profits.
///
/// Pass all AccrualState accounts to commit as remaining_accounts.
pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, UndelegateAndSettle<'info>>,
) -> Result<()> {
    let registry = read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(registry.rollup_active, RollupError::RollupNotActive);
    require!(ctx.accounts.distribution_root.committed, RollupError::DistributionAlreadyCommitted);

    // Store AccountInfos locally so we can take references into the Vec.
    let vault_info = ctx.accounts.sukuk_vault.to_account_info();
    let dist_info  = ctx.accounts.distribution_root.to_account_info();

    let mut account_refs: Vec<&AccountInfo<'info>> = vec![&vault_info, &dist_info];
    for accrual_info in ctx.remaining_accounts.iter() {
        account_refs.push(accrual_info);
    }

    // Commit all accounts back to base Solana and release delegation in one call.
    commit_and_undelegate_accounts(
        &ctx.accounts.authority,
        account_refs,
        &ctx.accounts.magic_context,
        &ctx.accounts.magic_program,
    )?;

    // Update rollup_active = false via CPI to sukuk_hook.
    // InvestorRegistry is owned by sukuk_hook — only it can write to it.
    sukuk_hook::cpi::set_rollup_state(
        CpiContext::new(
            ctx.accounts.sukuk_hook_program.to_account_info(),
            sukuk_hook::cpi::accounts::SetRollupState {
                authority:         ctx.accounts.authority.to_account_info(),
                mint:              ctx.accounts.mint.to_account_info(),
                investor_registry: ctx.accounts.investor_registry.to_account_info(),
            },
        ),
        false,
        0,
    )?;

    emit!(RollupSettled {
        mint: ctx.accounts.sukuk_vault.mint,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// `#[commit]` injects magic_context and magic_program accounts automatically.
#[commit]
#[derive(Accounts)]
pub struct UndelegateAndSettle<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"sukuk_vault", sukuk_vault.mint.as_ref()],
        bump = sukuk_vault.bump
    )]
    pub sukuk_vault: Account<'info, SukukVault>,

    /// The distribution root committed via commit_distribution.
    #[account(
        mut,
        constraint = distribution_root.committed
    )]
    pub distribution_root: Account<'info, DistributionRoot>,

    /// CHECK: sukuk token mint — needed for set_rollup_state CPI seed derivation.
    pub mint: AccountInfo<'info>,

    /// CHECK: InvestorRegistry — mutable for rollup_active = false CPI.
    #[account(mut)]
    pub investor_registry: AccountInfo<'info>,

    /// sukuk_hook program — required for the set_rollup_state CPI.
    pub sukuk_hook_program: Program<'info, sukuk_hook::program::SukukHook>,

    // AccrualState accounts passed as remaining_accounts
}

#[event]
pub struct RollupSettled {
    pub mint: Pubkey,
    pub timestamp: i64,
}
