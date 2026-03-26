use anchor_lang::prelude::*;
use anchor_spl::token_interface::{TokenAccount, TokenInterface};

use crate::state::{AccrualState, cross_program::read_investor_registry};
use crate::errors::RollupError;

/// Creates an AccrualState PDA for a holder inside the rollup session.
/// Submit to the MagicBlock ephemeral rollup RPC (not base Solana).
/// The account is created on the ER and committed to base Solana on settlement.
pub fn handler(ctx: Context<InitializeAccrualState>, holder: Pubkey) -> Result<()> {
    let registry = read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(registry.rollup_active, RollupError::RollupNotActive);

    let accrual = &mut ctx.accounts.accrual_state;
    accrual.holder = holder;
    accrual.mint = ctx.accounts.mint.key();
    accrual.accrued_profit_usdc = 0;
    accrual.last_tick = Clock::get()?.unix_timestamp;
    // Snapshot the holder's current sukuk token balance
    accrual.token_balance_snapshot = ctx.accounts.holder_token_account.amount;
    accrual.bump = ctx.bumps.accrual_state;

    Ok(())
}

#[derive(Accounts)]
#[instruction(holder: Pubkey)]
pub struct InitializeAccrualState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = AccrualState::LEN,
        seeds = [b"accrual_state", mint.key().as_ref(), holder.as_ref()],
        bump
    )]
    pub accrual_state: Account<'info, AccrualState>,

    /// CHECK: The sukuk token mint.
    pub mint: AccountInfo<'info>,

    /// The holder's sukuk token account — read for initial balance snapshot.
    #[account(
        token::mint = mint,
        token::authority = holder,
        token::token_program = token_program,
    )]
    pub holder_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: InvestorRegistry from sukuk_hook — read-only.
    pub investor_registry: AccountInfo<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
