/**
 * (b) ADL rank-then-build: buildAdlTransaction accepts the slab bytes or the ranking
 * the caller already has, so the documented "rank, then build" flow reads the slab
 * once instead of twice. Slab decoding is mocked as in adl-ranking.test.ts; the
 * thing under test is how many times fetchSlab runs and that results match.
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

import { fetchAdlRankedPositions, buildAdlTransaction } from "../src/solana/adl.js";
import { AccountKind } from "../src/solana/slab.js";

const K = () => Keypair.generate().publicKey;
const conn = {} as never;
const user = (idx: number, positionSize: bigint, pnl: bigint, capital: bigint) => ({
  idx,
  account: { kind: AccountKind.User, owner: new PublicKey(new Uint8Array(32).fill(idx)), positionSize, pnl, capital },
});

function setup(triggered: boolean, accounts: ReturnType<typeof user>[]) {
  m.detectSlabLayout.mockReturnValue({ engineLongOiOff: 1, engineShortOiOff: 2 });
  m.parseEngine.mockReturnValue({ pnlPosTot: triggered ? 11n : 1n, longOi: 5n, shortOi: 1n });
  m.parseConfig.mockReturnValue({ maxPnlCap: 10n });
  m.parseAllAccounts.mockReturnValue(accounts);
  m.fetchSlab.mockResolvedValue(new Uint8Array(8));
}

const settle = (p: Promise<unknown>) => p.then((v) => ({ ok: v }), (e: Error) => ({ err: e.message }));

beforeEach(() => vi.resetAllMocks());

describe("(b) ADL rank then build reads the slab once", () => {
  const scenarios = [
    ["not triggered -> null", false, [user(1, 1n, 1n, 1n)]],
    ["triggered, dominant side empty -> null", true, [user(1, -1n, 1n, 1n)]],
    ["triggered with a target -> v17-unsupported throw", true, [user(1, 1n, 5n, 1n), user(2, 2n, 9n, 1n)]],
  ] as const;

  for (const [name, triggered, accounts] of scenarios) {
    it(`${name}: ranking passed through = 1 fetchSlab, same outcome as re-fetching`, async () => {
      const [caller, slab, oracle, pid] = [K(), K(), K(), K()];
      setup(triggered, [...accounts]);
      const want = await settle(buildAdlTransaction(conn, caller, slab, oracle, pid));
      m.fetchSlab.mockClear();

      const ranking = await fetchAdlRankedPositions(conn, slab);
      const got = await settle(buildAdlTransaction(conn, caller, slab, oracle, pid, undefined, [], ranking));
      expect(m.fetchSlab).toHaveBeenCalledTimes(1);
      expect(got).toEqual(want);
    });

    it(`${name}: slab bytes passed through = 0 extra fetchSlab, same outcome`, async () => {
      const [caller, slab, oracle, pid] = [K(), K(), K(), K()];
      setup(triggered, [...accounts]);
      const want = await settle(buildAdlTransaction(conn, caller, slab, oracle, pid, "long"));
      m.fetchSlab.mockClear();

      const bytes = new Uint8Array(8);
      const got = await settle(buildAdlTransaction(conn, caller, slab, oracle, pid, "long", [], bytes));
      expect(m.fetchSlab).not.toHaveBeenCalled();
      expect(m.parseAllAccounts).toHaveBeenCalledWith(bytes);
      expect(got).toEqual(want);
    });
  }

  it("without a prefetched value it still fetches (unchanged default)", async () => {
    setup(false, []);
    await buildAdlTransaction(conn, K(), K(), K(), K());
    expect(m.fetchSlab).toHaveBeenCalledTimes(1);
  });
});
