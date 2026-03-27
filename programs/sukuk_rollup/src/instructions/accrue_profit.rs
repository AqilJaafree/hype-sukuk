use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, AccountSerialize};

use crate::state::{AccrualState, cross_program::read_investor_registry};
use crate::errors::RollupError;

/// Called by the native rollup crank every 30 seconds.
/// Processes up to 10 AccrualState accounts per instruction via remaining_accounts.
/// Submit exclusively to the MagicBlock ephemeral rollup RPC.
pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, AccrueProfit<'info>>,
) -> Result<()> {
    let registry = read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(registry.rollup_active, RollupError::RollupNotActive);

    let profit_rate_bps = registry.profit_rate_bps;
    let now = Clock::get()?.unix_timestamp;

    for accrual_info in ctx.remaining_accounts.iter() {
        // Manual deserialization — bypasses owner check, safe for ER-delegated accounts.
        let mut accrual = {
            let data = accrual_info.try_borrow_data()?;
            AccrualState::try_deserialize(&mut data.as_ref())?
        };

        let elapsed = now.saturating_sub(accrual.last_tick);
        if elapsed <= 0 {
            continue;
        }

        // u128 fixed-point: profit = balance * rate_bps * elapsed_seconds
        //                           / (10_000 * 365 * 86_400)
        // Numerator fits in u128: max_u64 * 10_000 * max_i64 ≈ 1.7e28 < 3.4e38.
        let period_profit_u128 = (accrual.token_balance_snapshot as u128)
            .saturating_mul(profit_rate_bps as u128)
            .saturating_mul(elapsed as u128)
            / (10_000u128 * 365 * 86_400);
        let period_profit = period_profit_u128.min(u64::MAX as u128) as u64;

        accrual.accrued_profit_usdc = accrual.accrued_profit_usdc.saturating_add(period_profit);
        accrual.last_tick = now;

        // Write the mutation back to the AccountInfo's data buffer.
        let mut data = accrual_info.try_borrow_mut_data()?;
        let mut cursor = std::io::Cursor::new(&mut data[..]);
        accrual.try_serialize(&mut cursor)?;

        emit!(ProfitAccrued {
            holder: accrual.holder,
            amount_usdc: period_profit,
            timestamp: now,
        });
    }

    Ok(())
}

#[derive(Accounts)]
pub struct AccrueProfit<'info> {
    /// CHECK: InvestorRegistry from sukuk_hook — read-only for profit_rate_bps.
    pub investor_registry: AccountInfo<'info>,
    // AccrualState accounts passed as remaining_accounts (up to 10 per call)
}

#[event]
pub struct ProfitAccrued {
    pub holder: Pubkey,
    pub amount_usdc: u64,
    pub timestamp: i64,
}
