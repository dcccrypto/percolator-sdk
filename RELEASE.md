# @percolator/sdk v1.0.0-beta.1 — Release Notes

**Release date:** 2026-04-04
**Status:** Release-ready. Awaiting Helius API key + mainnet market deployment before npm publish.
**License:** Apache-2.0

---

## Overview

`@percolator/sdk` is the official TypeScript SDK for the [Percolator](https://percolatorlaunch.com) permissionless perpetual futures protocol on Solana. It provides instruction builders, slab parsing, market discovery, ADL (auto-deleveraging) support, and RPC reliability utilities.

This is the first public beta release. The SDK is functionally complete, security-audited, and has **709 passing tests** covering the full public API surface.

---

## Installation

```bash
pnpm add @percolator/sdk
# or
npm install @percolator/sdk
# or
yarn add @percolator/sdk
```

**Peer dependency:** `@solana/web3.js ^1.95`

**Node.js:** ≥ 20.0.0

---

## Features

### Market Discovery (3-tier fallback)
- **Tier 1:** `getProgramAccounts` with dataSize filter (requires Helius or paid RPC)
- **Tier 2:** REST API fallback via `percolatorlaunch.com/api/markets`
- **Tier 3:** Static bundle fallback with on-chain verification via `getMultipleAccounts`
- All tiers gracefully degrade — SDK always attempts the next tier on failure

### Slab Parsing
- Full V1, V1M, V1M2, and V_ADL slab layout support
- `parseHeader`, `parseConfig`, `parseEngine`, `parseAllAccounts`
- `detectSlabLayout` auto-detects on-chain layout from buffer size
- All V1M2 engine offsets verified against BPF `offset_of!` table

### Auto-Deleveraging (ADL)
- `fetchAdlRankedPositions` — fetch slab and rank all open positions by PnL%
- `rankAdlPositions` — pure (no-RPC) ranking from raw slab bytes
- `isAdlTriggered` — check if ADL conditions are met
- `buildAdlTransaction` — full transaction builder (fetch → rank → pick target → instruction)
- `parseAdlEvent` — decode on-chain ADL event logs
- Error codes 61–65 fully supported

### RPC Reliability
- `RpcPool` — multi-endpoint connection pool with weighted round-robin and failover
- `withRetry` — exponential backoff retry wrapper (max 3 retries, configurable)
- `checkRpcHealth` — probe endpoint latency and slot height
- Request timeout (30s default) on all pool calls

### Instruction Builders
- 65+ instruction encoders covering all Percolator program instructions
- `encodeInitUser`, `encodeDepositCollateral`, `encodeTradeNoCpi`, `encodeWithdrawCollateral`, etc.
- Admin instructions: `encodeSetOiImbalanceHardBlock`, `encodeSetOracleAuthority`
- Shared vault: `QueueWithdrawalSV`, `ClaimEpochWithdrawal`, `AdvanceEpoch`

### PDA Derivation
- `deriveVaultAuthority`, `deriveUserAccount`, `deriveStakeAccount`, etc.
- All PDAs match deployed mainnet + devnet program addresses

### Math Utilities
- `computeMarkPnl`, `computeLiqPrice`, `computePnlPercent`
- `computeWarmupProgress`, `computeWarmupLeverageCap`
- `computeMaxWithdrawable`, `isAccountFlat`, `filterOpenPositions`

### Oracle Integration
- Pyth price feed consumption via `price-router`
- DEX oracle utilities for Meteora DLMM and Orca price feeds
- `computeMeteoraDlmmPriceE6`, `computeOrcaPriceE6`

### Runtime Utilities
- `simulateOrSend` — simulate or submit transactions with priority fee support
- Lighthouse / Blowfish wallet guard detection
- `isLighthouseProtected`, `isBlowfishProtected`

---

## Breaking Changes from 0.x

| Change | Migration |
|--------|-----------|
| `parseSlab` / `detectSlabLayout` throw on unrecognized sizes | Update catch logic — no more silent null fallback |
| `readNonce` / `readLastThrUpdateSlot` throw on null layout | Handle error case or check layout first |
| `computePnlPercent` throws on BigInt precision loss | Scale inputs or use BigInt path |
| `encodeExecuteAdl` validates `targetIdx` range (0–65535) | Ensure valid u16 range |
| `buildIx` / `simulateOrSend` validate signers array | Pass non-empty signers |
| `getProgramId` / `getCurrentNetwork` default to `"devnet"` | Pass `"mainnet"` explicitly or set `NETWORK=mainnet` |
| `encodeSetOiImbalanceHardBlock` tag changed to 71 | No action if using SDK encoder |
| `encodeSetOracleAuthority` tag changed to 16 | No action if using SDK encoder |

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 61 | `EngineSideBlocked` | Trade blocked — dominant side in DrainOnly/ResetPending |
| 62 | `EngineCorruptState` | Critical: slab state invariant violated |
| 63 | `InsuranceFundNotDepleted` | ADL rejected — insurance fund still has balance |
| 64 | `NoAdlCandidates` | ADL rejected — no eligible positions |
| 65 | `BankruptPositionAlreadyClosed` | ADL rejected — target already closed |

All codes included in `PERCOLATOR_ERRORS`, decoded via `decodeError(code)`, and auto-parsed from transaction logs via `parseErrorFromLogs(logs)`.

---

## Security

- **Independent audit** by 0x-SquidSol (2026-03-31): 20 hardening fixes merged (PR#82)
- All encoding functions validate input ranges before writing
- Browser-compatible — no Node.js `Buffer` dependency in production code
- `process.env` reads guarded for browser environments
- Bitmap/capacity mismatch detection prevents silent data corruption

---

## Test Coverage

- **709 tests** across 21 test files
- Full coverage: slab parsing, instruction encoding, ADL ranking, market discovery (all 3 tiers), RPC pool, retry logic, error codes, PDA derivation, validation, oracle math
- All tests mocked — CI-safe, no RPC keys required
- Additional devnet integration test suite (44 tests) available via `vitest --config vitest.devnet.config.ts`

---

## Quick Start

```typescript
import {
  getProgramId,
  discoverMarkets,
  parseAllAccounts,
  fetchAdlRankedPositions,
  RpcPool,
  withRetry,
} from "@percolator/sdk";

// Connect with RPC pool for reliability
const pool = new RpcPool({
  endpoints: [
    { url: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY", weight: 3 },
    { url: "https://api.mainnet-beta.solana.com", weight: 1 },
  ],
});

// Discover all Percolator markets (3-tier fallback)
const markets = await discoverMarkets(connection, {
  network: "mainnet",
  apiBaseUrl: "https://percolatorlaunch.com/api",
});

// Parse accounts from a market slab
const accounts = parseAllAccounts(slabData);

// Check ADL status
const rankings = await fetchAdlRankedPositions(connection, slabPubkey);
console.log("ADL triggered:", rankings.isTriggered);
```

---

## Publish Checklist (for Khubair)

- [ ] Helius API key provisioned and set in Railway
- [ ] Mainnet markets deployed
- [ ] PERC-8318 smoke test passes against mainnet
- [ ] `npm publish --access public` from clean main branch
- [ ] Verify package on npmjs.com: `@percolator/sdk@1.0.0-beta.1`
- [ ] Update `percolator-launch` to use published npm version instead of git dep
- [ ] Trigger Railway redeployments for API, keeper, indexer

---

## What's Next (1.0.0 stable)

- Mainnet smoke test validation (PERC-8318)
- Final npm package name confirmation (`@percolator/sdk` vs `@percolatorct/sdk`)
- Remove devnet-default safety gate (switch default to mainnet)
- WebSocket subscription helpers for real-time slab updates
- Transaction simulation with priority fee estimation via Helius Sender API

---

## Links

- **GitHub:** [dcccrypto/percolator-sdk](https://github.com/dcccrypto/percolator-sdk)
- **Protocol:** [percolatorlaunch.com](https://percolatorlaunch.com)
- **Changelog:** See [CHANGELOG.md](./CHANGELOG.md)
