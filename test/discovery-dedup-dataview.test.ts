/**
 * Perf-change guard for discoverMarkets (sdk#492):
 *  1. Decoded output over deterministic fixtures of every tier layout is byte-identical to the
 *     output the pre-change code produced (frozen sha256 captured on b1296be).
 *  2. Dedup keys on raw pubkey bytes: no base58 encoding on the happy path, duplicates still
 *     dropped, and the skip warnings still carry the base58 address.
 */
import { createHash } from "node:crypto";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { PublicKey, type Connection } from "@solana/web3.js";
import { discoverMarkets, SLAB_TIERS, SLAB_TIERS_V0, SLAB_TIERS_V1D } from "../src/solana/discovery.js";
import { SLAB_TIERS_V2, SLAB_TIERS_V12_1, SLAB_TIERS_V12_19, SLAB_TIERS_V_ADL } from "../src/solana/slab.js";

const MAGIC = [0x54, 0x41, 0x4c, 0x4f, 0x43, 0x52, 0x45, 0x50];
const SLICE = 1940;
const programId = new PublicKey(new Uint8Array(32).fill(7));

// Frozen from the pre-change implementation (b1296be) over buildFixtures() below.
// Re-frozen by J-20261123-SDK-FIX-V1DENGINEOFFSETS: SLAB_TIERS_V1D sizes now decode with the
// prog f7a2e8ab layout (engine at 456, not 424). A per-market diff against 2bf0fcd7 showed only
// the 72 V1D-sized fixtures (17064/65088/257184/1025568) changed; the other 328 are byte-identical.
// (was b5e7271587492a1925cd167e1551f41684b837b6de226b8d279fe145dfe26e8f)
// Re-frozen by J-20261123-SDK-FIX-V1DCONFIGTAIL: parseConfig reads the V1D 65088 B config tail
// 32 B later (prog f7a2e8ab funding_premium_* block). A per-market diff against 74e4d29e showed
// the same 72 V1D-sized fixtures changed, only in thresh_* / oracle-authority / oiCap / maxPnlCap;
// the other 328 are byte-identical. (was 7511d1af3b51767fd99ad0e3693de141691eabe2cf78f8a29518c6c73e8ebd0f)
const GOLDEN_SHA256 = "2c1d794d2511e8323c5ea8e34eb9caa10a3269550e8d267a270a049b5da3d4e2";
const GOLDEN_COUNT = 400;

function pk(i: number): PublicKey {
  const b = new Uint8Array(32);
  b[0] = i & 0xff; b[1] = (i >> 8) & 0xff; b[2] = 1;
  return new PublicKey(b);
}

function buildFixturesUncached() {
  let seed = 0x1234abcd;
  const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
  const tiers = [
    ...Object.values(SLAB_TIERS), ...Object.values(SLAB_TIERS_V0), ...Object.values(SLAB_TIERS_V1D),
    ...Object.values(SLAB_TIERS_V2), ...Object.values(SLAB_TIERS_V12_1), ...Object.values(SLAB_TIERS_V12_19),
    ...Object.values(SLAB_TIERS_V_ADL),
  ];
  const bySize = new Map<number, { dataSize: number }>();
  for (const t of tiers) bySize.set(t.dataSize, t);
  const sizes = [...bySize.values()];
  const byDataSize = new Map<number, Array<{ pubkey: PublicKey; account: any }>>();
  for (let i = 0; i < 400; i++) {
    const t = sizes[i % sizes.length];
    const data = new Uint8Array(SLICE);
    for (let j = 0; j < SLICE; j++) data[j] = rnd() & 0xff;
    data.set(MAGIC, 0);
    const arr = byDataSize.get(t.dataSize) ?? [];
    arr.push({ pubkey: pk(i), account: { data, owner: programId, lamports: 1, executable: false } });
    byDataSize.set(t.dataSize, arr);
  }
  return byDataSize;
}

// Fixtures are deterministic (fixed xorshift seed) and never mutated in place, so build them once
// per file and hand out shallow copies of the map (the dup test replaces an entry's array).
let fixtureCache: ReturnType<typeof buildFixturesUncached> | undefined;
function buildFixtures() {
  fixtureCache ??= buildFixturesUncached();
  return new Map(fixtureCache);
}

// Decoding 400 random slabs is CPU-bound and ~3-4x slower under --coverage or CPU contention
// (measured up to ~13 s under coverage + load vs ~1.3 s idle). Every test is capped at the 30 s
// per-test timeout below (the old "267% of 5 s" reading ignored it: 13.3 s was 44% of 30 s).
// The expensive work (fixture build + the single un-spied baseline decode) now runs once in
// beforeAll with its own explicit, larger hook timeout, so no test body races a timer on it.
const HEAVY_TIMEOUT_MS = 30_000;
// 4x the per-test cap: fixture build + one 400-slab decode, with room for coverage on a loaded box.
const SETUP_TIMEOUT_MS = 120_000;

let baselineMarkets: Awaited<ReturnType<typeof discoverMarkets>>;
beforeAll(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  baselineMarkets = await discoverMarkets(connFor(buildFixtures()), programId, { maxParallelTiers: 64 });
  vi.restoreAllMocks();
}, SETUP_TIMEOUT_MS);
function baseline() {
  return baselineMarkets;
}

function connFor(byDataSize: Map<number, Array<{ pubkey: PublicKey; account: any }>>) {
  return {
    getProgramAccounts: async (_p: PublicKey, opts: any) => byDataSize.get(opts?.filters?.[0]?.dataSize) ?? [],
    getMultipleAccountsInfo: async () => [],
  } as unknown as Connection;
}

const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? `${v}n` : v instanceof PublicKey ? v.toBase58() : v;

afterEach(() => vi.restoreAllMocks());

describe("discoverMarkets perf change (DataView reuse + byte dedup)", () => {
  it("decodes every tier fixture identically to the pre-change output", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const markets = baseline();
    const sorted = [...markets].sort((a, b) => a.slabAddress.toBase58().localeCompare(b.slabAddress.toBase58()));
    const sha = createHash("sha256").update(JSON.stringify(sorted, replacer)).digest("hex");
    console.log(`GOLDEN count=${markets.length} sha=${sha}`);
    expect(markets.length).toBe(GOLDEN_COUNT);
    expect(sha).toBe(GOLDEN_SHA256);
  }, HEAVY_TIMEOUT_MS);

  it("does not base58-encode pubkeys on the happy path", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const spy = vi.spyOn(PublicKey.prototype, "toBase58");
    const markets = await discoverMarkets(connFor(buildFixtures()), programId, { maxParallelTiers: 64 });
    expect(markets.length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
  }, HEAVY_TIMEOUT_MS);

  it("still drops a duplicate pubkey returned twice", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fx = buildFixtures();
    const [size, arr] = [...fx.entries()][0];
    fx.set(size, [...arr, { pubkey: arr[0].pubkey, account: arr[0].account }, { pubkey: new PublicKey(arr[0].pubkey.toBytes()), account: arr[0].account }]);
    const dup = await discoverMarkets(connFor(fx), programId, { maxParallelTiers: 64 });
    const base = baseline();
    expect(dup.length).toBe(base.length);
  }, HEAVY_TIMEOUT_MS);

  it("skip warning still names the account in base58", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = pk(999);
    const data = new Uint8Array(123);
    data.set(MAGIC, 0);
    const conn = {
      getProgramAccounts: async (_p: PublicKey, opts: any) =>
        opts?.filters?.[0]?.memcmp
          ? [{ pubkey: bad, account: { data, owner: programId, lamports: 1, executable: false } }]
          : [],
      getMultipleAccountsInfo: async () => [],
    } as unknown as Connection;
    await discoverMarkets(conn, programId);
    const msgs = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(msgs).toContain(bad.toBase58());
  });
});
