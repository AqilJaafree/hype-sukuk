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

        // NOTE: f64 arithmetic is deterministic within a single-validator ER session.
        // Replace with u128 fixed-point for production multi-validator environments.
        let daily_rate = (profit_rate_bps as f64) / 10_000.0 / 365.0;
        let period_profit = ((accrual.token_balance_snapshot as f64)
            * daily_rate
            * (elapsed as f64)
            / 86_400.0) as u64;

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
