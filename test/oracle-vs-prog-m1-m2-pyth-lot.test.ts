// DRAFT (fails on feat/v22-sdk-growth e4acaa84). M1 + M2: pythPriceToLotE6V22 (src/abi/v22-lot.ts:181-187) returns
// per-lot prices the program refuses.
//   M1 program range: leg e12/1e6 <= MAX_ORACLE_PRICE (v16_program.rs:12550-12552, 12625) and final
//      0 < p <= MAX_ORACLE_PRICE (v16_program.rs:12940-12943). SDK applies neither.
//   M2 program exponent bound |expo| <= 18 (v16_program.rs:12440, 12606). SDK accepts any exponent.
// Expected fix: return 0n (the function's documented "program would refuse") or throw on these rows.
import { describe, expect, it } from "vitest";
import { pythPriceToLotE6V22 } from "../src/abi/v22-lot.js";

const refused = (f: () => bigint) => { try { return f() === 0n; } catch { return true; } };

describe("M1 pythPriceToLotE6V22 applies the program's MAX_ORACLE_PRICE bound", () => {
  it("accepts exactly MAX_ORACLE_PRICE ($1,000,000 at lot 0)", () => {
    expect(pythPriceToLotE6V22(1_000_000_000n, -3, 0)).toBe(1_000_000_000_000n);
  });
  it.each([
    ["P-atmax+1  $1,000,000.001", 1_000_000_001n, -3, 0],
    ["P-i64max   i64::MAX e-8", (1n << 63n) - 1n, -8, 0],
    ["P-lotmax   $500k at lot 7 = $5e12 per lot", 50_000_000_000_000n, -8, 7],
    ["P-lot7-real $0.20 token at lot 7 = $2,000,000 per lot", 20_000_000n, -8, 7],
    ["P-x4       123456789e4", 123_456_789n, 4, 0],
    ["P-x+18     1e18", 1n, 18, 0],
  ])("%s is refused like the program (OracleInvalid)", (_l, price, expo, lot) => {
    expect(refused(() => pythPriceToLotE6V22(price as bigint, expo as number, lot as number))).toBe(true);
  });
});

describe("M2 pythPriceToLotE6V22 applies the program's |exponent| <= 18 bound", () => {
  it("accepts expo -18", () => {
    expect(pythPriceToLotE6V22(500_000_000_000_000_000n, -18, 0)).toBe(500_000n);
  });
  it.each([
    ["P-x-19 $0.5", 5_000_000_000_000_000_000n, -19, 0],
    ["P-x-20 $0.05 lot 2", 5_000_000_000_000_000_000n, -20, 2],
    ["P-x+19", 1n, 19, 0],
  ])("%s is refused like the program", (_l, price, expo, lot) => {
    expect(refused(() => pythPriceToLotE6V22(price as bigint, expo as number, lot as number))).toBe(true);
  });
});
