# PHASE 7 — error code audit

SDK src/abi/errors.ts has `PERCOLATOR_ERRORS: Record<number, ErrorInfo>` — a
hardcoded numeric → name+hint map covering 69 entries.

Wrapper enum at /path/to/perc-sync/work/percolator-prog/src/percolator.rs:1370
auto-numbers from 0 in declaration order. v12.17 wrapper at
/tmp/wrapper-v12.17 should have a similar enum (sample-checked: same first 28).

## Per-position alignment (v12.19)

| code | sdk name | wrapper name | drift |
|---:|:---|:---|:---|
| 0 | InvalidMagic | InvalidMagic | VERIFIED |
| 1 | InvalidVersion | InvalidVersion | VERIFIED |
| 2 | AlreadyInitialized | AlreadyInitialized | VERIFIED |
| 3 | NotInitialized | NotInitialized | VERIFIED |
| 4 | InvalidSlabLen | InvalidSlabLen | VERIFIED |
| 5 | InvalidOracleKey | InvalidOracleKey | VERIFIED |
| 6 | OracleStale | OracleStale | VERIFIED |
| 7 | OracleConfTooWide | OracleConfTooWide | VERIFIED |
| 8 | InvalidVaultAta | InvalidVaultAta | VERIFIED |
| 9 | InvalidMint | InvalidMint | VERIFIED |
| 10 | ExpectedSigner | ExpectedSigner | VERIFIED |
| 11 | ExpectedWritable | ExpectedWritable | VERIFIED |
| 12 | OracleInvalid | OracleInvalid | VERIFIED |
| 13 | EngineInsufficientBalance | EngineInsufficientBalance | VERIFIED |
| 14 | EngineUndercollateralized | EngineUndercollateralized | VERIFIED |
| 15 | EngineUnauthorized | EngineUnauthorized | VERIFIED |
| 16 | EngineInvalidMatchingEngine | EngineInvalidMatchingEngine | VERIFIED |
| 17 | EnginePnlNotWarmedUp | EnginePnlNotWarmedUp | VERIFIED |
| 18 | EngineOverflow | EngineOverflow | VERIFIED |
| 19 | EngineAccountNotFound | EngineAccountNotFound | VERIFIED |
| 20 | EngineNotAnLPAccount | EngineNotAnLPAccount | VERIFIED |
| 21 | EnginePositionSizeMismatch | EnginePositionSizeMismatch | VERIFIED |
| 22 | EngineRiskReductionOnlyMode | EngineRiskReductionOnlyMode | VERIFIED |
| 23 | EngineAccountKindMismatch | EngineAccountKindMismatch | VERIFIED |
| 24 | InvalidTokenAccount | InvalidTokenAccount | VERIFIED |
| 25 | InvalidTokenProgram | InvalidTokenProgram | VERIFIED |
| 26 | InvalidConfigParam | InvalidConfigParam | VERIFIED |
| 27 | HyperpTradeNoCpiDisabled | HyperpTradeNoCpiDisabled | VERIFIED |
| **28** | **InsuranceMintAlreadyExists** | **EngineCorruptState** | **ERROR_DRIFT_MEDIUM** |
| **29** | **InsuranceMintNotCreated** | **MarketPaused** | **ERROR_DRIFT_MEDIUM** |
| **30** | **InsuranceBelowThreshold** | **LpVaultInvalidFeeShare** | **ERROR_DRIFT_MEDIUM** |
| **31** | **InsuranceZeroAmount** | **LpVaultAlreadyExists** | **ERROR_DRIFT_MEDIUM** |
| 32+ | not enumerated here | LpVaultNotCreated etc | likely all drifted |

The SDK's positions 28-31+ refer to a legacy insurance LP scheme that was
renamed in the wrapper to LP vault PERC-272 and shifted error positions.

## Severity

**ERROR_DRIFT_MEDIUM.** Effect on consumers:
- A user catches `Custom(28)` from a wrapper error.
- SDK `parseErrorFromLogs` returns name "InsuranceMintAlreadyExists".
- Wrapper actually emitted EngineCorruptState (a serious internal error).
- Misleading UX. Not a wire-level safety issue.

The full delta from position 28 onwards needs systematic re-mapping
against the v12.19 enum. ~30 entries are likely off.

## Verdict

| status | count |
|:---|---:|
| VERIFIED | 28 (positions 0-27) |
| ERROR_DRIFT_MEDIUM | 4+ (positions 28, 29, 30, 31; all positions 32+ likely affected) |
