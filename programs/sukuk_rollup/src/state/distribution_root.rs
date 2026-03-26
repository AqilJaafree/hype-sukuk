use anchor_lang::prelude::*;

/// Merkle root of all accrual states for a profit distribution period.
/// Written by commit_distribution inside the rollup, then committed to base
/// Solana during undelegate_and_settle.
///
/// seeds: ["distribution_root", mint, period_start_as_le_bytes]
/// space: 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1 = 106
#[account]
pub struct DistributionRoot {
    pub mint: Pubkey,
    /// SHA-256 Merkle root over all (holder, accrued_profit_usdc) leaves.
    pub merkle_root: [u8; 32],
    /// Total USDC across all holders (6 decimals).
    pub total_profit_usdc: u64,
    pub period_start: i64,
    pub period_end: i64,
    pub holder_count: u64,
    /// Set true after commit_distribution. Guards against double-commit.
    pub committed: bool,
    pub bump: u8,
}

impl DistributionRoot {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1 + 1;
}
