use anchor_lang::prelude::*;

/// Profit pool — delegated to the rollup during a session.
/// Tracks the sukuk mint it belongs to and the authority.
/// Actual USDC sits in a separate ATA; this PDA acts as the
/// authority / bookkeeping account for the vault.
///
/// seeds: ["sukuk_vault", mint]
/// space: 8 + 32 + 32 + 8 + 1 = 81
#[account]
pub struct SukukVault {
    /// The sukuk token mint this vault belongs to.
    pub mint: Pubkey,
    /// The issuer authority that controls the vault.
    pub authority: Pubkey,
    /// Cached USDC balance (6 decimals). Updated during profit accrual.
    pub usdc_balance: u64,
    pub bump: u8,
}

impl SukukVault {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 1;
}
