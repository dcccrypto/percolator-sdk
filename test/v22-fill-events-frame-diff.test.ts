import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { wrapperEventTokensV22 } from "../src/abi/v22-fill-events.js";
import { LOG_TRUNCATED_V22 } from "../src/abi/v22-fill-events.js";

// Verbatim copy of the pre-optimisation frame walk (PublicKey round trip on every line).
const RUNTIME_LINE = /^Program ([1-9A-HJ-NP-Za-km-z]{32,44}) (.*)$/s;
const INVOKE_TAIL = /^invoke \[([0-9]+)\]$/;
// Oracle-side memo of the ORIGINAL pure check (positives and negatives) so 30k cases stay fast; the check itself is unchanged.
const oracleCanon = new Map<string, boolean>();
function oldCanon(id: string): boolean {
  let v = oracleCanon.get(id);
  if (v === undefined) {
    try { v = new PublicKey(id).toBase58() === id; } catch { v = false; }
    oracleCanon.set(id, v);
  }
  return v;
}
function oldLine(line: string) {
  const m = RUNTIME_LINE.exec(line);
  if (!m) return null;
  if (!oldCanon(m[1])) return null;
  return { id: m[1], tail: m[2] };
}
function oldWalk(logs: readonly string[] | null | undefined, wrapper: PublicKey) {
  if (!logs || logs.length === 0) return { ok: false, unknown: "no-logs" };
  if (logs.includes(LOG_TRUNCATED_V22)) return { ok: false, unknown: "truncated" };
  const w = wrapper.toBase58();
  const stack: string[] = [];
  const tokens: string[] = [];
  for (const line of logs) {
    const rl = oldLine(line);
    if (rl) {
      const inv = INVOKE_TAIL.exec(rl.tail);
      if (inv) {
        if (Number(inv[1]) !== stack.length + 1) return { ok: false, unknown: "bad-invoke-depth" };
        stack.push(rl.id);
      } else if (rl.tail === "success" || rl.tail.startsWith("failed: ")) {
        if (stack[stack.length - 1] !== rl.id) return { ok: false, unknown: "bad-return" };
        stack.pop();
      }
      continue;
    }
    if (line.startsWith("Program data: ")) {
      const top = stack[stack.length - 1];
      if (top === undefined) return { ok: false, unknown: "data-outside-frame" };
      if (top === w) for (const t of line.slice("Program data: ".length).split(" ")) if (t !== "") tokens.push(t);
    }
  }
  if (stack.length !== 0) return { ok: false, unknown: "unclosed-frame" };
  return { ok: true, tokens };
}

let seed = 0x9e3779b9;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const ri = (n: number) => Math.floor(rnd() * n);
const pick = <T,>(a: T[]) => a[ri(a.length)];
const ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

describe("wrapperEventTokensV22 frame walk: old == new", () => {
  it("matches the reference over 30k random and hostile log arrays", () => {
    const wrapper = new PublicKey(new Uint8Array(32).fill(9));
    const w = wrapper.toBase58();
    const ids: string[] = [w, w, w];
    for (let i = 0; i < 5; i++) ids.push(new PublicKey(new Uint8Array(32).fill(20 + i)).toBase58());
    // hostile ids
    for (const len of [31, 33, 30, 34]) ids.push(Array.from({ length: len }, () => ALPHA[ri(58)]).join(""));
    const k33 = new PublicKey(new Uint8Array(32).fill(5)).toBase58();
    ids.push("1" + k33, "11" + k33); // leading-zero padded: decode to 33/34 bytes or non-canonical
    ids.push("1".repeat(32), "1".repeat(44), "z".repeat(44), "z".repeat(32), w + "1", w.slice(1), w.slice(0, -1) + (w.endsWith("A") ? "B" : "A"));
    for (let i = 0; i < 10; i++) ids.push(Array.from({ length: 32 + ri(13) }, () => ALPHA[ri(58)]).join(""));
    ids.push("0OIl".repeat(9)); // non-alphabet
    const data = () => `Program data: ${Buffer.from(Array.from({ length: ri(40) }, () => ri(256))).toString("base64")}${rnd() < 0.2 ? " " + "AAAA" : ""}`;
    const tails = (depth: number) => [`invoke [${depth}]`, `invoke [${ri(5)}]`, "success", "failed: custom program error: 0x1", "consumed 10 of 200 compute units", "log", "invoke [01]", "invoke [1] "];
    let checked = 0;
    let okWithTokens = 0;
    for (let c = 0; c < 30000; c++) {
      const n = ri(24);
      const logs: string[] = [];
      let depth = 0;
      if (c % 4 === 0) {
        // well-formed nested frames, then (maybe) one mutation below
        const stk: string[] = [];
        const steps = 2 + ri(8);
        for (let i = 0; i < steps; i++) {
          if (stk.length < 4 && rnd() < 0.5) { const id = pick(ids.slice(0, 8)); stk.push(id); logs.push(`Program ${id} invoke [${stk.length}]`); }
          else if (stk.length && rnd() < 0.4) logs.push(data());
          else if (stk.length) logs.push(`Program ${stk.pop()} success`);
        }
        while (stk.length) { logs.push(data()); logs.push(`Program ${stk.pop()} success`); }
        if (rnd() < 0.2 && logs.length) logs[ri(logs.length)] = `Program ${pick(ids)} ${pick(["success", "invoke [9]"])}`;
      } else
      for (let i = 0; i < n; i++) {
        const r = rnd();
        if (r < 0.15) logs.push(data());
        else if (r < 0.2) logs.push(pick(["Log truncated", "", "Program log: hi", "Program data: ", "Program " + w, "program " + w + " success"]));
        else {
          const id = rnd() < 0.95 ? pick(ids.slice(0, 8)) : pick(ids);
          const t = rnd() < 0.5 ? (depth++, `invoke [${depth}]`) : pick(tails(depth + 1));
          if (t === "success" && depth > 0) depth--;
          logs.push(`Program ${id} ${t}`);
        }
      }
      const arg = c % 997 === 0 ? (c % 2 ? null : undefined) : logs;
      const got = wrapperEventTokensV22(arg, wrapper);
      expect(got).toEqual(oldWalk(arg, wrapper));
      if (got.ok && got.tokens.length > 0) okWithTokens++;
      checked++;
    }
    expect(checked).toBe(30000);
    expect(okWithTokens).toBeGreaterThan(100); // success path is genuinely exercised
  }, 120000);

  it("cache does not make a non-canonical id canonical after a canonical sibling was cached", () => {
    const wrapper = new PublicKey(new Uint8Array(32).fill(9));
    const good = new PublicKey(new Uint8Array(32).fill(5)).toBase58();
    const bad = "1" + good; // 33-byte/non-canonical encoding
    for (let k = 0; k < 3; k++) for (const id of [good, bad]) {
      const logs = [`Program ${id} invoke [1]`, `Program ${id} success`];
      expect(wrapperEventTokensV22(logs, wrapper)).toEqual(oldWalk(logs, wrapper));
    }
  });

  it("stays identical across cache eviction (>4096 distinct canonical ids)", () => {
    const wrapper = new PublicKey(new Uint8Array(32).fill(9));
    for (let i = 0; i < 4300; i++) {
      const b = new Uint8Array(32); b[0] = i & 255; b[1] = i >> 8; b[2] = 77;
      const id = new PublicKey(b).toBase58();
      const logs = [`Program ${id} invoke [1]`, `Program ${id} success`, `Program ${id} bogus`];
      expect(wrapperEventTokensV22(logs, wrapper)).toEqual(oldWalk(logs, wrapper));
    }
    const logs = [`Program ${wrapper.toBase58()} invoke [1]`, `Program data: QUJD`, `Program ${wrapper.toBase58()} success`];
    expect(wrapperEventTokensV22(logs, wrapper)).toEqual({ ok: true, tokens: ["QUJD"] });
  }, 120000);
});
