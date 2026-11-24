/**
 * Known stake program addresses per network.
 *
 * devnet (SDK 9.0.0-candidate): the v2.2 fresh devnet stake program `7JrgAUHi4PxaRv5JKHoGAxodDFbozYexpERei66Xgq4V`
 * (= PROGRAM_IDS_DEVNET_V22.vault; pinned as STAKE_PROGRAM_ID by the v2.2 wrapper 6kpg2wi7…). The previous
 * default `VmpVUArR…` belongs to the v1 / close-only ETDLAdi… world — see PROGRAM_IDS_DEVNET_V1.
 * The history below is kept as a record.
 *
 * devnet: UPDATED from the SUPERSEDED `51CeUNpbXovK2BRADPyssuf3Q1xWGabEK9pYkp5mqVhQ`
 * (the old `percolator-vault@eb3ebe8` deployment) to the FRESH v17 devnet triple's
 * stake address `VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w`, deployed 2026-07-17
 * from `~/v17/percolator-stake@1e08d35` (hash `0e9c2572...`), cross-verified against
 * `PROGRAM_IDS_V17.vault` in `src/config/program-ids.ts` ("v17 vault — deployed
 * devnet 2026-07-17, hash-verified"). This is a NEW address (not an in-place upgrade
 * of the old 51CeUNpb... address, which is now superseded and should not be used for
 * new integrations) and already runs the ADOPTED `percolator-stake` lineage this
 * module targets — see the module doc above.
 *
 * mainnet: UNVERIFIED as *ours* — no confirmed mainnet stake/vault deployment exists
 * in any v17 planning doc (Percolator mainnet is still in prep). Do not treat this as
 * ground truth; prefer the STAKE_PROGRAM_ID env override on mainnet until DevOps
 * confirms.
 *
 * IMPORTANT: "unverified" does NOT mean "inert". Checked against mainnet RPC on
 * 2026-08-16, DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F is a LIVE, executable
 * BPFLoaderUpgradeable program. That is precisely why getStakeProgramId() must not
 * silently default to mainnet: an unconfigured browser caller would have resolved to
 * a real, executing mainnet program rather than failing safe.
 */
export declare const STAKE_PROGRAM_IDS: {
    readonly devnet: "7JrgAUHi4PxaRv5JKHoGAxodDFbozYexpERei66Xgq4V";
    readonly mainnet: "DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F";
};
/**
 * User-facing hint text for `StakeError` custom program error codes
 * (`ProgramError::Custom(code)`, `percolator-stake/src/error.rs`).
 *
 * Codes 0-24 mirror `error.rs`'s on-chain `error_hint()` fallback text.
 * Codes 25-27 (#242 cooldown-increase timelock) and 28
 * (`DepositBelowMinimumLiquidity`, N7 anti-inflation hardening) are new in
 * the ADOPTED lineage — 28 is the entry this table exists to add. NOTE:
 * the on-chain `error_hint()` itself has a gap (falls through to "Unknown
 * error" for 25-27 despite them being named enum variants); the hints below
 * for 25-27 are derived from `error.rs`'s doc comments, not copied from a
 * (missing) on-chain string.
 */
export declare const STAKE_ERRORS: Record<number, string>;
