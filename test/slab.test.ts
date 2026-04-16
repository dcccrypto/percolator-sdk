import { PublicKey } from "@solana/web3.js";
import {
  parseHeader,
  parseConfig,
  readNonce,
  readLastThrUpdateSlot,
  parseAccount,
  parseEngine,
  parseParams,
  parseUsedIndices,
  isAccountUsed,
  AccountKind,
  detectSlabLayout,
} from "../src/solana/slab.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

console.log("Testing slab parsing...\n");

// Create a mock slab buffer
// V0 layout (deployed devnet): HEADER_LEN=72, CONFIG_LEN=408, ENGINE_OFF=480
//   RESERVED_OFF = 48 (nonce at 48, lastThrUpdateSlot at 56)
//   Config starts at offset 72
function createMockSlab(): Buffer {
  const buf = Buffer.alloc(16320);  // V0 n=64 slab (recognized by detectSlabLayout)

  // Header (72 bytes)
  // magic: "PERCOLAT" = 0x504552434f4c4154
  buf.writeBigUInt64LE(0x504552434f4c4154n, 0);
  // version: 1
  buf.writeUInt32LE(1, 8);
  // bump: 255
  buf.writeUInt8(255, 12);
  // padding: 3 bytes (skip)
  // admin: 32 bytes at offset 16
  const adminBytes = Buffer.alloc(32);
  adminBytes[0] = 1; // Make it non-zero
  adminBytes.copy(buf, 16);
  // _reserved (24 bytes starting at offset 48): nonce at [48..56], lastThrUpdateSlot at [56..64]
  buf.writeBigUInt64LE(42n, 48); // nonce = 42
  buf.writeBigUInt64LE(12345n, 56); // lastThrUpdateSlot = 12345

  // MarketConfig (starting at offset 72, V0 layout)
  // Layout: collateral_mint(32) + vault_pubkey(32) + index_feed_id(32)
  //         + max_staleness_secs(8) + conf_filter_bps(2) + vault_authority_bump(1) + invert(1) + unit_scale(4)

  // collateralMint: 32 bytes at offset 72
  const mintBytes = Buffer.alloc(32);
  mintBytes[0] = 2;
  mintBytes.copy(buf, 72);
  // vaultPubkey: 32 bytes at offset 104
  const vaultBytes = Buffer.alloc(32);
  vaultBytes[0] = 3;
  vaultBytes.copy(buf, 104);
  // index_feed_id: 32 bytes at offset 136
  const feedIdBytes = Buffer.alloc(32);
  feedIdBytes[0] = 5;
  feedIdBytes.copy(buf, 136);
  // maxStalenessSlots: u64 at offset 168
  buf.writeBigUInt64LE(100n, 168);
  // confFilterBps: u16 at offset 176
  buf.writeUInt16LE(50, 176);
  // vaultAuthorityBump: u8 at offset 178
  buf.writeUInt8(254, 178);
  // invert: u8 at offset 179
  buf.writeUInt8(1, 179);
  // unitScale: u32 at offset 180
  buf.writeUInt32LE(0, 180);

  return buf;
}

// Test parseHeader
{
  const slab = createMockSlab();
  const header = parseHeader(slab);

  assert(header.magic === 0x504552434f4c4154n, "header magic");
  assert(header.version === 1, "header version");
  assert(header.bump === 255, "header bump");
  assert(header.admin instanceof PublicKey, "header admin is PublicKey");
  assert(header.nonce === 42n, "header nonce");
  assert(header.lastThrUpdateSlot === 12345n, "header lastThrUpdateSlot");

  console.log("✓ parseHeader");
}

// Test parseConfig
{
  const slab = createMockSlab();
  const config = parseConfig(slab);

  assert(config.collateralMint instanceof PublicKey, "config mint is PublicKey");
  assert(config.vaultPubkey instanceof PublicKey, "config vault is PublicKey");
  assert(config.indexFeedId instanceof PublicKey, "config indexFeedId is PublicKey");
  assert(config.maxStalenessSlots === 100n, "config maxStalenessSlots");
  assert(config.confFilterBps === 50, "config confFilterBps");
  assert(config.vaultAuthorityBump === 254, "config vaultAuthorityBump");
  assert(config.invert === 1, "config invert");
  assert(config.unitScale === 0, "config unitScale");

  console.log("✓ parseConfig");
}

// Test readNonce
{
  const slab = createMockSlab();
  const nonce = readNonce(slab);
  assert(nonce === 42n, "readNonce");
  console.log("✓ readNonce");
}

// Test readLastThrUpdateSlot
{
  const slab = createMockSlab();
  const slot = readLastThrUpdateSlot(slab);
  assert(slot === 12345n, "readLastThrUpdateSlot");
  console.log("✓ readLastThrUpdateSlot");
}

// Test error on invalid magic
{
  const slab = createMockSlab();
  slab.writeBigUInt64LE(0n, 0); // Invalid magic

  let threw = false;
  try {
    parseHeader(slab);
  } catch (e) {
    threw = true;
    assert(
      (e as Error).message.includes("Invalid slab magic"),
      "error message mentions invalid magic"
    );
  }
  assert(threw, "parseHeader throws on invalid magic");
  console.log("✓ parseHeader rejects invalid magic");
}

// Test error on short buffer
{
  const shortBuf = Buffer.alloc(32);

  let threw = false;
  try {
    parseHeader(shortBuf);
  } catch (e) {
    threw = true;
  }
  assert(threw, "parseHeader throws on short buffer");
  console.log("✓ parseHeader rejects short buffer");
}

console.log("\n✅ All basic slab tests passed!");

// =============================================================================
// Account Parsing Tests
// =============================================================================

console.log("\nTesting account parsing...\n");

// V0 layout constants (deployed devnet program)
const ENGINE_OFF = 480;
const ACCOUNT_SIZE = 240;
const ENGINE_BITMAP_OFF = 320;
// For 64-account tier: bitmapWords=1, bitmapBytes=8, postBitmap=18, nextFree=128
// preAccounts = 320+8+18+128 = 474, accountsOff = ceil(474/8)*8 = 480
const ENGINE_ACCOUNTS_OFF = 480;

// Account field offsets
const ACCT_ACCOUNT_ID_OFF = 0;
const ACCT_CAPITAL_OFF = 8;
const ACCT_KIND_OFF = 24;
const ACCT_PNL_OFF = 32;
const ACCT_POSITION_SIZE_OFF = 80;
const ACCT_ENTRY_PRICE_OFF = 96;
const ACCT_MATCHER_PROGRAM_OFF = 120;
const ACCT_MATCHER_CONTEXT_OFF = 152;
const ACCT_OWNER_OFF = 184;

// Helper to write u128 as two u64s
function writeU128LE(buf: Buffer, offset: number, value: bigint): void {
  const lo = value & BigInt("0xFFFFFFFFFFFFFFFF");
  const hi = (value >> 64n) & BigInt("0xFFFFFFFFFFFFFFFF");
  buf.writeBigUInt64LE(lo, offset);
  buf.writeBigUInt64LE(hi, offset + 8);
}

// Helper to write i128 as two u64s
function writeI128LE(buf: Buffer, offset: number, value: bigint): void {
  if (value < 0n) {
    value = (1n << 128n) + value;  // Convert to unsigned
  }
  writeU128LE(buf, offset, value);
}

// Create a full mock slab with accounts (V0 layout, 64-account tier)
// V0: HEADER_LEN=72, CONFIG_LEN=408, ENGINE_OFF=480, ACCOUNT_SIZE=240
//   ENGINE_BITMAP_OFF=320, ENGINE_ACCOUNTS_OFF=480
// Total for 64-account tier: 480 + 480 + 64*240 = 16,320
function createFullMockSlab(): Buffer {
  const size = 16_320; // V0 64-account tier
  const buf = Buffer.alloc(size);

  // Header (72 bytes)
  buf.writeBigUInt64LE(0x504552434f4c4154n, 0);  // magic
  buf.writeUInt32LE(1, 8);  // version
  buf.writeUInt8(255, 12);  // bump
  const adminBytes = Buffer.alloc(32);
  adminBytes[0] = 1;
  adminBytes.copy(buf, 16);
  buf.writeBigUInt64LE(42n, 48);  // nonce (V0 RESERVED_OFF = 48)
  buf.writeBigUInt64LE(12345n, 56);  // lastThrUpdateSlot

  // MarketConfig - simplified (starts at offset 72, V0 HEADER_LEN)
  const mintBytes = Buffer.alloc(32);
  mintBytes[0] = 2;
  mintBytes.copy(buf, 72);

  // Set bitmap - mark accounts 0 and 1 as used
  const bitmapOffset = ENGINE_OFF + ENGINE_BITMAP_OFF;
  buf.writeBigUInt64LE(3n, bitmapOffset);  // bits 0 and 1 set

  // Create account at index 0 (LP)
  const acc0Base = ENGINE_OFF + ENGINE_ACCOUNTS_OFF + 0 * ACCOUNT_SIZE;
  buf.writeBigUInt64LE(100n, acc0Base + ACCT_ACCOUNT_ID_OFF);  // accountId
  writeU128LE(buf, acc0Base + ACCT_CAPITAL_OFF, 1000000000n);  // capital: 1 SOL
  buf.writeUInt8(1, acc0Base + ACCT_KIND_OFF);  // kind: LP (1)
  writeI128LE(buf, acc0Base + ACCT_PNL_OFF, 0n);  // pnl: 0
  writeI128LE(buf, acc0Base + ACCT_POSITION_SIZE_OFF, 0n);  // position: 0
  buf.writeBigUInt64LE(150000000n, acc0Base + ACCT_ENTRY_PRICE_OFF);  // entry price: $150
  // Set matcher_program (non-zero for LP)
  const matcherProg = Buffer.alloc(32);
  matcherProg[0] = 0xAA;
  matcherProg.copy(buf, acc0Base + ACCT_MATCHER_PROGRAM_OFF);
  // Set owner
  const owner0 = Buffer.alloc(32);
  owner0[0] = 0x11;
  owner0.copy(buf, acc0Base + ACCT_OWNER_OFF);

  // Create account at index 1 (User)
  const acc1Base = ENGINE_OFF + ENGINE_ACCOUNTS_OFF + 1 * ACCOUNT_SIZE;
  buf.writeBigUInt64LE(101n, acc1Base + ACCT_ACCOUNT_ID_OFF);  // accountId
  writeU128LE(buf, acc1Base + ACCT_CAPITAL_OFF, 500000000n);  // capital: 0.5 SOL
  buf.writeUInt8(0, acc1Base + ACCT_KIND_OFF);  // kind: User (0)
  writeI128LE(buf, acc1Base + ACCT_PNL_OFF, -100000n);  // pnl: -0.0001 SOL
  writeI128LE(buf, acc1Base + ACCT_POSITION_SIZE_OFF, 1000000n);  // position: 1M units
  buf.writeBigUInt64LE(145000000n, acc1Base + ACCT_ENTRY_PRICE_OFF);  // entry price: $145
  // matcher_program stays zero (User accounts don't have matchers)
  // Set owner
  const owner1 = Buffer.alloc(32);
  owner1[0] = 0x22;
  owner1.copy(buf, acc1Base + ACCT_OWNER_OFF);

  return buf;
}

// Test account kind parsing
{
  const slab = createFullMockSlab();

  // Test LP account (index 0)
  const acc0 = parseAccount(slab, 0);
  assert(acc0.kind === AccountKind.LP, "account 0 should be LP");
  assert(acc0.accountId === 100n, "account 0 accountId");
  assert(acc0.capital === 1000000000n, "account 0 capital");

  // Test User account (index 1)
  const acc1 = parseAccount(slab, 1);
  assert(acc1.kind === AccountKind.User, "account 1 should be User");
  assert(acc1.accountId === 101n, "account 1 accountId");
  assert(acc1.capital === 500000000n, "account 1 capital");

  console.log("✓ parseAccount kind field (LP vs User)");
}

// Test account fields
{
  const slab = createFullMockSlab();
  const acc1 = parseAccount(slab, 1);

  assert(acc1.positionSize === 1000000n, "account position size");
  assert(acc1.entryPrice === 145000000n, "account entry price");
  assert(acc1.pnl === -100000n, "account pnl (negative)");
  assert(acc1.owner instanceof PublicKey, "account owner is PublicKey");

  console.log("✓ parseAccount fields (position, entry price, pnl, owner)");
}

// Test bitmap parsing
{
  const slab = createFullMockSlab();
  const indices = parseUsedIndices(slab);

  assert(indices.length === 2, "should have 2 used indices");
  assert(indices.includes(0), "should include index 0");
  assert(indices.includes(1), "should include index 1");
  assert(!indices.includes(2), "should not include index 2");

  console.log("✓ parseUsedIndices (bitmap parsing)");
}

// Test isAccountUsed
{
  const slab = createFullMockSlab();

  assert(isAccountUsed(slab, 0) === true, "account 0 should be used");
  assert(isAccountUsed(slab, 1) === true, "account 1 should be used");
  assert(isAccountUsed(slab, 2) === false, "account 2 should not be used");
  assert(isAccountUsed(slab, 64) === false, "account 64 should not be used");

  console.log("✓ isAccountUsed");
}

// Test account index bounds
{
  const slab = createFullMockSlab();

  let threw = false;
  try {
    parseAccount(slab, 10000);  // Way out of bounds
  } catch (e) {
    threw = true;
    assert((e as Error).message.includes("out of range"), "error mentions out of range");
  }
  assert(threw, "parseAccount throws on out of bounds index");

  console.log("✓ parseAccount rejects out of bounds index");
}

// Test negative index
{
  const slab = createFullMockSlab();

  let threw = false;
  try {
    parseAccount(slab, -1);
  } catch (e) {
    threw = true;
  }
  assert(threw, "parseAccount throws on negative index");

  console.log("✓ parseAccount rejects negative index");
}

console.log("\n✅ All account tests passed!");

console.log("\n✅ All slab tests passed!");

// ─── V1_LEGACY slab tests (65,352 bytes, engineOff=640) ─────────────────────
// Root cause: buildLayout() used bitmapOff=656 for preAccountsLen, giving accountsOff=1864.
// Actual accounts start at 1880 (verified empirically on devnet).
// Fix: use actualBitmapOff=672 in preAccountsLen → accountsOff=1880.
// With base correct, all standard offsets (owner=+184, capital=+8) work as-is.
{
  console.log("\nTesting V1_LEGACY slab layout (65,352-byte slabs)...");

  // V1_LEGACY constants (on-chain actual values — verified against devnet slab)
  const V1L_ENGINE_OFF = 640;
  const V1L_BITMAP_OFF_REL = 672;    // relative to engineOff → abs 1312
  const V1L_ACCOUNTS_OFF = 1880;     // accountsOff absolute (empirically confirmed)
  const V1L_ACCT_OWNER_OFF = 184;    // standard owner offset — correct now that base is right
  const V1L_ACCT_CAPITAL_OFF = 8;    // standard capital offset
  const V1L_ACCT_SIZE = 248;
  const V1L_SIZE = 65_352;

  const slab65352 = Buffer.alloc(V1L_SIZE);

  // Set bitmap: bits 0 and 1 used (word 0 = 0x03)
  const bitmapAbs = V1L_ENGINE_OFF + V1L_BITMAP_OFF_REL; // 1312
  slab65352.writeBigUInt64LE(0x03n, bitmapAbs);

  // Write two accounts at correct V1_LEGACY positions (base=1880)
  const ownerA = Buffer.alloc(32); ownerA[0] = 0xAA;
  const ownerB = Buffer.alloc(32); ownerB[0] = 0xBB;
  ownerA.copy(slab65352, V1L_ACCOUNTS_OFF + 0 * V1L_ACCT_SIZE + V1L_ACCT_OWNER_OFF);
  ownerB.copy(slab65352, V1L_ACCOUNTS_OFF + 1 * V1L_ACCT_SIZE + V1L_ACCT_OWNER_OFF);

  // Write capital values to verify field reads correctly
  const CAPITAL_A = 2_055_000_000n;
  const CAPITAL_B = 555_000_000n;
  slab65352.writeBigUInt64LE(CAPITAL_A, V1L_ACCOUNTS_OFF + 0 * V1L_ACCT_SIZE + V1L_ACCT_CAPITAL_OFF);
  slab65352.writeBigUInt64LE(CAPITAL_B, V1L_ACCOUNTS_OFF + 1 * V1L_ACCT_SIZE + V1L_ACCT_CAPITAL_OFF);

  // detectSlabLayout must recognise 65352
  const layout = detectSlabLayout(V1L_SIZE);
  assert(layout !== null, "detectSlabLayout must handle 65352 bytes");
  assert(layout!.engineOff === V1L_ENGINE_OFF, `engineOff must be 640, got ${layout!.engineOff}`);
  assert(layout!.accountsOff === V1L_ACCOUNTS_OFF,
    `accountsOff must be 1880 for V1_LEGACY, got ${layout!.accountsOff}`);
  assert(layout!.acctOwnerOff === V1L_ACCT_OWNER_OFF,
    `acctOwnerOff must be 184 for V1_LEGACY, got ${layout!.acctOwnerOff}`);
  assert(layout!.engineBitmapOff === V1L_BITMAP_OFF_REL,
    `engineBitmapOff must be 672 for V1_LEGACY, got ${layout!.engineBitmapOff}`);
  console.log("  ✓ detectSlabLayout recognises 65,352-byte V1_LEGACY slab");
  console.log("  ✓ accountsOff=1880 (root cause fix: actualBitmapOff used in preAccountsLen)");

  // parseUsedIndices must return [0, 1]
  const indices = parseUsedIndices(slab65352);
  assert(indices.length === 2 && indices[0] === 0 && indices[1] === 1,
    `expected indices [0,1] got [${indices}]`);
  console.log("  ✓ parseUsedIndices returns correct indices (0,1) not (128,129)");

  // parseAccount must read owner and capital from correct offsets
  const acc0 = parseAccount(slab65352, 0);
  assert(acc0.owner.toBytes()[0] === 0xAA,
    `account 0 owner first byte must be 0xAA (got ${acc0.owner.toBytes()[0]})`);
  assert(acc0.capital === CAPITAL_A,
    `account 0 capital must be ${CAPITAL_A} (got ${acc0.capital})`);
  const acc1 = parseAccount(slab65352, 1);
  assert(acc1.owner.toBytes()[0] === 0xBB,
    `account 1 owner first byte must be 0xBB (got ${acc1.owner.toBytes()[0]})`);
  assert(acc1.capital === CAPITAL_B,
    `account 1 capital must be ${CAPITAL_B} (got ${acc1.capital})`);
  console.log("  ✓ parseAccount reads owner at +184 and capital at +8 correctly for V1_LEGACY");

  console.log("✅ V1_LEGACY slab tests passed!");
}

// ─── V2 slab layout tests (ENGINE_OFF=600, BITMAP_OFF=432) ──────────────────
// V2 slabs produce identical data sizes to V1D (postBitmap=2) slabs.
// Disambiguation requires reading version field at offset 8.
{
  console.log("\nTesting V2 slab layout (BPF intermediate)...");

  // V2 small slab size = 65088 (same as V1D small)
  const V2_SIZE = 65_088;

  // Create minimal buffer with version=2 at offset 8
  const v2buf = Buffer.alloc(V2_SIZE);
  // Write PERCOLAT magic
  v2buf.writeBigUInt64LE(0x504552434f4c4154n, 0);
  // Write version=2 at offset 8
  v2buf.writeUInt32LE(2, 8);

  // Without data, detectSlabLayout should return V1D (backward compat)
  const layoutNoData = detectSlabLayout(V2_SIZE);
  assert(layoutNoData !== null, "detectSlabLayout(65088) without data should return non-null");
  assert(layoutNoData!.version === 1, `Without data, version should be 1 (V1D), got ${layoutNoData!.version}`);
  assert(layoutNoData!.engineOff === 424, `Without data, engineOff should be 424 (V1D), got ${layoutNoData!.engineOff}`);
  console.log("  ✓ detectSlabLayout without data returns V1D (backward compat)");

  // With data containing version=2, should return V2 layout
  const layoutV2 = detectSlabLayout(V2_SIZE, v2buf);
  assert(layoutV2 !== null, "detectSlabLayout with V2 data should return non-null");
  assert(layoutV2!.version === 2, `With V2 data, version should be 2, got ${layoutV2!.version}`);
  assert(layoutV2!.engineOff === 600, `V2 engineOff should be 600, got ${layoutV2!.engineOff}`);
  assert(layoutV2!.engineBitmapOff === 432, `V2 engineBitmapOff should be 432, got ${layoutV2!.engineBitmapOff}`);
  assert(layoutV2!.accountSize === 248, `V2 accountSize should be 248, got ${layoutV2!.accountSize}`);
  assert(layoutV2!.maxAccounts === 256, `V2 maxAccounts should be 256, got ${layoutV2!.maxAccounts}`);
  console.log("  ✓ detectSlabLayout with V2 data returns version=2 layout");

  // V2 should have no mark_price, long_oi, short_oi, emergency fields
  assert(layoutV2!.engineMarkPriceOff === -1, "V2 should have no mark_price");
  assert(layoutV2!.engineLongOiOff === -1, "V2 should have no long_oi");
  assert(layoutV2!.engineShortOiOff === -1, "V2 should have no short_oi");
  assert(layoutV2!.engineEmergencyOiModeOff === -1, "V2 should have no emergency OI mode");
  assert(layoutV2!.engineEmergencyStartSlotOff === -1, "V2 should have no emergency start slot");
  assert(layoutV2!.engineLastBreakerSlotOff === -1, "V2 should have no last breaker slot");
  console.log("  ✓ V2 layout correctly reports missing fields as -1");

  // V2 engine field offsets should match specification
  assert(layoutV2!.engineCurrentSlotOff === 352, "V2 currentSlot offset");
  assert(layoutV2!.engineFundingIndexOff === 360, "V2 fundingIndex offset");
  assert(layoutV2!.engineTotalOiOff === 408, "V2 totalOI offset");
  assert(layoutV2!.engineCTotOff === 424, "V2 cTot offset");
  assert(layoutV2!.engineLiqCursorOff === 456, "V2 liqCursor offset");
  assert(layoutV2!.engineNetLpPosOff === 504, "V2 netLpPos offset");
  assert(layoutV2!.engineLpMaxAbsOff === 536, "V2 lpMaxAbs offset");
  assert(layoutV2!.engineLpMaxAbsSweepOff === 552, "V2 lpMaxAbsSweep offset");
  console.log("  ✓ V2 engine field offsets match specification");

  // With data containing version=1 (V1D), should still return V1D
  const v1dBuf = Buffer.alloc(V2_SIZE);
  v1dBuf.writeBigUInt64LE(0x504552434f4c4154n, 0);
  v1dBuf.writeUInt32LE(1, 8);
  const layoutV1D = detectSlabLayout(V2_SIZE, v1dBuf);
  assert(layoutV1D !== null, "detectSlabLayout with V1D data should return non-null");
  assert(layoutV1D!.version === 1, `With V1D data, version should be 1, got ${layoutV1D!.version}`);
  assert(layoutV1D!.engineOff === 424, `With V1D data, engineOff should be 424, got ${layoutV1D!.engineOff}`);
  console.log("  ✓ detectSlabLayout with version=1 data returns V1D layout");

  // V2 large slab size = 1025568 (same as V1D large)
  const V2_LARGE_SIZE = 1_025_568;
  const v2LargeBuf = Buffer.alloc(64); // minimal for version read
  v2LargeBuf.writeBigUInt64LE(0x504552434f4c4154n, 0);
  v2LargeBuf.writeUInt32LE(2, 8);
  const layoutV2Large = detectSlabLayout(V2_LARGE_SIZE, v2LargeBuf);
  assert(layoutV2Large !== null, "detectSlabLayout for V2 large should return non-null");
  assert(layoutV2Large!.version === 2, `V2 large version should be 2, got ${layoutV2Large!.version}`);
  assert(layoutV2Large!.maxAccounts === 4096, `V2 large maxAccounts should be 4096, got ${layoutV2Large!.maxAccounts}`);
  console.log("  ✓ V2 large slab (1025568) detected correctly");

  console.log("✅ V2 slab layout tests passed!");
}

// ─── V_ADL slab layout tests (PERC-8270/8271 ADL upgrade) ──────────────────
// V_ADL slabs use ENGINE_OFF=624, BITMAP_OFF=1008, ACCOUNT_SIZE=312.
// Sizes corrected after bitmapOff was fixed from 1006→1008 (empirically verified
// against mainnet CCTegYZ... slab). Old sizes (1288304/323312/82064) now map to V1M2.
{
  console.log("\nTesting V_ADL slab layout (PERC-8270/8271 ADL upgrade)...");

  // Large tier: 4096 accounts × 312 bytes/account, bitmapOff=1008
  // computeSlabSize(624, 1008, 312, 4096, 18) = 1_288_312
  const V_ADL_LARGE_SIZE = 1_288_312;
  const layoutLarge = detectSlabLayout(V_ADL_LARGE_SIZE);
  assert(layoutLarge !== null, `detectSlabLayout(1288312) must return non-null`);
  assert(layoutLarge!.engineOff === 624, `V_ADL engineOff should be 624, got ${layoutLarge!.engineOff}`);
  assert(layoutLarge!.accountSize === 312, `V_ADL accountSize should be 312, got ${layoutLarge!.accountSize}`);
  assert(layoutLarge!.maxAccounts === 4096, `V_ADL maxAccounts should be 4096, got ${layoutLarge!.maxAccounts}`);
  assert(layoutLarge!.engineBitmapOff === 1008, `V_ADL bitmapOff should be 1008, got ${layoutLarge!.engineBitmapOff}`);
  assert(layoutLarge!.acctOwnerOff === 192, `V_ADL acctOwnerOff should be 192, got ${layoutLarge!.acctOwnerOff}`);
  console.log("  ✓ V_ADL large slab (1288312, 4096 accounts) detected correctly");

  // Verify critical engine field offsets
  assert(layoutLarge!.engineCurrentSlotOff === 432, `V_ADL currentSlot should be 432`);
  assert(layoutLarge!.engineMarkPriceOff === 504, `V_ADL markPrice should be 504`);
  assert(layoutLarge!.engineTotalOiOff === 544, `V_ADL totalOI should be 544`);
  assert(layoutLarge!.engineLongOiOff === 560, `V_ADL longOI should be 560`);
  assert(layoutLarge!.engineShortOiOff === 576, `V_ADL shortOI should be 576`);
  assert(layoutLarge!.engineCTotOff === 592, `V_ADL cTot should be 592`);
  assert(layoutLarge!.enginePnlPosTotOff === 608, `V_ADL pnlPosTot should be 608`);
  console.log("  ✓ V_ADL engine field offsets match PERC-8270 specification");

  // accountsOff: ENGINE_OFF=624 + rel=9736 = 10360
  // preAccountsLen = 1008+512+18+8192 = 9730 → ceil(9730/8)*8 = 9736
  assert(layoutLarge!.accountsOff === 10360, `V_ADL accountsOff should be 10360, got ${layoutLarge!.accountsOff}`);
  console.log("  ✓ V_ADL accounts array offset = 10360 (ENGINE_OFF=624 + 9736)");

  // Insurance isolation fields present
  assert(layoutLarge!.hasInsuranceIsolation === true, `V_ADL should have insurance isolation`);
  console.log("  ✓ V_ADL has insurance isolation fields");

  // Medium tier: 1024 accounts — computeSlabSize(624, 1008, 312, 1024, 18) = 323_320
  const V_ADL_MEDIUM_SIZE = 323_320;
  const layoutMedium = detectSlabLayout(V_ADL_MEDIUM_SIZE);
  assert(layoutMedium !== null, `detectSlabLayout(323320) must return non-null`);
  assert(layoutMedium!.engineOff === 624, `V_ADL medium engineOff should be 624, got ${layoutMedium!.engineOff}`);
  assert(layoutMedium!.maxAccounts === 1024, `V_ADL medium maxAccounts should be 1024`);
  assert(layoutMedium!.accountSize === 312, `V_ADL medium accountSize should be 312`);
  console.log("  ✓ V_ADL medium slab (323320, 1024 accounts) detected correctly");

  // Small tier: 256 accounts — computeSlabSize(624, 1008, 312, 256, 18) = 82_072
  const V_ADL_SMALL_SIZE = 82_072;
  const layoutSmall = detectSlabLayout(V_ADL_SMALL_SIZE);
  assert(layoutSmall !== null, `detectSlabLayout(82072) must return non-null`);
  assert(layoutSmall!.engineOff === 624, `V_ADL small engineOff should be 624, got ${layoutSmall!.engineOff}`);
  assert(layoutSmall!.maxAccounts === 256, `V_ADL small maxAccounts should be 256`);
  assert(layoutSmall!.accountSize === 312, `V_ADL small accountSize should be 312`);
  console.log("  ✓ V_ADL small slab (82072, 256 accounts) detected correctly");

  console.log("✅ V_ADL slab layout tests passed!");
}

// ─── V_SETDEXPOOL slab layout tests (PERC-SetDexPool) ───────────────────────
// V_SETDEXPOOL is the current mainnet binary layout.
// ENGINE_OFF=648 (align_up(104+544, 8)), BITMAP_OFF=1008, ACCOUNT_SIZE=312.
// Sizes: computeSlabSize(648, 1008, 312, n, 18)
{
  console.log("\nTesting V_SETDEXPOOL slab layout (current mainnet binary)...");

  // Large tier: 4096 accounts — 1_288_336 bytes
  const V_SETDEXPOOL_LARGE_SIZE = 1_288_336;
  const layoutLarge = detectSlabLayout(V_SETDEXPOOL_LARGE_SIZE);
  assert(layoutLarge !== null, `detectSlabLayout(1288336) must return non-null`);
  assert(layoutLarge!.engineOff === 648, `V_SETDEXPOOL large engineOff should be 648, got ${layoutLarge!.engineOff}`);
  assert(layoutLarge!.accountSize === 312, `V_SETDEXPOOL large accountSize should be 312`);
  assert(layoutLarge!.maxAccounts === 4096, `V_SETDEXPOOL large maxAccounts should be 4096`);
  assert(layoutLarge!.engineBitmapOff === 1008, `V_SETDEXPOOL bitmapOff should be 1008, got ${layoutLarge!.engineBitmapOff}`);
  assert(layoutLarge!.acctOwnerOff === 192, `V_SETDEXPOOL acctOwnerOff should be 192`);
  // accountsOff: 648 + ceil((1008+512+18+8192)/8)*8 = 648 + 9736 = 10384
  assert(layoutLarge!.accountsOff === 10384, `V_SETDEXPOOL accountsOff should be 10384, got ${layoutLarge!.accountsOff}`);
  console.log("  ✓ V_SETDEXPOOL large slab (1288336, 4096 accounts) detected correctly");

  // Medium tier: 1024 accounts — 323_344 bytes (deployed to mainnet 4AyxFjwU, now closed)
  const V_SETDEXPOOL_MEDIUM_SIZE = 323_344;
  const layoutMedium = detectSlabLayout(V_SETDEXPOOL_MEDIUM_SIZE);
  assert(layoutMedium !== null, `detectSlabLayout(323344) must return non-null`);
  assert(layoutMedium!.engineOff === 648, `V_SETDEXPOOL medium engineOff should be 648, got ${layoutMedium!.engineOff}`);
  assert(layoutMedium!.maxAccounts === 1024, `V_SETDEXPOOL medium maxAccounts should be 1024`);
  assert(layoutMedium!.accountSize === 312, `V_SETDEXPOOL medium accountSize should be 312`);
  assert(layoutMedium!.accountsOff === 3856, `V_SETDEXPOOL medium accountsOff should be 3856, got ${layoutMedium!.accountsOff}`);
  console.log("  ✓ V_SETDEXPOOL medium slab (323344, 1024 accounts) detected correctly");

  // Small tier: 256 accounts — 82_096 bytes
  const V_SETDEXPOOL_SMALL_SIZE = 82_096;
  const layoutSmall = detectSlabLayout(V_SETDEXPOOL_SMALL_SIZE);
  assert(layoutSmall !== null, `detectSlabLayout(82096) must return non-null`);
  assert(layoutSmall!.engineOff === 648, `V_SETDEXPOOL small engineOff should be 648, got ${layoutSmall!.engineOff}`);
  assert(layoutSmall!.maxAccounts === 256, `V_SETDEXPOOL small maxAccounts should be 256`);
  assert(layoutSmall!.accountSize === 312, `V_SETDEXPOOL small accountSize should be 312`);
  console.log("  ✓ V_SETDEXPOOL small slab (82096, 256 accounts) detected correctly");

  // Verify engine field offsets are same as V_ADL (only ENGINE_OFF differs, not internal layout)
  assert(layoutLarge!.engineCurrentSlotOff === 432, `V_SETDEXPOOL currentSlot should be 432`);
  assert(layoutLarge!.engineTotalOiOff === 544, `V_SETDEXPOOL totalOI should be 544`);
  assert(layoutLarge!.hasInsuranceIsolation === true, `V_SETDEXPOOL should have insurance isolation`);
  console.log("  ✓ V_SETDEXPOOL engine field offsets match V_ADL (only engineOff differs)");

  console.log("✅ V_SETDEXPOOL slab layout tests passed!");
}

// ─── V12_1 slab layout tests (percolator-core v12.1 merge) ──────────────────
// V12_1 is the post-v12.1 merge layout. Account grew 312→320 bytes, bitmap shifted 1008→1016.
// All offsets verified by cargo build-sbf compile-time assertions.
{
  console.log("\nTesting V12_1 slab layout (v12.1 program)...");

  // Large tier: 4096 accounts
  const V12_1_LARGE_SIZE = 1_321_112;
  const layoutLarge = detectSlabLayout(V12_1_LARGE_SIZE);
  assert(layoutLarge !== null, `detectSlabLayout(${V12_1_LARGE_SIZE}) must return non-null`);
  assert(layoutLarge!.engineOff === 648, `V12_1 large engineOff should be 648, got ${layoutLarge!.engineOff}`);
  assert(layoutLarge!.accountSize === 320, `V12_1 large accountSize should be 320, got ${layoutLarge!.accountSize}`);
  assert(layoutLarge!.maxAccounts === 4096, `V12_1 large maxAccounts should be 4096`);
  assert(layoutLarge!.engineBitmapOff === 368, `V12_1 bitmapOff should be 368 (engine-relative), got ${layoutLarge!.engineBitmapOff}`);
  assert(layoutLarge!.acctOwnerOff === 208, `V12_1 acctOwnerOff should be 208, got ${layoutLarge!.acctOwnerOff}`);
  // accountsOff = engineOff + ceil((368+512+18+8192)/8)*8 = 648 + 9096 = 9744
  assert(layoutLarge!.accountsOff === 9744, `V12_1 large accountsOff should be 9744, got ${layoutLarge!.accountsOff}`);
  console.log(`  ✓ V12_1 large slab (${V12_1_LARGE_SIZE}, 4096 accounts) detected correctly`);

  // Medium tier: 1024 accounts
  const V12_1_MEDIUM_SIZE = 331_544;
  const layoutMedium = detectSlabLayout(V12_1_MEDIUM_SIZE);
  assert(layoutMedium !== null, `detectSlabLayout(${V12_1_MEDIUM_SIZE}) must return non-null`);
  assert(layoutMedium!.engineOff === 648, `V12_1 medium engineOff should be 648, got ${layoutMedium!.engineOff}`);
  assert(layoutMedium!.maxAccounts === 1024, `V12_1 medium maxAccounts should be 1024`);
  assert(layoutMedium!.accountSize === 320, `V12_1 medium accountSize should be 320`);
  console.log(`  ✓ V12_1 medium slab (${V12_1_MEDIUM_SIZE}, 1024 accounts) detected correctly`);

  // Small tier: 256 accounts
  // computeSlabSize(648, 1016, 320, 256, 18) = 648 + ceil((1016+32+18+512)/8)*8 + 256*320
  //   = 648 + 1584 + 81920 = 84152
  const V12_1_SMALL_SIZE = 84_152;
  const layoutSmall = detectSlabLayout(V12_1_SMALL_SIZE);
  assert(layoutSmall !== null, `detectSlabLayout(${V12_1_SMALL_SIZE}) must return non-null`);
  assert(layoutSmall!.engineOff === 648, `V12_1 small engineOff should be 648, got ${layoutSmall!.engineOff}`);
  assert(layoutSmall!.maxAccounts === 256, `V12_1 small maxAccounts should be 256`);
  assert(layoutSmall!.accountSize === 320, `V12_1 small accountSize should be 320`);
  console.log(`  ✓ V12_1 small slab (${V12_1_SMALL_SIZE}, 256 accounts) detected correctly`);

  // Verify v12.1 engine field offsets changed from V_ADL/V_SETDEXPOOL
  assert(layoutLarge!.engineCurrentSlotOff === 448, `V12_1 currentSlot should be 448, got ${layoutLarge!.engineCurrentSlotOff}`);
  assert(layoutLarge!.engineCTotOff === 480, `V12_1 cTot should be 480, got ${layoutLarge!.engineCTotOff}`);
  assert(layoutLarge!.engineTotalOiOff === 816, `V12_1 totalOI should be 816, got ${layoutLarge!.engineTotalOiOff}`);
  assert(layoutLarge!.engineMarkPriceOff === 928, `V12_1 markPrice should be 928, got ${layoutLarge!.engineMarkPriceOff}`);
  assert(layoutLarge!.engineEmergencyOiModeOff === 968, `V12_1 emergencyOiMode should be 968`);
  assert(layoutLarge!.paramsSize === 352, `V12_1 paramsSize should be 352, got ${layoutLarge!.paramsSize}`);
  assert(layoutLarge!.hasInsuranceIsolation === true, `V12_1 should have insurance isolation`);
  console.log("  ✓ V12_1 engine field offsets verified (reorganized from V_ADL/V_SETDEXPOOL)");

  console.log("✅ V12_1 slab layout tests passed!");
}
