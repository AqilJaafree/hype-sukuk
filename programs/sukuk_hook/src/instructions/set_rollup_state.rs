use anchor_lang::prelude::*;
use crate::state::InvestorRegistry;

/// Called via CPI by sukuk_rollup to update rollup lifecycle state on the
/// InvestorRegistry. Only the authority may trigger this (enforced by the
/// signer check on the CPI call site).
#[derive(Accounts)]
pub struct SetRollupState<'info> {
    /// The issuer authority — must sign.
    pub authority: Signer<'info>,

    /// CHECK: sukuk token mint — used to derive the registry PDA seed.
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"investor_registry", mint.key().as_ref()],
        bump = investor_registry.bump,
        has_one = authority,
    )]
    pub investor_registry: Account<'info, InvestorRegistry>,
}

pub fn handler(
    ctx: Context<SetRollupState>,
    rollup_active: bool,
    session_start: i64,
) -> Result<()> {
    let registry = &mut ctx.accounts.investor_registry;
    registry.rollup_active = rollup_active;
    registry.session_start = session_start;
    Ok(())
}
