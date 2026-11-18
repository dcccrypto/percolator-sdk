import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { parseErrorFromLogs as after } from "../src/abi/errors.js";
import { parseErrorFromLogs as before } from "./helpers/errors-before.js";
import { CORPUS, fuzzLogs, mulberry32, ID_POOL } from "./helpers/errors-corpus.js";

const OPTS = [
  undefined,
  { context: { action: "trade" as const } },
  { context: { action: "withdraw" as const, openLegs: 1 } },
  { programIds: { stake: [ID_POOL[0]] } },
  { programIds: { nft: [Keypair.generate().publicKey, ID_POOL[7]], matcher: [] }, context: { action: "resolve" as const } },
];

describe("parseErrorFromLogs: memoised vs frozen reference", () => {
  it("deep-equal on corpus x option sets", () => {
    for (const logs of CORPUS) for (const o of OPTS) expect(after(logs, o)).toEqual(before(logs, o));
  });
  it("deep-equal on 10k fuzzed log arrays", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 10_000; i++) {
      const logs = fuzzLogs(rng);
      const o = OPTS[i % OPTS.length];
      expect(after(logs, o)).toEqual(before(logs, o));
    }
  });
  it("extra ids do not leak into later default calls", () => {
    const id = Keypair.generate().publicKey.toBase58();
    const logs = [`Program ${id} failed: custom program error: 0x1`];
    expect(after(logs, { programIds: { nft: [id] } })?.program).toBe("nft");
    expect(after(logs)?.program).toBe("unknown");
  });
});
