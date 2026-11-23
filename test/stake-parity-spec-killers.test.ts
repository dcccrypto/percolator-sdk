/**
 * Mutation killers (from SDK-REPORT-STAKEPARITYSTATICMUT). They target the mutants that survive
 * test/stake-parity-rust-static.test.ts:
 *   S05 specs/stake-parity.json stake_deposit_size drift: survives every test in the repo (static, test/stake*,
 *       parity-fixtures, account-decode).
 *   S06 spec layout offset drift: survives the static test and test/stake*. Only parity-fixtures.test.ts catches it,
 *       and it compares against hand-typed literals, not against the decoder.
 *   T03/T04 encodeStakeDeposit / encodeStakeWithdraw tag byte: survive the static test. The static diff only checks
 *       `data` for build*Ix cases; stake.test.ts catches them with literals.
 * Oracles: the SDK decoder (decodeStakePool / decodeDepositPda) for the spec numbers, and the pinned Rust
 * instruction.rs (`unpack` payload widths) for the encoders. The static test's deposit / depositJunior / withdraw
 * cases also carry `data` now, so its own tag/width diff catches T03/T04 too.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STAKE_IX, STAKE_DEPOSIT_SIZE, STAKE_DEPOSIT_DISCRIMINATOR, STAKE_POOL_DISCRIMINATOR, STAKE_POOL_SIZE_V4,
  decodeStakePool, decodeDepositPda, encodeStakeDeposit, encodeStakeWithdraw, encodeStakeDepositJunior,
} from "../src/solana/stake.js";

const spec = JSON.parse(readFileSync(resolve(__dirname, "../specs/stake-parity.json"), "utf8")) as {
  stake_deposit_size: number; stake_pool_size: number;
  layout: { reserved_start: number; offsets: Record<string, number> };
};
const FIX = resolve(__dirname, "fixtures/stake/v22-214c3e3");
const stateRs = readFileSync(resolve(FIX, "state-1-300.rs.txt"), "utf8");
const instructionRs = readFileSync(resolve(FIX, "instruction.rs.txt"), "utf8");

const rustBytes = (name: string): number[] =>
  new RegExp(`${name}: \\[u8; 8\\] = \\[([^\\]]+)\\]`).exec(stateRs)![1]!.split(",").map((x) => Number(x.trim()));

describe("K-S05: spec stake_deposit_size is the size the SDK decoder enforces", () => {
  it("spec == STAKE_DEPOSIT_SIZE, and decodeDepositPda accepts exactly that length and refuses one byte less", () => {
    expect(spec.stake_deposit_size).toBe(STAKE_DEPOSIT_SIZE);
    const buf = new Uint8Array(spec.stake_deposit_size);
    buf.set(STAKE_DEPOSIT_DISCRIMINATOR, 88);
    expect(() => decodeDepositPda(buf)).not.toThrow();
    expect(() => decodeDepositPda(buf.subarray(0, spec.stake_deposit_size - 1))).toThrow(/too short/);
    // Discriminator the SDK checks is the one the pinned Rust declares.
    expect([...STAKE_DEPOSIT_DISCRIMINATOR]).toEqual(rustBytes("STAKE_DEPOSIT_DISCRIMINATOR"));
  });
});

describe("K-S06: every spec layout offset round-trips through decodeStakePool (v4 buffer)", () => {
  // spec field -> [decoded field, width, value written]
  const FIELDS: Record<string, [string, 1 | 2 | 8, bigint]> = {
    market_resolved: ["marketResolved", 1, 1n],
    hwm_enabled: ["hwmEnabled", 1, 1n],
    hwm_floor_bps: ["hwmFloorBps", 2, 0x1234n],
    epoch_high_water_tvl: ["epochHighWaterTvl", 8, 0x0102030405060708n],
    hwm_last_epoch: ["hwmLastEpoch", 8, 0x1112131415161718n],
    tranche_enabled: ["trancheEnabled", 1, 1n],
    junior_balance: ["juniorBalance", 8, 0x2122232425262728n],
    junior_total_lp: ["juniorTotalLp", 8, 0x3132333435363738n],
    junior_fee_mult_bps: ["juniorFeeMultBps", 2, 0x4142n],
    total_recovered_from_wrapper: ["totalRecoveredFromWrapper", 8, 0x5152535455565758n],
  };

  it("spec reserved_start is the Rust `_reserved` offset assert", () => {
    expect(/assert!\(offset_of!\(StakePool, _reserved\) == (\d+)\);/.exec(stateRs)![1]).toBe(String(spec.layout.reserved_start));
    expect(Object.keys(spec.layout.offsets).sort()).toEqual(Object.keys(FIELDS).sort());
  });

  it("each field is decoded from exactly the spec offset", () => {
    const base = (): Uint8Array => {
      const b = new Uint8Array(STAKE_POOL_SIZE_V4);
      b.set(STAKE_POOL_DISCRIMINATOR, spec.layout.reserved_start);
      b[spec.layout.reserved_start + 8] = 4; // version
      return b;
    };
    for (const [field, [key, width, value]] of Object.entries(FIELDS)) {
      const b = base();
      const off = spec.layout.offsets[field]!;
      for (let i = 0; i < width; i++) b[off + i] = Number((value >> BigInt(8 * i)) & 0xffn);
      const d = decodeStakePool(b) as unknown as Record<string, unknown>;
      const got = d[key];
      const want = width === 1 ? true : width === 2 ? Number(value) : value;
      expect(got, `${field} @ ${off}`).toEqual(want);
    }
  });
});

describe("K-T03/T04: deposit / withdraw encoders emit the Rust tag and an `unpack` payload width", () => {
  // Payload widths `unpack` accepts per tag, read from the pinned Rust (`N => { if rest.len() != W`).
  const lens = (tag: number): number[] => {
    const m = new RegExp(`\\n\\s+${tag} => \\{([\\s\\S]*?)\\n\\s+\\d+ => \\{`).exec(instructionRs);
    return [...(m?.[1] ?? "").matchAll(/rest\.len\(\)\s*[!=]=\s*(\d+)/g)].map((x) => Number(x[1]));
  };

  it.each([
    ["encodeStakeDeposit", encodeStakeDeposit(7n), 1],
    ["encodeStakeDepositJunior", encodeStakeDepositJunior(7n), 16],
    ["encodeStakeWithdraw", encodeStakeWithdraw(7n), 2],
  ] as const)("%s", (_name, data, rustTag) => {
    expect(data[0]).toBe(rustTag);
    expect(lens(rustTag)).toContain(data.length - 1);
  });

  it("STAKE_IX deposit/withdraw tags equal the Rust tags those encoders target", () => {
    expect([STAKE_IX.Deposit, STAKE_IX.DepositJunior, STAKE_IX.Withdraw]).toEqual([1, 16, 2]);
  });
});
