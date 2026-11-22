// RpcPool endpoint health under interleaved calls (J-20261122-SDK-REPORT-CONCURRENTCALLSHAREDSTATE).
// A health result that lands late must not overwrite a newer one. Ordering is driven by
// hand-resolved deferreds, no timers, so the outcome does not depend on scheduling.
import { describe, it, expect, vi, afterEach } from "vitest";
import { RpcPool } from "../src/solana/rpc-pool.js";

const A = "http://a.invalid";
const B = "http://b.invalid";
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const pool = () =>
  new RpcPool({
    endpoints: [{ url: A, label: "A" }, { url: B, label: "B" }],
    strategy: "failover",
    retry: { maxRetries: 0 },
    recoveryAfterMs: 0,
    verbose: false,
  });
const statusOf = (p: RpcPool, label: string) => p.status().find((s) => s.label === label)!;
const okSlot = () => Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 1 }), { status: 200 }));
const failOnA = async (c: { rpcEndpoint: string }) => {
  if (c.rpcEndpoint.startsWith(A)) throw new Error("A down");
  return "b";
};

afterEach(() => vi.unstubAllGlobals());

describe("RpcPool health under concurrent calls", () => {
  it("Hit 1: a success that was in flight before an endpoint was marked unhealthy does not mark it healthy again", async () => {
    const p = pool();
    const slow = deferred<string>();
    // 1) call 0 is issued on A while A is still up; its response is held back.
    const inFlight = p.call(() => slow.promise, { idempotent: true });
    // 2) A goes down: three later calls fail on A (then fail over to B).
    for (let i = 0; i < 3; i++) await p.call(failOnA, { idempotent: true });
    expect(statusOf(p, "A").healthy).toBe(false);
    // 3) the stale response from step 1 arrives. The caller still gets it.
    slow.resolve("late");
    await expect(inFlight).resolves.toBe("late");
    // A serial run cannot get here: the success was issued BEFORE the failures.
    expect(statusOf(p, "A").healthy).toBe(false);
    expect(statusOf(p, "A").failures).toBeGreaterThanOrEqual(3);
  });

  it("Hit 2: a healthCheck probe issued before a newer successful call does not mark the endpoint dead", async () => {
    const p = pool();
    const probeA = deferred<Response>();
    vi.stubGlobal("fetch", (url: string) => (String(url).startsWith(A) ? probeA.promise : okSlot()));
    // 1) probe of A starts (A briefly bad)...
    const probe = p.healthCheck(10_000);
    // 2) ...a newer real call succeeds on A...
    await expect(p.call(async (c) => c.rpcEndpoint, { idempotent: true })).resolves.toContain("a.invalid");
    expect(statusOf(p, "A").healthy).toBe(true);
    // 3) ...then the older probe answer lands. healthCheck still reports what the probe saw.
    probeA.resolve(new Response("bad gateway", { status: 502 }));
    const results = await probe;
    expect(results[0].healthy).toBe(false);
    // The probe's view is older than the call's success; A must stay in rotation.
    expect(statusOf(p, "A").healthy).toBe(true);
  });

  it("a healthy probe issued before newer failures does not bring a dead endpoint back", async () => {
    const p = pool();
    const probeA = deferred<Response>();
    vi.stubGlobal("fetch", (url: string) => (String(url).startsWith(A) ? probeA.promise : okSlot()));
    const probe = p.healthCheck(10_000);
    for (let i = 0; i < 3; i++) await p.call(failOnA, { idempotent: true });
    expect(statusOf(p, "A").healthy).toBe(false);
    probeA.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: 7 }), { status: 200 }));
    await probe;
    expect(statusOf(p, "A").healthy).toBe(false);
    expect(statusOf(p, "A").failures).toBe(3);
  });

  it("a stale success does not wipe a newer failure count below the threshold", async () => {
    const p = pool();
    const slow = deferred<string>();
    const inFlight = p.call(() => slow.promise, { idempotent: true });
    await p.call(failOnA, { idempotent: true });
    await p.call(failOnA, { idempotent: true });
    slow.resolve("late");
    await inFlight;
    // Serial order is success, fail, fail: two consecutive failures.
    expect(statusOf(p, "A").failures).toBe(2);
    // One more newer failure still marks A down.
    await p.call(failOnA, { idempotent: true });
    expect(statusOf(p, "A").healthy).toBe(false);
  });

  it("a success issued after the failures still restores the endpoint", async () => {
    const p = pool();
    for (let i = 0; i < 3; i++) await p.call(failOnA, { idempotent: true });
    expect(statusOf(p, "A").healthy).toBe(false);
    // A newer probe says A is back.
    vi.stubGlobal("fetch", () => okSlot());
    await p.healthCheck(10_000);
    expect(statusOf(p, "A")).toMatchObject({ healthy: true, failures: 0 });
    // A newer failure followed by a newer success on A: the success wins.
    await p.call(failOnA, { idempotent: true });
    await expect(p.call(async (c) => c.rpcEndpoint, { idempotent: true })).resolves.toContain("a.invalid");
    expect(statusOf(p, "A")).toMatchObject({ healthy: true, failures: 0 });
  });

  it("concurrent failures on one endpoint still mark it unhealthy", async () => {
    const p = pool();
    const gates = Array.from({ length: 5 }, () => deferred<string>());
    const calls = gates.map((g) =>
      p.call(async (c) => (c.rpcEndpoint.startsWith(A) ? g.promise : "b"), { idempotent: true }),
    );
    gates.forEach((g) => g.reject(new Error("A down")));
    await expect(Promise.all(calls)).resolves.toEqual(["b", "b", "b", "b", "b"]);
    expect(statusOf(p, "A").healthy).toBe(false);
  });
});
