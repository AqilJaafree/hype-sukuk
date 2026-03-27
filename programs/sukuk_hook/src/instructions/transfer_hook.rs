use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_pack::Pack;
use anchor_lang::AccountDeserialize;
use anchor_spl::token_interface::{Mint, TokenAccount};

use crate::{errors::SukukError, state::{InvestorEntry, InvestorRegistry}};

#[event]
pub struct TransferApproved {
    pub mint:      Pubkey,
    pub from:      Pubkey,
    pub to:        Pubkey,
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct TransferHook<'info> {
    // Positions 0–4 are fixed by the Token-2022 transfer hook interface
    #[account(token::mint = mint, token::authority = owner)]
    pub source_token: InterfaceAccount<'info, TokenAccount>,     // 0

    pub mint: InterfaceAccount<'info, Mint>,                     // 1

    #[account(token::mint = mint)]
    pub destination_token: InterfaceAccount<'info, TokenAccount>, // 2

    /// CHECK: source owner — passed by Token-2022
    pub owner: UncheckedAccount<'info>,                          // 3

    /// CHECK: extra_account_meta_list PDA
    #[account(
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,        // 4

    // Extra accounts (positions 5–10, registered in extra_account_meta_list)
    #[account(
        seeds = [b"investor_registry", mint.key().as_ref()],
        bump = investor_registry.bump,
    )]
    pub investor_registry: Account<'info, InvestorRegistry>,     // 5

    #[account(
        seeds = [
            b"investor_entry",
            investor_registry.key().as_ref(),
            destination_token.owner.as_ref(),
        ],
        bump = investor_entry.bump,
    )]
    pub investor_entry: Account<'info, InvestorEntry>,           // 6

    pub clock: Sysvar<'info, Clock>,                             // 7

    /// CHECK: Token-2022 program — used only as seed component
    pub token_2022_program: UncheckedAccount<'info>,             // 8

    /// CHECK: Associated Token Program — used only as seed component
    pub associated_token_program: UncheckedAccount<'info>,       // 9

    /// CHECK: zkMe SBT associated token account for destination wallet
    pub zkme_sbt_account: UncheckedAccount<'info>,               // 10
}

/// Raw handler invoked from the fallback function when Token-2022 calls the
/// hook using the SPL transfer-hook-interface execute discriminator.
/// Accounts must match the positions registered in extra_account_meta_list:
///   [0] source_token, [1] mint, [2] destination_token, [3] owner,
///   [4] extra_account_meta_list, [5] investor_registry, [6] investor_entry,
///   [7] clock, [8] token_2022_program, [9] ata_program, [10] zkme_sbt_account
pub fn process_raw<'info>(accounts: &'info [AccountInfo<'info>], _amount: u64) -> Result<()> {
    if accounts.len() < 11 {
        return Err(anchor_lang::error::Error::from(
            anchor_lang::solana_program::program_error::ProgramError::NotEnoughAccountKeys,
        ));
    }

    let destination_token_info = &accounts[2];
    let investor_registry_info = &accounts[5];
    let investor_entry_info    = &accounts[6];
    let clock_info             = &accounts[7];
    let zkme_sbt_info          = &accounts[10];

    // Deserialize InvestorRegistry
    let registry = {
        let data = investor_registry_info.try_borrow_data()?;
        InvestorRegistry::try_deserialize(&mut &data[..])?
    };

    // Deserialize InvestorEntry
    let entry = {
        let data = investor_entry_info.try_borrow_data()?;
        InvestorEntry::try_deserialize(&mut &data[..])?
    };

    // Clock
    let clock = Clock::from_account_info(clock_info)?;

    // Destination owner (byte 32..64 of a Token-2022 account)
    let destination_owner = {
        let data = destination_token_info.try_borrow_data()?;
        require!(
            data.len() >= spl_token_2022::state::Account::LEN,
            SukukError::NotWhitelisted
        );
        let tok = spl_token_2022::state::Account::unpack(
            &data[..spl_token_2022::state::Account::LEN],
        )?;
        tok.owner
    };

    // 1. Whitelist
    require!(entry.wallet == destination_owner, SukukError::NotWhitelisted);

    // 2. zkMe SBT
    {
        let sbt_data = zkme_sbt_info.try_borrow_data()?;
        require!(
            sbt_data.len() >= spl_token_2022::state::Account::LEN,
            SukukError::NoZkCredential
        );
        let sbt = spl_token_2022::state::Account::unpack(
            &sbt_data[..spl_token_2022::state::Account::LEN],
        )?;
        require!(sbt.mint == registry.zkme_credential_mint, SukukError::InvalidCredentialMint);
        require!(sbt.owner == destination_owner, SukukError::CredentialOwnerMismatch);
        require!(sbt.amount >= 1, SukukError::NoZkCredential);
    }

    // 3. KYC expiry
    require!(clock.unix_timestamp < entry.kyc_expiry, SukukError::KycExpired);

    // 4. KYC level
    require!(entry.kyc_level >= registry.min_kyc_level, SukukError::InsufficientKycLevel);

    // 5. Lock period
    require!(clock.unix_timestamp >= registry.lock_until, SukukError::TransferLocked);

    Ok(())
}

pub fn handler(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
    let registry = &ctx.accounts.investor_registry;
    let entry    = &ctx.accounts.investor_entry;
    let clock    = &ctx.accounts.clock;

    // 1. Whitelist — destination wallet must have a valid InvestorEntry
    require!(
        entry.wallet == ctx.accounts.destination_token.owner,
        SukukError::NotWhitelisted
    );

    // 2. zkMe SBT — destination must hold a valid zkMe credential
    {
        let sbt_info = &ctx.accounts.zkme_sbt_account;
        let sbt_data = sbt_info.try_borrow_data()?;
        require!(
            sbt_data.len() >= spl_token_2022::state::Account::LEN,
            SukukError::NoZkCredential
        );
        let sbt = spl_token_2022::state::Account::unpack(&sbt_data[..spl_token_2022::state::Account::LEN])?;
        require!(sbt.mint == registry.zkme_credential_mint, SukukError::InvalidCredentialMint);
        require!(
            sbt.owner == ctx.accounts.destination_token.owner,
            SukukError::CredentialOwnerMismatch
        );
        require!(sbt.amount >= 1, SukukError::NoZkCredential);
    }

    // 3. KYC expiry
    require!(clock.unix_timestamp < entry.kyc_expiry, SukukError::KycExpired);

    // 4. KYC level gate
    require!(entry.kyc_level >= registry.min_kyc_level, SukukError::InsufficientKycLevel);

    // 5. Lock period
    require!(clock.unix_timestamp >= registry.lock_until, SukukError::TransferLocked);

    emit!(TransferApproved {
        mint:      ctx.accounts.mint.key(),
        from:      ctx.accounts.source_token.owner,
        to:        ctx.accounts.destination_token.owner,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}
