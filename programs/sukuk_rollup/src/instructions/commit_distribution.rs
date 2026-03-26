use anchor_lang::prelude::*;
use anchor_lang::AccountDeserialize;
use rs_merkle::{MerkleTree, algorithms::Sha256 as MerkleSha256};
use sha2::{Sha256, Digest};

use crate::state::{AccrualState, DistributionRoot, cross_program::read_investor_registry};
use crate::errors::RollupError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CommitDistributionArgs {
    pub period_start: i64,
}

/// Builds a Merkle tree over all AccrualState accounts and writes the root.
/// All AccrualState accounts for the period must be passed as remaining_accounts.
/// Submit to the MagicBlock ephemeral rollup RPC.
/// IRREVERSIBLE — once committed = true, the root cannot be changed.
pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, CommitDistribution<'info>>,
    args: CommitDistributionArgs,
) -> Result<()> {
    let registry = read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(registry.rollup_active, RollupError::RollupNotActive);

    let dist = &mut ctx.accounts.distribution_root;
    require!(!dist.committed, RollupError::DistributionAlreadyCommitted);
    require!(!ctx.remaining_accounts.is_empty(), RollupError::EmptyAccrualStates);

    let now = Clock::get()?.unix_timestamp;

    // Build Merkle leaves: sha256(holder_pubkey_bytes || accrued_profit_usdc_le)
    let mut leaves: Vec<[u8; 32]> = Vec::with_capacity(ctx.remaining_accounts.len());
    let mut total_profit: u64 = 0;

    for accrual_info in ctx.remaining_accounts.iter() {
        let data = accrual_info.try_borrow_data()?;
        let accrual = AccrualState::try_deserialize(&mut data.as_ref())?;

        let mut hasher = Sha256::new();
        hasher.update(accrual.holder.as_ref());
        hasher.update(&accrual.accrued_profit_usdc.to_le_bytes());
        let leaf: [u8; 32] = hasher.finalize().into();

        leaves.push(leaf);
        total_profit = total_profit.saturating_add(accrual.accrued_profit_usdc);
    }

    let tree = MerkleTree::<MerkleSha256>::from_leaves(&leaves);
    let root = tree.root().ok_or(RollupError::EmptyAccrualStates)?;

    dist.mint = ctx.accounts.mint.key();
    dist.merkle_root = root;
    dist.total_profit_usdc = total_profit;
    dist.period_start = args.period_start;
    dist.period_end = now;
    dist.holder_count = leaves.len() as u64;
    dist.committed = true;
    dist.bump = ctx.bumps.distribution_root;

    emit!(DistributionCommitted {
        mint: dist.mint,
        merkle_root: root,
        total_usdc: total_profit,
        period_end: now,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: CommitDistributionArgs)]
pub struct CommitDistribution<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = DistributionRoot::LEN,
        seeds = [
            b"distribution_root",
            mint.key().as_ref(),
            &args.period_start.to_le_bytes(),
        ],
        bump
    )]
    pub distribution_root: Account<'info, DistributionRoot>,

    /// CHECK: The sukuk token mint.
    pub mint: AccountInfo<'info>,

    /// CHECK: InvestorRegistry — read-only for rollup_active check.
    pub investor_registry: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    // All AccrualState accounts passed as remaining_accounts
}

#[event]
pub struct DistributionCommitted {
    pub mint: Pubkey,
    pub merkle_root: [u8; 32],
    pub total_usdc: u64,
    pub period_end: i64,
}
