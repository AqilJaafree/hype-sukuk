use anchor_lang::prelude::*;
use crate::state::SukukVault;

/// Creates the sukuk_vault PDA on base Solana.
/// Must be called once before delegate_sukuk_vault.
/// Following the example pattern: init account first, delegate second.
pub fn handler(ctx: Context<InitializeSukukVault>) -> Result<()> {
    let vault = &mut ctx.accounts.sukuk_vault;
    vault.mint      = ctx.accounts.mint.key();
    vault.authority = ctx.accounts.authority.key();
    vault.usdc_balance = 0;
    vault.bump      = ctx.bumps.sukuk_vault;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeSukukVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: The sukuk token mint. Used to derive PDA seeds.
    pub mint: AccountInfo<'info>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + SukukVault::LEN,
        seeds = [b"sukuk_vault", mint.key().as_ref()],
        bump
    )]
    pub sukuk_vault: Account<'info, SukukVault>,

    pub system_program: Program<'info, System>,
}
