use anchor_lang::prelude::*;

// Placeholder ID — replaced by real keypair after `anchor build`
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// sukuk_hook implementation — see hype-sukuk.md for full spec.
// This stub allows the workspace to compile while sukuk_rollup is developed.
#[program]
pub mod sukuk_hook {
    use super::*;

    pub fn placeholder(_ctx: Context<Placeholder>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Placeholder<'info> {
    pub signer: Signer<'info>,
}
