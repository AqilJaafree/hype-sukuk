use anchor_lang::{
    prelude::*,
    solana_program::program::invoke_signed,
};
use anchor_spl::token_interface::Mint;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta,
    seeds::Seed,
    state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::state::InvestorRegistry;

// Indices in the execute instruction accounts list:
//   0: source_token
//   1: mint
//   2: destination_token
//   3: source_owner
//   4: extra_account_meta_list
//   5: investor_registry  (extra[0])
//   6: investor_entry     (extra[1])
//   7: clock              (extra[2])
//   8: token_2022_program (extra[3])
//   9: ata_program        (extra[4])
//  10: zkme_sbt_account   (extra[5])

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Created and initialised manually below
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
    )]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        seeds = [b"investor_registry", mint.key().as_ref()],
        bump = investor_registry.bump,
    )]
    pub investor_registry: Account<'info, InvestorRegistry>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeExtraAccountMetaList>) -> Result<()> {
    let registry = &ctx.accounts.investor_registry;
    let _zkme_mint_bytes = registry.zkme_credential_mint.to_bytes();

    // 6 extra accounts (see index table above)
    let account_metas = vec![
        // extra[0]: investor_registry — seeds ["investor_registry", mint(1)]
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"investor_registry".to_vec() },
                Seed::AccountKey { index: 1 }, // mint at execute-instruction position 1
            ],
            false,
            false,
        )?,

        // extra[1]: investor_entry — seeds ["investor_entry", registry(5), destination_owner]
        // destination_owner is at bytes 32..64 of destination_token (position 2)
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: b"investor_entry".to_vec() },
                Seed::AccountKey { index: 5 }, // investor_registry = extra[0] = index 5
                Seed::AccountData { account_index: 2, data_index: 32, length: 32 },
            ],
            false,
            false,
        )?,

        // extra[2]: clock sysvar
        ExtraAccountMeta::new_with_pubkey(
            &anchor_lang::solana_program::sysvar::clock::ID,
            false,
            false,
        )?,

        // extra[3]: Token-2022 program (needed as a seed component for ATA derivation)
        ExtraAccountMeta::new_with_pubkey(
            &spl_token_2022::ID,
            false,
            false,
        )?,

        // extra[4]: Associated Token Program (derives the SBT ATA)
        ExtraAccountMeta::new_with_pubkey(
            &spl_associated_token_account::ID,
            false,
            false,
        )?,

        // extra[5]: zkMe SBT ATA = ATA(destination_owner, Token-2022, zkme_credential_mint)
        // ATA seeds: [owner, token_program, mint]
        //   owner        = AccountData { account_index: 2, data_index: 32, length: 32 }
        //   token_program = AccountKey  { index: 8 }  (extra[3] = Token-2022 program)
        //   mint         = AccountData { account_index: 5, data_index: 72, length: 32 }
        //                  (zkme_credential_mint stored at byte 72 in investor_registry)
        // The program that derives this PDA is the ATA program at index 9 (extra[4]).
        //
        // Note: zkme_credential_mint offset in InvestorRegistry (Anchor layout):
        //   [0..8]  discriminator
        //   [8..40] authority
        //   [40..72] kyc_oracle
        //   [72..104] zkme_credential_mint  ← data_index = 72
        ExtraAccountMeta::new_external_pda_with_seeds(
            9, // ATA program at index 9
            &[
                Seed::AccountData { account_index: 2, data_index: 32, length: 32 },
                Seed::AccountKey  { index: 8 },
                Seed::AccountData { account_index: 5, data_index: 72, length: 32 },
            ],
            false,
            false,
        )?,
    ];

    let account_size = ExtraAccountMetaList::size_of(account_metas.len())?;
    let lamports = Rent::get()?.minimum_balance(account_size);

    let mint_key = ctx.accounts.mint.key();
    let bump_seed = [ctx.bumps.extra_account_meta_list];
    let pda_signer_seeds: &[&[&[u8]]] = &[&[
        b"extra-account-metas",
        mint_key.as_ref(),
        &bump_seed,
    ]];

    // Create the PDA account (must use invoke_signed because PDA is the signer)
    invoke_signed(
        &anchor_lang::solana_program::system_instruction::create_account(
            ctx.accounts.authority.key,
            ctx.accounts.extra_account_meta_list.key,
            lamports,
            account_size as u64,
            ctx.program_id,
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.extra_account_meta_list.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        pda_signer_seeds,
    )?;

    // Write extra account meta list
    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &account_metas)?;

    Ok(())
}
