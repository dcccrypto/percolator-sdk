/**
 * Coverage for the money paths of src/solana/adl.ts that adl.test.ts only
 * re-derives inline: rankAdlPositions ordering/pnlPct, isAdlTriggered,
 * fetchAdlRankedPositions/buildAdlTransaction, the parseAdlEvent program-id
 * filter, and the fetchAdlRankings response validation.
 *
 * Slab parsing is mocked (the slab decoders have their own suites); every
 * expected number below is computed by hand from the mocked inputs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";

const m = vi.hoisted(() => ({
  detectSlabLayout: vi.fn(),
  parseEngine: vi.fn(),
  parseConfig: vi.fn(),
  parseAllAccounts: vi.fn(),
  fetchSlab: vi.fn(),
}));

vi.mock("../src/solana/slab.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../src/solana/slab.js")>();
  return { ...orig, ...m };
});

import {
  rankAdlPositions,
  isAdlTriggered,
  fetchAdlRankedPositions,
  buildAdlTransaction,
  parseAdlEvent,
  fetchAdlRankings,
} from "../src/solana/adl.js";
import { AccountKind } from "../src/solana/slab.js";

const OI_LAYOUT = { engineLongOiOff: 1, engineShortOiOff: 2 };
const NO_OI_LAYOUT = { engineLongOiOff: -1, engineShortOiOff: -1 };

const user = (idx: number, positionSize: bigint, pnl: bigint, capital: bigint) => ({
  idx,
  account: { kind: AccountKind.User, owner: Keypair.generate().publicKey, positionSize, pnl, capital },
});

function setup(opts: {
  layout?: unknown;
  pnlPosTot?: bigint;
  longOi?: bigint;
  shortOi?: bigint;
  maxPnlCap?: bigint;
  accounts?: ReturnType<typeof user>[];
}) {
  m.detectSlabLayout.mockReturnValue(opts.layout === undefined ? OI_LAYOUT : opts.layout);
  m.parseEngine.mockReturnValue({
    pnlPosTot: opts.pnlPosTot ?? 0n,
    longOi: opts.longOi ?? 0n,
    shortOi: opts.shortOi ?? 0n,
  });
  m.parseConfig.mockReturnValue({ maxPnlCap: opts.maxPnlCap ?? 0n });
  m.parseAllAccounts.mockReturnValue(opts.accounts ?? []);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("rankAdlPositions (mocked slab)", () => {
  it("computes pnlPct = pnl*10000/capital (truncating) and ranks longs/shorts separately", () => {
    setup({
      accounts: [
        user(1, 100n, 100_000n, 1_000_000n), // +1000 bps
        user(2, 50n, 250_000n, 1_000_000n), // +2500 bps
        user(3, 10n, -50_000n, 1_000_000n), // -500 bps
        user(4, -70n, 1n, 3n), // 10000/3 = 3333 bps (truncated)
        user(5, -80n, -1n, 3n), // -10000/3 -> BigInt truncates toward zero = -3333
        user(6, 5n, 999n, 0n), // zero capital -> 0 bps
      ],
    });
    const r = rankAdlPositions(new Uint8Array(8));
    expect(r.longs.map((p) => [p.idx, p.pnlPct, p.adlRank])).toEqual([
      [2, 2500n, 0],
      [1, 1000n, 1],
      [6, 0n, 2],
      [3, -500n, 3],
    ]);
    expect(r.shorts.map((p) => [p.idx, p.pnlPct, p.adlRank])).toEqual([
      [4, 3333n, 0],
      [5, -3333n, 1],
    ]);
    expect(r.ranked.map((p) => p.idx)).toEqual([4, 2, 1, 6, 3, 5]);
    expect(r.longs.every((p) => p.side === "long")).toBe(true);
    expect(r.shorts.every((p) => p.side === "short")).toBe(true);
  });

  it("keeps insertion order for equal pnlPct (stable sort, comparator returns 0)", () => {
    setup({ accounts: [user(7, 1n, 10n, 100n), user(3, 1n, 10n, 100n), user(9, 1n, 10n, 100n)] });
    const r = rankAdlPositions(new Uint8Array(8));
    expect(r.longs.map((p) => p.idx)).toEqual([7, 3, 9]);
    expect(r.longs.map((p) => p.adlRank)).toEqual([0, 1, 2]);
  });

  it("skips LP accounts and flat user accounts", () => {
    const lp = user(1, 100n, 1n, 1n);
    (lp.account as { kind: AccountKind }).kind = AccountKind.LP;
    setup({ accounts: [lp, user(2, 0n, 5n, 5n), user(3, 1n, 1n, 1n)] });
    const r = rankAdlPositions(new Uint8Array(8));
    expect(r.ranked.map((p) => p.idx)).toEqual([3]);
  });

  it("isTriggered only when maxPnlCap > 0 and pnlPosTot strictly exceeds it", () => {
    setup({ pnlPosTot: 101n, maxPnlCap: 100n });
    expect(rankAdlPositions(new Uint8Array(8))).toMatchObject({ isTriggered: true, pnlPosTot: 101n, maxPnlCap: 100n });
    setup({ pnlPosTot: 100n, maxPnlCap: 100n });
    expect(rankAdlPositions(new Uint8Array(8)).isTriggered).toBe(false);
    setup({ pnlPosTot: 100n, maxPnlCap: 0n });
    expect(rankAdlPositions(new Uint8Array(8)).isTriggered).toBe(false);
  });

  it("leaves isTriggered false and maxPnlCap 0 when config parse throws", () => {
    setup({ pnlPosTot: 500n, maxPnlCap: 1n, accounts: [user(1, 1n, 1n, 1n)] });
    m.parseConfig.mockImplementation(() => {
      throw new Error("bad config");
    });
    const r = rankAdlPositions(new Uint8Array(8));
    expect(r.isTriggered).toBe(false);
    expect(r.maxPnlCap).toBe(0n);
    expect(r.pnlPosTot).toBe(500n);
    expect(r.ranked).toHaveLength(1);
  });

  it("warns and returns dominantSide null when parseEngine throws (Error and non-Error)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setup({});
    m.parseEngine.mockImplementation(() => {
      throw new Error("invalid slab magic");
    });
    expect(rankAdlPositions(new Uint8Array(8)).dominantSide).toBeNull();
    expect(warn).toHaveBeenLastCalledWith("[rankAdlPositions] parseEngine failed:", "invalid slab magic");
    m.parseEngine.mockImplementation(() => {
      throw "boom";
    });
    rankAdlPositions(new Uint8Array(8));
    expect(warn).toHaveBeenLastCalledWith("[rankAdlPositions] parseEngine failed:", "boom");
    warn.mockRestore();
  });

  it("with no recognised layout: dominantSide null, trigger fields zero", () => {
    setup({ layout: null, pnlPosTot: 9n, longOi: 5n, shortOi: 1n });
    const r = rankAdlPositions(new Uint8Array(8));
    expect(r).toMatchObject({ dominantSide: null, isTriggered: false, maxPnlCap: 0n, pnlPosTot: 9n });
    expect(m.parseConfig).not.toHaveBeenCalled();
  });

  it("dominantSide null for layouts without OI offsets, even if engine reports OI", () => {
    setup({ layout: NO_OI_LAYOUT, longOi: 1n, shortOi: 9n });
    expect(rankAdlPositions(new Uint8Array(8)).dominantSide).toBeNull();
  });

  it("dominantSide follows OI: short only when strictly greater", () => {
    setup({ longOi: 1n, shortOi: 2n });
    expect(rankAdlPositions(new Uint8Array(8)).dominantSide).toBe("short");
    setup({ longOi: 2n, shortOi: 2n });
    expect(rankAdlPositions(new Uint8Array(8)).dominantSide).toBe("long");
  });
});

describe("isAdlTriggered (mocked slab)", () => {
  it("false when layout unrecognised", () => {
    setup({ layout: null, pnlPosTot: 10n, maxPnlCap: 1n });
    expect(isAdlTriggered(new Uint8Array(8))).toBe(false);
  });
  it("false when pnlPosTot is zero (config never read)", () => {
    setup({ pnlPosTot: 0n, maxPnlCap: 1n });
    expect(isAdlTriggered(new Uint8Array(8))).toBe(false);
    expect(m.parseConfig).not.toHaveBeenCalled();
  });
  it("false when maxPnlCap is zero (unconfigured)", () => {
    setup({ pnlPosTot: 10n, maxPnlCap: 0n });
    expect(isAdlTriggered(new Uint8Array(8))).toBe(false);
  });
  it("true only when pnlPosTot > maxPnlCap", () => {
    setup({ pnlPosTot: 11n, maxPnlCap: 10n });
    expect(isAdlTriggered(new Uint8Array(8))).toBe(true);
    setup({ pnlPosTot: 10n, maxPnlCap: 10n });
    expect(isAdlTriggered(new Uint8Array(8))).toBe(false);
  });
  it("false when parsing throws", () => {
    setup({ pnlPosTot: 10n, maxPnlCap: 1n });
    m.parseEngine.mockImplementation(() => {
      throw new Error("x");
    });
    expect(isAdlTriggered(new Uint8Array(8))).toBe(false);
  });
});

describe("fetchAdlRankedPositions / buildAdlTransaction", () => {
  const K = () => Keypair.generate().publicKey;
  const conn = {} as never;

  it("fetchAdlRankedPositions ranks the fetched slab bytes", async () => {
    const bytes = new Uint8Array(8);
    m.fetchSlab.mockResolvedValue(bytes);
    setup({ accounts: [user(4, 1n, 10n, 100n)] });
    const slab = K();
    const r = await fetchAdlRankedPositions(conn, slab);
    expect(m.fetchSlab).toHaveBeenCalledWith(conn, slab);
    expect(r.ranked.map((p) => p.idx)).toEqual([4]);
  });

  it("buildAdlTransaction returns null when ADL is not triggered", async () => {
    m.fetchSlab.mockResolvedValue(new Uint8Array(8));
    setup({ pnlPosTot: 1n, maxPnlCap: 10n, accounts: [user(1, 1n, 1n, 1n)] });
    expect(await buildAdlTransaction(conn, K(), K(), K(), K())).toBeNull();
  });

  it("buildAdlTransaction returns null when triggered but the chosen side is empty", async () => {
    m.fetchSlab.mockResolvedValue(new Uint8Array(8));
    setup({ pnlPosTot: 11n, maxPnlCap: 10n, longOi: 5n, shortOi: 1n, accounts: [user(1, -1n, 1n, 1n)] });
    // dominant side is long but only a short exists
    expect(await buildAdlTransaction(conn, K(), K(), K(), K())).toBeNull();
  });

  it("buildAdlTransaction reaches the v17 unsupported throw for the selected target", async () => {
    m.fetchSlab.mockResolvedValue(new Uint8Array(8));
    setup({ pnlPosTot: 11n, maxPnlCap: 10n, accounts: [user(1, 1n, 1n, 1n)] });
    await expect(buildAdlTransaction(conn, K(), K(), K(), K(), "long")).rejects.toThrow(
      "not supported by the v17 SDK",
    );
  });
});

describe("parseAdlEvent program-id filtering", () => {
  const PID = "Perc1111111111111111111111111111111111111111";
  const OTHER = "Other111111111111111111111111111111111111111";
  const EVENT = "Program log: 2904424449 7 1500000 100 2";

  it("accepts an event logged at depth 0 of the percolator invocation", () => {
    const logs = [`Program ${PID} invoke [1]`, EVENT, `Program ${PID} success`];
    expect(parseAdlEvent(logs, PID)).toEqual({
      tag: 0xad1e0001n,
      targetIdx: 7,
      price: 1_500_000n,
      closedAbs: (2n << 64n) | 100n,
    });
  });

  it("ignores events outside any percolator invocation", () => {
    expect(parseAdlEvent([EVENT], PID)).toBeNull();
    expect(parseAdlEvent([`Program ${PID} invoke [1]`, `Program ${PID} success`, EVENT], PID)).toBeNull();
    expect(parseAdlEvent([`Program ${PID} invoke [1]`, `Program ${PID} failed: custom`, EVENT], PID)).toBeNull();
  });

  it("ignores events emitted by a CPI callee, accepts one after the callee returns", () => {
    const spoof = [
      `Program ${PID} invoke [1]`,
      `Program ${OTHER} invoke [2]`,
      EVENT,
      `Program ${OTHER} success`,
      `Program ${PID} success`,
    ];
    expect(parseAdlEvent(spoof, PID)).toBeNull();
    const after = [
      `Program ${PID} invoke [1]`,
      `Program ${OTHER} invoke [2]`,
      `Program ${OTHER} success`,
      EVENT,
      `Program ${PID} success`,
    ];
    expect(parseAdlEvent(after, PID)?.targetIdx).toBe(7);
  });

  it("a failed callee also pops the CPI depth", () => {
    const logs = [
      `Program ${PID} invoke [1]`,
      `Program ${OTHER} invoke [2]`,
      `Program ${OTHER} failed`,
      EVENT,
    ];
    expect(parseAdlEvent(logs, PID)?.price).toBe(1_500_000n);
  });

  it("an unmatched callee exit at depth 0 cannot push depth negative", () => {
    const logs = [`Program ${PID} invoke [1]`, `Program ${OTHER} success`, EVENT];
    expect(parseAdlEvent(logs, PID)?.targetIdx).toBe(7);
  });

  it("without a program id, takes the first matching line regardless of nesting", () => {
    expect(parseAdlEvent([`Program ${OTHER} invoke [2]`, EVENT])?.targetIdx).toBe(7);
  });

  it("ignores wrong-tag lines and keeps looking", () => {
    const logs = ["Program log: 1 2 3 4 5", EVENT];
    expect(parseAdlEvent(logs)?.targetIdx).toBe(7);
  });
});

describe("fetchAdlRankings", () => {
  const good = {
    slabAddress: "S",
    pnlPosTot: "10",
    maxPnlCap: "5",
    adlNeeded: true,
    capExceeded: true,
    rankings: [{ rank: 1, idx: 3, pnlAbs: "1", capital: "2", pnlPctMillionths: "500000" }],
  };
  const resp = (body: unknown, ok = true, status = 200, text?: () => Promise<string>) =>
    vi.fn().mockResolvedValue({ ok, status, json: async () => body, text: text ?? (async () => "") });

  it("builds the URL (trailing slash trimmed, slab encoded) and returns the parsed body", async () => {
    const f = resp(good);
    const slab = new PublicKey("7rUiMfQVTRMJb44fzDT7Gq1BGtioN3UVqNKaMVuqyqyH");
    expect(await fetchAdlRankings("https://api.example/", slab, f)).toBe(good);
    expect(f).toHaveBeenCalledWith(
      "https://api.example/api/adl/rankings?slab=7rUiMfQVTRMJb44fzDT7Gq1BGtioN3UVqNKaMVuqyqyH",
    );
    await fetchAdlRankings("https://api.example", "a b", f);
    expect(f).toHaveBeenLastCalledWith("https://api.example/api/adl/rankings?slab=a%20b");
  });

  it("includes status and body text on HTTP errors", async () => {
    const f = resp(null, false, 503, async () => "down");
    await expect(fetchAdlRankings("https://x", "s", f)).rejects.toThrow(
      "fetchAdlRankings: HTTP 503 from https://x/api/adl/rankings?slab=s — down",
    );
  });

  it("omits the body suffix when the error body is empty or unreadable", async () => {
    await expect(fetchAdlRankings("https://x", "s", resp(null, false, 500))).rejects.toThrow(
      /^fetchAdlRankings: HTTP 500 from https:\/\/x\/api\/adl\/rankings\?slab=s$/,
    );
    const f = resp(null, false, 502, async () => {
      throw new Error("stream");
    });
    await expect(fetchAdlRankings("https://x", "s", f)).rejects.toThrow(/^fetchAdlRankings: HTTP 502 from \S+$/);
  });

  it.each([
    [null, "non-object response"],
    ["str", "non-object response"],
    [{ ...good, rankings: undefined }, "missing rankings array"],
    [{ ...good, adlNeeded: "yes" }, "invalid adlNeeded field: yes"],
    [{ ...good, capExceeded: 1 }, "invalid capExceeded field: 1"],
    [{ ...good, slabAddress: 5 }, "invalid slabAddress field: 5"],
    [{ ...good, pnlPosTot: 10 }, "invalid pnlPosTot field: 10"],
    [{ ...good, maxPnlCap: null }, "invalid maxPnlCap field: null"],
    [{ ...good, rankings: [null] }, "invalid ranking entry (not an object)"],
    [{ ...good, rankings: [{ idx: -1 }] }, "invalid ranking idx: -1"],
    [{ ...good, rankings: [{ idx: 1.5 }] }, "invalid ranking idx: 1.5"],
    [{ ...good, rankings: [{ idx: "1" }] }, "invalid ranking idx: 1"],
  ])("rejects malformed response %#", async (body, msg) => {
    await expect(fetchAdlRankings("https://x", "s", resp(body))).rejects.toThrow(msg);
  });
});
