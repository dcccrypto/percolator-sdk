#!/usr/bin/env tsx
/**
 * scan-engine-offsets.ts — Empirical SBF engine field offset probe
 *
 * Fetches the raw account data for a V1M2 slab on Solana mainnet and scans
 * the engine region to find where known values land in the binary layout.
 *
 * The slab is engineOff=616, engine struct layout identical to V_ADL.
 * On SBF, u128 aligns to 8 bytes (not 16), so struct field offsets differ
 * from a native aarch64 build.
 *
 * Usage:
 *   cd /Users/khubair/percolator-sdk && npx tsx scripts/scan-engine-offsets.ts
 *
 * @param RPC_URL  Override via process.env.RPC_URL (falls back to mainnet public)
 */

import "dotenv/config";
import { Connection, PublicKey } from "@solana/web3.js";

// ── Constants ─────────────────────────────────────────────────────────────────

// NOTE: The originally-provided pubkey FkNmxZRYRCFoGquerJfnDsUBMFBJgb3cLNjRMhCCsRKj does not exist
// on mainnet (value:null from getAccountInfo). The actual slab account under program
// ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv is FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC
// (290120 bytes). Corrected pubkey used here.
//
// EMPIRICALLY VERIFIED LAYOUT (290120 bytes, V12_1 SBF):
//   engineOff  = 648   (align_up(HEADER=104 + CONFIG=544, 8) = 648)
//   bitmapOff  = 552   (relative to engineOff; verified: bitmap[0]=1 at abs 1200)
//   accountSize= 280   (V12_1_ACCOUNT_SIZE_SBF — u128 aligns to 8 on SBF, not 16)
//   n          = 1024
//   postBitmap = 18    (num_used + pad + next_account_id + free_head)
//   accountsOff= 2752  (align_up(552+128+18+2048, 8) = align_up(2746, 8) = 2752)
//   total      = 648 + 2752 + 286720 = 290120 ✓
const SLAB_PUBKEY = process.env["SLAB_PUBKEY"] ?? "FkNmxZJUmr2bF7kwsBDtKoHeajrNdSEQokgGmmzn69vC";
const ENGINE_OFF = parseInt(process.env["ENGINE_OFF"] ?? "648"); // V12_1 SBF verified

// V12_1 SBF engine field offsets (relative to engineOff=648), EMPIRICALLY VERIFIED.
//
// KEY FINDING: The engine region begins directly with RiskParams on this slab — no
// vault or InsuranceFund prefix visible at the expected HOST offsets. The SBF struct is
// 400 bytes shorter than HOST (bitmapOff=552 SBF vs 1016 HOST). This is because:
//   1. InsuranceFund shrinks: HOST=80 → SBF=16 (-64 bytes)
//   2. Additional field reordering/removal in V12_1 upstream rebase (ADL side state absent
//      or heavily compacted on SBF due to u128 alignment savings across many fields)
//
// EMPIRICALLY CONFIRMED OFFSETS (from on-chain byte scan of FkNmxZJUmr2bF...):
//   EO+  0 (abs  648): RiskParams begins (first field = 150, likely max_leverage_bps)
//   EO+184 (abs  832): slot field INSIDE RiskParams (last_oracle_update_slot or equiv)
//   EO+200 (abs  848): slot field INSIDE RiskParams (authority_price_last_slot)
//   EO+216 (abs  864): u64=249000000 (admin initial deposit / some price config)
//   EO+520 (abs 1168): u64=1 (lifetime counter or bool flag — just before price fields)
//   EO+528 (abs 1176): authority_price_e6 = SOL price (~100.75 USD × 1e6)  *** KEY ***
//   EO+536 (abs 1184): lastCrankSlot (or currentSlot) = recent mainnet slot  *** KEY ***
//   EO+544 (abs 1192): mark_ewma_e6 = SOL price (~100.75 USD × 1e6)  *** KEY ***
//   EO+552 (abs 1200): bitmap[0] = 1 (one account slot occupied)  — bitmapOff confirmed
//
// All offsets EO+384..519 are ZERO (fresh market: no positions, no funding, no OI).
//
// SOL price at time of scan: ~100.75 USD (NOT 82 USD as expected — price moved since estimate).
const NAMED_FIELDS: Array<{ name: string; off: number; size: 8 | 16 }> = [
  // RiskParams starts at EO+0 on SBF (vault and InsuranceFund are absent or folded in)
  { name: "riskparams[0] (max_leverage_bps?)",      off: 0,   size: 8 },
  { name: "riskparams[8] (maint_margin_bps?)",      off: 8,   size: 8 },
  { name: "riskparams[16] (liq_fee_bps?)",          off: 16,  size: 8 },
  { name: "riskparams[24] (small_bps_field)",       off: 24,  size: 8 },
  { name: "riskparams[32] (max_accounts=1024)",     off: 32,  size: 8 },
  { name: "riskparams[40] (scale_1e6)",             off: 40,  size: 8 },
  { name: "riskparams[72] (bps=300)",               off: 72,  size: 8 },
  { name: "riskparams[80] (bps=50)",                off: 80,  size: 8 },
  { name: "riskparams[88] (price_bound_1e8)",       off: 88,  size: 8 },
  { name: "riskparams[104] (bps=100)",              off: 104, size: 8 },
  { name: "riskparams[120] (1e7_field)",            off: 120, size: 8 },
  { name: "riskparams[136] (1e5_field)",            off: 136, size: 8 },
  { name: "riskparams[152] (5e5_field)",            off: 152, size: 8 },
  { name: "riskparams[184] SLOT (oracle_slot?)",    off: 184, size: 8 },
  { name: "riskparams[200] SLOT (authority_slot?)", off: 200, size: 8 },
  { name: "riskparams[208] (bps=300 / deposit?)",   off: 208, size: 8 },
  { name: "riskparams[216] (249000000 deposit_e6)", off: 216, size: 8 },
  { name: "riskparams[304] (1e6 price config)",     off: 304, size: 8 },
  { name: "riskparams[320] (1e6 price config)",     off: 320, size: 8 },
  // Runtime state (all zero for fresh market except final fields)
  { name: "[runtime] current_slot (ZERO=uninit)",   off: 384, size: 8 },
  { name: "[runtime] funding_rate_bps (ZERO)",      off: 392, size: 8 },
  { name: "[runtime] last_crank_slot (ZERO)",       off: 400, size: 8 },
  { name: "[runtime] c_tot lo (ZERO)",              off: 416, size: 8 },
  { name: "[runtime] pnl_pos_tot lo (ZERO)",        off: 432, size: 8 },
  { name: "[runtime] pnl_matured lo (ZERO)",        off: 448, size: 8 },
  { name: "[runtime] liq_cursor (ZERO)",            off: 464, size: 8 },
  { name: "[runtime] total_oi lo (ZERO)",           off: 496, size: 8 },
  { name: "[runtime] net_lp_pos lo (ZERO)",         off: 512, size: 8 },
  // Last 3 populated fields before bitmap:
  { name: "*** u64=1 (lifetime_ctr or bool flag)", off: 520, size: 8 },
  { name: "*** authority_price_e6 (SOL price×1e6)",off: 528, size: 8 },
  { name: "*** lastCrankSlot / currentSlot",        off: 536, size: 8 },
  { name: "*** mark_ewma_e6 (SOL price×1e6)",       off: 544, size: 8 },
  // Bitmap starts at EO+552
  { name: "bitmap[0] (should be 1 = 1 acct used)", off: 552, size: 8 },
  { name: "bitmap[1] (should be 0)",               off: 560, size: 8 },
];

// ── Read helpers ──────────────────────────────────────────────────────────────

function dv(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}
function readU64LE(data: Uint8Array, off: number): bigint {
  return dv(data).getBigUint64(off, true);
}
function readI64LE(data: Uint8Array, off: number): bigint {
  return dv(data).getBigInt64(off, true);
}
function readU128LE(data: Uint8Array, off: number): bigint {
  const lo = readU64LE(data, off);
  const hi = readU64LE(data, off + 8);
  return (hi << 64n) | lo;
}
function readI128LE(data: Uint8Array, off: number): bigint {
  const lo = readU64LE(data, off);
  const hi = readU64LE(data, off + 8);
  const unsigned = (hi << 64n) | lo;
  return unsigned >= (1n << 127n) ? unsigned - (1n << 128n) : unsigned;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function hexByte(b: number): string {
  return b.toString(16).padStart(2, "0");
}

function hexDump(data: Uint8Array, relStart: number, len: number): void {
  const end = Math.min(relStart + len, data.length);
  for (let row = relStart; row < end; row += 16) {
    const rowEnd = Math.min(row + 16, end);
    const hexParts: string[] = [];
    const decParts: string[] = [];

    for (let i = row; i < rowEnd; i++) {
      hexParts.push(hexByte(data[i]));
    }
    // u64 LE interpretations of each 8-byte group in row
    for (let i = row; i < rowEnd; i += 8) {
      if (i + 8 <= rowEnd) {
        const val = readU64LE(data, i);
        decParts.push(`[+${i - relStart}]u64=${val}`);
      }
    }

    const addr = `+${String(row - relStart).padStart(4, " ")} (abs ${String(ENGINE_OFF + row).padStart(6, " ")})`;
    const hex = hexParts.join(" ").padEnd(47, " ");
    console.log(`  ${addr}  ${hex}  | ${decParts.join("  ")}`);
  }
}

// ── Known-value scanner ───────────────────────────────────────────────────────

/** Search for a u32 LE value anywhere in the engine region. */
function scanForU32(engine: Uint8Array, needle: number, label: string): void {
  const hits: number[] = [];
  for (let i = 0; i <= engine.length - 4; i++) {
    const v = dv(engine).getUint32(i, true);
    if (v === needle) hits.push(i);
  }
  if (hits.length === 0) {
    console.log(`  ${label} (0x${needle.toString(16).toUpperCase()}) — NOT FOUND`);
  } else {
    for (const off of hits) {
      const aligned8 = off % 8 === 0 ? "  [8-byte aligned]" : "";
      console.log(`  ${label} (0x${needle.toString(16).toUpperCase()}) found at engine+${off} (abs ${ENGINE_OFF + off})${aligned8}`);
    }
  }
}

/** Search for any u64 LE value in a slot range [minVal, maxVal]. */
function scanForU64Range(engine: Uint8Array, minVal: bigint, maxVal: bigint, label: string): void {
  const hits: Array<{ off: number; val: bigint }> = [];
  for (let i = 0; i <= engine.length - 8; i += 8) {
    const v = readU64LE(engine, i);
    if (v >= minVal && v <= maxVal) hits.push({ off: i, val: v });
  }
  if (hits.length === 0) {
    console.log(`  ${label} [${minVal}..${maxVal}] — NOT FOUND at any 8-byte aligned offset`);
  } else {
    for (const { off, val } of hits) {
      console.log(`  ${label} found at engine+${off} (abs ${ENGINE_OFF + off}): ${val} (0x${val.toString(16).toUpperCase()})`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const rpc = process.env["RPC_URL"] ?? "https://api.mainnet-beta.solana.com";
  console.log(`RPC: ${rpc}`);
  console.log(`Account: ${SLAB_PUBKEY}`);
  console.log(`Engine region starts at byte: ${ENGINE_OFF}\n`);

  const connection = new Connection(rpc, "confirmed");
  const pubkey = new PublicKey(SLAB_PUBKEY);

  const info = await connection.getAccountInfo(pubkey, { commitment: "confirmed" });
  if (!info) {
    throw new Error(`Account ${SLAB_PUBKEY} not found on mainnet`);
  }

  const raw = info.data instanceof Uint8Array ? info.data : new Uint8Array(info.data);
  console.log(`Account data length: ${raw.length} bytes`);

  if (raw.length < ENGINE_OFF) {
    throw new Error(`Account too small (${raw.length}) to contain engine at offset ${ENGINE_OFF}`);
  }

  const engine = raw.subarray(ENGINE_OFF);
  console.log(`Engine region length: ${engine.length} bytes\n`);

  // ── Section 1: Hex dump of engine bytes 0-600 ──────────────────────────────
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  HEX DUMP: engine bytes 0-600");
  console.log("  Format: +rel (abs absolute)  hex bytes  | [+rel]u64=decimal ...");
  console.log("═══════════════════════════════════════════════════════════════");
  hexDump(engine, 0, 600);

  // ── Section 2: Named field dump ───────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  NAMED FIELDS (V_ADL engine layout, V1M2 slab)");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(
    `  ${"Field".padEnd(45)} ${"Off".padStart(5)} ${"Abs".padStart(7)}  ${"u64/u128 value"}`
  );
  console.log("  " + "─".repeat(90));

  for (const { name, off, size } of NAMED_FIELDS) {
    if (off + size > engine.length) continue;
    let valStr: string;
    if (size === 16) {
      const u128 = readU128LE(engine, off);
      const i128 = readI128LE(engine, off);
      valStr = `u128=${u128}  i128=${i128}`;
    } else {
      const u64 = readU64LE(engine, off);
      const i64 = readI64LE(engine, off);
      valStr = `u64=${u64}  i64=${i64}`;
    }
    const allZero = [...Array(size)].every((_, k) => engine[off + k] === 0);
    const zeroTag = allZero ? "  [ZERO]" : "";
    console.log(
      `  ${name.padEnd(45)} ${String(off).padStart(5)} ${String(ENGINE_OFF + off).padStart(7)}  ${valStr}${zeroTag}`
    );
  }

  // ── Section 3: Focused region dumps ─────────────────────────────────────
  const regions: Array<{ label: string; start: number; end: number }> = [
    { label: "funding index / lastFundingSlot area",  start: 200, end: 220 },
    { label: "lifetimeLiquidations through LP fields", start: 320, end: 400 },
    { label: "authority_price / mark_ewma / emergency", start: 400, end: 500 },
  ];
  for (const { label, start, end } of regions) {
    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`  FOCUSED REGION: engine+${start}..${end} — ${label}`);
    console.log(`═══════════════════════════════════════════════════════════════`);
    hexDump(engine, start, end - start);
    // u64 table
    for (let off = start; off < end; off += 8) {
      if (off + 8 > engine.length) break;
      const u64 = readU64LE(engine, off);
      const i64 = readI64LE(engine, off);
      const u128 = off + 16 <= engine.length ? readU128LE(engine, off) : null;
      const allZero = u64 === 0n;
      const note = allZero ? " [ZERO]" : "";
      const u128str = u128 !== null && !allZero ? `  u128(this+next)=${u128}` : "";
      console.log(`    engine+${String(off).padStart(4)} (abs ${ENGINE_OFF + off}): u64=${u64}  i64=${i64}${u128str}${note}`);
    }
  }

  // ── Section 4: All 8-byte aligned fields (full engine, u64 + i128 view) ──
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  ALL 8-BYTE ALIGNED OFFSETS (engine+0 to engine+1016)`);
  console.log(`  Showing non-zero values only, plus u64 and i128 (paired with next)`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  const scanLen = Math.min(1016, engine.length);
  for (let off = 0; off < scanLen; off += 8) {
    const u64 = readU64LE(engine, off);
    if (u64 === 0n) continue; // skip zero rows
    const i64 = readI64LE(engine, off);
    const i128 = off + 16 <= engine.length ? readI128LE(engine, off) : null;
    const i128str = i128 !== null ? `  i128=${i128}` : "";
    console.log(`    engine+${String(off).padStart(4)} (abs ${ENGINE_OFF + off}): u64=${u64} (0x${u64.toString(16).toUpperCase()})  i64=${i64}${i128str}`);
  }

  // ── Section 5: Known-value search ─────────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  KNOWN-VALUE SEARCH`);
  console.log(`═══════════════════════════════════════════════════════════════`);

  // SOL price — actual scan-time price is ~100.75 USD, search wide range 70M..120M
  const SOL_PRICE_MIN = 70_000_000;
  const SOL_PRICE_MAX = 120_000_000;
  console.log(`\n  -- SOL price range [${SOL_PRICE_MIN}..${SOL_PRICE_MAX}] as u64 (8-byte aligned) --`);
  scanForU64Range(
    engine,
    BigInt(SOL_PRICE_MIN),
    BigInt(SOL_PRICE_MAX),
    "authority_price_e6 / mark_ewma_e6"
  );

  // Recent mainnet slots: ~410-413M range
  console.log("\n  -- Recent slot numbers [400_000_000..420_000_000] as u64 (8-byte aligned) --");
  scanForU64Range(engine, 400_000_000n, 420_000_000n, "slot fields");

  // Also scan full 4-byte alignment for slot numbers
  console.log("\n  -- Slot range scan (every 4 bytes, u64 overlapping) --");
  const slotMin = 400_000_000n;
  const slotMax = 420_000_000n;
  for (let i = 0; i <= Math.min(600, engine.length) - 8; i += 4) {
    const v = readU64LE(engine, i);
    if (v >= slotMin && v <= slotMax) {
      const aligned8 = i % 8 === 0 ? " [8-byte aligned]" : " [4-byte only]";
      console.log(`    slot-range value ${v} at engine+${i} (abs ${ENGINE_OFF + i})${aligned8}`);
    }
  }

  // ── Section 6: Summary of zero vs non-zero 8-byte words ───────────────────
  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  SUMMARY: zero/non-zero map of engine (8-byte words, first 1016 bytes)`);
  console.log(`  Legend: . = zero, X = non-zero (each char = 8 bytes)`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  const mapLen = Math.min(1016, engine.length);
  const words = mapLen / 8;
  let line = "  ";
  for (let i = 0; i < words; i++) {
    const u64 = readU64LE(engine, i * 8);
    line += u64 === 0n ? "." : "X";
    if ((i + 1) % 64 === 0) {
      console.log(`${line}  (words ${i - 63}..${i}, bytes ${(i - 63) * 8}..${(i + 1) * 8 - 1})`);
      line = "  ";
    }
  }
  if (line.trim().length > 0) {
    const startWord = words - (words % 64);
    console.log(`${line}  (words ${startWord}..${words - 1}, bytes ${startWord * 8}..${mapLen - 1})`);
  }

  console.log("\nDone.");
}

main().catch((err: unknown) => {
  console.error("Fatal:", err);
  process.exit(1);
});
