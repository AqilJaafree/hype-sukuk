use anchor_lang::prelude::*;

#[error_code]
pub enum RollupError {
    #[msg("Account is not delegated to the rollup")]
    AccountNotDelegated,
    #[msg("Order has expired")]
    OrderExpired,
    #[msg("Order is already filled")]
    OrderAlreadyFilled,
    #[msg("Bid price is below ask price")]
    PriceMismatch,
    #[msg("Both orders must be on opposite sides")]
    BothSidesMustBeOpposite,
    #[msg("Counterparty is not on the investor whitelist")]
    CounterpartyNotWhitelisted,
    #[msg("Distribution for this period has already been committed")]
    DistributionAlreadyCommitted,
    #[msg("No active rollup session")]
    RollupNotActive,
    #[msg("Rollup session is already active")]
    RollupAlreadyActive,
    #[msg("No accrual states provided for distribution")]
    EmptyAccrualStates,
    #[msg("Order amount must be greater than zero")]
    InvalidAmount,
    #[msg("Order price must be greater than zero")]
    InvalidPrice,
    #[msg("Order expiry must be in the future")]
    InvalidExpiry,
    #[msg("Mint mismatch between orders")]
    MintMismatch,
    #[msg("Distribution has not been committed yet")]
    DistributionNotCommitted,
    #[msg("Merkle proof is invalid for this claim")]
    InvalidMerkleProof,
}
