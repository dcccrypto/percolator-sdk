import type { ErrorInfo } from "./errors.js";
/**
 * StakeError codes 33 to 48 (v5), with the stable Rust variant name and a calm one-line user message.
 * Codes 0 to 32 are the v2.1 table (`STAKE_ERRORS`); {@link decodeStakeErrorV5} covers all of them. Note
 * `STAKE_ERRORS[32]` still says "VERSION 18": on a v2.2 stake it pins VERSION 19 (see the PR notes).
 */
export declare const STAKE_ERRORS_V5: Readonly<Record<number, ErrorInfo>>;
/**
 * Stable Rust variant names of StakeError 0..32 (percolator-stake `src/error.rs` @ aebbff6), for
 * attributing a stake failure by name. The user-facing text for these codes is `STAKE_ERRORS`.
 */
export declare const STAKE_ERROR_NAMES: Readonly<Record<number, string>>;
