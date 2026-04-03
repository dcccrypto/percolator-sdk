# @percolator/sdk

TypeScript SDK for building clients, bots, and UIs on top of the [Percolator](https://github.com/dcccrypto/percolator) perpetual futures protocol on Solana.

> **⚠️ RELEASE CANDIDATE** — `1.0.0-rc.1`. Security audit (0x-SquidSol) complete. Pending final mainnet program verification before `1.0.0` stable. Use at your own risk.

[![npm](https://img.shields.io/npm/v/@percolator/sdk?color=14F195)](https://www.npmjs.com/package/@percolator/sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

---

## Installation

```bash
pnpm add @percolator/sdk
# or
npm install @percolator/sdk
```

**Peer dependency:** `@solana/web3.js ^1.95`

---

## Quick Start

```typescript
import {
  getProgramId,
  deriveVaultAuthority,
  encodeInitUser,
  encodeDepositCollateral,
  encodeTradeNoCpi,
  parseHeader,
  parseConfig,
  parseAllAccounts,
  detectSlabLayout,
  computeMarkPnl,
  computeLiqPrice,
  simulateOrSend,
} from "@percolator/sdk";

// Get program ID (defaults to devnet)
const programId = getProgramId("devnet");

// Derive vault authority PDA
const [vaultAuth, bump] = deriveVaultAuthority(programId, slabPubkey);

// Read and parse on-chain slab account
const slabInfo = await connection.getAccountInfo(slabPubkey);
const slabData = new Uint8Array(slabInfo!.data);
const header = parseHeader(slabData);
const layout = detectSlabLayout(slabData.length);
const config = parseConfig(slabData, layout!);
const accounts = parseAllAccounts(slabData);

// Compute PnL for a position
const pnl = computeMarkPnl(positionSize, entryPrice, oraclePrice);
const liqPrice = computeLiqPrice(entryPrice, capital, positionSize, 500n);
```

---

## Features

### ABI Encoding & Decoding

Type-safe instruction builders matching the on-chain Rust layout byte-for-byte:

```typescript
import { buildInitMarketIxData, buildTradeNoCpiIxData, IX_TAG } from "@percolator/sdk";

// Build InitMarket instruction data (256 bytes)
const data = buildInitMarketIxData({
  admin: adminPubkey,
  collateralMint: mintPubkey,
  indexFeedId: pythFeedId,
  maxStaleSecs: 60n,
  confFilterBps: 250,
  invert: false,
  unitScale: 1_000_000_000, // lamports per unit
  riskParams: { /* ... */ },
});

// Build trade instruction
const tradeData = buildTradeNoCpiIxData({
  userIdx: 0,
  lpIdx: 0,
  requestedSize: 1_000_000n, // positive = long, negative = short
  maxSlippage: 50,           // bps
});
```

**Supported instructions:** `InitMarket`, `InitUser`, `InitLP`, `DepositCollateral`, `WithdrawCollateral`, `KeeperCrank`, `TradeNoCpi`, `TradeCpi`, `LiquidateAtOracle`, `CloseAccount`, `TopUpInsurance`, `SetRiskThreshold`, `UpdateAdmin`, `UpdateConfig`, `SetMaintenanceFee`, `PushOraclePrice`, `ResolveMarket`, `SetOiImbalanceHardBlock`, `SetOracleAuthority`, and more.

### Admin Instructions

#### SetOiImbalanceHardBlock (tag=71)

Prevents new trades from pushing the long/short OI skew above a configurable threshold.
When triggered, the on-chain error `OiImbalanceHardBlock` (code 59) is returned.

```typescript
import {
  encodeSetOiImbalanceHardBlock,
  ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK,
  buildAccountMetas,
  buildIx,
  simulateOrSend,
} from "@percolator/sdk";

// threshold_bps = 0         → hard block disabled (default)
// threshold_bps = 5_000     → block trades that push skew above 50%
// threshold_bps = 8_000     → block trades that push skew above 80%
// threshold_bps = 10_000    → lock dominant side once any OI exists

const data = encodeSetOiImbalanceHardBlock({ thresholdBps: 8_000 });
const keys = buildAccountMetas(ACCOUNTS_SET_OI_IMBALANCE_HARD_BLOCK, [
  adminPublicKey,  // [signer]
  slabPublicKey,   // [writable]
]);
const ix = buildIx({ programId, keys, data });

const result = await simulateOrSend({ connection, ix, signers: [admin] });
console.log("signature:", result.signature);
```

#### SetOracleAuthority (tag=16)

Delegates the `PushOraclePrice` right to a specific keypair (e.g. a crank bot).
Pass `PublicKey.default` (all zeros) to revoke — the program then falls back to Pyth/Chainlink.

```typescript
import { PublicKey } from "@solana/web3.js";
import {
  encodeSetOracleAuthority,
  ACCOUNTS_SET_ORACLE_AUTHORITY,
  buildAccountMetas,
  buildIx,
  simulateOrSend,
} from "@percolator/sdk";

// Delegate to a crank bot
const data = encodeSetOracleAuthority({ newAuthority: crankBot.publicKey });
const keys = buildAccountMetas(ACCOUNTS_SET_ORACLE_AUTHORITY, [
  adminPublicKey,  // [signer, writable]
  slabPublicKey,   // [writable]
]);
const ix = buildIx({ programId, keys, data });

await simulateOrSend({ connection, ix, signers: [admin] });

// Revoke — fall back to Pyth/Chainlink
const revokeData = encodeSetOracleAuthority({ newAuthority: PublicKey.default });
```

See [`examples/admin-instructions.ts`](examples/admin-instructions.ts) for full end-to-end examples.

### Account Deserialization

Parse the on-chain slab account into typed TypeScript objects:

```typescript
import {
  parseHeader,
  parseConfig,
  parseAllAccounts,
  detectSlabLayout,
} from "@percolator/sdk";

const slabData = new Uint8Array(accountInfo.data);
const header = parseHeader(slabData);
const layout = detectSlabLayout(slabData.length)!;
const config = parseConfig(slabData, layout);
const accounts = parseAllAccounts(slabData);

// header.magic, header.version, header.admin, header.nonce
// header.resolved, header.paused

// config.collateralMint, config.vaultPubkey, config.indexFeedId
// config.maxStalenessSlots, config.confFilterBps
// config.fundingHorizonSlots, config.fundingKBps
// config.threshFloor, config.threshRiskBps

// accounts[i].account.owner, accounts[i].account.capital,
// accounts[i].account.pnl, accounts[i].account.positionSize
```

### PDA Derivation

All program-derived addresses with correct seeds:

```typescript
import {
  deriveVaultAuthority,
  deriveLpPda,
  deriveInsuranceLpMint,
} from "@percolator/sdk";

const [vaultAuth, bump] = deriveVaultAuthority(programId, slab);
const [lpPda, lpBump] = deriveLpPda(programId, slab, lpIndex);
const [insMint, insBump] = deriveInsuranceLpMint(programId, slab);
```

### Trading Math

Coin-margined perpetual math utilities (all BigInt, no floating-point):

```typescript
import {
  computeMarkPnl,
  computeLiqPrice,
  computeEntryPrice,
  computeEffectiveLeverage,
} from "@percolator/sdk";

// Mark-to-market PnL (in native token units)
const pnl = computeMarkPnl(positionSize, entryPriceE6, oraclePriceE6);

// Liquidation price given capital and maintenance margin
const liqPrice = computeLiqPrice(entryPriceE6, capital, positionSize, 500n);

// All values use e6 format: 1 USD = 1_000_000
```

### Oracle Price Router

Automatic oracle discovery and ranking for any Solana token:

```typescript
import { resolvePrice } from "@percolator/sdk";

const result = await resolvePrice(tokenMint);
// result.bestSource — highest-confidence price source
// result.allSources — all discovered sources ranked by liquidity
```

Supports **Pyth**, **DexScreener** (Raydium, Orca, Meteora), and **Jupiter** price feeds.

### Program ID Configuration

Network-aware program ID resolution:

```typescript
import { getProgramId, getMatcherProgramId } from "@percolator/sdk";

// Defaults to devnet
const programId = getProgramId();

// Explicit network selection
const mainnetId = getProgramId("mainnet");

// Environment variable override: PROGRAM_ID=<your-id>
```

### Auto-Deleveraging (ADL)

ADL (Auto-Deleveraging) reduces the most-profitable opposing positions when the insurance fund is depleted. The SDK provides both on-chain and API-based ADL utilities.

#### Checking if ADL is triggered

```typescript
import { isAdlTriggered } from "@percolator/sdk";

const accountInfo = await connection.getAccountInfo(slabKey);
if (isAdlTriggered(accountInfo!.data)) {
  console.log("Insurance fund depleted — ADL is active");
}
```

#### Ranking positions for ADL

```typescript
import { fetchAdlRankedPositions } from "@percolator/sdk";

const { ranked, longs, shorts, isTriggered } = await fetchAdlRankedPositions(
  connection,
  slabKey,
);
// ranked  — all positions sorted by PnL% descending (ADL priority order)
// longs   — top-ranked long position (ADL target if insurance negative on short side)
// shorts  — top-ranked short position
// isTriggered — whether pnl_pos_tot exceeds max_pnl_cap on-chain
```

#### Building an ADL instruction

```typescript
import { buildAdlInstruction, buildAdlTransaction, getProgramId } from "@percolator/sdk";

const programId = getProgramId("devnet");

// Build instruction directly (caller already has target index)
const ix = buildAdlInstruction(
  callerPublicKey,   // keeper / crank wallet
  slabPublicKey,
  oracleFeedPublicKey,
  programId,
  targetAccountIndex, // number — index of account to deleverage
);

// OR: fetch + rank + pick top target automatically
const ix2 = await buildAdlTransaction(
  connection,
  callerPublicKey,
  slabPublicKey,
  oracleFeedPublicKey,
  programId,
  "long", // side to deleverage ("long" | "short")
);
```

#### Decoding on-chain ADL events

```typescript
import { parseAdlEvent } from "@percolator/sdk";

// After sending / confirming an ExecuteAdl transaction:
const tx = await connection.getTransaction(sig, { commitment: "confirmed" });
const event = parseAdlEvent(tx?.meta?.logMessages ?? []);
// event.tag          — 0xAD1E_0001 (2904424449)
// event.targetIdx    — account index that was deleveraged
// event.price        — oracle price at execution (e6)
// event.closedAbs    — absolute position size closed (i128)
```

#### Fetching ADL rankings via HTTP API

```typescript
import { fetchAdlRankings } from "@percolator/sdk";

const result = await fetchAdlRankings(
  "https://api.percolatorlaunch.com",
  slabAddress,
);
// result.slabAddress              — slab public key (base58)
// result.adlNeeded                — true if ADL is triggered (capExceeded or utilizationTriggered)
// result.capExceeded              — true if pnlPosTot > maxPnlCap
// result.insuranceDepleted        — true if insurance fund balance == 0
// result.utilizationTriggered     — true if utilization BPS exceeds the configured ADL threshold
// result.pnlPosTot                — aggregate profitable PnL (decimal string)
// result.maxPnlCap                — max PnL cap from market config (decimal string, "0" if unconfigured)
// result.excess                   — excess PnL above cap (decimal string)
// result.insuranceFundBalance     — insurance fund balance (decimal string)
// result.insuranceFundFeeRevenue  — insurance fund lifetime fee revenue (decimal string)
// result.insuranceUtilizationBps  — insurance utilization in basis points (0–10000)
// result.rankings                 — AdlApiRanking[] sorted by rank (1 = first to deleverage)
//   .rank             — rank (1 = highest PnL%, deleveraged first)
//   .idx              — slab account index (pass as targetIdx to buildAdlInstruction)
//   .pnlAbs           — absolute PnL in lamports (decimal string)
//   .capital          — capital at entry in lamports (decimal string)
//   .pnlPctMillionths — pnl * 1_000_000 / capital (decimal string)
```

#### ADL error codes (61–65)

| Code | Name | Description |
|------|------|-------------|
| 61 | `EngineSideBlocked` | Trade blocked — this side is in DrainOnly or ResetPending mode |
| 62 | `EngineCorruptState` | Slab state corrupt — critical internal error, please report |
| 63 | `InsuranceFundNotDepleted` | ADL not triggered yet (insurance fund healthy) |
| 64 | `NoAdlCandidates` | No eligible positions to deleverage |
| 65 | `BankruptPositionAlreadyClosed` | Target position already closed |

---

### Transaction Helpers

Build, simulate, and send transactions with error parsing:

```typescript
import { buildIx, simulateOrSend } from "@percolator/sdk";

const ix = buildIx({ programId, keys: accountMetas, data: ixData });

const result = await simulateOrSend({
  connection,
  ix,
  signers: [payer],
  simulate: false,        // true = simulate only
  computeUnitLimit: 400_000,
});

// result.signature, result.slot, result.err, result.logs
// Errors are automatically parsed from logs into human-readable messages
```

### Client-Side Validation

Validate parameters before submitting transactions:

```typescript
import {
  validatePublicKey,
  validateAmount,
  validateBps,
  validateI128,
  validateIndex,
} from "@percolator/sdk";

// Validates a public key string (throws ValidationError on invalid input)
const slabKey = validatePublicKey(slabAddress, "slab");

// Validates a u64 amount (throws ValidationError if negative or > u64 max)
const amount = validateAmount("1000000000", "depositAmount");

// Validates basis points (0-10000)
const feeBps = validateBps("50", "tradingFee");
```

---

## Mainnet vs Devnet

By default the SDK targets **devnet** (safety default — PERC-697). The `NETWORK` environment
variable and the `network` parameter to `getProgramId()` / `discoverMarkets()` control which
program IDs and RPC endpoints are used. Production deployments always set `NETWORK=mainnet`
explicitly via Railway env vars.

```typescript
import { getProgramId, discoverMarkets } from "@percolator/sdk";

// Devnet (default — safe fallback)
const programId = getProgramId("devnet");

// Mainnet — set env or pass explicitly
// NETWORK=mainnet
const mainnetProgramId = getProgramId("mainnet");

// Market discovery — uses network from NETWORK env by default
const markets = await discoverMarkets(connection);
```

### Program Addresses

| Program | Network | Address |
|---------|---------|---------|
| Percolator | Mainnet | `GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24` |
| Matcher | Mainnet | `DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX` |
| Percolator | Devnet | `FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD` |
| Matcher | Devnet | `GTRgyTDfrMvBubALAqtHuQwT8tbGyXid7svXZKtWfC9k` |

> Use `PROGRAM_ID` / `MATCHER_PROGRAM_ID` env vars to override for local test validators.

---

## RPC Concurrency

`discoverMarkets()` fires one `getProgramAccounts` request per known slab tier size.
There are ~15 known tier sizes. To avoid hitting rate limits on public or free-tier endpoints,
the SDK caps parallel in-flight requests at **6** by default.

For production use a [Helius](https://helius.dev) paid-tier key. On the free tier,
pass `sequential: true` to serialize requests with exponential backoff:

```typescript
import { discoverMarkets } from "@percolator/sdk";

// Helius paid tier — parallel (default, fast)
const markets = await discoverMarkets(connection, { maxParallelTiers: 6 });

// Free-tier or public RPC — sequential with 429 backoff
const marketsSafe = await discoverMarkets(connection, { sequential: true });

// Custom concurrency
const marketsCustom = await discoverMarkets(connection, { maxParallelTiers: 3 });
```

> **Note:** Public mainnet-beta RPC (`api.mainnet-beta.solana.com`) rejects
> `getProgramAccounts` calls entirely. A Helius or QuickNode endpoint is required for
> `discoverMarkets()` in production.

---

## Architecture

```
@percolator/sdk
├── abi/                 # Binary encoding/decoding matching on-chain layout
│   ├── instructions.ts  # Instruction data builders (all 72 instructions)
│   ├── accounts.ts      # Account struct deserialization
│   ├── encode.ts        # Low-level binary encoding (u8/u16/u32/u64/i128/pubkey)
│   ├── errors.ts        # On-chain error code → human-readable parsing
│   └── index.ts
├── solana/              # Solana-specific helpers
│   ├── slab.ts          # Slab account parser (header + config + accounts)
│   ├── pda.ts           # PDA derivation (vault, LP, insurance mint)
│   ├── discovery.ts     # Market discovery (find all Percolator markets)
│   ├── dex-oracle.ts    # DEX oracle price integration
│   ├── token-program.ts # SPL Token helpers
│   ├── ata.ts           # Associated Token Account helpers
│   └── index.ts
├── runtime/             # Transaction building and submission
│   ├── tx.ts            # buildIx, simulateOrSend, error handling
│   └── index.ts
├── math/                # Trading math (all BigInt)
│   ├── trading.ts       # PnL, liquidation price, leverage, entry price
│   └── index.ts
├── oracle/              # Price feed integration
│   └── price-router.ts  # Multi-source oracle resolution (Pyth, DEX, Jupiter)
├── config/              # Configuration
│   └── program-ids.ts   # Network-aware program IDs
├── validation.ts        # Client-side parameter validation
└── index.ts             # Public API re-exports
```

---

## Development

### Prerequisites

- Node.js 20+ and pnpm 9+

### Commands

```bash
pnpm install              # Install dependencies
pnpm build                # Build with tsup (outputs to dist/)
pnpm test                 # Run test suite (vitest)
pnpm lint                 # Type-check (tsc --noEmit)
```

### Testing

Tests cover ABI encoding roundtrips, PDA derivation, slab parsing, validation, and trading math:

```bash
pnpm test                 # Run all tests
pnpm test -- --watch      # Watch mode
```

### Publishing

```bash
pnpm build
npm publish --access public
```

---

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `PROGRAM_ID` | Override Percolator program ID | Network default |
| `MATCHER_PROGRAM_ID` | Override Matcher program ID | Network default |
| `NETWORK` | Target network (`devnet` / `mainnet`) | `devnet` |

### Devnet Program Addresses

| Program | Address |
|---------|---------|
| Percolator | `FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD` |
| Matcher | `4HcGCsyjAqnFua5ccuXyt8KRRQzKFbGTJkVChpS7Yfzy` |

---

## Browser Compatibility

The SDK uses `DataView` for all binary reads (no Node.js `Buffer` dependency). Works in:
- Node.js 20+
- Modern browsers (Chrome, Firefox, Safari, Edge)
- React Native (via `@solana/web3.js`)

---

## Related Repositories

| Repository | Description |
|-----------|-------------|
| [percolator](https://github.com/dcccrypto/percolator) | Core risk engine crate (Rust) |
| [percolator-prog](https://github.com/dcccrypto/percolator-prog) | Solana on-chain program (wrapper) |
| [percolator-matcher](https://github.com/dcccrypto/percolator-matcher) | Reference matcher program for LP pricing |
| [percolator-stake](https://github.com/dcccrypto/percolator-stake) | Insurance LP staking program |
| [percolator-ops](https://github.com/dcccrypto/percolator-ops) | Operations dashboard |
| [percolator-mobile](https://github.com/dcccrypto/percolator-mobile) | Solana Seeker mobile trading app |
| [percolator-launch](https://github.com/dcccrypto/percolator-launch) | Full-stack launch platform (monorepo) |

## License

Apache 2.0 — see [LICENSE](LICENSE).
