/**
 * prog#587 (#644) creator-fee payee: tag 125, the tag 90 payee route, the payee PDA / record (kind 19), p4 bit 3,
 * error 136, the routing rules, the builders, the market reader and the CloseSlab planner.
 * Parity fixture: test/fixtures/creator-fee-payee-parity.json, generated from the REAL crate (percolator-prog rc23
 * 2b5dce8a on engine 2f05df8c) by scripts/creator-fee-payee-parity/sdk_587_parity.rs (see its header).
 */
import { readFileSync } from "node:fs";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import * as P from "../src/abi/creator-fee-payee-v22.js";
import * as B from "../src/solana/creator-fee-payee-v22.js";
import { planCloseSlabAttempt } from "../src/solana/market-lifecycle.js";
import { deriveVaultAuthority } from "../src/solana/pda.js";
import { ACCOUNT_KIND, LAYOUT_V22, UnknownLayoutError } from "../src/abi/layout.js";
import { P4_FLAG_CREATOR_FEE_PAYEE_V22, P4_FLAG_EXIT_REQUIRES_LOSS_CURRENT_V22, P4_FLAG_INS_UNITS_REQUIRED_V22 } from "../src/abi/v22-wire.js";
import { PERCOLATOR_ERRORS, decodeError } from "../src/abi/errors.js";
import { encodeWithdrawCreatorFee } from "../src/abi/instructions.js";
import { V17_CREATOR_FEE_CLAIMABLE_OFF } from "../src/solana/slab.js";
import { PAYEE_REFUSED, PAYEE_VECTORS } from "./creator-fee-payee-vector-inputs.js";
import { stampMarket } from "./helpers/stamp.js";

interface Fx {
  prog: string; engine: string; program: string;
  vectors: Record<string, { hex: string; rust: { ok: boolean; decoded?: Record<string, unknown>; err?: string }; rustReencodedHex: string }>;
  constants: { tag: number; kind: number; p4Flag: number; p4FlagsIdx: number; version: number; bodyLen: number; accountLen: number; seed: string; errorInvalid: number; errorUnauthorized: number; errorFeesOutstanding: number };
  offsets: Record<string, number>;
  pdas: { market: string; assetIndex: number; pda: string; bump: number; vaultAuthority: string; vaultAuthorityBump: number }[];
  atas: { payee: string; mint: string; ata: string }[];
  records: Record<string, { hex: string; ok: boolean; err?: string; market?: string; payee?: string; assetIndex?: number; version?: number; bump?: number }>;
  rules: Record<string, unknown>[];
}
const FX = JSON.parse(readFileSync(new URL("./fixtures/creator-fee-payee-parity.json", import.meta.url), "utf8")) as Fx;
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
const unhex = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, "hex"));
const pk = (): PublicKey => Keypair.generate().publicKey;

describe("pinned oracle", () => {
  it("is prog rc23 2b5dce8a (#644 + #645) on engine 2f05df8c", () => {
    expect(FX.prog).toBe("2b5dce8a11ed1b3d21e9a56db0144feef99b17e4");
    expect(FX.engine).toBe("2f05df8c8c1edd85734120e1322420621fc33cf0");
  });
});

describe("instruction golden vectors (SDK encoder == real decoder; real re-encode == SDK bytes)", () => {
  for (const [id, v] of Object.entries(PAYEE_VECTORS)) {
    it(id, () => {
      const bytes = v.build();
      const f = FX.vectors[id];
      expect(hex(bytes), "SDK bytes drifted from the fixture").toBe(f.hex);
      expect(f.rust.ok, `real decoder refused ${id}: ${f.rust.err}`).toBe(true);
      expect(f.rust.decoded).toMatchObject({ variant: v.variant, tag: v.tag, ...v.fields });
      expect(f.rustReencodedHex).toBe(f.hex);
      expect(bytes[0]).toBe(v.tag);
    });
    it(`${id}: one byte short / long is refused by the real decoder`, () => {
      expect(FX.vectors[`${id}__short`].rust.ok).toBe(false);
      expect(FX.vectors[`${id}__long`].rust.ok).toBe(false);
    });
    it(`${id}: NEGATIVE CONTROL: any flipped bit breaks the vector check`, () => {
      const bytes = v.build();
      for (let i = 0; i < bytes.length; i++) {
        const m = Uint8Array.from(bytes); m[i] ^= 0x01;
        expect(hex(m)).not.toBe(FX.vectors[id].hex);
      }
    });
  }
  for (const id of Object.keys(PAYEE_REFUSED)) {
    it(`refused by the real decoder: ${id}`, () => expect(FX.vectors[`refused_${id}`].rust.ok).toBe(false));
  }
  it("tag 125 is 51 bytes; the field order is asset_index, market_id, payee, authority_epoch", () => {
    const d = P.encodeSetCreatorFeePayeeV22({ assetIndex: 0x0102, marketId: 3n, payee: new Uint8Array(32).fill(9), authorityEpoch: 4n });
    expect(d.length).toBe(P.SET_CREATOR_FEE_PAYEE_LEN_V22);
    expect(hex(d)).toBe("7d0201" + "0300000000000000" + "09".repeat(32) + "0400000000000000");
  });
  it("the encoder refuses what the program refuses or cannot carry", () => {
    expect(() => P.encodeSetCreatorFeePayeeV22({ assetIndex: 0, marketId: 1n, payee: new Uint8Array(32), authorityEpoch: 0n })).toThrow(/zero/);
    expect(() => P.encodeSetCreatorFeePayeeV22({ assetIndex: 65536, marketId: 1n, payee: pk(), authorityEpoch: 0n })).toThrow(/u16/);
    expect(() => P.encodeSetCreatorFeePayeeV22({ assetIndex: 0, marketId: 1n << 64n, payee: pk(), authorityEpoch: 0n })).toThrow();
    expect(() => P.encodeSetCreatorFeePayeeV22({ assetIndex: 0, marketId: 1n, payee: new Uint8Array(31), authorityEpoch: 0n })).toThrow(/32 bytes/);
  });
});

describe("constants, error code and offsets == the real crate", () => {
  const C = FX.constants;
  it("tag, kind, p4 bit, record version / lengths, seed", () => {
    expect(P.TAG_SET_CREATOR_FEE_PAYEE_V22).toBe(C.tag);
    expect(ACCOUNT_KIND.CreatorFeePayee).toBe(C.kind);
    expect(P4_FLAG_CREATOR_FEE_PAYEE_V22).toBe(C.p4Flag);
    expect(P4_FLAG_CREATOR_FEE_PAYEE_V22 & (P4_FLAG_INS_UNITS_REQUIRED_V22 | P4_FLAG_EXIT_REQUIRES_LOSS_CURRENT_V22)).toBe(0);
    expect(P.CREATOR_FEE_PAYEE_VERSION_V22).toBe(C.version);
    expect(P.CREATOR_FEE_PAYEE_BODY_LEN_V22).toBe(C.bodyLen);
    expect(P.CREATOR_FEE_PAYEE_ACCOUNT_LEN_V22).toBe(C.accountLen);
    expect(P.CREATOR_FEE_PAYEE_SEED_V22).toBe(C.seed);
  });
  it("error 136 CreatorFeePayeeInvalid; 8 and 71 unchanged", () => {
    expect(P.CREATOR_FEE_PAYEE_INVALID_ERROR_V22).toBe(C.errorInvalid);
    expect(decodeError(C.errorInvalid)?.name).toBe("CreatorFeePayeeInvalid");
    expect(PERCOLATOR_ERRORS[C.errorUnauthorized]?.name).toBe("Unauthorized");
    expect(PERCOLATOR_ERRORS[C.errorFeesOutstanding]?.name).toBe("CloseSlabFeesOutstanding");
    expect(decodeError(137)).toBeUndefined();
  });
  it("the market fields the reader uses sit where rustc puts them", () => {
    const O = FX.offsets;
    expect(LAYOUT_V22.wrapperSlot.profileP4Flags).toBe(O.profileP4Flags);
    expect(LAYOUT_V22.wrapperSlot.controlSequences).toBe(O.controlSequencesOff);
    expect(V17_CREATOR_FEE_CLAIMABLE_OFF).toBe(O.configCreatorFeeClaimable);
    expect([O.profileAssetAdmin, O.profileCreatorFeeClaimable, O.controlAuthorityEpoch, O.headerLen]).toEqual([368, 400, 72, 16]);
  });
});

describe("PDA, vault authority and payee ATA == the real crate", () => {
  const program = new PublicKey(FX.program);
  it("payee PDA for every fixture (market, asset index)", () => {
    expect(FX.pdas.length).toBe(10);
    for (const p of FX.pdas) {
      const [pda, bump] = P.deriveCreatorFeePayeeV22(program, new PublicKey(p.market), p.assetIndex);
      expect([pda.toBase58(), bump], `${p.market}/${p.assetIndex}`).toEqual([p.pda, p.bump]);
      const [va, vb] = deriveVaultAuthority(program, new PublicKey(p.market));
      expect([va.toBase58(), vb]).toEqual([p.vaultAuthority, p.vaultAuthorityBump]);
    }
  });
  it("NEGATIVE CONTROL: a big-endian asset index derives another address", () => {
    const p = FX.pdas.find((x) => x.assetIndex === 256)!;
    const be = PublicKey.findProgramAddressSync([Buffer.from("creator_fee_payee"), new PublicKey(p.market).toBuffer(), Buffer.from([1, 0])], program)[0];
    expect(be.toBase58()).not.toBe(p.pda);
  });
  it("the destination is canonical_vault_address(payee, mint): classic SPL Token ATA, off-curve payees included", () => {
    expect(FX.atas.length).toBe(3);
    for (const a of FX.atas) {
      const got = P.creatorFeePayeeDestinationV22(new PublicKey(a.payee), new PublicKey(a.mint));
      expect(got.toBase58()).toBe(a.ata);
      expect(getAssociatedTokenAddressSync(new PublicKey(a.mint), new PublicKey(a.payee), true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID).toBase58()).toBe(a.ata);
    }
  });
});

describe("record decoder agrees with the real reader", () => {
  for (const [id, r] of Object.entries(FX.records)) {
    it(`${id}: ${r.ok ? "decodes" : `refused (${r.err})`}`, () => {
      const data = unhex(r.hex);
      if (r.ok) {
        const d = P.decodeCreatorFeePayeeV22(data);
        expect([d.market.toBase58(), d.payee.toBase58(), d.assetIndex, d.version, d.bump]).toEqual([r.market, r.payee, r.assetIndex, r.version, r.bump]);
      } else {
        expect(() => P.decodeCreatorFeePayeeV22(data)).toThrow(UnknownLayoutError);
      }
    });
  }
  it("the fixture covers each refusal class", () => {
    expect(Object.entries(FX.records).filter(([, r]) => !r.ok).map(([k]) => k).sort())
      .toEqual(["badMagic", "badVersion", "long", "reservedNonZero", "short", "wrongKind", "zeroMarket", "zeroPayee"]);
  });
});

describe("rules == the real pure functions", () => {
  const k = (h: unknown): Uint8Array => unhex(h as string);
  it("claim_route, creator_pot_orphaned, has_payee_bit, with_payee_bit, payee_update_allowed (every fixture row)", () => {
    let n = 0;
    for (const r of FX.rules) {
      switch (r.fn) {
        case "claim_route": expect(P.creatorFeeClaimRouteV22(k(r.admin), r.flag as boolean)).toBe(r.out); break;
        case "creator_pot_orphaned": expect(P.creatorPotOrphanedV22(k(r.admin), r.flag as boolean, BigInt(r.pot as string))).toBe(r.out); break;
        case "has_payee_bit": expect(P.hasCreatorFeePayeeFlagV22(r.p4 as number)).toBe(r.out); break;
        case "with_payee_bit": {
          const on = r.on as boolean, f = r.p4 as number;
          expect(on ? f | P4_FLAG_CREATOR_FEE_PAYEE_V22 : f & ~P4_FLAG_CREATOR_FEE_PAYEE_V22 & 0xff).toBe(r.out);
          break;
        }
        case "payee_update_allowed":
          expect(P.payeeUpdateAllowedV22(k(r.admin), k(r.signer), r.current === null ? null : k(r.current), k(r.new), k(r.vaultAuthority)), JSON.stringify(r)).toBe(r.out);
          break;
        default: throw new Error(`unknown rule ${String(r.fn)}`);
      }
      n++;
    }
    expect(n).toBe(85);
    expect(FX.rules.filter((r) => r.fn === "payee_update_allowed" && r.out === true).length).toBeGreaterThan(0);
  });
});

describe("builders", () => {
  const programId = pk(), market = pk(), admin = pk(), payee = pk(), caller = pk(), mint = pk(), vaultToken = pk();
  it("tag 125: 4 accounts in handler order, flags, data", () => {
    const ix = B.buildSetCreatorFeePayeeIxV22({ programId, market, assetAdmin: admin, assetIndex: 2, marketId: 7n, payee, authorityEpoch: 3n });
    const [rec] = P.deriveCreatorFeePayeeV22(programId, market, 2);
    expect(ix.keys.map((m) => [m.pubkey.toBase58(), m.isSigner, m.isWritable])).toEqual([
      [admin.toBase58(), true, true], [market.toBase58(), false, true], [rec.toBase58(), false, true], [SystemProgram.programId.toBase58(), false, false],
    ]);
    expect(hex(ix.data)).toBe(hex(P.encodeSetCreatorFeePayeeV22({ assetIndex: 2, marketId: 7n, payee, authorityEpoch: 3n })));
  });
  it("tag 90 payee route: ATA create first, then 7 accounts with the payee ATA at [2] and the record at [6]", () => {
    const ixs = B.buildClaimCreatorFeeToPayeeIxsV22({ programId, market, caller, assetIndex: 1, payee, vaultMint: mint, vaultToken, amount: 55n, authorityEpoch: 9n });
    expect(ixs).toHaveLength(2);
    const ata = P.creatorFeePayeeDestinationV22(payee, mint);
    expect(ixs[0].programId.toBase58()).toBe(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
    expect(ixs[0].keys[1].pubkey.toBase58()).toBe(ata.toBase58());
    expect(ixs[0].keys[2].pubkey.toBase58()).toBe(payee.toBase58());
    const t = ixs[1];
    const [rec] = P.deriveCreatorFeePayeeV22(programId, market, 1);
    const [va] = deriveVaultAuthority(programId, market);
    expect(t.keys.map((m) => [m.pubkey.toBase58(), m.isSigner, m.isWritable])).toEqual([
      [caller.toBase58(), true, false], [market.toBase58(), false, true], [ata.toBase58(), false, true], [vaultToken.toBase58(), false, true],
      [va.toBase58(), false, false], [TOKEN_PROGRAM_ID.toBase58(), false, false], [rec.toBase58(), false, false],
    ]);
    expect(t.keys.length).toBe(P.WITHDRAW_CREATOR_FEE_PAYEE_ACCOUNT_INDEX_V22 + 1);
    expect(hex(t.data)).toBe(hex(encodeWithdrawCreatorFee({ amount: 55n, assetIndex: 1, authorityEpoch: 9n })));
    expect(t.data.length).toBe(27);
    expect(t.data[0]).toBe(90);
  });
  it("tag 90 payee route without the ATA create, and a zero amount is refused", () => {
    expect(B.buildClaimCreatorFeeToPayeeIxsV22({ programId, market, caller, assetIndex: 1, payee, vaultMint: mint, vaultToken, amount: 1n, authorityEpoch: 0n, createPayeeAta: false })).toHaveLength(1);
    expect(() => B.buildClaimCreatorFeeToPayeeIxsV22({ programId, market, caller, assetIndex: 1, payee, vaultMint: mint, vaultToken, amount: 0n, authorityEpoch: 0n })).toThrow(/> 0/);
  });
});

/** A synthetic v2.2 market with `n` asset slots (header stamped; everything else zero). */
function market(n: number): Uint8Array {
  const L = LAYOUT_V22;
  return stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + n * L.assetSlotStride), L.version);
}
function setAsset(d: Uint8Array, i: number, o: { admin?: PublicKey; p4?: number; pot?: bigint; epoch?: bigint }): void {
  const L = LAYOUT_V22;
  const slot = L.marketGroupOff + L.marketGroupLen + i * L.assetSlotStride;
  const v = new DataView(d.buffer);
  if (o.admin) d.set(o.admin.toBytes(), slot + FX.offsets.profileAssetAdmin);
  if (o.p4 !== undefined) d[slot + L.wrapperSlot.profileP4Flags] = o.p4;
  if (o.pot !== undefined) v.setBigUint64(slot + FX.offsets.profileCreatorFeeClaimable, o.pot, true);
  if (o.epoch !== undefined) v.setBigUint64(slot + L.wrapperSlot.controlSequences + FX.offsets.controlAuthorityEpoch, o.epoch, true);
}

describe("readCreatorFeeClaimStateV22", () => {
  it("burned admin + bit 3: route Payee, asset 0 owes its counter + the legacy pot", () => {
    const d = market(2);
    setAsset(d, 0, { p4: P4_FLAG_CREATOR_FEE_PAYEE_V22 | 1, pot: 40n, epoch: 5n });
    new DataView(d.buffer).setBigUint64(FX.offsets.headerLen + V17_CREATOR_FEE_CLAIMABLE_OFF, 2n, true);
    expect(B.readCreatorFeeClaimStateV22(d, 0)).toMatchObject({ assetIndex: 0, payeeFlag: true, route: "Payee", owed: 42n, authorityEpoch: 5n });
  });
  it("asset 1 never draws the legacy pot; live admin = AdminSigned; burned without bit = Refused", () => {
    const d = market(3);
    new DataView(d.buffer).setBigUint64(FX.offsets.headerLen + V17_CREATOR_FEE_CLAIMABLE_OFF, 1000n, true);
    const admin = pk();
    setAsset(d, 1, { admin, pot: 7n, p4: P4_FLAG_CREATOR_FEE_PAYEE_V22 });
    setAsset(d, 2, { pot: 9n, p4: P4_FLAG_INS_UNITS_REQUIRED_V22 });
    expect(B.readCreatorFeeClaimStateV22(d, 1)).toMatchObject({ route: "AdminSigned", owed: 7n, payeeFlag: true });
    expect(B.readCreatorFeeClaimStateV22(d, 1).assetAdmin.toBase58()).toBe(admin.toBase58());
    expect(B.readCreatorFeeClaimStateV22(d, 2)).toMatchObject({ route: "Refused", owed: 9n, payeeFlag: false });
    expect(() => B.readCreatorFeeClaimStateV22(d, 3)).toThrow(/not present/);
  });
});

describe("planCloseSlabAttempt with creator-fee legs", () => {
  const programId = pk(), mkt = pk(), vaultToken = pk(), closer = pk(), closerDestToken = pk(), payee = pk(), vaultMint = pk();
  const base = { programId, market: mkt, vaultToken, closer, closerDestToken, closeAuthorityEpoch: 0n, hasLpVault: false };
  const tags = (ixs: { programId: PublicKey; data: Buffer }[]): (number | string)[] =>
    ixs.map((ix) => (ix.programId.equals(programId) ? ix.data[0] : ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) ? "ata" : "?"));
  it("a payee pot is paid (ATA + tag 90 to the payee) BEFORE CloseSlab", () => {
    const ixs = planCloseSlabAttempt({ ...base, creatorFees: [{ assetIndex: 0, route: "Payee", owed: 42n, authorityEpoch: 3n, payee, vaultMint }] });
    expect(tags(ixs)).toEqual(["ata", 90, 13]);
    const t90 = ixs[1];
    expect(t90.keys[0].pubkey.toBase58()).toBe(closer.toBase58());
    expect(t90.keys[2].pubkey.toBase58()).toBe(P.creatorFeePayeeDestinationV22(payee, vaultMint).toBase58());
    expect(t90.keys[6].pubkey.toBase58()).toBe(P.deriveCreatorFeePayeeV22(programId, mkt, 0)[0].toBase58());
    expect(hex(t90.data)).toBe(hex(Uint8Array.from([90, 42, ...new Uint8Array(15), 0, 0, 3, 0, 0, 0, 0, 0, 0, 0])));
  });
  it("orders after tag 84 and handles several assets; Refused and zero pots plan nothing", () => {
    const ixs = planCloseSlabAttempt({
      ...base,
      protocolFee: { authority: pk(), destToken: pk(), authorityEpoch: 0n, owed: 1n },
      creatorFees: [
        { assetIndex: 0, route: "Payee", owed: 0n, authorityEpoch: 0n, payee, vaultMint },
        { assetIndex: 1, route: "Refused", owed: 99n, authorityEpoch: 0n },
        { assetIndex: 2, route: "Payee", owed: 5n, authorityEpoch: 0n, payee, vaultMint },
        { assetIndex: 3, route: "AdminSigned", owed: 0n, authorityEpoch: 0n },
      ],
    });
    expect(tags(ixs)).toEqual([84, "ata", 90, 13]);
  });
  it("refuses to plan CloseSlab while a live admin's pot is owed, or a payee leg lacks its keys / has a bad amount", () => {
    expect(() => planCloseSlabAttempt({ ...base, creatorFees: [{ assetIndex: 0, route: "AdminSigned", owed: 1n, authorityEpoch: 0n }] })).toThrow(/live asset_admin/);
    expect(() => planCloseSlabAttempt({ ...base, creatorFees: [{ assetIndex: 0, route: "Payee", owed: 1n, authorityEpoch: 0n }] })).toThrow(/payee and vaultMint/);
    expect(() => planCloseSlabAttempt({ ...base, creatorFees: [{ assetIndex: 0, route: "Payee", owed: 1n, authorityEpoch: 0n, payee, vaultMint, amount: 2n }] })).toThrow(/\(0, 1\]/);
  });
  it("NEGATIVE CONTROL: without creatorFees the plan is the pre-#587 one (CloseSlab only)", () => {
    expect(tags(planCloseSlabAttempt(base))).toEqual([13]);
  });
});
