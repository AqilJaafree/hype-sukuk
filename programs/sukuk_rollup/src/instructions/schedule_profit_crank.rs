use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use ephemeral_rollups_sdk::consts::MAGIC_PROGRAM_ID;
use magicblock_magic_program_api::{args::ScheduleTaskArgs, instruction::MagicBlockInstruction};

use crate::state::cross_program::read_investor_registry;
use crate::errors::RollupError;

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct ScheduleCrankArgs {
    /// Unique task identifier. Use a different id per scheduled crank.
    pub task_id: u64,
    /// Milliseconds between executions (30_000 = 30 seconds).
    pub execution_interval_millis: u64,
    /// How many times to run. Use u64::MAX to run until undelegated.
    pub iterations: u64,
}

/// Schedules native on-rollup profit accrual cranks.
/// Must be submitted to the ephemeral rollup RPC (not base Solana).
/// After scheduling, the MagicBlock scheduler calls accrue_profit automatically.
pub fn handler(ctx: Context<ScheduleProfitCrank>, args: ScheduleCrankArgs) -> Result<()> {
    let registry = read_investor_registry(&ctx.accounts.investor_registry)?;
    require!(registry.rollup_active, RollupError::RollupNotActive);

    // Build the accrue_profit instruction that the scheduler will call.
    // The investor_registry is baked in as a static account at schedule time.
    // All AccrualState accounts must be appended as remaining_accounts by the caller.
    let mut crank_accounts = vec![
        AccountMeta::new_readonly(ctx.accounts.investor_registry.key(), false),
    ];
    // Append each accrual_state from remaining_accounts
    for accrual_info in ctx.remaining_accounts.iter() {
        crank_accounts.push(AccountMeta::new(accrual_info.key(), false));
    }

    let crank_ix = Instruction {
        program_id: crate::ID,
        accounts: crank_accounts,
        data: anchor_lang::InstructionData::data(&crate::instruction::AccrueProfit {}),
    };

    let ix_data = bincode::serialize(&MagicBlockInstruction::ScheduleTask(ScheduleTaskArgs {
        task_id: args.task_id,
        execution_interval_millis: args.execution_interval_millis,
        iterations: args.iterations,
        instructions: vec![crank_ix],
    }))
    .map_err(|_| anchor_lang::error::ErrorCode::AccountNotInitialized)?;

    let schedule_ix = Instruction::new_with_bytes(
        MAGIC_PROGRAM_ID,
        &ix_data,
        vec![
            AccountMeta::new(ctx.accounts.payer.key(), true),
        ],
    );

    invoke(
        &schedule_ix,
        &[ctx.accounts.payer.to_account_info()],
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct ScheduleProfitCrank<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: InvestorRegistry — baked into the scheduled crank instruction.
    pub investor_registry: AccountInfo<'info>,

    /// CHECK: The MagicBlock Magic Program.
    #[account(address = MAGIC_PROGRAM_ID)]
    pub magic_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    // AccrualState accounts passed as remaining_accounts
}
