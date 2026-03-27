use anchor_lang::prelude::*;
use crate::{errors::SukukError, state::{InvestorEntry, InvestorRegistry}};

#[event]
pub struct InvestorAdded {
    pub registry:   Pubkey,
    pub wallet:     Pubkey,
    pub kyc_level:  u8,
    pub kyc_expiry: i64,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct AddInvestor<'info> {
    #[account(mut)]
    pub kyc_oracle: Signer<'info>,

    /// CHECK: sukuk token mint
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"investor_registry", mint.key().as_ref()],
        bump = investor_registry.bump,
        has_one = kyc_oracle,
    )]
    pub investor_registry: Account<'info, InvestorRegistry>,

    #[account(
        init,
        payer = kyc_oracle,
        space = InvestorEntry::LEN,
        seeds = [b"investor_entry", investor_registry.key().as_ref(), wallet.as_ref()],
        bump,
    )]
    pub investor_entry: Account<'info, InvestorEntry>,

    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handler(
    ctx: Context<AddInvestor>,
    wallet: Pubkey,
    kyc_level: u8,
    kyc_expiry: i64,
    kyc_provider_hash: [u8; 32],
) -> Result<()> {
    let clock = &ctx.accounts.clock;
    require!(kyc_expiry > clock.unix_timestamp, SukukError::InvalidExpiry);

    let entry = &mut ctx.accounts.investor_entry;
    entry.wallet            = wallet;
    entry.approved_at       = clock.unix_timestamp;
    entry.kyc_level         = kyc_level;
    entry.kyc_expiry        = kyc_expiry;
    entry.kyc_provider_hash = kyc_provider_hash;
    entry.bump              = ctx.bumps.investor_entry;

    let registry = &mut ctx.accounts.investor_registry;
    registry.investor_count += 1;

    emit!(InvestorAdded {
        registry:   registry.key(),
        wallet,
        kyc_level,
        kyc_expiry,
    });

    Ok(())
}
