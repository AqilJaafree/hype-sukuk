use anchor_lang::prelude::*;

use crate::state::{OtcOrder, OrderSide, cross_program::{read_investor_registry, read_investor_entry}};
use crate::errors::RollupError;

/// sukuk_hook program ID — used for on-chain PDA derivation and verification.
const SUKUK_HOOK_ID: Pubkey = sukuk_hook::ID;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct PlaceOtcOrderArgs {
    pub side: OrderSide,
    pub amount: u64,
    pub price_usdc: u64,
    pub expiry: i64,
    /// Client-provided nonce — must be unique per (mint, owner) pair.
    pub nonce: u64,
}

/// Creates an OtcOrder PDA inside the rollup.
/// Validates the order owner is whitelisted via a cross-program read of
/// investor_registry (not delegated — lives on base Solana).
/// Submit to the MagicBlock ephemeral rollup RPC.
pub fn handler(ctx: Context<PlaceOtcOrder>, args: PlaceOtcOrderArgs) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    require!(args.amount > 0, RollupError::InvalidAmount);
    require!(args.price_usdc > 0, RollupError::InvalidPrice);
    require!(args.expiry > now, RollupError::InvalidExpiry);

    // Whitelist check — read from non-delegated base-chain InvestorRegistry.
    // PDA key is verified by the seeds constraint on the account struct.
    let registry = read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(registry.rollup_active, RollupError::RollupNotActive);

    // Read the InvestorEntry for the order owner to confirm whitelist membership.
    // PDA key is verified by the seeds constraint on the account struct.
    let entry = read_investor_entry(&ctx.accounts.investor_entry)?;
    require!(
        entry.wallet == ctx.accounts.owner.key(),
        RollupError::CounterpartyNotWhitelisted
    );

    let order = &mut ctx.accounts.otc_order;
    order.owner = ctx.accounts.owner.key();
    order.mint = ctx.accounts.mint.key();
    order.side = args.side;
    order.amount = args.amount;
    order.price_usdc = args.price_usdc;
    order.expiry = args.expiry;
    order.filled = false;
    order.bump = ctx.bumps.otc_order;

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: PlaceOtcOrderArgs)]
pub struct PlaceOtcOrder<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = OtcOrder::LEN,
        seeds = [
            b"otc_order",
            mint.key().as_ref(),
            owner.key().as_ref(),
            &args.nonce.to_le_bytes(),
        ],
        bump
    )]
    pub otc_order: Account<'info, OtcOrder>,

    /// CHECK: The sukuk token mint — used as PDA seed.
    pub mint: AccountInfo<'info>,

    /// CHECK: InvestorRegistry PDA owned by sukuk_hook.
    /// Key is verified on-chain via seeds derivation against SUKUK_HOOK_ID.
    #[account(
        seeds = [b"investor_registry", mint.key().as_ref()],
        seeds::program = SUKUK_HOOK_ID,
        bump,
    )]
    pub investor_registry: AccountInfo<'info>,

    /// CHECK: InvestorEntry PDA owned by sukuk_hook for the order owner.
    /// Key is verified on-chain via seeds derivation against SUKUK_HOOK_ID.
    #[account(
        seeds = [b"investor_entry", investor_registry.key().as_ref(), owner.key().as_ref()],
        seeds::program = SUKUK_HOOK_ID,
        bump,
    )]
    pub investor_entry: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}
