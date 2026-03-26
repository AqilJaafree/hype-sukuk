use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, AccountSerialize};

/// Read-only mirror of sukuk_hook::InvestorRegistry.
/// Field layout and order must exactly match the hook program's struct.
/// The Anchor discriminator is sha256("account:InvestorRegistry")[..8] — identical
/// in both programs because it is derived from the struct name, not the program ID.
#[account]
pub struct InvestorRegistry {
    pub authority: Pubkey,
    pub kyc_oracle: Pubkey,
    pub zkme_credential_mint: Pubkey,
    pub mint: Pubkey,
    pub lock_until: i64,
    pub profit_rate_bps: u16,
    pub min_kyc_level: u8,
    pub investor_count: u64,
    pub rollup_active: bool,
    pub session_start: i64,
    pub bump: u8,
}

/// Read-only mirror of sukuk_hook::InvestorEntry.
#[account]
pub struct InvestorEntry {
    pub wallet: Pubkey,
    pub approved_at: i64,
    pub kyc_level: u8,
    pub kyc_expiry: i64,
    pub kyc_provider_hash: [u8; 32],
    pub bump: u8,
}

// ── Generic cross-program account readers ─────────────────────────────────────

/// Generic cross-program account deserializer.
/// Bypasses owner checks — use only for reading accounts owned by other programs.
fn read_cross_program<T: AccountDeserialize>(info: &AccountInfo) -> Result<T> {
    let data = info.try_borrow_data()?;
    T::try_deserialize(&mut &data[..])
        .map_err(|_| error!(anchor_lang::error::ErrorCode::AccountDidNotDeserialize))
}

/// Read InvestorRegistry from sukuk_hook (cross-program, read-only).
pub fn read_investor_registry(info: &AccountInfo) -> Result<InvestorRegistry> {
    read_cross_program(info)
}

/// Read InvestorEntry from sukuk_hook (cross-program, read-only).
pub fn read_investor_entry(info: &AccountInfo) -> Result<InvestorEntry> {
    read_cross_program(info)
}

// ── Cross-program account writers ─────────────────────────────────────────────

/// Write an InvestorRegistry back to its AccountInfo.
/// Use when mutating the registry from the rollup (e.g. setting rollup_active).
pub fn write_investor_registry(
    info: &AccountInfo,
    registry: &InvestorRegistry,
) -> Result<()> {
    let mut data = info.try_borrow_mut_data()?;
    let mut cursor = std::io::Cursor::new(&mut data[..]);
    registry.try_serialize(&mut cursor)?;
    Ok(())
}
