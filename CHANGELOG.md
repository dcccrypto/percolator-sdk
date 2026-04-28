# Changelog

All notable changes to `@percolator/sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [2.0.2] — 2026-04-28

V12_19 SBF layout fix using authoritative probe-verified values. v2.0.1's
V12_19 constants were speculative and turned out to be wrong on every
value (engineOff, configLen, accountSize, slab tier sizes). v2.0.2
replaces them with values extracted from `cargo build-sbf --features small`
compile-error messages on deliberately-wrong const assertions in the
wrapper. Every value below was confirmed against the same wrapper code
that produced the deployed mainnet binary (sha256 `205c0e77...`).

### Authoritative v12.19 SBF values (replacing v2.0.1's wrong ones)

| constant | v2.0.1 (wrong) | v2.0.2 (probe-confirmed) |
|---|---|---|
| HEADER_LEN | 72 (V12_17 inheritance) | **136** |
| CONFIG_LEN | 528 | **480** |
| ENGINE_OFF | 600 | **616** |
| ACCOUNT_SIZE | 352 (V12_17 inheritance) | **360** |
| SLAB_LEN small | 94168 (cu_benchmark stale) | **96760** |

V12_19 RiskEngine internal offsets (rel to engine start):

| field | v2.0.1 | v2.0.2 |
|---|---|---|
| current_slot | 216 | **200** |
| market_mode | 224 | **208** |
| c_tot | 328 | **312** |
| pnl_pos_tot | 344 | **328** |
| pnl_matured_pos_tot | 360 | **344** |
| oi_eff_long_q | 488 | **472** |
| oi_eff_short_q | 504 | **488** |
| neg_pnl_count | 608 | **584** |
| rr_cursor_position | 616 | **592** |
| last_oracle_price | 640 | **624** |
| fund_px_last | 648 | **632** |
| last_market_slot | 656 | **640** |
| f_long_num | 664 | **648** |
| f_short_num | 680 | **664** |

Account size grew (352 -> 360) and accounts are now INLINE within
RiskEngine struct (was separate in V12_17). For the small tier
(MAX_ACCOUNTS=256), accounts start at engineOff + 1776.

V12_19 MarketConfig SBF offsets newly added:
- hyperp_authority +144
- last_effective_price_e6 +192
- tvl_insurance_cap_mult +202
- oracle_price_cap_e2bps +216
- min_oracle_price_cap_e2bps +224
- maintenance_fee_per_slot +320
- dex_pool +368
- max_pnl_cap +400
- oi_cap_multiplier_bps +416
- pending_admin +448

### Fixed

- `V12_19_SIZES` now contains correct slab sizes
  (26848/96760/376408/1495000) instead of stale cu_benchmark constants.
- `buildLayoutV12_19` computes accountsOff dynamically per tier (accounts
  are inline within RiskEngine starting after `prev_free` + 8-byte align).
- `parseEngine` V12_19 detection switched from
  `engineOff === V12_19_ENGINE_OFF_SBF` (which never matched anything in
  v2.0.1) to `accountSize === V12_19_ACCOUNT_SIZE_SBF` (matches probe-
  confirmed 360 byte v12.19 SBF Account).

### Methodology

Probe values were extracted by adding `#[cfg(target_arch = "sbf")] const _:
[(); 0] = [(); offset_of!(...)]` blocks to the wrapper, running
`cargo build-sbf --features small`, and reading the compile-error
messages that revealed the actual SBF offsets. The wrapper was then
reverted clean (no source changes shipped). Same source as deployed
binary, so values match the deployed program byte-for-byte.

### Gates

- pnpm test 792 PASS / 31 SKIPPED.
- pnpm lint clean.

### Deprecations

v2.0.0 and v2.0.1 are both incorrect for parsing v12.19 slabs. They are
SAFE for transaction building (encoders, account specs, IX_TAGs are all
still byte-correct). Run `npm deprecate @percolatorct/sdk@2.0.0
"v12.19 layout incorrect, use 2.0.2+"` and same for 2.0.1.

---

## [2.0.1] — 2026-04-28

Correctness fix discovered during post-deploy further-verification. The
v2.0.0 V12_19 slab layout incorrectly inherited engine field offsets from
V12_17 SBF, but the V12_19 RiskEngine struct grew significantly (added
resolved_slot, adl_mult/coeff/epoch_*, side_mode_*, stored_pos_count_*,
phantom_dust_bound_*, rr_cursor_position, sweep_generation,
last_market_slot, etc.; removed last_crank_slot and gc_cursor).

### Fixed

- `buildLayoutV12_19` now uses V12_19-specific engine field offsets
  derived by walking the v12.19 RiskEngine struct definition at
  `/Users/khubair/perc-sync/work/percolator/src/percolator.rs:581`,
  cross-checked against probe constants in
  `/Users/khubair/perc-sync/work/percolator-prog/tests/test_conservation.rs:4574,4586`
  and `/Users/khubair/perc-sync/work/percolator-prog/tests/common/mod.rs:2185`:
  - `c_tot` at engine+328 (was 336 in v2.0.0).
  - `pnl_pos_tot` at engine+344 (was 352).
  - `oi_eff_long/short` at engine+488/504 (was 504/520).
  - `last_market_slot` at engine+656 (replaces V12_17 `last_crank_slot`).
  - `rr_cursor_position` at engine+616 (replaces V12_17 `gc_cursor`).
- `parseEngine` recognises V12_19 explicitly via
  `layout.engineOff === V12_19_ENGINE_OFF_SBF` and routes to V12_19
  field offsets instead of conflating with V12_17 SBF.

### Impact

Consumers of v2.0.0 calling `parseEngine` against any v12.19 slab on
mainnet would have read garbage values for `cTot`, `pnlPosTot`,
`pnlMaturedPosTot`, `longOi`, `shortOi`, `lastCrankSlot`, `gcCursor`.
The bug was latent because no v12.19 slabs exist on the deployed program
yet — no markets created post-2026-04-28 upgrade. v2.0.1 fixes it before
the first market is initialised.

Transaction-building paths (encoders, account specs, IX_TAG bytes,
PDAs) were unaffected and remain byte-correct.

### Gates

- pnpm test 792 PASS / 31 SKIPPED.
- pnpm lint clean.
- pnpm build clean.

---

## [2.0.0] — 2026-04-28

Stable release. Cut after the v12.19 mainnet upgrade landed at slot
416196178 (tx `n6UunJ6a7xB3hCd54CMxPszHgkHKoHyaSUdEyTq8rGEz9tmoycBGsrFRVXt3Wkg6fm1ASRaH1p9SR6wEL5o9DBn`)
and post-merge verification confirmed GO.

### Added

- `buildLayoutV12_19` in `src/solana/slab.ts`. Inherits engine internals
  from V12_17 SBF; differs only in `engineOff` (600 vs 584) and
  `configLen` (528 vs 512). Tier sizes match the wrapper's compile-time
  constants in `tests/cu_benchmark.rs:49-64`:
  - `--features micro`: 19_640 bytes (64 accounts).
  - `--features small`: 94_168 bytes (256 accounts) — currently deployed
    to mainnet program `ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv`.
  - `--features medium`: 372_280 bytes (1024 accounts).
  - default: 1_484_728 bytes (4096 accounts).
- `detectSlabLayout` checks V12_19 sizes before V12_17 SBF. The
  collision (94168 in both) resolves to V12_19 in practice because the
  deployed program produces v12.19 slabs only.
- `parseEngine` recognises `engineOff === 600` as V12_19 SBF (same
  internals as V12_17 SBF).

### Mainnet state at release

- program `ESa89R5...` upgraded to v12.19 `--features small`.
- last deployed slot 416196178.
- new binary 626,136 bytes (sha256 `205c0e77865612bd3a529bd851a956acb712543faede318a79c2765ebaa032ea`).

---

## [2.0.0-rc.1] — 2026-04-28

Single-target SDK aligned to wrapper v12.19 (PR #271, branch
sync/v12.19-wrapper, commit d760fc4). The dual v12.17/v12.19 target shape
introduced in 2.0.0-rc.0 is removed because the stale mainnet program at
ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv is being abandoned and the
v12.19 deployment is the next mainnet upgrade.

### Removed

- `src/vanilla.ts` and the `@percolatorct/sdk/vanilla` subpath export.
- `WrapperTarget` type and every `target?: 'v12.17' | 'v12.19'` parameter.
- v12.17 default branches in `encodeInitMarket` and `encodeUpdateConfig`.
- The throw-without-target gate on `encodeInitSharedVault`,
  `encodeAllocateMarket`, `encodeQueueWithdrawalSV`,
  `encodeClaimEpochWithdrawal`, `encodeAdvanceEpoch`.
- `test/parity/v12.17-encoder-bytes.parity.test.ts` and
  `fixtures/parity/v12.17-encoder-bytes.json`.
- `test/vanilla.test.ts` and `VANILLA.md`.

### Changed

- `encodeInitMarket` always emits the 304-byte v12.19 base payload.
  Previously defaulted to 344-byte v12.17 layout. Wrapper anchor:
  `src/percolator.rs:1786` (handle_init_market decode in d760fc4).
- `encodeUpdateConfig` always emits 35 bytes including
  `tvl_insurance_cap_mult: u16`. Wrapper anchor:
  `src/percolator.rs:2027-2041` (handle_update_config decode).
- 5 PERC-628 shared-vault encoders (tags 59-63) emit valid v12.19 bytes
  unconditionally.

### Fixed

- **H-1 ACCOUNTS_TRADE_NOCPI: 4 -> 5** accounts. Inserts clock at index 3.
  Wrapper: `src/percolator.rs:8484` expect_len(5).
- **H-2 ACCOUNTS_TOPUP_INSURANCE: 5 -> 6**. Appends clock at index 5.
  Wrapper: `src/percolator.rs:9256` expect_len(6).
- **H-3 ACCOUNTS_UPDATE_CONFIG: 2 -> 3**. Appends clock at index 2.
  Wrapper: `src/percolator.rs:9544` accepts 3 OR 4 (canonical 3-form).
- **H-4 ACCOUNTS_SET_ORACLE_PRICE_CAP: 2 -> 3**. Appends clock at index 2.
  Wrapper: `src/percolator.rs:9654` expect_len(3).
- **H-5 ACCOUNTS_RESOLVE_MARKET: 2 -> 4**. Appends clock + oracle.
  Wrapper: `src/percolator.rs:9748` expect_len(4).
- **H-7 deriveInsuranceLpMint** seed `"ins_lp"` -> `"lp_vault_mint"`.
  Wrapper: `src/percolator.rs:2543` derive_lp_vault_mint.

### Deferred

- **B-9 V12_19 slab layout descriptor** — V12_19 tier sizes
  (19_640 / 94_168 / 372_280 / 1_484_728) collide with V12_17 SBF tier
  sizes. Disambiguator + buildLayoutV12_19 land post-mainnet-deploy when
  a real v12.19 slab can be fingerprinted. Tracked in
  `audit-2026-04-28-v12.19/FINAL.md`.
- **W-1 wrapper sdk_parity_fixtures.rs** missing `UpdateAuthority` tag 83.
  One-line wrapper patch deferred to user (see
  `audit-2026-04-28-v12.19/phase-4-deferred.md`). `pnpm run parity:check`
  remains red until that lands on PR #271.

### Gates

- `pnpm test`: 792 PASS / 31 SKIPPED (was 832 in rc.0, lost 40 from
  dropped vanilla + v12.17 parity tests).
- `pnpm lint`: clean.
- `pnpm build`: clean. `dist/index.js` = 264 KB (no `dist/vanilla.js`).
- `pnpm run parity:check`: red until W-1 wrapper patch lands.

---

## [2.0.0-rc.0] — 2026-04-27

Two-track package split. Adds `@percolatorct/sdk/vanilla` subpath with
the minimal v12.17.7 deployed-line encoder surface (27 instructions,
28 KB bundle). The default `@percolatorct/sdk` import is unchanged
and continues to expose the full fork-extended surface.

Major version bump because the new subpath export is part of the
public API surface contract per SemVer §5.

### Added

- `src/vanilla.ts` entry point.
- `package.json` `exports` field maps `./vanilla`.
- `tsup.config.ts` emits `dist/vanilla.js` and `dist/vanilla.d.ts`.
- `test/vanilla.test.ts` enforces export-set invariant against
  `audit-2026-04-27/vanilla-subset.md`.
- `VANILLA.md` documents the subset and when to use it.

### Changed

- README adds "two flavors" section.

### Coverage

Tests: 826 -> 832 PASS. 31 SKIPPED unchanged. Bundle sizes:
`dist/index.js` 265 KB, `dist/vanilla.js` 28 KB.

---

## [1.0.0-beta.39-presync] — 2026-04-27

v12.19 forward-port + v12.20 prep. Cut on `sync/v12.19-sdk` branch
because PR #88 (engine) and PR #271 (wrapper) are still OPEN MERGEABLE
at the time of cut. NPM publish is blocked until both PRs merge.

### Added

- `WrapperTarget` type. Encoders whose wire format diverges between
  v12.17 and v12.19 accept `target?: 'v12.17' | 'v12.19'` defaulting
  to `'v12.17'` for backward compatibility.
- `encodeUpdateConfig({ target: 'v12.19', tvlInsuranceCapMult })`
  appends `u16` field for the v12.19 35-byte payload. Wrapper
  anchor: src/percolator.rs:2027 (decode).
- `encodeInitMarket({ target: 'v12.19', ... })` produces the 304-byte
  base payload (drops `maxInsuranceFloor`, `minOraclePriceCap`,
  `minInitialDeposit`). Wrapper anchor: src/percolator.rs:1789-1893.
- PERC-628 shared vault encoders un-throw under `target: 'v12.19'`:
  `encodeInitSharedVault`, `encodeAllocateMarket`,
  `encodeQueueWithdrawalSV`, `encodeClaimEpochWithdrawal`,
  `encodeAdvanceEpoch`. Wrapper anchors: src/percolator.rs:2249-2263.
- 17 v12.19 byte-parity tests at
  `test/parity/v12.19-encoder-bytes.parity.test.ts`.

### Changed

- README documents the new wrapper-version target convention.

### Deferred

`audit-2026-04-27/v12.20-design-notes.md` covers three upstream wrapper
commits (`c175ec4`, `f04720e`, `5229c1c`) deferred per the freeze
policy. Each has a documented migration plan for the next sync session.

### Coverage

Tests: 809 -> 826 PASS. 31 SKIPPED unchanged.

---

## [1.0.0-beta.38] — 2026-04-27

Coverage and correctness audit on the v12.17.7 deployed line. Audit
artifacts under `audit-2026-04-27/`. Wrapper baseline d760fc4
(tag h-new-1-resolved).

### Added

- `encodeUpdateAuthority` (tag 83). v12.18.x 4-way authority split.
  `AUTHORITY_KIND` const map with `Admin=0`, `HyperpMark=1`,
  `Insurance=2`, `InsuranceOperator=4`. Wrapper anchor:
  `src/percolator.rs:6876`.
- `encodeReclaimEmptyAccount` (tag 25). Wrapper handler at
  `src/percolator.rs:10470`. Permissionless §2.6 / §10.7.
- `encodeSettleAccount` (tag 26). Wrapper handler at
  `src/percolator.rs:10503`. Permissionless §10.2.
- `encodeDepositFeeCredits` (tag 27). Wrapper handler at
  `src/percolator.rs:10557`. Owner-only §10.3.1.
- `encodeConvertReleasedPnl` (tag 28). Wrapper handler at
  `src/percolator.rs:10636`. Owner-only §10.4.1.
- `ACCOUNTS_RECLAIM_EMPTY_ACCOUNT`, `ACCOUNTS_SETTLE_ACCOUNT`,
  `ACCOUNTS_DEPOSIT_FEE_CREDITS`, `ACCOUNTS_CONVERT_RELEASED_PNL`,
  `ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY`, `ACCOUNTS_UPDATE_AUTHORITY`.
- 27 byte-level parity tests under `test/parity/v12.17-encoder-bytes.parity.test.ts`
  pinning encoder output against wrapper decode positions documented
  in `audit-2026-04-27/borsh-audit.md`.
- Coverage gate test enumerating the v12.17.7 reachable instruction
  set and asserting every name has an `IX_TAG` entry.
- `UpdateAuthority` entry in `specs/wrapper-tags.json` and the
  `parity-fixtures.test.ts` `sdkMap`.

### Changed

- `encodeUpdateConfig` jsdoc now documents the v12.17 vs v12.19
  wire format split. v12.17 stays at 33 bytes (4 funding fields).
  v12.19 adds `tvl_insurance_cap_mult: u16` for 35-byte total per
  wrapper commit `4ec51cc`. The v12.19 SDK target lands in beta.39.

### Audit findings

- 0 BLOCKING issues.
- 2 HIGH (G-1 UpdateConfig drift v12.19-only, G-2 UpdateAuthority encoder
  missing). G-2 fixed here. G-1 deferred to beta.39 (v12.19 target).
- 4 MEDIUM (G-3 missing per-account encoders 25-28, G-5 deprecated-but-
  handler-exists tags 59-63, G-6 wrapper parity binary missing tag 83,
  G-7 zero parity coverage). G-3 + G-7 fixed here. G-5 deferred to
  beta.39. G-6 logged at `audit-2026-04-27/wrapper-findings.md`.
- 1 LOW (G-4 missing `ACCOUNTS_SET_INSURANCE_WITHDRAW_POLICY`). Fixed.
- 11 deprecated-both-sides entries verified correct.

### Wrapper findings

`audit-2026-04-27/wrapper-findings.md` records one wrapper-side issue:
`src/bin/sdk_parity_fixtures.rs` omits tag 83 UpdateAuthority. Cannot
push wrapper from this session. Tracked for the next wrapper sync.

### Coverage

Tests: 782 -> 809 PASS. 31 SKIPPED unchanged.

---

## [1.0.0-beta.33] — 2026-04-19

### Fixed

- Corrected SDK drift against the live `percolator-stake`, `percolator-prog`, and `percolator-nft` programs.
- Stake SDK now treats tombstoned admin proxy tags `5-9` and `11` as removed, keeps tag `10` aligned with `ReturnInsurance`, and adds live tag `18` for `SetMarketResolved`.
- Standalone NFT parsing now decodes `positionOwner` from the current on-chain account layout.
- Wrapper instruction encoders for removed or disabled paths now fail fast instead of serializing dead tags.
- Added missing account-order specs for active wrapper handlers including permissionless resolve, resolved force-close, LP vault flows, dispute flows, LP collateral, offset pairs, and orphan recovery.

### Changed

- Tightened parity tests so they assert current on-chain behavior instead of accepting legacy instruction layouts.

## [1.0.0-beta.29] — 2026-04-17

- **BREAKING**: Removed `encodeSetOracleAuthority` (IX 16) and `encodePushOraclePrice` (IX 17). The on-chain program no longer supports admin-pushed oracle prices; all live markets must use Pyth, Chainlink, or Hyperp DEX-fed oracles. Phase G of pre-audit hardening — see percolator-prog commit 5391dc4.

---

## [1.0.0-beta.1] — 2026-04-04

### Changed

- **Version bump to 1.0.0-beta.1** (PERC-8474): SDK is functionally complete and mainnet-ready.
  All 709 tests passing. Bumped from `0.5.1` to `1.0.0-beta.1` for public release preparation.

- **`package.json` exports condition order fixed**: `types` condition moved before `import`/`require`
  to resolve tsup build warnings and follow TypeScript `moduleResolution: "bundler"` best practice.

### Notes

- Not yet published to npm. Awaiting Helius API key provisioning + mainnet market deployment.
- See `RELEASE.md` for full release notes, install instructions, and migration guide.

---

## [1.0.0-rc.6] — 2026-04-04

### Added

- **RPC connection pool (`RpcPool`)** (PR#123, PERC-8453): Multi-endpoint connection pool
  with configurable failover and weighted round-robin strategies. Automatically retries
  transient errors (429, 502, 503, 504, network errors) with exponential backoff. Marks
  endpoints unhealthy after consecutive failures and recovers them automatically.

- **Configurable retry logic (`withRetry`)** (PERC-8453): Standalone exponential-backoff
  retry wrapper for any async function. Supports `maxRetries` (default 3), `baseDelayMs`
  (default 500ms), `maxDelayMs` (default 10s), configurable `jitterFactor`, and custom
  `retryableStatusCodes`.

- **RPC health probe (`checkRpcHealth`)** (PERC-8453): Utility that probes an RPC endpoint
  by calling `getSlot()` and measuring round-trip latency. Returns `{ healthy, latencyMs,
  slot, error }`. Also available as `pool.healthCheck()` for all endpoints at once.

- **Request timeout configuration** (PERC-8453): `RpcPool` supports `requestTimeoutMs`
  (default 30s) applied to every `call()` via `Promise.race`.

- **Full TypeScript types** (PERC-8453): `RetryConfig`, `RpcEndpointConfig`,
  `RpcPoolConfig`, `SelectionStrategy`, `RpcHealthResult` — all exported.

- **57 unit tests** for retry logic, pool behavior, failover, round-robin, timeout handling,
  and health probing.

---

## [1.0.0-rc.5] — 2026-04-04

### Added

- **Tier-3 static bundle fallback for `discoverMarkets()`** (PR#119, PERC-8435):
  When both `getProgramAccounts` (tier 1) and the REST API (tier 2) are unavailable,
  `discoverMarkets()` now falls back to a bundled static list of known slab addresses.
  Addresses are fetched on-chain via `getMarketsByAddress` (`getMultipleAccounts`),
  ensuring all data is still verified on-chain. Enabled by passing `network: "mainnet"`
  (or `"devnet"`) in `DiscoverMarketsOptions`.

- **`discoverMarketsViaStaticBundle()`** (PERC-8435): Standalone function to discover
  markets from a static address list. Used internally by tier-3 fallback and also
  available as a public API for callers who want direct control.

- **Static market registry** (PERC-8435): `getStaticMarkets()`, `registerStaticMarkets()`,
  and `clearStaticMarkets()` — runtime-extensible registry of known slab addresses per
  network. Bundled lists can be augmented at runtime before calling `discoverMarkets()`.

---

## [1.0.0-rc.4] — 2026-04-04

### Added

- **`discoverMarketsViaApi()`** (PR#118, PERC-8424, GH#59): API-first market discovery —
  queries the Percolator REST API (`GET /markets`) for slab addresses, then fetches full
  on-chain data via `getMarketsByAddress` (`getMultipleAccounts`). Works on any RPC
  endpoint including public mainnet nodes. Recommended for mainnet users without a
  Helius API key.

- **`apiBaseUrl` option for `discoverMarkets()`** (PERC-8424, GH#59): When set,
  `discoverMarkets()` automatically falls back to the REST API if `getProgramAccounts`
  returns 0 results or is rejected by the RPC node. Combined with `apiTimeoutMs` for
  timeout control. Enables graceful degradation on public RPCs.

### Changed

- **`discoverMarkets()` memcmp fallback resilience** (PERC-8424): The memcmp fallback
  path (used when all dataSize tier queries fail) now catches its own errors instead of
  propagating, allowing the API fallback to execute when available.

---

## [1.0.0-rc.3] — 2026-04-04

### Added

- **`getMarketsByAddress()`** (PR#105, PERC-8407, GH#59): Fetch and parse Percolator
  markets by known slab addresses using `getMultipleAccounts`. Unlike `discoverMarkets()`
  (which uses `getProgramAccounts` — blocked on public mainnet RPCs), this works on any
  RPC endpoint including `api.mainnet-beta.solana.com`. Supports batching (max 100 per
  call), inter-batch delay, and graceful skipping of invalid/missing accounts.

---

## [1.0.0-rc.2] — 2026-04-04

Post-merge hardening release. 14 PRs merged since rc.1: 5 new utility functions,
8 security/correctness fixes from extended audit, and 1 regression fix.

### New Exports

| Export | PR | Description |
|--------|-----|-------------|
| `computeMaxWithdrawable` | #88 | Calculate maximum withdrawable amount for a position |
| `isAccountFlat` | #89 | Check if an account has no open positions |
| `filterOpenPositions` | #89 | Filter account list to only accounts with open positions |
| `computeWarmupProgress` | #90 | Track position warmup countdown toward full leverage |
| `getSlabHealth` | #92 | Assess market slab health status (utilization, capacity) |

### Fixed

- **`isAdlTriggered` regression** (PR#103, GH#102): Returns `false` for unrecognized slab
  layouts instead of throwing. Defensive fix — matches catch-all behavior at function bottom.
  (PERC-8402)

- **`encodePushOraclePrice` validation** (PR#91): Input validation added to oracle price
  push instruction — rejects invalid price/exponent/confidence inputs before encoding.

- **`computeWarmupLeverageCap` negative input** (PR#94, medium): Negative warmup progress
  values now throw instead of producing nonsensical leverage caps.

- **`computeEmaMarkPrice` overflow** (PR#95, medium): Divides early to prevent integer
  overflow when EMA inputs approach `BigInt(2^53)` boundary.

- **`computeMeteoraDlmmPriceE6` unbounded loop** (PR#96, medium): Exponentiation loop now
  has iteration limit (256) to prevent DoS on malicious bin step values.

- **ADL event parsing truncation** (PR#97, medium): `targetIdx` validated against u16 range
  before `BigInt`→`Number` conversion to prevent silent truncation.

- **`parseAccount` bounds check** (PR#98, medium): `acctOwnerOff` validated against buffer
  length before read — prevents out-of-bounds access on truncated slab data.

- **Validation function Number truncation** (PR#99, low): `Number.MAX_SAFE_INTEGER` checks
  added to all validation utility functions that convert BigInt to Number.

- **ADL ranking sign convention** (PR#100, low): Explicit validation that long-side PnL > 0
  and short-side PnL < 0 in ADL ranking — rejects reversed-sign positions.

### Known Issues

- **GH#59**: `discoverMarkets()` requires a Helius (or equivalent) paid-tier RPC on mainnet.
  Public `api.mainnet-beta.solana.com` rejects `getProgramAccounts`. The `sequential: true`
  mode with retry also fails because the public RPC blocks the call entirely, not just
  rate-limits it. **Workaround for public RPC users**: not currently possible for market
  discovery. Consumers must use a paid RPC provider that supports `getProgramAccounts`.
  A future `getMarketsByAddress()` function using `getMultipleAccounts` (which public RPCs
  do support) is planned as an alternative for callers who already know market addresses.

---

## [1.0.0-rc.1] — 2026-03-31

This is the first release-candidate for `@percolator/sdk` v1. It targets the Percolator V_ADL
on-chain program (mainnet + devnet) and includes every breaking change and new API introduced
since the `0.2.0` baseline.

### Breaking Changes

- **`parseSlab` / `detectSlabLayout` now throw on unrecognized slab sizes.**
  Previously, unrecognized sizes silently returned a null layout or fell back to a best-guess
  parse. Now `detectSlabLayout` returns `null` and callers (including `parseEngine`) throw
  a descriptive error. Update any catch logic that expected a silent fallback.

- **`readNonce` / `readLastThrUpdateSlot` throw on null layout.**
  Both functions now throw `Error("slab layout is null — cannot read nonce/slot")` when
  called with a buffer that has no recognized layout, instead of returning `0n` silently.

- **`computePnlPercent` now throws on BigInt-to-Number precision loss.**
  When `capital` exceeds `Number.MAX_SAFE_INTEGER` the function now throws rather than
  silently returning an inaccurate float. Use the BigInt-based path or scale inputs down.

- **`encodeExecuteAdl` validates `targetIdx` range.**
  Passing a `targetIdx < 0` or `targetIdx > 65535` now throws immediately with a clear message
  instead of silently encoding a truncated u16.

- **`buildIx` / `simulateOrSend` validate `signers` array.**
  Passing an empty signers array now throws before hitting the RPC, rather than causing an
  opaque "missing signature" RPC error.

- **`getProgramId` / `getMatcherProgramId` / `getCurrentNetwork` default to `"devnet"`.**
  The default is intentionally devnet for safety (PERC-697). Pass `"mainnet"` explicitly or set
  `NETWORK=mainnet` in the environment for mainnet operations. Production deployments (Railway)
  always set `NETWORK` explicitly.

- **`encodeSetOiImbalanceHardBlock` / `encodeSetOracleAuthority` tag slots changed.**
  These were emitted with incorrect tags in `0.1.x`. Tags are now correct:
  `SetOiImbalanceHardBlock = 71`, `SetOracleAuthority = 16`.

### New Exports

The following symbols are now part of the public API (all re-exported from the root index):

#### ADL types and functions (PERC-8278 / PERC-8312)

| Export | Description |
|--------|-------------|
| `AdlRankedPosition` | Ranked position record (idx, pnl, pnlPct, side, adl_rank) |
| `AdlRankingResult` | Full ranking snapshot: `ranked[]`, top `longs`/`shorts`, `isTriggered` |
| `AdlEvent` | Decoded on-chain `ExecuteAdl` event log entry |
| `AdlApiRanking` | Single ranked position from `/api/adl/rankings` HTTP endpoint |
| `AdlApiResult` | Full HTTP API response including trigger flags and insurance state |
| `AdlSide` | `"long" \| "short"` |
| `fetchAdlRankedPositions` | Fetch slab, rank all open positions by PnL% (requires RPC) |
| `rankAdlPositions` | Pure (no-RPC) ranking of already-fetched slab bytes |
| `isAdlTriggered` | Check if slab's `pnl_pos_tot` exceeds `max_pnl_cap` |
| `buildAdlInstruction` | Build a single `ExecuteAdl` `TransactionInstruction` |
| `buildAdlTransaction` | Fetch + rank + pick top target + return instruction |
| `parseAdlEvent` | Decode `AdlEvent` from transaction log lines |
| `fetchAdlRankings` | Fetch ADL rankings from `/api/adl/rankings` HTTP endpoint |

#### Error codes 61–65

| Code | Name | Trigger |
|------|------|---------|
| 61 | `EngineSideBlocked` | Trade blocked — dominant side in DrainOnly/ResetPending mode |
| 62 | `EngineCorruptState` | Critical: slab state invariant violated |
| 63 | `InsuranceFundNotDepleted` | ADL rejected — insurance fund still has balance > 0 |
| 64 | `NoAdlCandidates` | ADL rejected — no eligible positions to deleverage |
| 65 | `BankruptPositionAlreadyClosed` | ADL rejected — target position already closed |

All five codes are included in `PERCOLATOR_ERRORS`, returned by `decodeError(code)`,
and parsed automatically by `parseErrorFromLogs(logs)`.

#### Admin instruction helpers (PERC-8110 / PERC-8180)

| Export | Description |
|--------|-------------|
| `encodeSetOiImbalanceHardBlock` | Encode `SetOiImbalanceHardBlock` instruction data (tag=71) |
| `ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK` | Account descriptor for the instruction |
| `encodeSetOracleAuthority` | Encode `SetOracleAuthority` instruction data (tag=16) |
| `ACCOUNTS_SET_ORACLE_AUTHORITY` | Account descriptor for the instruction |
| `IX_TAG` | Instruction tag enum — all 65+ instruction tags |

#### Shared vault instructions (PERC-628)

`QueueWithdrawalSV`, `ClaimEpochWithdrawal`, `AdvanceEpoch` are now exported instruction tags.

#### Slab layout constants (PERC-8271)

| Export | Description |
|--------|-------------|
| `SLAB_TIERS_V_ADL` | ADL-upgraded slab tier sizes (SLAB_LEN = 1,288,304 bytes) |
| `ALL_TIERS` | All known slab tier sizes for multi-tier market discovery |
| `validateSlabDataSize` | Returns true if size matches a known tier |

### Fixed

- **Security audit (0x-SquidSol, PR#82):** 20 hardening fixes merged from independent audit:
  - `encU8` / `encU16` / `encU32`: range-check before encode — prevents silent truncation
  - `encPubkey`: descriptive error for invalid inputs (null, wrong length, non-base58)
  - `computePnlPercent`: BigInt-to-Number precision guard
  - `parseErrorFromLogs`: hex string bounded to 8 chars to prevent ReDoS
  - `buildAdlInstruction`: signer array and `targetIdx` validation
  - `stake.ts`: Buffer removed — fully browser-compatible via `DataView`
  - `price-router`: removed `as any` casts; added URL-encode for token mint; default fetch timeout
  - `dex-oracle`: `decimals` and `binStep` validated to prevent arithmetic DoS
  - `config`: `process.env` reads guarded for browser environments
  - `slab`: `postBitmap` guard to prevent misreading V1D engine fields
  - `slab`: bitmap–capacity mismatch warning logged when `usedAccounts > slabCapacity`
  - `discovery`: unrecognized slab layouts skipped with warning instead of fallback parse
  - `simulateOrSend`: non-ok HTTP response handled before null-deref

- **RPC concurrency cap** (PR#50): `discoverMarkets()` now caps parallel tier queries at 6
  (configurable via `maxParallelTiers`). This prevents accidental RPC storms when using public
  or free-tier endpoints. On a Helius Starter plan, pass `sequential: true` to serialize
  tier queries with exponential backoff.

- **Market discovery memcmp fallback** (PR#9): If the primary `getProgramAccounts` with
  `dataSize` filter returns empty, the SDK now retries with a memcmp magic-byte filter.

- **V1 slab layout** (PR#12): `SLAB_TIERS` updated to match deployed V1 on-chain values.

- **V_ADL slab SLAB_LEN** (PERC-8271): Updated from 1,025,880 to 1,288,304 bytes after
  `Account` and `RiskEngine` struct additions for ADL state fields.

- **Mainnet program IDs** (GH#1689): `getProgramId("mainnet")` and `getMatcherProgramId("mainnet")`
  now return the correct deployed mainnet addresses.

- **`parseEngine` exception handling:** Wrapped in try/catch — malformed slab data logs a
  warning and returns `null` instead of crashing the caller.

### Deprecated

- `discoverMarkets()` called without `maxParallelTiers` on public RPC endpoints may return
  partial results or 429 errors. Pass `{ sequential: true }` or use a Helius paid-tier key.
  This behaviour will be enforced in `1.0.0` final.

---

## [0.2.0] — 2026-01-10

Initial public release. See git history for full commit log.
