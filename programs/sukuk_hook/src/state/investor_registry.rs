use anchor_lang::prelude::*;

#[account]
pub struct InvestorRegistry {
    pub authority: Pubkey,            // 32 — issuer; controls lifecycle + mint
    pub kyc_oracle: Pubkey,           // 32 — backend oracle; can only add/remove/renew investors
    pub zkme_credential_mint: Pubkey, // 32 — zkMe SBT mint pubkey for this program
    pub mint: Pubkey,                 // 32 — the sukuk token mint
    pub lock_until: i64,              // 8  — no transfers before this unix timestamp
    pub profit_rate_bps: u16,         // 2  — annual rate, e.g. 450 = 4.50%
    pub min_kyc_level: u8,            // 1  — platform minimum (1=retail, 2=accredited, 3=institutional)
    pub investor_count: u64,          // 8
    pub rollup_active: bool,          // 1  — set true when accounts delegated to rollup
    pub session_start: i64,           // 8  — unix ts of rollup session start
    pub bump: u8,                     // 1
}
// seeds: ["investor_registry", sukuk_mint]
// space: 8 + 32 + 32 + 32 + 32 + 8 + 2 + 1 + 8 + 1 + 8 + 1 = 165

impl InvestorRegistry {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 2 + 1 + 8 + 1 + 8 + 1;
}
