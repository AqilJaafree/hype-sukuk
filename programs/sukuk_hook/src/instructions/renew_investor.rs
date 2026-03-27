use anchor_lang::prelude::*;
use crate::{errors::SukukError, state::{InvestorEntry, InvestorRegistry}};

#[event]
pub struct InvestorRenewed {
    pub registry:   Pubkey,
    pub wallet:     Pubkey,
    pub new_expiry: i64,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct RenewInvestor<'info> {
    pub kyc_oracle: Signer<'info>,

    /// CHECK: sukuk token mint
    pub mint: UncheckedAccount<'info>,

    #[account(
        seeds = [b"investor_registry", mint.key().as_ref()],
        bump = investor_registry.bump,
        has_one = kyc_oracle,
    )]
    pub investor_registry: Account<'info, InvestorRegistry>,

    #[account(
        mut,
        seeds = [
            b"investor_entry",
            investor_registry.key().as_ref(),
            wallet.as_ref(),
        ],
        bump = investor_entry.bump,
    )]
    pub investor_entry: Account<'info, InvestorEntry>,

    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(
    ctx: Context<RenewInvestor>,
    _wallet: Pubkey,
    new_kyc_expiry: i64,
    new_kyc_provider_hash: [u8; 32],
) -> Result<()> {
    let clock = &ctx.accounts.clock;
    require!(new_kyc_expiry > clock.unix_timestamp, SukukError::InvalidExpiry);

    let entry = &mut ctx.accounts.investor_entry;
    entry.kyc_expiry        = new_kyc_expiry;
    entry.kyc_provider_hash = new_kyc_provider_hash;
    entry.approved_at       = clock.unix_timestamp;

    emit!(InvestorRenewed {
        registry:   ctx.accounts.investor_registry.key(),
        wallet:     entry.wallet,
        new_expiry: new_kyc_expiry,
    });

    Ok(())
}
