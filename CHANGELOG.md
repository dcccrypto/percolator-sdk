# Changelog

All notable changes to `@percolator/sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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
