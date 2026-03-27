use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

// Placeholder ID — replaced by real keypair after `anchor build`
declare_id!("3MrobtssgGyiuLVgheCqTSWJGWQxXDbPvMtip7tuMQkv");

#[program]
pub mod sukuk_hook {
    use super::*;

    /// Initialises the InvestorRegistry PDA for a given sukuk mint.
    /// Called once by authority after the Token-2022 mint is created.
    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        params: InitRegistryParams,
    ) -> Result<()> {
        initialize_registry::handler(ctx, params)
    }

    /// Registers the 6 extra accounts Token-2022 injects on every transfer_checked.
    /// Must be called after initialize_registry and before any minting.
    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        initialize_extra_metas::handler(ctx)
    }

    /// Called by Token-2022 on every transfer_checked. Read-only — enforces
    /// whitelist, zkMe SBT, KYC expiry, KYC level, and lock period.
    pub fn transfer_hook(ctx: Context<TransferHook>, amount: u64) -> Result<()> {
        transfer_hook::handler(ctx, amount)
    }

    /// Adds an investor to the whitelist. Signed by kyc_oracle.
    pub fn add_investor(
        ctx: Context<AddInvestor>,
        wallet: Pubkey,
        kyc_level: u8,
        kyc_expiry: i64,
        kyc_provider_hash: [u8; 32],
    ) -> Result<()> {
        add_investor::handler(ctx, wallet, kyc_level, kyc_expiry, kyc_provider_hash)
    }

    /// Removes an investor from the whitelist. Signed by kyc_oracle or authority.
    pub fn remove_investor(ctx: Context<RemoveInvestor>, wallet: Pubkey) -> Result<()> {
        remove_investor::handler(ctx, wallet)
    }

    /// Renews an investor's KYC expiry and provider hash. Signed by kyc_oracle.
    pub fn renew_investor(
        ctx: Context<RenewInvestor>,
        wallet: Pubkey,
        new_kyc_expiry: i64,
        new_kyc_provider_hash: [u8; 32],
    ) -> Result<()> {
        renew_investor::handler(ctx, wallet, new_kyc_expiry, new_kyc_provider_hash)
    }

    /// Updates the lock_until timestamp. Signed by authority.
    pub fn update_lock_period(ctx: Context<UpdateLockPeriod>, new_lock_until: i64) -> Result<()> {
        update_lock_period::handler(ctx, new_lock_until)
    }

    /// Fallback: routes Token-2022 transfer-hook execute calls (SPL interface
    /// discriminator) to the compliance handler.
    pub fn fallback<'info>(
        _program_id: &Pubkey,
        accounts: &'info [AccountInfo<'info>],
        data: &[u8],
    ) -> Result<()> {
        // sha256("spl-transfer-hook-interface:execute")[..8]
        const EXECUTE_DISC: [u8; 8] = [105, 37, 101, 197, 75, 251, 102, 26];
        if data.starts_with(&EXECUTE_DISC) {
            let amount = u64::from_le_bytes(
                data[8..16]
                    .try_into()
                    .map_err(|_| anchor_lang::error::ErrorCode::InstructionDidNotDeserialize)?,
            );
            return transfer_hook::process_raw(accounts, amount);
        }
        Err(anchor_lang::error::ErrorCode::InstructionFallbackNotFound.into())
    }
}
