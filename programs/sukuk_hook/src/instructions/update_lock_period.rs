use anchor_lang::prelude::*;
use crate::{errors::SukukError, state::InvestorRegistry};

#[derive(Accounts)]
pub struct UpdateLockPeriod<'info> {
    pub authority: Signer<'info>,

    /// CHECK: sukuk token mint
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"investor_registry", mint.key().as_ref()],
        bump = investor_registry.bump,
        has_one = authority,
    )]
    pub investor_registry: Account<'info, InvestorRegistry>,
}

pub fn handler(ctx: Context<UpdateLockPeriod>, new_lock_until: i64) -> Result<()> {
    require!(
        ctx.accounts.authority.key() == ctx.accounts.investor_registry.authority,
        SukukError::UnauthorizedAuthority
    );
    ctx.accounts.investor_registry.lock_until = new_lock_until;
    Ok(())
}
