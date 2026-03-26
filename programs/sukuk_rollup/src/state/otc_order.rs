use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum OrderSide {
    Buy  = 0,
    Sell = 1,
}

/// An OTC order created inside the rollup.
/// Matching records intent only — actual token transfer happens
/// post-undelegate on base Solana via transfer_checked (enforcing TransferHook).
///
/// seeds: ["otc_order", mint, owner, nonce_as_le_bytes]
/// space: 8 + 32 + 32 + 1 + 8 + 8 + 8 + 1 + 1 = 99
#[account]
pub struct OtcOrder {
    pub owner: Pubkey,
    pub mint: Pubkey,
    /// Buy or Sell side.
    pub side: OrderSide,
    /// Token units (sukuk decimals).
    pub amount: u64,
    /// Price per token in USDC (6 decimals).
    pub price_usdc: u64,
    /// Unix timestamp after which the order is no longer valid.
    pub expiry: i64,
    /// Set true when matched by match_otc_order.
    pub filled: bool,
    pub bump: u8,
}

impl OtcOrder {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 8 + 8 + 8 + 1 + 1;
}
