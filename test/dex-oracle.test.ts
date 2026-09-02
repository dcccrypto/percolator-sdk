/**
 * DEX Oracle tests — PumpSwap, Raydium CLMM, Meteora DLMM
 */
import { PublicKey } from "@solana/web3.js";
import {
  detectDexType,
  parseDexPool,
  computeDexSpotPriceE6,
  fetchMintDecimals,
} from "../src/solana/dex-oracle.js";
import {
  PUMPSWAP_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
  METEORA_DLMM_PROGRAM_ID,
} from "../src/solana/pda.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function assertThrows(fn: () => void, substr: string, testName: string): void {
  try {
    fn();
    throw new Error(`FAIL: ${testName} — expected throw containing "${substr}"`);
  } catch (e: any) {
    if (!e.message.includes(substr)) {
      throw new Error(`FAIL: ${testName} — expected "${substr}" but got "${e.message}"`);
    }
  }
}

// Helper to write u16 LE
function writeU16LE(buf: Uint8Array, offset: number, val: number) {
  buf[offset] = val & 0xff;
  buf[offset + 1] = (val >> 8) & 0xff;
}

// Helper to write i32 LE
function writeI32LE(buf: Uint8Array, offset: number, val: number) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setInt32(offset, val, true);
}

// Helper to write u64 LE
function writeU64LE(buf: Uint8Array, offset: number, val: bigint) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  dv.setUint32(offset, Number(val & 0xffffffffn), true);
  dv.setUint32(offset + 4, Number((val >> 32n) & 0xffffffffn), true);
}

// Helper to write u128 LE
function writeU128LE(buf: Uint8Array, offset: number, val: bigint) {
  writeU64LE(buf, offset, val & ((1n << 64n) - 1n));
  writeU64LE(buf, offset + 8, val >> 64n);
}

// Helper: fill 32 bytes with a pubkey-like pattern
function fillPubkey(buf: Uint8Array, offset: number, seed: number) {
  for (let i = 0; i < 32; i++) buf[offset + i] = (seed + i) % 256;
}

// ===========================================================================
// detectDexType
// ===========================================================================

console.log("--- detectDexType ---");

assert(detectDexType(PUMPSWAP_PROGRAM_ID) === "pumpswap", "detect pumpswap");
assert(detectDexType(RAYDIUM_CLMM_PROGRAM_ID) === "raydium-clmm", "detect raydium-clmm");
assert(detectDexType(METEORA_DLMM_PROGRAM_ID) === "meteora-dlmm", "detect meteora-dlmm");
assert(detectDexType(PublicKey.default) === null, "detect unknown returns null");
assert(detectDexType(new PublicKey("11111111111111111111111111111111")) === null, "detect system program returns null");

console.log("  ✓ detectDexType");

// ===========================================================================
// PumpSwap
// ===========================================================================

console.log("--- PumpSwap ---");

const WSOL_MINT_B58 = "So11111111111111111111111111111111111111112";

// Offsets match the real Anchor `Pool` account layout, verified against the live
// ANSEM pool (see the fixture test below): base_mint@43, quote_mint@75,
// pool_base_token_account@139, pool_quote_token_account@171.
function makePumpSwapPoolData(quoteMintB58?: string): Uint8Array {
  const buf = new Uint8Array(210);
  fillPubkey(buf, 43, 1);    // base_mint
  if (quoteMintB58) {
    buf.set(new PublicKey(quoteMintB58).toBytes(), 75);
  } else {
    fillPubkey(buf, 75, 33); // quote_mint (non-WSOL synthetic pattern)
  }
  fillPubkey(buf, 139, 65);  // pool_base_token_account (baseVault)
  fillPubkey(buf, 171, 97);  // pool_quote_token_account (quoteVault)
  return buf;
}

function makeSplTokenAccount(amount: bigint): Uint8Array {
  const buf = new Uint8Array(165);
  writeU64LE(buf, 64, amount);
  return buf;
}

// Parse — offsets land on the expected fields
{
  const data = makePumpSwapPoolData();
  const pool = parseDexPool("pumpswap", PublicKey.default, data);
  assert(pool.dexType === "pumpswap", "pumpswap parse type");
  assert(pool.baseMint !== undefined, "pumpswap has baseMint");
  assert(pool.baseVault !== undefined, "pumpswap has baseVault");
  assert(pool.quoteVault !== undefined, "pumpswap has quoteVault");
  // Spot-check the exact bytes come from the corrected offsets, not the old
  // (35/67/131/163) ones.
  const expectedBase = new Uint8Array(32);
  for (let i = 0; i < 32; i++) expectedBase[i] = (1 + i) % 256;
  assert(
    Buffer.from(pool.baseMint.toBytes()).equals(Buffer.from(expectedBase)),
    "pumpswap baseMint reads from offset 43 (not the old offset 35)",
  );
}

// Parse too-short data (below the new 203-byte minimum, which now covers
// pool_quote_token_account — the old 195-byte minimum silently under-covered it)
assertThrows(
  () => parseDexPool("pumpswap", PublicKey.default, new Uint8Array(195)),
  "too short",
  "pumpswap parse too short"
);

// computeDexSpotPriceE6 now REQUIRES decimals for pumpswap (like meteora-dlmm) —
// the raw vault-amount ratio ignores mint decimals and mis-prices by
// 10^(decBase-decQuote).
assertThrows(
  () =>
    computeDexSpotPriceE6("pumpswap", makePumpSwapPoolData(), {
      base: makeSplTokenAccount(1_000_000n),
      quote: makeSplTokenAccount(1_000_000n),
    }),
  "decimals",
  "pumpswap missing decimals",
);

// Price computation — equal decimals, non-WSOL quote (no SOL conversion needed)
{
  const poolData = makePumpSwapPoolData();
  const base = makeSplTokenAccount(1_000_000_000n); // 1B base
  const quote = makeSplTokenAccount(500_000_000n); // 500M quote
  const price = computeDexSpotPriceE6("pumpswap", poolData, { base, quote }, { base: 6, quote: 6 });
  // equal decimals ⇒ ratio unaffected by the decimal adjustment: 500M/1B * 1e6 = 500_000
  assert(price === 500_000n, `pumpswap normal price: expected 500000, got ${price}`);
}

// Price computation — decimal-adjusted, non-WSOL quote (base 6dp / quote 9dp,
// the exact asymmetry pump.fun tokens vs WSOL have — but with a non-WSOL quote
// mint here so the test isolates the decimal fix from the SOL-conversion fix)
{
  const poolData = makePumpSwapPoolData();
  const base = makeSplTokenAccount(1_000_000n); // 1.0 token (6dp)
  const quote = makeSplTokenAccount(1_000_000_000n); // 1.0 quote unit (9dp)
  const price = computeDexSpotPriceE6("pumpswap", poolData, { base, quote }, { base: 6, quote: 9 });
  // (1_000_000_000 / 1e9) / (1_000_000 / 1e6) * 1e6 = 1.0 / 1.0 * 1e6 = 1_000_000
  assert(price === 1_000_000n, `pumpswap decimal-adjusted 1:1 price: expected 1000000, got ${price}`);
}

// #PS-1 regression: WITHOUT the decimal fix, 6dp-base/9dp-quote at a real
// pump.fun-shaped ratio would be off by exactly 1000x. Confirm the fix removes it.
{
  const poolData = makePumpSwapPoolData();
  const base = makeSplTokenAccount(3_892_192_026_206n); // ~3.89M tokens, 6dp
  const quote = makeSplTokenAccount(15_062_049_237_081n); // ~15,062 SOL, 9dp
  const price = computeDexSpotPriceE6("pumpswap", poolData, { base, quote }, { base: 6, quote: 9 });
  // token/quote price ≈ 0.003869 → price_e6 ≈ 3869 (NOT 3_869_000 — the old
  // undecimaled formula would have produced ~3,869,000, a 1000x error).
  assert(price === 3869n, `pumpswap decimal-fixed ANSEM-shaped ratio: expected 3869, got ${price}`);
}

// #PS-3: WSOL-quoted pool WITHOUT solPriceE6 must throw (never silently return
// a token/SOL price mislabeled as USD).
assertThrows(
  () =>
    computeDexSpotPriceE6(
      "pumpswap",
      makePumpSwapPoolData(WSOL_MINT_B58),
      { base: makeSplTokenAccount(1_000_000n), quote: makeSplTokenAccount(1_000_000_000n) },
      { base: 6, quote: 9 },
    ),
  "solPriceE6",
  "pumpswap WSOL-quoted without solPriceE6",
);

// #PS-3: WSOL-quoted pool WITH solPriceE6 converts token/SOL → USD
{
  const poolData = makePumpSwapPoolData(WSOL_MINT_B58);
  const base = makeSplTokenAccount(3_892_192_026_206n); // ~3.89M tokens, 6dp
  const quote = makeSplTokenAccount(15_062_049_237_081n); // ~15,062 SOL, 9dp
  const solPriceE6 = 77_728_195n; // $77.728195
  const price = computeDexSpotPriceE6("pumpswap", poolData, { base, quote }, { base: 6, quote: 9 }, solPriceE6);
  // token/SOL price_e6 = 3869 (from the case above); 3869 * 77.728195 / 1e6 ≈ 0.30073 → 300730 e6
  assert(price === 300_730n, `pumpswap SOL→USD conversion: expected 300730, got ${price}`);
}

// #338 INVERTED (was "zero base returns 0"): a zero is not a price, and every
// caller would have had to recognise the sentinel as "no price" — none did, so it
// propagated into the oracle path. This now THROWS, matching how
// computeDexSpotPriceE6 already reports missing vaultData and missing decimals.
// Re-introducing the `return 0n` fails here.
{
  const poolData = makePumpSwapPoolData();
  const base = makeSplTokenAccount(0n);
  const quote = makeSplTokenAccount(100n);
  let threw = false;
  try {
    computeDexSpotPriceE6("pumpswap", poolData, { base, quote }, { base: 6, quote: 6 });
  } catch {
    threw = true;
  }
  assert(threw, "pumpswap zero base must THROW, not return a zero price");
}

// Price — very large amounts (equal decimals, no overflow with BigInt)
{
  const poolData = makePumpSwapPoolData();
  const base = makeSplTokenAccount(18_446_744_073_709_551_615n); // u64 max
  const quote = makeSplTokenAccount(18_446_744_073_709_551_615n);
  const price = computeDexSpotPriceE6("pumpswap", poolData, { base, quote }, { base: 6, quote: 6 });
  assert(price === 1_000_000n, `pumpswap equal large amounts: expected 1000000, got ${price}`);
}

// Vault data too short
assertThrows(
  () =>
    computeDexSpotPriceE6(
      "pumpswap",
      makePumpSwapPoolData(),
      { base: new Uint8Array(10), quote: makeSplTokenAccount(100n) },
      { base: 6, quote: 6 },
    ),
  "too short",
  "pumpswap base vault too short",
);

// Missing vaultData
assertThrows(
  () => computeDexSpotPriceE6("pumpswap", makePumpSwapPoolData()),
  "vaultData",
  "pumpswap missing vaultData"
);

// ===========================================================================
// FIXTURE: real mainnet PumpSwap pool FnzKY6x7entQ1eR3D225dQyT7ybfka4PskBMQhb8L3CC
// ANSEM ("The Black Bull") / WSOL. Fetched from mainnet-beta, slot 431709958,
// Jul 2026. Verified independently via getTokenAccountsByOwner(pool) — the
// pool_quote_token_account decoded here matches the pool's actual WSOL vault
// on-chain (owner=pool PDA, ~15,062 SOL balance at fetch time).
// ===========================================================================
{
  const POOL_B64 =
    "8ZptBBGxbbz9AADFPRuklpDrfWvVVW4U1TIn3IAQ1eSm5kcr9KA2wGrSVH/wMLND/KPYVoFp" +
    "U7otoC4VT9HaKQiSLUc+85gnwtA/BpuIV/6rgYT7aH9jRhjANdrEOdwa6ztVmKDwAAAAAAGt" +
    "J2U+oZwnGkL34ynPR+DljHY+o44oq2IYlMu+QXYXAJ/ndBtXZdSGv8DFTwiGTwXbPRJSR6H+" +
    "yosRI+E81OA5uuMeU9JqOzYa7uy0TMSfZJXP/DwAicwkoM9fRIlaN0H/AuQM5QMAAHpKScAu" +
    "vZ3NBA/mxNRt1KUZ/PWcaHsdohozBOV1lOjNAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
  const raw = Buffer.from(POOL_B64, "base64");
  const poolData = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  assert(poolData.length === 301, `fixture: expected 301 bytes, got ${poolData.length}`);

  const ANSEM_MINT = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump";
  const pool = parseDexPool(
    "pumpswap",
    new PublicKey("FnzKY6x7entQ1eR3D225dQyT7ybfka4PskBMQhb8L3CC"),
    poolData,
  );
  assert(pool.dexType === "pumpswap", "fixture: dexType");
  assert(
    pool.baseMint.toBase58() === ANSEM_MINT,
    `fixture: baseMint must be ANSEM, got ${pool.baseMint.toBase58()}`,
  );
  assert(
    pool.quoteMint.toBase58() === WSOL_MINT_B58,
    `fixture: quoteMint must be WSOL, got ${pool.quoteMint.toBase58()}`,
  );
  assert(
    pool.baseVault!.toBase58() === "BmCXK8QFCHgjiqGm7peAtBbZpFPJNsp5fYP5rSRazMS8",
    `fixture: baseVault mismatch, got ${pool.baseVault!.toBase58()}`,
  );
  assert(
    pool.quoteVault!.toBase58() === "DaXhQ3pfN3J5dQnXxVU8YqW9bwA3RUVxXvq2iBjTDVt4",
    `fixture: quoteVault mismatch, got ${pool.quoteVault!.toBase58()}`,
  );

  // Reserve amounts captured from the same live vaults at fetch time (slot
  // 431709958): base=3,892,192.026206 ANSEM (6dp), quote=15,062.049237081 SOL (9dp).
  const base = makeSplTokenAccount(3_892_192_026_206n);
  const quote = makeSplTokenAccount(15_062_049_237_081n);
  const solPriceE6 = 77_728_195n; // SOL/USD snapshot from the same verification pass
  const priceE6 = computeDexSpotPriceE6(
    "pumpswap",
    poolData,
    { base, quote },
    { base: 6, quote: 9 },
    solPriceE6,
  );
  // Independently verified against Jupiter Price API v3 ($0.298347) and
  // DexScreener ($0.2994) at fetch time — within 0.5% of both. The pre-fix
  // formula (no decimals, no SOL conversion) computed $3.84 for this same
  // snapshot — a ~1186% error.
  assert(
    priceE6 === 300_730n,
    `fixture: ANSEM price should be $0.30073 (300730 e6), got ${priceE6}`,
  );
}

console.log("  ✓ PumpSwap");

// ===========================================================================
// Raydium CLMM
// ===========================================================================

console.log("--- Raydium CLMM ---");

function makeRaydiumClmmData(decimals0: number, decimals1: number, sqrtPriceX64: bigint): Uint8Array {
  const buf = new Uint8Array(280);
  fillPubkey(buf, 73, 1);   // baseMint
  fillPubkey(buf, 105, 33); // quoteMint
  buf[233] = decimals0;
  buf[234] = decimals1;
  writeU128LE(buf, 253, sqrtPriceX64);
  return buf;
}

// Parse
{
  const data = makeRaydiumClmmData(9, 6, 1n << 64n);
  const pool = parseDexPool("raydium-clmm", PublicKey.default, data);
  assert(pool.dexType === "raydium-clmm", "raydium parse type");
}

// Parse too short
assertThrows(
  () => parseDexPool("raydium-clmm", PublicKey.default, new Uint8Array(100)),
  "too short",
  "raydium parse too short"
);

// Normal price: sqrt = 2^64 → price = 1.0 (with equal decimals)
// sqrt_price_x64 = 2^64 means sqrt(price) = 1, so price = 1
// With decimals0 = decimals1, price_e6 should be 1_000_000
{
  const sqrtPriceX64 = 1n << 64n; // sqrt = 1.0 in Q64.64
  const data = makeRaydiumClmmData(6, 6, sqrtPriceX64);
  const price = computeDexSpotPriceE6("raydium-clmm", data);
  // price = (2^64)^2 * 10^(6+6-6) / 2^128 = 1 * 10^6 = 1_000_000
  assert(price === 1_000_000n, `raydium price=1: expected 1000000, got ${price}`);
}

// Micro-price (THE BUG CASE): sqrt < 2^64
// This is the critical test — previously sqrtHi = 0, returning 0
{
  // sqrt_price_x64 = 2^32 (much less than 2^64)
  // price = (2^32)^2 / 2^128 = 2^64 / 2^128 = 2^-64 ≈ 5.4e-20
  // With decimals0=9, decimals1=6: scale = 10^(6+9-6) = 10^9
  // price_e6 = 5.4e-20 * 1e9 = 5.4e-11 → still 0 at integer level
  // Let's use a more realistic micro-price:
  // sqrt_price_x64 = 2^48 → price = 2^96 / 2^128 = 2^-32 ≈ 2.3e-10
  // With d0=9, d1=6: price_e6 = 2.3e-10 * 1e9 = 0.23 → 0 (still small)
  // Use sqrt_price_x64 = 2^56 → price = 2^112/2^128 = 2^-16 ≈ 1.5e-5
  // With d0=9, d1=6: price_e6 = 1.5e-5 * 1e9 = 15258
  const sqrtPriceX64 = 1n << 56n;
  const data = makeRaydiumClmmData(9, 6, sqrtPriceX64);
  const price = computeDexSpotPriceE6("raydium-clmm", data);
  // Exact: (2^56)^2 / 2^128 * 10^9 = 2^112 / 2^128 * 1e9 = 1e9 / 2^16 = 15258.7...
  // With our method: scaled = 2^56 * 1e6 = ... >> 64 gives term, etc.
  // The key assertion: price MUST be > 0 (the old code would give 0)
  assert(price > 0n, `raydium micro-price must be > 0, got ${price}`);
  // Should be approximately 15258
  assert(price >= 15000n && price <= 16000n, `raydium micro-price ~15258, got ${price}`);
}

// #338 INVERTED (was "sqrt = 0 returns 0") — see the PumpSwap note above.
{
  const data = makeRaydiumClmmData(6, 6, 0n);
  let threw = false;
  try {
    computeDexSpotPriceE6("raydium-clmm", data);
  } catch {
    threw = true;
  }
  assert(threw, "raydium sqrt_price_x64 = 0 must THROW, not return a zero price");
}

// Large sqrt — won't overflow with BigInt
{
  const sqrtPriceX64 = (1n << 96n); // large sqrt
  const data = makeRaydiumClmmData(6, 6, sqrtPriceX64);
  const price = computeDexSpotPriceE6("raydium-clmm", data);
  // price = (2^96)^2 / 2^128 * 1e6 = 2^64 * 1e6 = 18446744073709551616000000
  assert(price > 0n, `raydium large sqrt > 0, got ${price}`);
}

// Negative decimal diff (decimals1 > decimals0)
{
  const sqrtPriceX64 = 1n << 64n;
  const data = makeRaydiumClmmData(6, 9, sqrtPriceX64);
  const price = computeDexSpotPriceE6("raydium-clmm", data);
  // price = 1 * 10^(6+6-9) = 10^3 = 1000
  assert(price === 1000n, `raydium neg decimal diff: expected 1000, got ${price}`);
}

// Data too short
assertThrows(
  () => computeDexSpotPriceE6("raydium-clmm", new Uint8Array(100)),
  "too short",
  "raydium data too short"
);

// Reject decimals > 24 (resource exhaustion prevention)
assertThrows(
  () => computeDexSpotPriceE6("raydium-clmm", makeRaydiumClmmData(255, 6, 1n << 64n)),
  "decimals out of range",
  "raydium reject decimals0=255"
);
assertThrows(
  () => computeDexSpotPriceE6("raydium-clmm", makeRaydiumClmmData(6, 255, 1n << 64n)),
  "decimals out of range",
  "raydium reject decimals1=255"
);
assertThrows(
  () => computeDexSpotPriceE6("raydium-clmm", makeRaydiumClmmData(25, 6, 1n << 64n)),
  "decimals out of range",
  "raydium reject decimals0=25"
);

// Accept decimals at boundary (24)
{
  const data = makeRaydiumClmmData(24, 24, 1n << 64n);
  const price = computeDexSpotPriceE6("raydium-clmm", data);
  assert(price === 1_000_000n, `raydium decimals=24,24 should work, got ${price}`);
}

console.log("  ✓ Raydium CLMM");

// ===========================================================================
// Meteora DLMM
// ===========================================================================

console.log("--- Meteora DLMM ---");

function makeMeteoraData(binStep: number, activeId: number): Uint8Array {
  // Correct LbPair layout offsets (verified against mainnet pool 5rCf1DM8...):
  //   [80:82]   bin_step  u16
  //   [76:80]   active_id i32
  //   [88:120]  token_x_mint Pubkey
  //   [120:152] token_y_mint Pubkey
  const buf = new Uint8Array(216); // at least 152 bytes; 216 covers through reserve_y
  fillPubkey(buf, 88, 1);   // baseMint (token_x_mint)
  fillPubkey(buf, 120, 33); // quoteMint (token_y_mint)
  writeU16LE(buf, 80, binStep);  // bin_step at offset 80 (not 73 which is bin_step_seed)
  writeI32LE(buf, 76, activeId); // active_id at offset 76
  return buf;
}

// Parse — type + correct mint extraction
{
  const data = makeMeteoraData(10, 0);
  const pool = parseDexPool("meteora-dlmm", PublicKey.default, data);
  assert(pool.dexType === "meteora-dlmm", "meteora parse type");
  // baseMint was filled at offset 88 with seed=1: bytes [1,2,3,...,32]
  const expectedBase = new Uint8Array(32);
  for (let i = 0; i < 32; i++) expectedBase[i] = (1 + i) % 256;
  assert(pool.baseMint.toBytes().every((b, i) => b === expectedBase[i]),
    "meteora parse correct baseMint from offset 88");
  // quoteMint was filled at offset 120 with seed=33: bytes [33,34,...,64]
  const expectedQuote = new Uint8Array(32);
  for (let i = 0; i < 32; i++) expectedQuote[i] = (33 + i) % 256;
  assert(pool.quoteMint.toBytes().every((b, i) => b === expectedQuote[i]),
    "meteora parse correct quoteMint from offset 120");
}

// Parse too short
assertThrows(
  () => parseDexPool("meteora-dlmm", PublicKey.default, new Uint8Array(50)),
  "too short",
  "meteora parse too short"
);

// active_id = 0 → price = 1.0 → price_e6 = 1_000_000
{
  const data = makeMeteoraData(10, 0);
  const price = computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 6, quote: 6 });
  assert(price === 1_000_000n, `meteora activeId=0: expected 1000000, got ${price}`);
}

// Positive active_id: price = (1 + 10/10000)^100 = 1.001^100 ≈ 1.10511
{
  const data = makeMeteoraData(10, 100);
  const price = computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 6, quote: 6 });
  // Should be approximately 1_105_116 (1.105116 * 1e6)
  assert(price >= 1_100_000n && price <= 1_110_000n, `meteora positive activeId ~1105116, got ${price}`);
}

// Negative active_id: price = 1 / (1.001^100) ≈ 0.90484
{
  const data = makeMeteoraData(10, -100);
  const price = computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 6, quote: 6 });
  assert(price >= 900_000n && price <= 910_000n, `meteora negative activeId ~904837, got ${price}`);
}

// #338 INVERTED (was "zero bin_step returns 0") — see the PumpSwap note above.
{
  const data = makeMeteoraData(0, 100);
  let threw = false;
  try {
    computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 6, quote: 6 });
  } catch {
    threw = true;
  }
  assert(threw, "meteora binStep = 0 must THROW, not return a zero price");
}

// Large positive exponent
{
  const data = makeMeteoraData(1, 10000);
  const price = computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 6, quote: 6 });
  // (1 + 1/10000)^10000 ≈ e ≈ 2.718 → price_e6 ≈ 2_718_281
  assert(price >= 2_700_000n && price <= 2_730_000n, `meteora large exp ~2718281, got ${price}`);
}

// Data too short
assertThrows(
  () => computeDexSpotPriceE6("meteora-dlmm", new Uint8Array(50), undefined, { base: 6, quote: 6 }),
  "too short",
  "meteora data too short"
);

// #226: token-decimal adjustment — asymmetric decimals scale by 10^(decBase-decQuote).
{
  // activeId=0 → atomic price 1.0; base=9, quote=6 → diff +3 → price_e6 = 1e6 * 10^3.
  const data = makeMeteoraData(10, 0);
  const up = computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 9, quote: 6 });
  assert(up === 1_000_000_000n, `meteora decimals +3: expected 1000000000, got ${up}`);
  // base=6, quote=9 → diff -3 → price_e6 = 1e6 / 10^3 = 1000.
  const down = computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 6, quote: 9 });
  assert(down === 1_000n, `meteora decimals -3: expected 1000, got ${down}`);
  // decimals out of range rejected.
  assertThrows(
    () => computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 99, quote: 6 }),
    "out of range",
    "meteora decimals out of range"
  );
  assertThrows(
    () => computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: -1, quote: 6 }),
    "out of range",
    "meteora negative base decimals rejected"
  );
  assertThrows(
    () => computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 6, quote: -1 }),
    "out of range",
    "meteora negative quote decimals rejected"
  );
  assertThrows(
    () => computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 1.5, quote: 6 }),
    "out of range",
    "meteora fractional decimals rejected"
  );
  assertThrows(
    () => computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: Number.NaN, quote: 6 }),
    "out of range",
    "meteora NaN decimals rejected"
  );
  // missing decimals rejected.
  assertThrows(
    () => computeDexSpotPriceE6("meteora-dlmm", data),
    "requires decimals",
    "meteora requires decimals"
  );
}

// Reject binStep > 10000 (resource exhaustion prevention)
assertThrows(
  () => computeDexSpotPriceE6("meteora-dlmm", makeMeteoraData(10001, 100), undefined, { base: 6, quote: 6 }),
  "binStep",
  "meteora reject binStep=10001"
);
assertThrows(
  () => computeDexSpotPriceE6("meteora-dlmm", makeMeteoraData(65535, 100), undefined, { base: 6, quote: 6 }),
  "binStep",
  "meteora reject binStep=65535"
);

// Reject |activeId| > 500000 (resource exhaustion prevention)
assertThrows(
  () => computeDexSpotPriceE6("meteora-dlmm", makeMeteoraData(10, 500001), undefined, { base: 6, quote: 6 }),
  "activeId",
  "meteora reject activeId=500001"
);
assertThrows(
  () => computeDexSpotPriceE6("meteora-dlmm", makeMeteoraData(10, -500001), undefined, { base: 6, quote: 6 }),
  "activeId",
  "meteora reject activeId=-500001"
);
assertThrows(
  () => computeDexSpotPriceE6("meteora-dlmm", makeMeteoraData(10, 2_000_000_000), undefined, { base: 6, quote: 6 }),
  "activeId",
  "meteora reject activeId=2B"
);

// Accept boundary values
{
  const data = makeMeteoraData(10000, 0);
  const price = computeDexSpotPriceE6("meteora-dlmm", data, undefined, { base: 6, quote: 6 });
  assert(price === 1_000_000n, `meteora binStep=10000 activeId=0 should work, got ${price}`);
}

// ===========================================================================
// FIXTURE: real mainnet Meteora DLMM pool 5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6
// Fetched from mainnet-beta on 2026-06-28, slot 429510894.
// Pool: WSOL (So111...) / USDC (EPjFW...), bin_step=4, active_id=-6616.
// Verified via on-chain RPC: token_x_mint=WSOL at offset 88, token_y_mint=USDC at offset 120.
// ===========================================================================
{
  const POOL_B64 =
    "IQsxYrVlsQ0QJx4AWAKIE8DUAQDgkwQAeFX+/4iqAQDoAwAAAAAAABAnAAAAAAAAJ+b//wAAAADp" +
    "cEFqAAAAAAAAAAAAAAAA/wQAACjm//8EAAAAAAAAAAabiFf+q4GE+2h/Y0YYwDXaxDncGus7VZig" +
    "8AAAAAABxvp6877brTo9ZfNqq8l0MbG75MLS9uDkfKYCA0UvXWHJSJlnLnmUpTrMngO1OaOUlA" +
    "PGmZRz7OrcxR6p6JFrJq9frZbeoPqr6Upv3p3ixa4nPIa3aZLTj4H3hSgAdOmvR5oEEAAAAAB0" +
    "scoFAAAAAAAA";
  // Decode base64 (Node.js Buffer)
  const raw = Buffer.from(POOL_B64, "base64");
  const poolData = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);

  // 1. Parse — mints must be exactly WSOL and USDC
  const WSOL = "So11111111111111111111111111111111111111112";
  const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const pool = parseDexPool(
    "meteora-dlmm",
    new PublicKey("5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6"),
    poolData,
  );
  assert(pool.dexType === "meteora-dlmm", "fixture: dexType");
  assert(pool.baseMint.toBase58() === WSOL,
    `fixture: baseMint must be WSOL, got ${pool.baseMint.toBase58()}`);
  assert(pool.quoteMint.toBase58() === USDC,
    `fixture: quoteMint must be USDC, got ${pool.quoteMint.toBase58()}`);

  // 2. Price — bin_step=4, active_id=-6616, WSOL(9 dec) / USDC(6 dec)
  //   atomic price = 1.0004^(-6616) ≈ 0.07097
  //   human price  = 0.07097 * 10^(9-6) = ~70.97 USDC/SOL → price_e6 ≈ 70_970_000
  const priceE6 = computeDexSpotPriceE6("meteora-dlmm", poolData, undefined, { base: 9, quote: 6 });
  assert(
    priceE6 >= 65_000_000n && priceE6 <= 80_000_000n,
    `fixture: price_e6 should be ~70-71M (SOL/USDC), got ${priceE6}`,
  );
}

console.log("  ✓ Meteora DLMM");

// ===========================================================================
// parseDexPool — all 3 types
// ===========================================================================

console.log("--- parseDexPool dispatch ---");

{
  const ps = parseDexPool("pumpswap", PublicKey.default, makePumpSwapPoolData());
  assert(ps.dexType === "pumpswap", "parseDexPool pumpswap");
  
  const ry = parseDexPool("raydium-clmm", PublicKey.default, makeRaydiumClmmData(6, 6, 1n << 64n));
  assert(ry.dexType === "raydium-clmm", "parseDexPool raydium");
  
  const mt = parseDexPool("meteora-dlmm", PublicKey.default, makeMeteoraData(10, 0));
  assert(mt.dexType === "meteora-dlmm", "parseDexPool meteora");
}

console.log("  ✓ parseDexPool dispatch");

console.log("\n✅ All dex-oracle tests passed!");
