use anchor_lang::prelude::*;
use crate::state::{InvestorEntry, InvestorRegistry};

#[event]
pub struct InvestorRemoved {
    pub registry: Pubkey,
    pub wallet:   Pubkey,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RemoveInvestor<'info> {
    /// CHECK: may be authority or kyc_oracle — validated in handler
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: sukuk token mint
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"investor_registry", mint.key().as_ref()],
        bump = investor_registry.bump,
    )]
    pub investor_registry: Account<'info, InvestorRegistry>,

    #[account(
        mut,
        close = signer,
        seeds = [
            b"investor_entry",
            investor_registry.key().as_ref(),
            wallet.as_ref(),
        ],
        bump = investor_entry.bump,
    )]
    pub investor_entry: Account<'info, InvestorEntry>,
}

pub fn handler(ctx: Context<RemoveInvestor>, _wallet: Pubkey) -> Result<()> {
    let registry = &ctx.accounts.investor_registry;
    let signer_key = ctx.accounts.signer.key();
    require!(
        signer_key == registry.authority || signer_key == registry.kyc_oracle,
        crate::errors::SukukError::UnauthorizedAuthority
    );

    let registry = &mut ctx.accounts.investor_registry;
    registry.investor_count = registry.investor_count.saturating_sub(1);

    emit!(InvestorRemoved {
        registry: registry.key(),
        wallet:   ctx.accounts.investor_entry.wallet,
    });

    Ok(())
}
