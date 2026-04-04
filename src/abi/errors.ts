/**
 * Percolator program error definitions.
 * Each error includes a name and actionable guidance.
 */
interface ErrorInfo {
  name: string;
  hint: string;
}

export const PERCOLATOR_ERRORS: Record<number, ErrorInfo> = {
  0: {
    name: "InvalidMagic",
    hint: "The slab account has invalid data. Ensure you're using the correct slab address.",
  },
  1: {
    name: "InvalidVersion",
    hint: "Slab version mismatch. The program may have been upgraded. Check for CLI updates.",
  },
  2: {
    name: "AlreadyInitialized",
    hint: "This account is already initialized. Use a different account or skip initialization.",
  },
  3: {
    name: "NotInitialized",
    hint: "The slab is not initialized. Run 'init-market' first.",
  },
  4: {
    name: "InvalidSlabLen",
    hint: "Slab account has wrong size. Create a new slab account with correct size.",
  },
  5: {
    name: "InvalidOracleKey",
    hint: "Oracle account doesn't match config. Check the --oracle parameter matches the market's oracle.",
  },
  6: {
    name: "OracleStale",
    hint: "Oracle price is too old. Wait for oracle to update or check if oracle is paused.",
  },
  7: {
    name: "OracleConfTooWide",
    hint: "Oracle confidence interval is too wide. Wait for more stable market conditions.",
  },
  8: {
    name: "InvalidVaultAta",
    hint: "Vault token account is invalid. Check the vault account is correctly configured.",
  },
  9: {
    name: "InvalidMint",
    hint: "Token mint doesn't match. Ensure you're using the correct collateral token.",
  },
  10: {
    name: "ExpectedSigner",
    hint: "Missing required signature. Ensure the correct wallet is specified with --wallet.",
  },
  11: {
    name: "ExpectedWritable",
    hint: "Account must be writable. This is likely a CLI bug - please report it.",
  },
  12: {
    name: "OracleInvalid",
    hint: "Oracle data is invalid. Check the oracle account is a valid Pyth price feed.",
  },
  13: {
    name: "EngineInsufficientBalance",
    hint: "Not enough collateral. Deposit more with 'deposit' before this operation.",
  },
  14: {
    name: "EngineUndercollateralized",
    hint: "Account is undercollateralized. Deposit more collateral or reduce position size.",
  },
  15: {
    name: "EngineUnauthorized",
    hint: "Not authorized. You must be the account owner or admin for this operation.",
  },
  16: {
    name: "EngineInvalidMatchingEngine",
    hint: "Matcher program/context doesn't match LP config. Check --matcher-program and --matcher-context.",
  },
  17: {
    name: "EnginePnlNotWarmedUp",
    hint: "PnL not warmed up yet. Wait for the warmup period to complete before trading.",
  },
  18: {
    name: "EngineOverflow",
    hint: "Numeric overflow in calculation. Try a smaller amount or position size.",
  },
  19: {
    name: "EngineAccountNotFound",
    hint: "Account not found at this index. Run 'init-user' or 'init-lp' first, or check the index.",
  },
  20: {
    name: "EngineNotAnLPAccount",
    hint: "Expected an LP account but got a user account. Check the --lp-idx parameter.",
  },
  21: {
    name: "EnginePositionSizeMismatch",
    hint: "Position size mismatch between user and LP. This shouldn't happen - please report it.",
  },
  22: {
    name: "EngineRiskReductionOnlyMode",
    hint: "Market is in risk-reduction mode. Only position-reducing trades are allowed.",
  },
  23: {
    name: "EngineAccountKindMismatch",
    hint: "Wrong account type. User operations require user accounts, LP operations require LP accounts.",
  },
  24: {
    name: "InvalidTokenAccount",
    hint: "Token account is invalid. Ensure you have an ATA for the collateral mint.",
  },
  25: {
    name: "InvalidTokenProgram",
    hint: "Invalid token program. Ensure SPL Token program is accessible.",
  },
  26: {
    name: "InvalidConfigParam",
    hint: "Invalid configuration parameter. Check that leverage, fees, and risk thresholds are within allowed ranges.",
  },
  27: {
    name: "HyperpTradeNoCpiDisabled",
    hint: "TradeNoCpi is disabled for this market. Use TradeCpi with LP matching instead.",
  },
  28: {
    name: "InsuranceMintAlreadyExists",
    hint: "Insurance LP mint already exists for this market. Cannot recreate.",
  },
  29: {
    name: "InsuranceMintNotCreated",
    hint: "Insurance LP mint has not been created yet. Run CreateInsuranceMint first.",
  },
  30: {
    name: "InsuranceBelowThreshold",
    hint: "Insurance fund balance is below the required threshold. Deposit more to insurance fund.",
  },
  31: {
    name: "InsuranceZeroAmount",
    hint: "Insurance deposit/withdrawal amount must be greater than zero.",
  },
  32: {
    name: "InsuranceSupplyMismatch",
    hint: "Insurance LP token supply doesn't match vault balance. This is an internal error - please report it.",
  },
  33: {
    name: "MarketPaused",
    hint: "This market is currently paused by the admin. Trading, deposits, and withdrawals are disabled.",
  },
  34: {
    name: "AdminRenounceNotAllowed",
    hint: "Cannot renounce admin — the market must be RESOLVED first before renouncing admin control.",
  },
  35: {
    name: "InvalidConfirmation",
    hint: "Invalid confirmation code for RenounceAdmin. This is a safety check — please verify the code.",
  },
  36: {
    name: "InsufficientSeed",
    hint: "Vault seed balance is below the required minimum (500,000,000 raw tokens). Deposit more tokens to the vault before InitMarket.",
  },
  37: {
    name: "InsufficientDexLiquidity",
    hint: "DEX pool has insufficient liquidity for safe Hyperp oracle bootstrapping. The quote-side reserves must meet the minimum threshold.",
  },
  38: {
    name: "LpVaultAlreadyExists",
    hint: "LP vault already created for this market. Each market can only have one LP vault.",
  },
  39: {
    name: "LpVaultNotCreated",
    hint: "LP vault not yet created. Call CreateLpVault first before depositing or withdrawing.",
  },
  40: {
    name: "LpVaultZeroAmount",
    hint: "LP vault deposit or withdrawal amount must be greater than zero.",
  },
  41: {
    name: "LpVaultSupplyMismatch",
    hint: "LP vault supply/capital mismatch — LP share supply > 0 but vault capital is 0. This is an internal error — please report it.",
  },
  42: {
    name: "LpVaultWithdrawExceedsAvailable",
    hint: "LP vault withdrawal exceeds available capital. Some capital is reserved for open interest coverage.",
  },
  43: {
    name: "LpVaultInvalidFeeShare",
    hint: "LP vault fee share basis points out of range. Must be 0–10,000 (0%–100%).",
  },
  44: {
    name: "LpVaultNoNewFees",
    hint: "No new fees to distribute to LP vault. Wait for more trading activity to accrue fees.",
  },
  // ── PERC-312 / PERC-314 / PERC-315 / PERC-309 / PERC-8111 / PERC-8110 (codes 45–60) ─────────
  45: {
    name: "SafetyValveDominantSideBlocked",
    hint: "New position on the dominant side is blocked while the market is rebalancing (safety valve).",
  },
  46: {
    name: "DisputeWindowClosed",
    hint: "The dispute window for this resolved market has closed.",
  },
  47: {
    name: "DisputeAlreadyExists",
    hint: "A dispute already exists for this market — cannot open another.",
  },
  48: {
    name: "MarketNotResolved",
    hint: "Market is not resolved — cannot dispute an active market.",
  },
  49: {
    name: "NoActiveDispute",
    hint: "No active dispute found for this market.",
  },
  50: {
    name: "LpCollateralDisabled",
    hint: "LP collateral is not enabled for this market.",
  },
  51: {
    name: "LpCollateralPositionOpen",
    hint: "Cannot withdraw LP collateral while a position is still open.",
  },
  52: {
    name: "WithdrawQueueAlreadyExists",
    hint: "A withdrawal queue entry already exists for this user/market.",
  },
  53: {
    name: "WithdrawQueueNotFound",
    hint: "No queued withdrawal found for this user/market.",
  },
  54: {
    name: "WithdrawQueueNothingClaimable",
    hint: "Nothing is claimable from the withdrawal queue this epoch — wait for the next epoch.",
  },
  55: {
    name: "AuditViolation",
    hint: "Audit crank detected a conservation invariant violation — this is a critical internal error, please report it.",
  },
  56: {
    name: "CrossMarginPairNotFound",
    hint: "Cross-margin offset pair is not configured for these two slabs.",
  },
  57: {
    name: "CrossMarginAttestationStale",
    hint: "Cross-margin attestation is stale — too many slots have elapsed since the last attestation.",
  },
  58: {
    name: "WalletPositionCapExceeded",
    hint: "Trade rejected: the resulting position would exceed the per-wallet position cap (max_wallet_pos_e6) for this market.",
  },
  59: {
    name: "OiImbalanceHardBlock",
    hint: "Trade rejected: it would increase the OI imbalance (|long_oi − short_oi| / total_oi) beyond the configured hard-block threshold (oi_imbalance_hard_block_bps). Try the opposite side.",
  },
  60: {
    name: "EngineInvalidEntryPrice",
    hint: "Entry price must be positive when opening a position.",
  },
  61: {
    name: "EngineSideBlocked",
    hint: "New position blocked — this side is in DrainOnly or ResetPending mode. Wait for the market to stabilise.",
  },
  62: {
    name: "EngineCorruptState",
    hint: "Engine detected a corrupt state invariant violation — this is a critical internal error, please report it.",
  },
  63: {
    name: "InsuranceFundNotDepleted",
    hint: "ADL rejected — insurance fund is not fully depleted (balance > 0). ADL is only permitted once insurance is exhausted.",
  },
  64: {
    name: "NoAdlCandidates",
    hint: "ADL rejected — no eligible candidate positions found for deleveraging.",
  },
  65: {
    name: "BankruptPositionAlreadyClosed",
    hint: "ADL rejected — the target position is already closed (size == 0). Re-rank and pick a different target.",
  },
};

/**
 * Decode a custom program error code to its info.
 */
export function decodeError(code: number): ErrorInfo | undefined {
  return PERCOLATOR_ERRORS[code];
}

/**
 * Get error name from code.
 */
export function getErrorName(code: number): string {
  return PERCOLATOR_ERRORS[code]?.name ?? `Unknown(${code})`;
}

/**
 * Get actionable hint for error code.
 */
export function getErrorHint(code: number): string | undefined {
  return PERCOLATOR_ERRORS[code]?.hint;
}

// ============================================================================
// Lighthouse / Anchor error classification
// ============================================================================

/** Lighthouse v2 program ID (Blowfish/Phantom wallet middleware). */
const LIGHTHOUSE_PROGRAM_ID_STR = "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95";

/**
 * Anchor framework error codes (0x1770–0x1900+) that come from Lighthouse,
 * NOT from Percolator. Our program uses raw BPF with custom codes 0–65.
 */
const ANCHOR_ERROR_RANGE_START = 0x1770;
const ANCHOR_ERROR_RANGE_END = 0x1FFF;

/** Well-known Anchor error names for common codes emitted by Lighthouse. */
const ANCHOR_ERROR_NAMES: Record<number, string> = {
  0x1790: "ConstraintMut",
  0x1794: "ConstraintOwner",
  0x1796: "ConstraintSeeds",
  0x1900: "ConstraintAddress",
};

/**
 * Check whether an error code is in the Anchor framework error range
 * (used by Lighthouse, not Percolator).
 */
export function isAnchorErrorCode(code: number): boolean {
  return code >= ANCHOR_ERROR_RANGE_START && code <= ANCHOR_ERROR_RANGE_END;
}

/** Max hex digits for `custom program error: 0x...` — Solana custom errors are u32. */
const CUSTOM_ERROR_HEX_MAX_LEN = 8;

/**
 * Parse error from transaction logs.
 * Looks for "Program ... failed: custom program error: 0x..."
 *
 * Hex capture is bounded (1–8 digits) so pathological logs cannot feed unbounded
 * strings into `parseInt` or produce precision-loss codes above u32.
 *
 * Distinguishes between:
 * - Percolator program errors (codes 0–65): returns Percolator error info
 * - Anchor/Lighthouse errors (codes 0x1770–0x1FFF): returns Lighthouse-specific
 *   name and hint so callers can handle wallet middleware failures
 */
export function parseErrorFromLogs(logs: string[]): {
  code: number;
  name: string;
  hint?: string;
  source?: "percolator" | "lighthouse" | "unknown";
} | null {
  if (!Array.isArray(logs)) {
    return null;
  }

  // Track whether the failing instruction is inside a Lighthouse invocation
  let insideLighthouse = false;

  const re = new RegExp(
    `custom program error: 0x([0-9a-fA-F]{1,${CUSTOM_ERROR_HEX_MAX_LEN}})(?![0-9a-fA-F])`,
    "i",
  );
  for (const log of logs) {
    if (typeof log !== "string") {
      continue;
    }

    // Track Lighthouse program invocation context
    if (log.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} invoke`)) {
      insideLighthouse = true;
    } else if (log.includes(`Program ${LIGHTHOUSE_PROGRAM_ID_STR} success`)) {
      insideLighthouse = false;
    }

    const match = log.match(re);
    if (match) {
      const code = parseInt(match[1], 16);
      if (!Number.isFinite(code) || code < 0 || code > 0xffff_ffff) {
        continue;
      }

      // Anchor/Lighthouse error range
      if (isAnchorErrorCode(code) || insideLighthouse) {
        const anchorName = ANCHOR_ERROR_NAMES[code] ?? `AnchorError(0x${code.toString(16)})`;
        return {
          code,
          name: `Lighthouse:${anchorName}`,
          hint:
            "This error comes from the Lighthouse/Blowfish wallet guard, not from Percolator. " +
            "The transaction itself is valid. Disable transaction simulation in your wallet " +
            "settings, or use a wallet without Blowfish protection (e.g., Backpack, Solflare).",
          source: "lighthouse",
        };
      }

      // Percolator program error
      const info = decodeError(code);
      return {
        code,
        name: info?.name ?? `Unknown(${code})`,
        hint: info?.hint,
        source: info ? "percolator" : "unknown",
      };
    }
  }
  return null;
}
