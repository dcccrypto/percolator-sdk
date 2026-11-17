/**
 * Differential: the memoised / subarray creator-fee-payee-v22 functions vs the ORIGINAL implementations
 * (copied verbatim below) over >= 5k random markets / assets / payees / mints. Output must be byte-identical.
 */
import { PublicKey } from "@solana/web3.js";
import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACCOUNT_KIND, LAYOUT_V22, UnknownLayoutError, resolveLayout } from "../src/abi/layout.js";
import * as P from "../src/abi/creator-fee-payee-v22.js";
import { stampHeader } from "./helpers/stamp.js";

// ---- old implementations (pre-optimisation, verbatim) ----
const oldDerive = (programId: PublicKey, market: PublicKey, assetIndex: number): [PublicKey, number] => {
  if (!Number.isInteger(assetIndex) || assetIndex < 0 || assetIndex > 0xffff) {
    throw new Error(`deriveCreatorFeePayeeV22: assetIndex ${assetIndex} is not a u16`);
  }
  const idx = new Uint8Array(2);
  new DataView(idx.buffer).setUint16(0, assetIndex, true);
  return PublicKey.findProgramAddressSync([Buffer.from(P.CREATOR_FEE_PAYEE_SEED_V22), market.toBuffer(), Buffer.from(idx)], programId);
};
const ATA = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TOK = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const oldDest = (payee: PublicKey, mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([payee.toBuffer(), TOK.toBuffer(), mint.toBuffer()], ATA)[0];
const ZERO32 = new Uint8Array(32);
const eq32 = (a: Uint8Array, b: Uint8Array): boolean => { for (let i = 0; i < 32; i++) if (a[i] !== b[i]) return false; return true; };
const oldDecode = (data: Uint8Array) => {
  const parser = "decodeCreatorFeePayeeV22";
  const kind = ACCOUNT_KIND.CreatorFeePayee;
  const L = resolveLayout(data, { parser, kind, versions: [LAYOUT_V22.version] });
  const LEN = P.CREATOR_FEE_PAYEE_ACCOUNT_LEN_V22;
  if (data.length !== LEN) {
    throw new UnknownLayoutError(data.length < LEN ? "TOO_SHORT" : "BAD_LENGTH", parser, `creator fee payee account length ${data.length} != ${LEN}`, { version: L.version, kind });
  }
  const b = 16;
  const F = P.CREATOR_FEE_PAYEE_FIELD_OFF_V22;
  const market = data.subarray(b + F.market, b + F.market + 32);
  const payee = data.subarray(b + F.payee, b + F.payee + 32);
  const version = data[b + F.version];
  const reserved = data.subarray(b + F.reserved, b + F.reserved + 4);
  const bad = (why: string): never => {
    throw new UnknownLayoutError("INVALID_RECORD", parser, `invalid creator fee payee record: ${why}`, { version: L.version, kind });
  };
  if (version !== P.CREATOR_FEE_PAYEE_VERSION_V22) bad(`version ${version}`);
  if (eq32(market, ZERO32)) bad("zero market");
  if (eq32(payee, ZERO32)) bad("zero payee");
  if (reserved.some((x) => x !== 0)) bad("reserved bytes not zero");
  return { market: new PublicKey(market.slice()), payee: new PublicKey(payee.slice()), assetIndex: data[b + F.assetIndex] | (data[b + F.assetIndex + 1] << 8), version, bump: data[b + F.bump] };
};

const rnd32 = (): Uint8Array => webcrypto.getRandomValues(new Uint8Array(32));
const rndPk = (): PublicKey => new PublicKey(rnd32());
const rndInt = (n: number): number => webcrypto.getRandomValues(new Uint32Array(1))[0] % n;
const mkRecord = (market: Uint8Array, payee: Uint8Array, asset: number, bump: number): Uint8Array => {
  const d = stampHeader(new Uint8Array(P.CREATOR_FEE_PAYEE_ACCOUNT_LEN_V22), ACCOUNT_KIND.CreatorFeePayee, LAYOUT_V22.version);
  d.set(market, 16); d.set(payee, 48);
  d[80] = asset & 0xff; d[81] = asset >> 8; d[82] = 1; d[83] = bump;
  return d;
};
const sameErr = (fn1: () => unknown, fn2: () => unknown): void => {
  let e1: unknown, e2: unknown;
  try { fn1(); } catch (e) { e1 = e; }
  try { fn2(); } catch (e) { e2 = e; }
  expect(e1).toBeDefined();
  expect((e2 as Error).message).toBe((e1 as Error).message);
  expect((e2 as { code?: unknown }).code).toBe((e1 as { code?: unknown }).code);
};

describe("creator-fee-payee-v22 differential vs original", () => {
  it("PDAs, bumps, ATAs and decoded records: 6000 random cases (each queried twice: cold + memo hit)", { timeout: 300_000 }, () => {
    const programs = [rndPk(), rndPk(), rndPk()];
    const mints = [rndPk(), rndPk()];
    const N = 6000;
    let mismatches = 0;
    for (let i = 0; i < N; i++) {
      const prog = programs[i % programs.length];
      const market = rndPk();
      const payee = rndPk();
      const mint = mints[i % mints.length];
      // include u16 boundaries
      const asset = i % 7 === 0 ? [0, 1, 255, 256, 0xfffe, 0xffff][(i / 7 | 0) % 6] : rndInt(0x10000);
      const want = oldDerive(prog, market, asset);
      const wantAta = oldDest(payee, mint);
      for (let pass = 0; pass < 2; pass++) {
        const got = P.deriveCreatorFeePayeeV22(prog, market, asset);
        if (!got[0].toBytes().every((x, j) => x === want[0].toBytes()[j]) || got[1] !== want[1]) mismatches++;
        const ata = P.creatorFeePayeeDestinationV22(payee, mint);
        if (!ata.equals(wantAta)) mismatches++;
      }
      const bump = rndInt(256);
      const rec = mkRecord(market.toBytes(), payee.toBytes(), asset, bump);
      const wd = oldDecode(rec);
      const gd = P.decodeCreatorFeePayeeV22(rec);
      if (gd.market.toBase58() !== wd.market.toBase58() || gd.payee.toBase58() !== wd.payee.toBase58() ||
          gd.assetIndex !== wd.assetIndex || gd.version !== wd.version || gd.bump !== wd.bump) mismatches++;
      // decoded keys must not alias the caller's buffer
      const before = gd.market.toBase58();
      rec.fill(7, 16, 48);
      if (gd.market.toBase58() !== before) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it("returned tuples are fresh and mutation of one result cannot poison the memo", () => {
    const prog = rndPk(), market = rndPk();
    const a = P.deriveCreatorFeePayeeV22(prog, market, 3);
    const keep = a[0].toBase58(), bump = a[1];
    a[1] = 999; a[0] = rndPk();
    const b = P.deriveCreatorFeePayeeV22(prog, market, 3);
    expect(b[0].toBase58()).toBe(keep);
    expect(b[1]).toBe(bump);
    expect(b).not.toBe(a);
  });

  it("memo is bounded: overflowing it stays correct", { timeout: 300_000 }, () => {
    const prog = rndPk();
    const cap = P.CREATOR_FEE_PAYEE_MEMO_MAX_V22;
    expect(cap).toBeGreaterThan(0);
    const m0 = rndPk();
    const first = P.deriveCreatorFeePayeeV22(prog, m0, 0);
    for (let i = 0; i < cap + 50; i++) P.deriveCreatorFeePayeeV22(prog, rndPk(), i & 0xffff);
    expect(P.creatorFeePayeeMemoSizeV22()).toBeLessThanOrEqual(cap);
    const again = P.deriveCreatorFeePayeeV22(prog, m0, 0);
    expect(again[0].equals(first[0]) && again[1] === first[1]).toBe(true);
  });

  it("errors match: bad assetIndex and malformed records", () => {
    const prog = rndPk(), market = rndPk();
    for (const bad of [-1, 65536, 1.5, NaN]) sameErr(() => oldDerive(prog, market, bad), () => P.deriveCreatorFeePayeeV22(prog, market, bad));
    const ok = mkRecord(market.toBytes(), rnd32(), 1, 254);
    const variants: Uint8Array[] = [ok.subarray(0, 87), new Uint8Array(89), (() => { const d = ok.slice(); d[82] = 2; return d; })(),
      (() => { const d = ok.slice(); d.fill(0, 16, 48); return d; })(), (() => { const d = ok.slice(); d.fill(0, 48, 80); return d; })(),
      (() => { const d = ok.slice(); d[85] = 1; return d; })()];
    for (const v of variants) sameErr(() => oldDecode(v), () => P.decodeCreatorFeePayeeV22(v));
  });
});
