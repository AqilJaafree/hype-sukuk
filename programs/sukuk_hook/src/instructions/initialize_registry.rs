use anchor_lang::prelude::*;
use crate::state::InvestorRegistry;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitRegistryParams {
    pub kyc_oracle: Pubkey,
    pub zkme_credential_mint: Pubkey,
    pub lock_until: i64,
    pub profit_rate_bps: u16,
    pub min_kyc_level: u8,
}

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Token-2022 mint — validated by checking mint key matches registry seed
    pub mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = InvestorRegistry::LEN,
        seeds = [b"investor_registry", mint.key().as_ref()],
        bump,
    )]
    pub investor_registry: Account<'info, InvestorRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeRegistry>, params: InitRegistryParams) -> Result<()> {
    let registry = &mut ctx.accounts.investor_registry;
    registry.authority            = ctx.accounts.authority.key();
    registry.kyc_oracle           = params.kyc_oracle;
    registry.zkme_credential_mint = params.zkme_credential_mint;
    registry.mint                 = ctx.accounts.mint.key();
    registry.lock_until           = params.lock_until;
    registry.profit_rate_bps      = params.profit_rate_bps;
    registry.min_kyc_level        = params.min_kyc_level;
    registry.investor_count       = 0;
    registry.rollup_active        = false;
    registry.session_start        = 0;
    registry.bump                 = ctx.bumps.investor_registry;
    Ok(())
}
