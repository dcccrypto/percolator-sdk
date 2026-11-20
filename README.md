# @percolatorct/sdk

TypeScript SDK for building clients, bots, and UIs on top of the [Percolator](https://github.com/dcccrypto/percolator) perpetual futures protocol on Solana.

> **EXPERIMENTAL. NOT AUDITED.** `2.0.5`. v12.19 single-target. 792 tests passing. Do NOT use with real funds.

## 9.0.0-candidate (v2.2) devnet program IDs

Devnet defaults point at the v2.2 fresh devnet deployment (2026-10-10, test only; v2.2 does not ship):
wrapper `6kpg2wi7…`, stake `7JrgAUHi…`, nft `27LWmR72…`, matcher `AsHvEJ8z…` (`PROGRAM_IDS_DEVNET_V22`).
The v2.1 RC ids (`5NGgnU2j…` / `A6DVNubv…` / `DWUNq2iY…` / `DfTxJUT5…`) were never deployed and are no
longer defaults or allowlisted. The 8.x ETDLAdi world stays live as "v1 / close-only"; its four ids are
exported as `PROGRAM_IDS_DEVNET_V1` and must be passed explicitly. Mainnet ids are unchanged.
`NFT_PROGRAM_ID=27LWmR72…` needs no `PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE`. See `CHANGELOG.md`.

### Trading fee to sign (v2.2)

A matcher trade (TradeCpi) is refused with Custom(9) when the signed max fee is below the base fee plus the
matcher's fee, or above the market maximum. Read the inputs and sign the helper's value:

```ts
import { Connection, clusterApiUrl, type PublicKey } from "@solana/web3.js";
import { readTradeFeeInputsV22, computeTradeFeeBpsToSignV22, encodeTradeCpi, type TradeCpiArgs } from "@percolatorct/sdk";

declare const marketPk: PublicKey;      // the v2.2 market
declare const matcherCtxPk: PublicKey;  // the LP's matcher context account
declare const tradeArgs: Omit<TradeCpiArgs, "feeBps">; // portfolio ids, epochs, asset, size, limit

const connection = new Connection(clusterApiUrl("devnet"));
const [market, ctx] = await connection.getMultipleAccountsInfo([marketPk, matcherCtxPk]);
const { feeBps } = computeTradeFeeBpsToSignV22(readTradeFeeInputsV22(market!.data, 0, ctx!.data));
// v2.2 devnet markets: base 30 + matcher up to 100 + margin 5 = 135 (max 700)
const data = encodeTradeCpi({ ...tradeArgs, feeBps });
```

### Resolving a stale market (tag 39)

Anyone can permanently resolve a market whose price has been stale for `permissionless_resolve_stale_slots`
(18,000 slots, about 72 minutes, on the v2.2 markets). Check first, then send; only the fee payer signs:

```ts
import { Connection, clusterApiUrl, Transaction, sendAndConfirmTransaction, type Keypair, type PublicKey } from "@solana/web3.js";
import { getProgramId, staleResolveStatusV22, buildResolveStalePermissionlessIxV22 } from "@percolatorct/sdk";

declare const marketPk: PublicKey; // the stale v2.2 market
declare const payer: Keypair;      // fee payer, the only signer

const connection = new Connection(clusterApiUrl("devnet"));
const slot = BigInt(await connection.getSlot());
const info = await connection.getAccountInfo(marketPk);
const status = staleResolveStatusV22(info!.data, slot); // refusalCode: 21 resolved, 19 behind, 27 not matured
if (status.canResolve) {
  const tx = new Transaction().add(buildResolveStalePermissionlessIxV22(getProgramId("devnet"), marketPk, slot));
  await sendAndConfirmTransaction(connection, tx, [payer]);
}
```

After resolution, traders exit through CloseResolved (tag 30). A price push before resolution moves the
market's last good oracle slot and un-matures it.

### Trading on a multi-asset market (3+ positions)

On a multi-asset market, once the trader or the market maker holds 3 or more positions, every trade (closes too)
needs both sides refreshed in the same transaction, or the program returns 19. `buildMultiAssetTradeIxsV22` decides
and builds it (`[budget 1.4M CU, refresh LP observing all assets, refresh trader, refresh LP, trade]`; a single-asset
market or fewer than 3 positions returns the trade alone):

```ts
import { Connection, clusterApiUrl, TransactionMessage, VersionedTransaction, type PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { getProgramId, buildMultiAssetTradeIxsV22, refineMultiAssetTradePlanV22, parseErrorFromLogs } from "@percolatorct/sdk";

declare const wallet: PublicKey;                  // the trader (fee payer and crank signer)
declare const market: PublicKey;                  // the multi-asset market
declare const takerPortfolio: PublicKey, lpPortfolio: PublicKey;
declare const tradeIx: TransactionInstruction;    // your TradeCpi / TradeNoCpi instruction

const connection = new Connection(clusterApiUrl("devnet"));
const programId = getProgramId("devnet");
const [marketAcc, takerAcc, lpAcc] = await connection.getMultipleAccountsInfo([market, takerPortfolio, lpPortfolio]);
const [marketData, takerData, lpData] = [marketAcc!.data, takerAcc!.data, lpAcc!.data].map((d) => new Uint8Array(d));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function toTx(ixs: TransactionInstruction[]): Promise<VersionedTransaction> {
  const { blockhash } = await connection.getLatestBlockhash();
  return new VersionedTransaction(new TransactionMessage({ payerKey: wallet, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
}

let plan = buildMultiAssetTradeIxsV22({ programId, market, marketData, cranker: wallet, takerPortfolio, takerData, lpPortfolio, lpData, tradeIx });
for (let n = 0; n < 8; n++) {
  const sim = await connection.simulateTransaction(await toTx(plan.instructions), { sigVerify: false });
  if (!sim.value.err) break;
  const next = refineMultiAssetTradePlanV22(plan, sim.value.err); // drops a refresh refused 22, appends one on 19
  if (next.action === "fail") throw new Error(parseErrorFromLogs(sim.value.logs ?? [], { context: { action: "trade", healthCheckStale: true } })?.hint);
  if (next.action === "wait") await sleep(700);
  plan = next.plan;
}
```

For an open, pass `stalePeers` (other positioned portfolios that are stale on that asset), otherwise the program returns 121.

### Errors by program

`parseErrorFromLogs(logs, { context })` decodes the first failing program's error with that program's table
(wrapper, stake, nft, matcher, SPL Token) and returns `program` / `programId`. Unknown programs fall back to the
wrapper table and report `program: "unknown"`; pass `programIds` for fresh deployments. `context: { action:
"trade" }` or `{ action: "withdraw", openLegs }` gives the precise line for wrapper 9 and 19.

## 8.0.0 relaunch targets (historical)

> The 8.0.0 devnet ids are now `PROGRAM_IDS_DEVNET_V1` (v1 / close-only). The current devnet
> wrapper is `getProgramId("devnet")` (= `PROGRAM_IDS_DEVNET_V22.percolator`).

- **Wrapper:** percolator-prog P1 + P3 head `58e379f1` (engine `35ddd692`) at the 8.0.0 devnet
  wrapper (`PROGRAM_IDS_DEVNET_V1.percolator`). The SDK covers P1 tag 93 and errors 66–71, and P3 tags 94–102, errors 72–88,
  the vault-LP decoders and the bound-vault Earn tails.
- **Stake:** percolator-stake F-9 head `d13b5a9` plus the fresh-ID bump. The SDK covers tags 29
  `RecoverTerminalInsurance` and 30 `AdminCloseSlab`, errors 29–32, and `planStakeWindDown`.
- **Targets instructions not on the relaunch programs yet:** the matcher v2 (P2,
  percolator-match#30) tag 5 Configure, SetParams, the call extension and the requested-fee
  return bits. The matcher stays v1 (`12bd671`) unless P2 ships in the relaunch. On a P3
  vault-owned LP, matcher tag 5 can never be used, because the LP owner is the registry PDA
  and it cannot sign.

See `CHANGELOG.md` [8.0.0] for the full list. The sections below this one describe the
2.0.x / v12.19 SDK and are historical.

## Target wrapper

The SDK targets the percolator v12.19 wrapper (PR #271, branch `sync/v12.19-wrapper`, commit `d760fc4`).
All encoders emit v12.19 wire format. The dual-target `target: 'v12.17' | 'v12.19'` parameter
present in 2.0.0-rc.0 has been removed. PERC-628 shared-vault encoders
(`InitSharedVault`, `AllocateMarket`, `QueueWithdrawalSV`, `ClaimEpochWithdrawal`,
`AdvanceEpoch`) are unconditionally enabled.

Slab parsers retain V12_1 / V12_15 / V12_17 layout descriptors for backward-compatible
reads of older deployments. V12_19 layout descriptor is added for fresh v12.19 slabs.

[![npm](https://img.shields.io/npm/v/@percolatorct/sdk?color=14F195)](https://www.npmjs.com/package/@percolatorct/sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

---

## Installation

```bash
pnpm add @percolatorct/sdk
# or
npm install @percolatorct/sdk
```

**Peer dependency:** `@solana/web3.js ^1.95`

---

## Quick Start

```typescript
import { Connection, clusterApiUrl, type PublicKey } from "@solana/web3.js";
import {
  getProgramId,
  deriveVaultAuthority,
  parseWrapperConfigV17,
  parsePortfolioV17,
  decodeMarketFundingV22,
  computeMarkPnl,
  computeLiqPrice,
} from "@percolatorct/sdk";

declare const marketPk: PublicKey;    // a v2.2 market
declare const portfolioPk: PublicKey; // a trader portfolio on that market

const connection = new Connection(clusterApiUrl("devnet"));

// Program ID: getProgramId("devnet") === PROGRAM_IDS_DEVNET_V22.percolator
const programId = getProgramId("devnet");

// Derive vault authority PDA
const [vaultAuth, bump] = deriveVaultAuthority(programId, marketPk);

// Read and decode the v2.2 market and a portfolio
const marketData = new Uint8Array((await connection.getAccountInfo(marketPk))!.data);
const wrapperConfig = parseWrapperConfigV17(marketData);
const funding = decodeMarketFundingV22(marketData);
const portfolio = parsePortfolioV17(new Uint8Array((await connection.getAccountInfo(portfolioPk))!.data));

// Compute PnL and liquidation price for a position (all e6 / bigint)
const positionSize = 1_000_000n, entryPrice = 100_000_000n, oraclePrice = 105_000_000n, capital = 10_000_000n;
const pnl = computeMarkPnl(positionSize, entryPrice, oraclePrice);
const liqPrice = computeLiqPrice(entryPrice, capital, positionSize, 500n);
```

---

## Features

### ABI Encoding & Decoding

Type-safe instruction builders matching the on-chain Rust layout byte-for-byte:

```typescript
import { encodeTradeNoCpi, IX_TAG } from "@percolatorct/sdk";

// TradeNoCpi (tag 6): a direct trade between two portfolios
const tradeData = encodeTradeNoCpi({
  accountAPortfolioId: 1n, accountAPositionEpoch: 0n, // live-read from each portfolio (CAS)
  accountBPortfolioId: 2n, accountBPositionEpoch: 0n,
  assetIndex: 0, marketId: 1n,
  sizeQ: 1_000_000n,       // positive = A long, negative = A short
  execPrice: 100_000_000n, // e6
  feeBps: 135n,            // sign computeTradeFeeBpsToSignV22(...).feeBps
  backingFeeCapBps: 0,
});
console.log(tradeData[0] === IX_TAG.TradeNoCpi); // true

// InitMarket on v2.2: encodeInitMarketV22(args, trailer) takes the full risk-parameter set;
// see test/v22-vector-inputs.ts for a complete example.
```

**Supported instructions:** `InitMarket`, `InitUser`, `InitLP`, `DepositCollateral`, `WithdrawCollateral`, `KeeperCrank`, `TradeNoCpi`, `TradeCpi`, `LiquidateAtOracle`, `CloseAccount`, `TopUpInsurance`, `SetRiskThreshold`, `UpdateAdmin`, `UpdateConfig`, `SetMaintenanceFee`, `PushOraclePrice`, `ResolveMarket`, `UpdateAssetAuthority`, and more.

### Admin Instructions

`SetOiImbalanceHardBlock` (v12 tag 71) and `SetOracleAuthority` (v12 tag 16) are not instructions on the
v17 / v2.2 wrapper. `encodeSetOiImbalanceHardBlock` is kept only as a removed-instruction stub and throws if
called; there is no v2.2 equivalent.

#### Per-asset oracle authority (UpdateAssetAuthority, tag 65)

Delegates the oracle-push right for one asset to a specific key (e.g. a crank bot):

```typescript
import { Keypair } from "@solana/web3.js";
import { encodeUpdateAssetAuthority, ASSET_AUTH_KIND } from "@percolatorct/sdk";

const crankBot = Keypair.generate();
const currentEpoch = 0n; // live-read this asset's authority_epoch (CAS: pass the current value, not +1)

const data = encodeUpdateAssetAuthority({
  assetIndex: 0,
  marketId: 1n,
  kind: ASSET_AUTH_KIND.Oracle,   // 4
  newPubkey: crankBot.publicKey,
  authorityEpoch: currentEpoch,
});
```

The signer must be the asset's `asset_admin` or the current holder of that authority.

### Account Deserialization

Parse a v12.x slab account into typed TypeScript objects (these parsers recognise v12 slab sizes only;
for a v2.2 market use `parseWrapperConfigV17` / `parsePortfolioV17` as in the Quick Start):

```typescript
import {
  parseHeader,
  parseConfig,
  parseAllAccounts,
  detectSlabLayout,
} from "@percolatorct/sdk";

declare const accountInfo: { data: Buffer }; // await connection.getAccountInfo(slabPk)

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
  getProgramId,
} from "@percolatorct/sdk";
import type { PublicKey } from "@solana/web3.js";

declare const slab: PublicKey; // the market account
const programId = getProgramId("devnet");
const lpIndex = 0;

const [vaultAuth, bump] = deriveVaultAuthority(programId, slab);
const [lpPda, lpBump] = deriveLpPda(programId, slab, lpIndex);
const [insMint, insBump] = deriveInsuranceLpMint(programId, slab);
```

### Trading Math

Perpetual math utilities (all BigInt, no floating-point):

```typescript
import {
  computeMarkPnl,
  computeLiqPrice,
  computeEstimatedEntryPrice,
  computeMaxLeverage,
} from "@percolatorct/sdk";

const positionSize = 1_000_000n, entryPriceE6 = 100_000_000n, oraclePriceE6 = 105_000_000n, capital = 10_000_000n;

// Mark-to-market PnL (v2.2 engine linear floor, quote units)
const pnl = computeMarkPnl(positionSize, entryPriceE6, oraclePriceE6);

// Liquidation price given capital and maintenance margin
const liqPrice = computeLiqPrice(entryPriceE6, capital, positionSize, 500n);

// Fee-adjusted fill estimate, and max leverage from initial margin bps
const estEntry = computeEstimatedEntryPrice(oraclePriceE6, 30n, "long");
const maxLev = computeMaxLeverage(1_000n); // 10

// All values use e6 format: 1 USD = 1_000_000
```

### Oracle Price Router

Automatic oracle discovery and ranking for any Solana token:

```typescript
import { resolvePrice } from "@percolatorct/sdk";

const tokenMint = "So11111111111111111111111111111111111111112"; // any SPL mint (base58)
const result = await resolvePrice(tokenMint);
// result.bestSource — highest-confidence price source
// result.allSources — all discovered sources ranked by liquidity
```

Supports **Pyth**, **DexScreener** (Raydium, Orca, Meteora), and **Jupiter** price feeds.

### Program ID Configuration

Network-aware program ID resolution:

```typescript
import { getProgramId, getMatcherProgramId } from "@percolatorct/sdk";

// Defaults to devnet
const programId = getProgramId();

// Explicit network selection
const mainnetId = getProgramId("mainnet");

// Environment variable override: PROGRAM_ID=<your-id>
```

### Auto-Deleveraging (ADL)

ADL (Auto-Deleveraging) reduces the most-profitable opposing positions when the insurance fund is depleted. The SDK provides ranking, trigger-check, API, and event-decoding utilities. Building `ExecuteAdl` transactions is not supported in the v17 SDK because the v17 wrapper does not accept that instruction.

#### Checking if ADL is triggered

```typescript
import { Connection, clusterApiUrl, type PublicKey } from "@solana/web3.js";
import { isAdlTriggered } from "@percolatorct/sdk";

declare const slabKey: PublicKey; // a v12.x slab (v2.2 market sizes are not recognised and return false)
const connection = new Connection(clusterApiUrl("devnet"));
const accountInfo = await connection.getAccountInfo(slabKey);
if (isAdlTriggered(accountInfo!.data)) {
  console.log("Insurance fund depleted — ADL is active");
}
```

#### Ranking positions for ADL

```typescript
import { Connection, clusterApiUrl, type PublicKey } from "@solana/web3.js";
import { fetchAdlRankedPositions } from "@percolatorct/sdk";

declare const slabKey: PublicKey; // a v12.x slab
const connection = new Connection(clusterApiUrl("devnet"));
const { ranked, longs, shorts, isTriggered } = await fetchAdlRankedPositions(
  connection,
  slabKey,
);
// ranked  — all positions sorted by PnL% descending (ADL priority order)
// longs   — top-ranked long position (ADL target if insurance negative on short side)
// shorts  — top-ranked short position
// isTriggered — whether pnl_pos_tot exceeds max_pnl_cap on-chain
```

#### Decoding on-chain ADL events

```typescript
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { parseAdlEvent } from "@percolatorct/sdk";

declare const sig: string; // signature of a confirmed v12.x ExecuteAdl transaction
const connection = new Connection(clusterApiUrl("devnet"));
const tx = await connection.getTransaction(sig, { commitment: "confirmed" });
const event = parseAdlEvent(tx?.meta?.logMessages ?? []);
// event.tag          — 0xAD1E_0001 (2904424449)
// event.targetIdx    — account index that was deleveraged
// event.price        — oracle price at execution (e6)
// event.closedAbs    — absolute position size closed (i128)
```

#### Fetching ADL rankings via HTTP API

```typescript
import { fetchAdlRankings } from "@percolatorct/sdk";

declare const slabAddress: string; // market slab (base58)
const result = await fetchAdlRankings(
  "https://percolatorlaunch.com/api",
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
//   .idx              — slab account index (ExecuteAdl building is not supported on v17 / v2.2)
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
import { Connection, clusterApiUrl, type AccountMeta, type Keypair } from "@solana/web3.js";
import { buildIx, simulateOrSend, getProgramId } from "@percolatorct/sdk";

declare const accountMetas: AccountMeta[]; // e.g. from buildAccountMetas(ACCOUNTS_*, ...)
declare const ixData: Uint8Array;          // from an encode* function
declare const payer: Keypair;

const connection = new Connection(clusterApiUrl("devnet"));
const programId = getProgramId("devnet");
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
} from "@percolatorct/sdk";

const slabAddress = "So11111111111111111111111111111111111111112"; // any base58 key

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
import { Connection, clusterApiUrl } from "@solana/web3.js";
import { getProgramId, discoverMarkets } from "@percolatorct/sdk";

const connection = new Connection(clusterApiUrl("devnet"));

// Devnet (default — safe fallback)
const programId = getProgramId("devnet");

// Mainnet — set env or pass explicitly
// NETWORK=mainnet
const mainnetProgramId = getProgramId("mainnet");

// Market discovery — pass the program id of the network the connection points at
const markets = await discoverMarkets(connection, programId);
```

### Program Addresses

| Program | Network | Address |
|---------|---------|---------|
| Percolator | Mainnet | `ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv` |
| Matcher | Mainnet | `DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX` |
| Stake | Mainnet | `DC5fovFQD5SZYsetwvEqd4Wi4PFY1Yfnc669VMe6oa7F` |
| NFT | Mainnet | `FqhKJT9gtScjrmfUuRMjeg7cXNpif1fqsy5Jh65tJmTS` |
| Percolator | Devnet | `getProgramId("devnet")` = `PROGRAM_IDS_DEVNET_V22.percolator` (`6kpg2wi7vwkn7E9rvodXSktYRhna8TWjiZrC1dBek6NM`) |
| Matcher | Devnet | `getMatcherProgramId("devnet")` = `PROGRAM_IDS_DEVNET_V22.matcher` (`AsHvEJ8zNctKmdeS57H5E4w6nkTLi3bPVpd6ZCLc2ayN`) |

> Use `PROGRAM_ID` / `MATCHER_PROGRAM_ID` env vars to override for local test validators.

---

## RPC Connection Pool, Retry, and Health Probes

The SDK provides a production-grade RPC connection pool with automatic retry,
failover, and health probing. Use `RpcPool` for mainnet reliability.

### RpcPool — Multi-endpoint with failover/round-robin

```typescript
import { RpcPool, discoverMarkets, getProgramId } from "@percolatorct/sdk";
import type { PublicKey } from "@solana/web3.js";

declare const pubkey: PublicKey; // any account
const programId = getProgramId("mainnet");

const pool = new RpcPool({
  endpoints: [
    { url: "https://mainnet.helius-rpc.com/?api-key=KEY", weight: 10, label: "helius" },
    { url: "https://api.mainnet-beta.solana.com", weight: 1, label: "public" },
  ],
  strategy: "failover",   // or "round-robin"
  retry: {
    maxRetries: 3,         // default: 3
    baseDelayMs: 500,      // default: 500 (exponential backoff)
    maxDelayMs: 10_000,    // default: 10s cap
    jitterFactor: 0.25,    // default: 0.25 (avoid thundering herd)
  },
  requestTimeoutMs: 30_000, // default: 30s per request
  commitment: "confirmed",  // default: confirmed
});

// Execute any async call through the pool — auto-retry + failover
const slot = await pool.call(conn => conn.getSlot());
const balance = await pool.call(conn => conn.getBalance(pubkey));

// Use with discoverMarkets
const markets = await pool.call(conn =>
  discoverMarkets(conn, programId, { apiBaseUrl: "https://percolatorlaunch.com/api" })
);

// Pool status & diagnostics
console.log(pool.status()); // [{ label, url, healthy, failures, lastLatencyMs }]
console.log(`${pool.healthyCount}/${pool.size} endpoints healthy`);
```

### Standalone retry wrapper

```typescript
import { withRetry } from "@percolatorct/sdk";
import { Connection } from "@solana/web3.js";

const conn = new Connection("https://api.mainnet-beta.solana.com");
const slot = await withRetry(
  () => conn.getSlot(),
  { maxRetries: 3, baseDelayMs: 1000 },
);
```

### RPC health probes

```typescript
import { checkRpcHealth, RpcPool } from "@percolatorct/sdk";

const pool = new RpcPool({ endpoints: [{ url: "https://api.mainnet-beta.solana.com" }] });

const health = await checkRpcHealth("https://api.mainnet-beta.solana.com", 5000);
console.log(`${health.endpoint}: ${health.healthy ? "UP" : "DOWN"} — ${health.latencyMs}ms, slot ${health.slot}`);

// Or check all pool endpoints at once
const results = await pool.healthCheck();
```

---

## RPC Concurrency

`discoverMarkets()` fires one `getProgramAccounts` request per known slab tier size.
There are ~15 known tier sizes. To avoid hitting rate limits on public or free-tier endpoints,
the SDK caps parallel in-flight requests at **6** by default.

For production use a [Helius](https://helius.dev) paid-tier key. On the free tier,
pass `sequential: true` to serialize requests with exponential backoff:

```typescript
import { Connection } from "@solana/web3.js";
import { discoverMarkets, getProgramId } from "@percolatorct/sdk";

const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=KEY");
const programId = getProgramId("mainnet");

// Helius paid tier — parallel (default, fast)
const markets = await discoverMarkets(connection, programId, { maxParallelTiers: 6 });

// Free-tier or public RPC — sequential with 429 backoff
const marketsSafe = await discoverMarkets(connection, programId, { sequential: true });

// Custom concurrency
const marketsCustom = await discoverMarkets(connection, programId, { maxParallelTiers: 3 });
```

> **Note:** Public mainnet-beta RPC (`api.mainnet-beta.solana.com`) rejects
> `getProgramAccounts` calls entirely. Use the **API fallback** (below) or a
> Helius/QuickNode endpoint.

## Market Discovery — 3-Tier Fallback Chain

Public mainnet RPCs reject `getProgramAccounts`, which blocks `discoverMarkets()`.
The SDK provides a resilient 3-tier fallback chain that works on any RPC endpoint:

| Tier | Method | Requires |
|------|--------|----------|
| 1 | `getProgramAccounts` (RPC) | Helius/premium RPC key |
| 2 | REST API (`GET /markets`) | Percolator API online |
| 3 | Static bundle (bundled addresses) | Nothing — works offline |

All tiers verify data on-chain via `getMultipleAccounts` (works on all RPCs).

### Recommended: Full 3-tier fallback

Pass both `apiBaseUrl` and `network` to enable all three tiers:

```typescript
import { discoverMarkets, getProgramId } from "@percolatorct/sdk";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const markets = await discoverMarkets(connection, getProgramId("mainnet"), {
  apiBaseUrl: "https://percolatorlaunch.com/api",
  network: "mainnet",  // enables tier-3 static fallback
});
```

### API-only discovery via `discoverMarketsViaApi()`

Skip `getProgramAccounts` entirely — query the REST API for slab addresses,
then fetch full on-chain data:

```typescript
import { discoverMarketsViaApi, getProgramId } from "@percolatorct/sdk";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const programId = getProgramId("mainnet");
const markets = await discoverMarketsViaApi(
  connection,
  programId,
  "https://percolatorlaunch.com/api",
);
```

### Static-only discovery via `discoverMarketsViaStaticBundle()`

Use the bundled address list directly (no network calls except `getMultipleAccounts`):

```typescript
import {
  discoverMarketsViaStaticBundle,
  getStaticMarkets,
  getProgramId,
} from "@percolatorct/sdk";
import { Connection } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const entries = getStaticMarkets("mainnet");
const markets = await discoverMarketsViaStaticBundle(
  connection,
  getProgramId("mainnet"),
  entries,
);
```

### Extending the static registry at runtime

The static bundle can be augmented before calling `discoverMarkets()`:

```typescript
import { registerStaticMarkets, discoverMarkets, getProgramId } from "@percolatorct/sdk";
import { Connection } from "@solana/web3.js";

// Register known slab addresses before discovery
registerStaticMarkets("mainnet", [
  { slabAddress: "ABC123...", symbol: "SOL-PERP" },
  { slabAddress: "DEF456...", symbol: "ETH-PERP" },
]);

const connection = new Connection("https://api.mainnet-beta.solana.com");
const markets = await discoverMarkets(connection, getProgramId("mainnet"), {
  apiBaseUrl: "https://percolatorlaunch.com/api",
  network: "mainnet",
});
```

### Known addresses via `getMarketsByAddress()`

If you already know your market slab addresses (e.g. from an indexer or
hardcoded list), fetch them directly:

```typescript
import { getMarketsByAddress, getProgramId } from "@percolatorct/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const markets = await getMarketsByAddress(
  connection,
  getProgramId("mainnet"),
  [new PublicKey("..."), new PublicKey("...")],
);
```

---

## Architecture

```
@percolatorct/sdk
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
│   ├── rpc-pool.ts      # RPC connection pool, retry, failover, health probes
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
pnpm test                 # Run all 742 tests (vitest)
pnpm lint                 # Type-check (tsc --noEmit)
pnpm verify-layout        # Verify ABI byte offsets against on-chain layout
```

### Testing

Tests cover ABI encoding roundtrips, PDA derivation, slab parsing, validation, and trading math. 742 tests, 0 failures.

```bash
pnpm test                 # Run all tests
pnpm test -- --watch      # Watch mode
```

### v12.17 Layout Support

The SDK supports the v12.17 slab layout natively via `detectSlabLayout()`. The layout detection function inspects account size to select the correct field offsets for header, config, and per-account data.

A key fix in this version corrects the SBF byte offsets for `d1`/`d2` delta fields that were misaligned in earlier SDK versions. The `parseAllAccounts()` function applies the correct offsets for both devnet (legacy layout) and mainnet (v12.17 layout) slabs automatically.

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
| Percolator | `getProgramId("devnet")` = `PROGRAM_IDS_DEVNET_V22.percolator` |
| Matcher | `getMatcherProgramId("devnet")` = `PROGRAM_IDS_DEVNET_V22.matcher` |

The full v2.2 devnet set (wrapper, matcher, stake/vault, nft) is `PROGRAM_IDS_DEVNET_V22`; the 8.x
close-only set is `PROGRAM_IDS_DEVNET_V1`.

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
