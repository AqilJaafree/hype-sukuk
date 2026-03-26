use anchor_lang::prelude::*;

/// Per-holder profit accrual state.
/// Created inside the rollup session; written back to base Solana on settlement.
///
/// seeds: ["accrual_state", mint, holder]
/// space: 8 + 32 + 32 + 8 + 8 + 8 + 1 = 97
#[account]
pub struct AccrualState {
    /// The holder's wallet pubkey.
    pub holder: Pubkey,
    /// The sukuk token mint.
    pub mint: Pubkey,
    /// Accumulated profit in USDC (6 decimals).
    pub accrued_profit_usdc: u64,
    /// Unix timestamp of the last accrual tick.
    pub last_tick: i64,
    /// Sukuk token balance snapshot at the last tick.
    /// Updated each tick so balance changes are reflected progressively.
    pub token_balance_snapshot: u64,
    pub bump: u8,
}

impl AccrualState {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 8 + 1;
}
