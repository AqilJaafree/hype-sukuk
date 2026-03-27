use anchor_lang::prelude::*;

#[error_code]
pub enum SukukError {
    #[msg("Destination wallet is not on the investor whitelist")]
    NotWhitelisted,
    #[msg("Sukuk transfers are locked until the lock period expires")]
    TransferLocked,
    #[msg("Insufficient KYC level for this transfer")]
    InsufficientKycLevel,
    #[msg("KYC credential has expired — investor must re-verify")]
    KycExpired,
    #[msg("No valid zkMe credential SBT found on destination wallet")]
    NoZkCredential,
    #[msg("Credential SBT mint does not match registry zkMe program mint")]
    InvalidCredentialMint,
    #[msg("Credential SBT owner does not match destination token account owner")]
    CredentialOwnerMismatch,
    #[msg("Signer is not the registry authority")]
    UnauthorizedAuthority,
    #[msg("Rollup session is already active")]
    RollupAlreadyActive,
    #[msg("KYC expiry timestamp must be in the future")]
    InvalidExpiry,
}
