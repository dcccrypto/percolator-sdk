# @percolator/sdk

TypeScript SDK for building clients, bots, and UIs on top of the [Percolator](https://github.com/dcccrypto/percolator) perpetual futures protocol on Solana.

> **⚠️ DISCLAIMER: FOR EDUCATIONAL PURPOSES ONLY** — This code has NOT been audited. Do NOT use in production or with real funds.

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
  buildInitUserIxData,
  buildDepositCollateralIxData,
  buildTradeNoCpiIxData,
  parseSlab,
  computeMarkPnl,
  computeLiqPrice,
  simulateOrSend,
} from "@percolator/sdk";

// Get program ID (defaults to devnet)
const programId = getProgramId("devnet");

// Derive vault authority PDA
const [vaultAuth, bump] = deriveVaultAuthority(programId, slabPubkey);

// Read and parse on-chain slab account
const slabData = await connection.getAccountInfo(slabPubkey);
const { header, config, accounts } = parseSlab(slabData.data);

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

**Supported instructions:** `InitMarket`, `InitUser`, `InitLP`, `DepositCollateral`, `WithdrawCollateral`, `KeeperCrank`, `TradeNoCpi`, `TradeCpi`, `LiquidateAtOracle`, `CloseAccount`, `TopUpInsurance`, `SetRiskThreshold`, `UpdateAdmin`, `UpdateConfig`, `SetMaintenanceFee`, `PushOraclePrice`, `ResolveMarket`, and more.

### Account Deserialization

Parse the on-chain slab account into typed TypeScript objects:

```typescript
import { parseSlab, parseSlabHeader, parseMarketConfig } from "@percolator/sdk";

const { header, config, accounts } = parseSlab(accountData);

// header.magic, header.version, header.admin, header.nonce
// header.resolved, header.paused

// config.collateralMint, config.vaultPubkey, config.indexFeedId
// config.maxStalenessSlots, config.confFilterBps
// config.fundingHorizonSlots, config.fundingKBps
// config.threshFloor, config.threshRiskBps

// accounts[i].owner, accounts[i].capital, accounts[i].pnl, accounts[i].positionSize
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
import { validateRiskParams, validateTradeParams } from "@percolator/sdk";

const errors = validateRiskParams(params);
if (errors.length > 0) {
  console.error("Invalid risk params:", errors);
}
```

---

## Architecture

```
@percolator/sdk
├── abi/                 # Binary encoding/decoding matching on-chain layout
│   ├── instructions.ts  # Instruction data builders (all 28+ instructions)
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
