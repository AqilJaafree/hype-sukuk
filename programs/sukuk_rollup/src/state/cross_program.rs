use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, AccountSerialize};

// Import canonical types directly from sukuk_hook (cpi feature).
// Eliminates struct mirroring — layout is guaranteed identical at compile time.
pub use sukuk_hook::state::{InvestorRegistry, InvestorEntry};

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
