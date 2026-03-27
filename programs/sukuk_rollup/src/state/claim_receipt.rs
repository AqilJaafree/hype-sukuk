use anchor_lang::prelude::*;

/// Created when a holder claims their profit from a distribution period.
/// Existence of this PDA prevents double-claiming.
///
/// seeds: ["claim_receipt", distribution_root, holder]
/// space: 8 + 32 + 8 + 8 + 1 = 57
#[account]
pub struct ClaimReceipt {
    /// The holder that submitted the claim.
    pub holder: Pubkey,
    /// Amount of USDC (6 decimals) transferred to the holder.
    pub amount_usdc: u64,
    /// Unix timestamp of the claim.
    pub claimed_at: i64,
    pub bump: u8,
}

impl ClaimReceipt {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 1;
}
