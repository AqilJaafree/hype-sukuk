use anchor_lang::prelude::*;

#[account]
pub struct InvestorEntry {
    pub wallet: Pubkey,               // 32
    pub approved_at: i64,             // 8
    pub kyc_level: u8,                // 1  — 1=retail, 2=accredited, 3=institutional
    pub kyc_expiry: i64,              // 8  — re-verify deadline (default: +1 year)
    pub kyc_provider_hash: [u8; 32],  // 32 — SHA-256(zkMe appId + ":" + wallet)
    pub bump: u8,                     // 1
}
// seeds: ["investor_entry", investor_registry, wallet]
// space: 8 + 32 + 8 + 1 + 8 + 32 + 1 = 90

impl InvestorEntry {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 8 + 32 + 1;
}
