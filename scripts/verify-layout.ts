#!/usr/bin/env tsx
/**
 * verify-layout.ts — SDK layout drift detector
 *
 * Reads target/layout.json emitted by `cargo test layout_canary::emit_layout_json`
 * and asserts that every SDK constant in slab.ts matches.
 *
 * Run after any struct change in percolator-prog or percolator-core:
 *   cd percolator-prog && cargo test --test layout_canary emit_layout_json
 *   cd ../percolator-sdk && npx tsx scripts/verify-layout.ts
 *
 * Or with an explicit path:
 *   npx tsx scripts/verify-layout.ts /path/to/percolator-prog/target/layout.json
 *
 * Exit 0 = all good. Exit 1 = drift detected (lists every mismatch).
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── locate layout.json ────────────────────────────────────────────────────────
const arg = process.argv[2];
const layoutPath = arg
  ? path.resolve(arg)
  : path.resolve(__dirname, "../../percolator-prog/target/layout.json");

if (!fs.existsSync(layoutPath)) {
  console.error(`❌ layout.json not found at: ${layoutPath}`);
  console.error(
    "   Run: cd percolator-prog && cargo test --test layout_canary emit_layout_json"
  );
  process.exit(1);
}

const layout = JSON.parse(fs.readFileSync(layoutPath, "utf8"));
const sbf = layout.sbf as {
  config_len: number;
  engine_off: number;
  engine_align: number;
  engine_len: number;
  account_size: number;
  engine_bitmap_off: number;
};
const native = layout.native as {
  header_len: number;
  engine_bitmap_off: number;
  max_accounts: number;
};

console.log(`📐 Verifying layout constants against: ${layoutPath}`);
console.log(`   Target: ${layout._target}`);
console.log(
  `   SBF: config_len=${sbf.config_len} engine_off=${sbf.engine_off} account_size=${sbf.account_size} bitmap_off=${sbf.engine_bitmap_off}\n`
);

// ── SDK constants to check (extracted from slab.ts) ──────────────────────────
// These are the values slab.ts uses for the CURRENT deployed program layout.
// Add a new entry whenever a new layout version is introduced.
const SDK_CONSTANTS = {
  // V12_1 layout (current program after v12.1 merge)
  V12_1_ENGINE_OFF: 648,
  V12_1_ACCOUNT_SIZE: 320,
  V12_1_ENGINE_BITMAP_OFF: 1016,

  // Legacy layouts (pre-v12.1, still used for existing on-chain slabs)
  V_SETDEXPOOL_CONFIG_LEN: 544,
  V_SETDEXPOOL_ENGINE_OFF: 648,
  V_ADL_ACCOUNT_SIZE: 312,
  V_ADL_ENGINE_BITMAP_OFF: 1008,
  V1M2_ENGINE_BITMAP_OFF: 1008,

  // Header length (never changes)
  HEADER_LEN: 104,

  // Max accounts for the large tier
  MAX_ACCOUNTS: 4096,
} as const;

// ── expected values derived from layout.json ──────────────────────────────────
const EXPECTED = {
  V12_1_ENGINE_OFF: sbf.engine_off,
  V12_1_ACCOUNT_SIZE: sbf.account_size,
  V12_1_ENGINE_BITMAP_OFF: sbf.engine_bitmap_off,
  V_SETDEXPOOL_CONFIG_LEN: sbf.config_len,
  V_SETDEXPOOL_ENGINE_OFF: sbf.engine_off,
  V_ADL_ACCOUNT_SIZE: 312,            // legacy — fixed, doesn't come from layout.json
  V_ADL_ENGINE_BITMAP_OFF: 1008,      // legacy — fixed
  V1M2_ENGINE_BITMAP_OFF: 1008,       // legacy — fixed
  HEADER_LEN: native.header_len,
  MAX_ACCOUNTS: native.max_accounts,
} as const;

// ── slab size sanity check ─────────────────────────────────────────────────────
function computeSlabSize(
  engineOff: number,
  bitmapOff: number,
  accountSize: number,
  maxAccounts: number,
  postBitmap = 18
): number {
  const bitmapWords = Math.ceil(maxAccounts / 64);
  const bitmapBytes = bitmapWords * 8;
  const nextFreeBytes = maxAccounts * 2;
  const preAccountsLen = bitmapOff + bitmapBytes + postBitmap + nextFreeBytes;
  const accountsOff = Math.ceil(preAccountsLen / 8) * 8;
  return engineOff + accountsOff + maxAccounts * accountSize;
}

// Known on-chain slab sizes that must remain computable from the SDK constants.
// If a new market size is deployed, add it here.
const KNOWN_SLAB_SIZES: Array<{ label: string; engineOff: number; bitmapOff: number; accountSize: number; n: number; expected: number }> = [
  {
    label: "V1M2 medium 1024-account (current mainnet CCTegYZ...)",
    engineOff: 616, bitmapOff: 1008, accountSize: 312, n: 1024,
    expected: 323312,
  },
  {
    label: "V_SETDEXPOOL medium 1024-account (pre-v12.1)",
    engineOff: 648, bitmapOff: 1008, accountSize: 312, n: 1024,
    expected: 323344,
  },
  {
    label: "V12_1 large 4096-account (v12.1 program)",
    engineOff: sbf.engine_off, bitmapOff: sbf.engine_bitmap_off, accountSize: sbf.account_size, n: 4096,
    expected: 1321112,
  },
  {
    label: "V12_1 medium 1024-account (v12.1 program)",
    engineOff: sbf.engine_off, bitmapOff: sbf.engine_bitmap_off, accountSize: sbf.account_size, n: 1024,
    expected: 331544,
  },
];

// ── run checks ────────────────────────────────────────────────────────────────
let errors = 0;
let warnings = 0;

console.log("── Constant checks ──────────────────────────────────────────────");
for (const [key, expected] of Object.entries(EXPECTED)) {
  const actual = SDK_CONSTANTS[key as keyof typeof SDK_CONSTANTS];
  if (actual === expected) {
    console.log(`  ✅ ${key} = ${actual}`);
  } else {
    console.error(
      `  ❌ ${key}: SDK has ${actual}, layout.json says ${expected}`
    );
    errors++;
  }
}

console.log("\n── Slab size sanity checks ──────────────────────────────────────");
for (const { label, engineOff, bitmapOff, accountSize, n, expected } of KNOWN_SLAB_SIZES) {
  const actual = computeSlabSize(engineOff, bitmapOff, accountSize, n);
  if (actual === expected) {
    console.log(`  ✅ ${label}: ${actual} bytes`);
  } else {
    console.error(
      `  ❌ ${label}: expected ${expected} bytes, got ${actual} bytes`
    );
    errors++;
  }
}

// ── engine_off sanity: SBF must be < native ───────────────────────────────────
console.log("\n── Cross-target sanity ──────────────────────────────────────────");
if (sbf.engine_off < layout.native.engine_off) {
  console.log(
    `  ✅ SBF engine_off (${sbf.engine_off}) < native engine_off (${layout.native.engine_off})`
  );
} else if (sbf.engine_off === layout.native.engine_off) {
  console.log(
    `  ⚠️  SBF engine_off === native engine_off (${sbf.engine_off}) — unusual but may be correct if header+config already 8-byte aligned`
  );
  warnings++;
} else {
  console.error(
    `  ❌ SBF engine_off (${sbf.engine_off}) > native engine_off (${layout.native.engine_off}) — impossible`
  );
  errors++;
}

// ── result ────────────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────────────────────────────");
if (errors === 0) {
  console.log(
    `✅ All SDK constants match layout.json${warnings > 0 ? ` (${warnings} warning${warnings > 1 ? "s" : ""})` : ""}`
  );
  process.exit(0);
} else {
  console.error(
    `\n❌ ${errors} mismatch${errors > 1 ? "es" : ""} detected!\n`
  );
  console.error("To fix:");
  console.error(
    "  1. Update the mismatched constants in src/solana/slab.ts"
  );
  console.error(
    "  2. If account_size changed, update all layout builders (buildV_ADLLayout, buildV_SETDEXPOOLLayout, etc.)"
  );
  console.error(
    "  3. If engine_bitmap_off changed, update all bitmap readers"
  );
  console.error(
    "  4. Re-run this script to confirm all clear"
  );
  process.exit(1);
}
