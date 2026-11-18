import { describe, it, expect, vi, afterEach } from "vitest";
import { detectTxV1Support } from "../src/runtime/txv1.js";

function stub(active: boolean) {
  const state = { active, calls: 0 };
  const conn = {
    async getAccountInfo() {
      state.calls++;
      return { data: new Uint8Array(9).fill(0).map((_, i) => (i === 0 && state.active ? 1 : 0)) };
    },
  };
  return { conn, state };
}

describe("detectTxV1Support clock handling", () => {
  afterEach(() => vi.useRealTimers());

  it("serves cache within TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { conn, state } = stub(false);
    expect(await detectTxV1Support(conn)).toBe(false);
    vi.setSystemTime(1_000_000 + 60_000);
    await detectTxV1Support(conn);
    expect(state.calls).toBe(1);
  });

  it("refetches after TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { conn, state } = stub(false);
    await detectTxV1Support(conn);
    state.active = true;
    vi.setSystemTime(1_000_000 + 10 * 60_000 + 1);
    expect(await detectTxV1Support(conn)).toBe(true);
    expect(state.calls).toBe(2);
  });

  it("refetches when the clock steps backwards", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000_000);
    const { conn, state } = stub(false);
    await detectTxV1Support(conn);
    state.active = true;
    vi.setSystemTime(10_000_000 - 3_600_000); // 1h backwards
    expect(await detectTxV1Support(conn)).toBe(true);
    expect(state.calls).toBe(2);
  });

  it("NaN / negative ttl never serves the cache (fail-safe, hits RPC each call)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { conn, state } = stub(true);
    await detectTxV1Support(conn, NaN);
    await detectTxV1Support(conn, NaN);
    await detectTxV1Support(conn, -5);
    expect(state.calls).toBe(3);
  });
});
