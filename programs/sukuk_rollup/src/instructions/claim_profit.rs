use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use rs_merkle::{MerkleProof, algorithms::Sha256 as MerkleSha256};
use sha2::{Sha256, Digest};

use crate::state::{DistributionRoot, SukukVault, ClaimReceipt};
use crate::errors::RollupError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ClaimProfitArgs {
    /// Amount of USDC (6 decimals) the holder is claiming — must match the leaf.
    pub amount_usdc: u64,
    /// Index of the holder's leaf in the Merkle tree.
    pub leaf_index: u32,
    /// Sibling hashes forming the Merkle proof path.
    pub proof: Vec<[u8; 32]>,
}

/// Verifies a Merkle proof against the committed DistributionRoot and
/// transfers `amount_usdc` from the vault's USDC ATA to the holder's USDC ATA.
///
/// Call on base Solana after `undelegate_and_settle` has committed the root.
pub fn handler(ctx: Context<ClaimProfit>, args: ClaimProfitArgs) -> Result<()> {
    let distribution_root = &ctx.accounts.distribution_root;

    // Build the leaf: sha256(holder_pubkey || amount_usdc_le_bytes)
    // Must match the leaf construction in commit_distribution.
    let leaf: [u8; 32] = {
        let mut hasher = Sha256::new();
        hasher.update(ctx.accounts.holder.key().as_ref());
        hasher.update(&args.amount_usdc.to_le_bytes());
        hasher.finalize().into()
    };

    let proof = MerkleProof::<MerkleSha256>::new(args.proof);
    require!(
        proof.verify(
            distribution_root.merkle_root,
            &[args.leaf_index as usize],
            &[leaf],
            distribution_root.holder_count as usize,
        ),
        RollupError::InvalidMerkleProof
    );

    // Transfer USDC from vault ATA to holder ATA using vault PDA as signer.
    let vault = &ctx.accounts.sukuk_vault;
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"sukuk_vault",
        vault.mint.as_ref(),
        &[vault.bump],
    ]];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_usdc_ata.to_account_info(),
                to: ctx.accounts.holder_usdc_ata.to_account_info(),
                authority: ctx.accounts.sukuk_vault.to_account_info(),
            },
            signer_seeds,
        ),
        args.amount_usdc,
    )?;

    // Record the claim — prevents double-claiming via init constraint.
    let receipt = &mut ctx.accounts.claim_receipt;
    receipt.holder = ctx.accounts.holder.key();
    receipt.amount_usdc = args.amount_usdc;
    receipt.claimed_at = Clock::get()?.unix_timestamp;
    receipt.bump = ctx.bumps.claim_receipt;

    emit!(ProfitClaimed {
        holder: receipt.holder,
        amount_usdc: args.amount_usdc,
        timestamp: receipt.claimed_at,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(args: ClaimProfitArgs)]
pub struct ClaimProfit<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,

    /// The committed distribution root for this period.
    #[account(constraint = distribution_root.committed @ RollupError::DistributionNotCommitted)]
    pub distribution_root: Account<'info, DistributionRoot>,

    /// The sukuk vault — signs the USDC transfer as PDA authority.
    #[account(
        mut,
        seeds = [b"sukuk_vault", sukuk_vault.mint.as_ref()],
        bump = sukuk_vault.bump,
    )]
    pub sukuk_vault: Account<'info, SukukVault>,

    /// USDC ATA owned by sukuk_vault.
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = sukuk_vault,
    )]
    pub vault_usdc_ata: Account<'info, TokenAccount>,

    /// Holder's USDC ATA — receives the profit transfer.
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = holder,
    )]
    pub holder_usdc_ata: Account<'info, TokenAccount>,

    /// CHECK: USDC mint — validated indirectly via vault_usdc_ata and holder_usdc_ata.
    pub usdc_mint: AccountInfo<'info>,

    /// Created here; its existence prevents a second claim for the same period.
    #[account(
        init,
        payer = holder,
        space = ClaimReceipt::LEN,
        seeds = [b"claim_receipt", distribution_root.key().as_ref(), holder.key().as_ref()],
        bump,
    )]
    pub claim_receipt: Account<'info, ClaimReceipt>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[event]
pub struct ProfitClaimed {
    pub holder: Pubkey,
    pub amount_usdc: u64,
    pub timestamp: i64,
}
