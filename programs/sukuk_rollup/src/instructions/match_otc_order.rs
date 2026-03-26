use anchor_lang::prelude::*;

use crate::state::{OtcOrder, OrderSide, cross_program::{read_investor_registry, read_investor_entry}};
use crate::errors::RollupError;

/// Matches a bid (Buy) and an ask (Sell) OtcOrder inside the rollup.
/// Records intent only — actual token transfer happens post-undelegate
/// on base Solana via transfer_checked, which enforces the TransferHook.
/// Submit to the MagicBlock ephemeral rollup RPC.
pub fn handler(ctx: Context<MatchOtcOrder>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    let registry = read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(registry.rollup_active, RollupError::RollupNotActive);

    {
        let bid = &ctx.accounts.bid_order;
        let ask = &ctx.accounts.ask_order;

        // Side validation
        require!(bid.side == OrderSide::Buy, RollupError::BothSidesMustBeOpposite);
        require!(ask.side == OrderSide::Sell, RollupError::BothSidesMustBeOpposite);

        // Price: bid must be willing to pay at least ask price
        require!(bid.price_usdc >= ask.price_usdc, RollupError::PriceMismatch);

        // Same sukuk token
        require!(bid.mint == ask.mint, RollupError::MintMismatch);

        // Not already filled
        require!(!bid.filled, RollupError::OrderAlreadyFilled);
        require!(!ask.filled, RollupError::OrderAlreadyFilled);

        // Neither order expired
        require!(now < bid.expiry, RollupError::OrderExpired);
        require!(now < ask.expiry, RollupError::OrderExpired);
    }

    // Both counterparties must be whitelisted — cross-program read of base-chain entries
    let bid_entry = read_investor_entry(&ctx.accounts.bid_investor_entry)?;
    require!(
        bid_entry.wallet == ctx.accounts.bid_order.owner,
        RollupError::CounterpartyNotWhitelisted
    );

    let ask_entry = read_investor_entry(&ctx.accounts.ask_investor_entry)?;
    require!(
        ask_entry.wallet == ctx.accounts.ask_order.owner,
        RollupError::CounterpartyNotWhitelisted
    );

    // Mark both orders as filled
    let bid = &mut ctx.accounts.bid_order;
    let ask_owner = ctx.accounts.ask_order.owner;
    let amount = bid.amount.min(ctx.accounts.ask_order.amount);
    let price_usdc = ctx.accounts.ask_order.price_usdc; // settlement at ask price
    bid.filled = true;
    ctx.accounts.ask_order.filled = true;

    emit!(OtcMatched {
        bid_owner: bid.owner,
        ask_owner,
        amount,
        price_usdc,
        timestamp: now,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct MatchOtcOrder<'info> {
    pub matcher: Signer<'info>,

    #[account(mut, constraint = bid_order.side == OrderSide::Buy)]
    pub bid_order: Account<'info, OtcOrder>,

    #[account(mut, constraint = ask_order.side == OrderSide::Sell)]
    pub ask_order: Account<'info, OtcOrder>,

    /// CHECK: InvestorRegistry — whitelist source of truth.
    pub investor_registry: AccountInfo<'info>,

    /// CHECK: InvestorEntry for the bid (Buy) order owner.
    pub bid_investor_entry: AccountInfo<'info>,

    /// CHECK: InvestorEntry for the ask (Sell) order owner.
    pub ask_investor_entry: AccountInfo<'info>,
}

#[event]
pub struct OtcMatched {
    pub bid_owner: Pubkey,
    pub ask_owner: Pubkey,
    pub amount: u64,
    pub price_usdc: u64,
    pub timestamp: i64,
}
