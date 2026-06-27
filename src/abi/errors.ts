/**
 * Percolator v17 program error definitions.
 *
 * Source: v16_program.rs PercolatorError enum (lines 174-226 in v17 wrapper).
 * Ordinals 0-29 = toly base errors; 30-41 = fork LP-vault; 42-46 = fork NFT/B-3;
 * 47-48 = insurance withdrawal policy (F-1/F-2); 49 = EngineInsufficientInitialMargin
 * (discriminant tentative — TODO: confirm once percolator-anchor ships it).
 *
 * INVARIANT: ordinals must NOT be reordered (Rust enum discriminants are
 * sequential from 0). CI asserts each ordinal in tests/v16_kani.rs.
 *
 * v17 breaking changes vs v12.x:
 *   - Errors 0-29 have completely different names and semantics from v12.
 *   - Errors 30-41 are LP-vault (moved from v12.x range 30-41 to same ordinals).
 *   - Errors 42-46 are NFT/B-3 (new in v17).
 *   - v12.x errors 28-65 are entirely removed.
 */
export interface ErrorInfo {
  name: string;
  hint: string;
}

export const PERCOLATOR_ERRORS: Record<number, ErrorInfo> = {
  // ── toly base errors (0-29) ─────────────────────────────────────────────────
  0: {
    name: "InvalidMagic",
    hint: "Account magic mismatch — not a v17 percolator account. Check the market group address.",
  },
  1: {
    name: "InvalidVersion",
    hint: "Account version mismatch. Expected EXPECTED_SLAB_VERSION=16. The program may need upgrading.",
  },
  2: {
    name: "AlreadyInitialized",
    hint: "Account is already initialized. Use a different account or check the market group address.",
  },
  3: {
    name: "NotInitialized",
    hint: "Account is not initialized. Run InitMarket first.",
  },
  4: {
    name: "InvalidAccountKind",
    hint: "Wrong account kind (market group vs portfolio vs insurance-ledger). Check account addresses.",
  },
  5: {
    name: "InvalidAccountLen",
    hint: "Account data length is incorrect. The account may be from a different program version.",
  },
  6: {
    name: "ExpectedSigner",
    hint: "Missing required signature. Ensure the correct authority wallet is signing.",
  },
  7: {
    name: "ExpectedWritable",
    hint: "Account must be marked writable. This is likely a client-side account-list bug.",
  },
  8: {
    name: "Unauthorized",
    hint: "Not authorized for this operation. Check marketauth or asset_admin authority.",
  },
  9: {
    name: "InvalidInstruction",
    hint: "Unknown instruction tag. The SDK and program versions may be mismatched.",
  },
  10: {
    name: "InvalidMint",
    hint: "Token mint does not match the market's collateral mint.",
  },
  11: {
    name: "InvalidTokenAccount",
    hint: "Token account is invalid. Ensure you have a correctly configured ATA.",
  },
  12: {
    name: "InvalidVaultAccount",
    hint: "Vault account is invalid or does not match the market vault PDA.",
  },
  13: {
    name: "InvalidTokenProgram",
    hint: "Invalid token program. Expected SPL Token or Token-2022.",
  },
  14: {
    name: "EngineInvalidConfig",
    hint: "Engine config is invalid. A required config field is missing or out of range.",
  },
  15: {
    name: "EngineArithmeticOverflow",
    hint: "Arithmetic overflow in engine calculation. Try a smaller amount or position size.",
  },
  16: {
    name: "EngineProvenanceMismatch",
    hint: "Portfolio provenance mismatch — the portfolio was not created for this market group.",
  },
  17: {
    name: "EngineHiddenLeg",
    hint: "Engine detected a hidden leg (unexpected zero-size outstanding position). Internal error.",
  },
  18: {
    name: "EngineInvalidLeg",
    hint: "Engine received an invalid trade leg. Check asset_index and size.",
  },
  19: {
    name: "EngineStale",
    hint: "Engine position is stale — the market mark price has not been updated recently.",
  },
  20: {
    name: "EngineBStale",
    hint: "Engine B-side (batch) position stale. The batch crank needs to run.",
  },
  21: {
    name: "EngineLockActive",
    hint: "Engine lock is active — a close or recovery is in progress. Wait for it to complete.",
  },
  22: {
    name: "EngineNonProgress",
    hint: "Engine operation made no progress. This usually means a crank was called with nothing to do.",
  },
  23: {
    name: "EngineRecoveryRequired",
    hint: "Engine requires a recovery crank before normal operations can resume.",
  },
  24: {
    name: "EngineCounterOverflow",
    hint: "Engine counter overflow — too many assets or positions. Contact support.",
  },
  25: {
    name: "EngineCounterUnderflow",
    hint: "Engine counter underflow — attempted to decrement a zero counter. Internal error.",
  },
  26: {
    name: "OracleInvalid",
    hint: "Oracle data is invalid. Check the oracle account is a valid Pyth PriceUpdateV2 feed.",
  },
  27: {
    name: "OracleStale",
    hint: "Oracle price is stale. Wait for the oracle to publish a fresh price.",
  },
  28: {
    name: "OracleConfTooWide",
    hint: "Oracle confidence interval too wide. Wait for more stable market conditions.",
  },
  29: {
    name: "InvalidOracleKey",
    hint: "Oracle account key does not match the market's configured oracle feed ID.",
  },
  // ── Fork LP-vault errors (30-41) ─────────────────────────────────────────────
  30: {
    name: "LpVaultAlreadyExists",
    hint: "LP vault already created for this asset domain. Each domain can only have one LP vault.",
  },
  31: {
    name: "LpVaultNotFound",
    hint: "LP vault does not exist for this asset domain. Call CreateLpVault (tag 74) first.",
  },
  32: {
    name: "LpVaultPaused",
    hint: "LP vault is paused. Wait for the vault to be unpaused by the admin.",
  },
  33: {
    name: "LpVaultSharesOutstanding",
    hint: "Cannot close LP vault — shares are still outstanding. All redeemers must exit first.",
  },
  34: {
    name: "LpVaultZeroAmount",
    hint: "LP vault deposit or redemption amount must be greater than zero.",
  },
  35: {
    name: "LpVaultInsufficientShares",
    hint: "Insufficient LP vault shares to redeem. Check your share balance.",
  },
  36: {
    name: "LpVaultCooldownActive",
    hint: "LP vault redemption cooldown is still active. Wait for the cooldown period to elapse.",
  },
  37: {
    name: "LpVaultOiReservationViolated",
    hint: "LP vault deposit would violate the OI reservation limit. The vault has insufficient capacity.",
  },
  38: {
    name: "LpVaultNoFeesToCrank",
    hint: "No new fees to distribute to the LP vault. Wait for more trading activity.",
  },
  39: {
    name: "LpVaultSupplyMismatch",
    hint: "LP vault share supply / capital mismatch. Internal invariant violation — please report.",
  },
  40: {
    name: "LpVaultAuthorityMismatch",
    hint: "LP vault authority mismatch. The vault belongs to a different market group or admin.",
  },
  41: {
    name: "LpVaultZeroSharesMinted",
    hint: "First LP deposit minted zero shares (capital too small relative to existing NAV). Deposit a larger amount.",
  },
  // ── Fork NFT / B-3 errors (42-46) ────────────────────────────────────────────
  42: {
    name: "NftRegistryNotFound",
    hint: "NFT registry not found. Call SetNftProgramId (tag 73) to register the percolator-nft program first.",
  },
  43: {
    name: "NftPortfolioNotTransferable",
    hint: "Portfolio is not in a transferable state. Ensure the portfolio has no open positions or pending operations.",
  },
  44: {
    name: "NftTransferSelfOrZero",
    hint: "Cannot transfer portfolio to the zero address or to the current owner.",
  },
  45: {
    name: "NftInvalidMintAuthority",
    hint: "NFT mint authority mismatch. The percolator-nft program may not match the registered NFT program ID.",
  },
  46: {
    name: "NftPortfolioProvenance",
    hint: "Portfolio provenance mismatch for NFT transfer. The portfolio was not created for this market group.",
  },
  // ── Insurance withdrawal policy enforcement (F-1 / F-2) (47-48) ─────────────
  // Source: v16_program.rs PercolatorError variants appended after NftPortfolioProvenance.
  47: {
    name: "InsuranceWithdrawCooldownActive",
    hint: "Insurance withdrawal cooldown is still active (F-1). Wait for the cooldown period to elapse before withdrawing.",
  },
  48: {
    name: "InsuranceWithdrawCeilingExceeded",
    hint: "Insurance withdrawal would exceed the deposits-only ceiling (F-2). Reduce the withdrawal amount or wait for more deposits.",
  },
  // ── EngineInsufficientInitialMargin (49) ─────────────────────────────────────
  // TODO: confirm discriminant once percolator-anchor ships EngineInsufficientInitialMargin.
  // Tentative ordinal 49 (appended after InsuranceWithdrawCeilingExceeded=48).
  // This is a distinct error for initial-margin failure (previously surfaced as
  // the opaque EngineInvalidConfig=14). Update the ordinal key if the anchor
  // agent places it at a different position in the PercolatorError enum.
  49: {
    name: "EngineInsufficientInitialMargin",
    hint: "Insufficient initial margin for this trade or position open. Deposit more collateral or reduce the position size.",
  },
};
for (const v of Object.values(PERCOLATOR_ERRORS)) Object.freeze(v);
Object.freeze(PERCOLATOR_ERRORS);

/**
 * Decode a custom program error code to its info.
 *
 * @param code Custom error code from `custom program error: 0x<hex>`.
 * @returns ErrorInfo with name and hint, or undefined if the code is not recognized.
 */
export function decodeError(code: number): ErrorInfo | undefined {
  return PERCOLATOR_ERRORS[code];
}

/**
 * Get error name from code.
 *
 * @param code Custom error code.
 * @returns Human-readable error name, or "Unknown(<code>)" if not recognized.
 */
export function getErrorName(code: number): string {
  return PERCOLATOR_ERRORS[code]?.name ?? `Unknown(${code})`;
}

/**
 * Get actionable hint for error code.
 *
 * @param code Custom error code.
 * @returns Actionable hint string, or undefined if not recognized.
 */
export function getErrorHint(code: number): string | undefined {
  return PERCOLATOR_ERRORS[code]?.hint;
}

/** Max hex digits for `custom program error: 0x...` — Solana custom errors are u32. */
const CUSTOM_ERROR_HEX_MAX_LEN = 8;

/**
 * Parse a custom program error from transaction logs.
 *
 * Looks for "Program ... failed: custom program error: 0x..." in the log lines.
 * Returns null if no custom error is found.
 *
 * @param logs Array of transaction log strings from the RPC response.
 * @returns Parsed error with code, name, and hint — or null if not found.
 *
 * @example
 * ```ts
 * const err = parseErrorFromLogs(txResult.meta?.logMessages ?? []);
 * if (err) console.error(`${err.name}: ${err.hint}`);
 * ```
 */
export function parseErrorFromLogs(logs: string[]): {
  code: number;
  name: string;
  hint?: string;
} | null {
  if (!Array.isArray(logs)) {
    return null;
  }
  const re = new RegExp(
    `custom program error: 0x([0-9a-fA-F]{1,${CUSTOM_ERROR_HEX_MAX_LEN}})(?![0-9a-fA-F])`,
    "i",
  );
  for (const log of logs) {
    if (typeof log !== "string") {
      continue;
    }
    const match = log.match(re);
    if (match) {
      const code = parseInt(match[1], 16);
      if (!Number.isFinite(code) || code < 0 || code > 0xffff_ffff) {
        continue;
      }
      const info = decodeError(code);
      return {
        code,
        name: info?.name ?? `Unknown(${code})`,
        hint: info?.hint,
      };
    }
  }
  return null;
}
