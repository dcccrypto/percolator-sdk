/**
 * v2.2 launch settings: ONE table, keyed by asset class, read by the wizard and the seed kit
 * (decision memo D7, 2026-10-29). This file has NO imports so the app can vendor an exact
 * byte-for-byte copy; the sha256 is pinned in `test/v22-launch-settings.test.ts` and mirrored in
 * the consumers' parity tests.
 *
 * Only DECIDED values live here. Insurance, senior seed, holding fee and bond settings are open
 * and deliberately absent.
 *
 * @module
 */

/** Asset class that selects the stale window. Unknown / creator tokens are `meme`. */
export type V22AssetClass = "major" | "meme";

/** Stake pool risk mode byte (stake `state.rs`): 0 legacy, 1 FIRST_LOSS, 2 FEE_ONLY. */
export const V22_STAKE_POOL_MODE_FEE_ONLY = 2 as const;

/** One row of the launch-settings table. All slot counts are Solana slots. */
export interface V22LaunchSettings {
  /** Wrapper tag 38 `ConfigurePermissionlessResolve` stale window (chain bounds 9,000..=6,480,000). */
  readonly staleWindowSlots: number;
  /** Stake pool cooldown passed to the stake InitPool (v5). */
  readonly stakeCooldownSlots: number;
  /** Stake pool risk mode byte; FEE_ONLY (D5). */
  readonly stakePoolMode: typeof V22_STAKE_POOL_MODE_FEE_ONLY;
  /** Earn (vault) redemption cooldown; the program refuses < 150 at the vault-LP bind (D22). */
  readonly earnRedemptionCooldownSlots: number;
}

/**
 * The launch-settings table. Majors settle stale after 18,000 slots (~2 h), memes after 54,000 (~6 h).
 *
 * @example
 * ```ts
 * V22_LAUNCH_SETTINGS.meme.staleWindowSlots; // 54000
 * ```
 */
export const V22_LAUNCH_SETTINGS: Readonly<Record<V22AssetClass, V22LaunchSettings>> = Object.freeze({
  major: Object.freeze({
    staleWindowSlots: 18_000,
    stakeCooldownSlots: 150,
    stakePoolMode: V22_STAKE_POOL_MODE_FEE_ONLY,
    earnRedemptionCooldownSlots: 150,
  }),
  meme: Object.freeze({
    staleWindowSlots: 54_000,
    stakeCooldownSlots: 150,
    stakePoolMode: V22_STAKE_POOL_MODE_FEE_ONLY,
    earnRedemptionCooldownSlots: 150,
  }),
});

/**
 * Mainnet mints classed as `major`: wrapped SOL and Coinbase wrapped BTC (the seed kit's majors).
 * Everything else is a `meme`.
 */
export const V22_MAJOR_MINTS: readonly string[] = Object.freeze([
  "So11111111111111111111111111111111111111112",
  "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
]);

/**
 * Read the settings row for an asset class.
 *
 * @param cls - `"major"` or `"meme"`.
 * @returns The frozen settings row.
 * @example
 * ```ts
 * v22LaunchSettings("major").staleWindowSlots; // 18000
 * ```
 */
export function v22LaunchSettings(cls: V22AssetClass): V22LaunchSettings {
  return V22_LAUNCH_SETTINGS[cls];
}

/**
 * Classify a collateral/base mint. Unknown mints (creator tokens) default to `meme`.
 *
 * @param mint - Base58 mint address.
 * @returns `"major"` if the mint is in {@link V22_MAJOR_MINTS}, else `"meme"`.
 * @example
 * ```ts
 * classifyV22Asset("So11111111111111111111111111111111111111112"); // "major"
 * classifyV22Asset("8PzFWyLpCVEmbZmVJcaRTU5r69XKJx1rd7YGpWvnpump"); // "meme"
 * ```
 */
export function classifyV22Asset(mint: string): V22AssetClass {
  return V22_MAJOR_MINTS.includes(mint) ? "major" : "meme";
}
