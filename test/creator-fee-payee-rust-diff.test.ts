/**
 * Differential test: the creator-fee PAYEE money path (tag 125 `SetCreatorFeePayee`, the permissionless tag 90 claim to
 * the payee, and `readCreatorFeeClaimStateV22`) against the Rust it mirrors, row by row.
 *
 * Rust source read for every row: percolator-prog `feat/v22-rc23-2026-10-22` @ 4a5065f5a78a246ed6ece69aef32a13c3aca2bad
 *   - `src/creator_fee_payee_v22.rs`  (quoted as `cfp.rs:LINE`)
 *   - `src/v16_program.rs`            (quoted as `v16.rs:LINE`)
 *
 * Every expectation here is written from the Rust, not from the SDK: PDAs and ATAs are derived from literal seeds,
 * account flags come from the handler's `expect_signer` / `expect_writable` calls, and the claim-sum and grace rules are
 * re-implemented from the quoted lines. No cargo is run; this pins the SDK to the source text.
 */
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as P from "../src/abi/creator-fee-payee-v22.js";
import * as B from "../src/solana/creator-fee-payee-v22.js";
import { LAYOUT_V22 } from "../src/abi/layout.js";
import { stampMarket } from "./helpers/stamp.js";

const pk = (): PublicKey => Keypair.generate().publicKey;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

// Literal Rust ids (independent of the SDK constants).
const SPL_TOKEN_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"); // spl_token::ID
const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"); // ASSOCIATED_TOKEN_PROGRAM_ID

/** v16.rs:7922-7931 `derive_creator_fee_payee`: `[CREATOR_FEE_PAYEE_SEED, market, asset_index.to_le_bytes()]`. */
function rustPayeePda(programId: PublicKey, market: PublicKey, assetIndex: number): [PublicKey, number] {
  const le = Buffer.alloc(2);
  le.writeUInt16LE(assetIndex, 0);
  // cfp.rs:19 `CREATOR_FEE_PAYEE_SEED: &[u8] = b"creator_fee_payee"`
  return PublicKey.findProgramAddressSync([Buffer.from("creator_fee_payee", "utf8"), market.toBuffer(), le], programId);
}
/** v16.rs:50382-50384 `derive_vault_authority`: `[b"vault", market]`. */
const rustVaultAuthority = (programId: PublicKey, market: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], programId)[0];
/** v16.rs:50447-50457 `canonical_vault_address(owner, mint)`: `[owner, spl_token::ID, mint]` under the ATA program. */
const rustCanonicalAta = (owner: PublicKey, mint: PublicKey): PublicKey =>
  PublicKey.findProgramAddressSync([owner.toBuffer(), SPL_TOKEN_ID.toBuffer(), mint.toBuffer()], ATA_PROGRAM_ID)[0];

// ============================================================================
// Row 1: PDA seeds
// ============================================================================

describe("row 1: payee PDA seeds = ['creator_fee_payee', market, asset_index u16 LE] (cfp.rs:18-19, v16.rs:7922-7931)", () => {
  const programId = pk();
  const market = pk();
  it("cfp.rs:19 seed bytes are exactly b\"creator_fee_payee\"", () => {
    expect(P.CREATOR_FEE_PAYEE_SEED_V22).toBe("creator_fee_payee");
  });
  // u16 LE: 0x0100 distinguishes LE from BE, 0xffff is the u16 top.
  for (const assetIndex of [0, 1, 2, 255, 256, 0x0102, 0xffff]) {
    it(`v16.rs:7929-7931 asset ${assetIndex}: SDK derive == Rust seeds (key and bump)`, () => {
      const [rk, rb] = rustPayeePda(programId, market, assetIndex);
      const [sk, sb] = P.deriveCreatorFeePayeeV22(programId, market, assetIndex);
      expect(sk.toBase58()).toBe(rk.toBase58());
      expect(sb).toBe(rb);
    });
  }
  it("v16.rs:7931 asset_index is LITTLE endian (BE bytes give a different PDA for 0x0102)", () => {
    const be = PublicKey.findProgramAddressSync([Buffer.from("creator_fee_payee"), market.toBuffer(), Buffer.from([0x01, 0x02])], programId)[0];
    expect(P.deriveCreatorFeePayeeV22(programId, market, 0x0102)[0].toBase58()).not.toBe(be.toBase58());
  });
  it("v16.rs:7925 asset_index is a u16: the SDK refuses 65536 and -1 instead of wrapping", () => {
    expect(() => P.deriveCreatorFeePayeeV22(programId, market, 0x1_0000)).toThrow(/u16/);
    expect(() => P.deriveCreatorFeePayeeV22(programId, market, -1)).toThrow(/u16/);
  });
});

// ============================================================================
// Row 2: tag 125 accounts and data
// ============================================================================

describe("row 2: tag 125 SetCreatorFeePayee accounts and wire (v16.rs:24494-24599, v16.rs:10722-10727)", () => {
  const programId = pk(), market = pk(), assetAdmin = pk(), payee = pk();
  const ix = B.buildSetCreatorFeePayeeIxV22({ programId, market, assetAdmin, assetIndex: 3, marketId: 0x1122_3344_5566_7788n, payee, authorityEpoch: 9n });
  const flags = ix.keys.map((k) => [k.isSigner, k.isWritable]);

  it("v16.rs:24502-24505 exactly 4 accounts: admin, market, payee record, system program", () => {
    expect(ix.keys).toHaveLength(4);
    expect(ix.programId.toBase58()).toBe(programId.toBase58());
  });
  it("[0] admin: v16.rs:24506 expect_signer(admin); v16.rs:24570 expect_writable(admin) when the record is fresh (rent payer)", () => {
    expect(ix.keys[0].pubkey.toBase58()).toBe(assetAdmin.toBase58());
    expect(flags[0]).toEqual([true, true]);
  });
  it("[1] market: v16.rs:24507 expect_writable(market_ai); not a signer", () => {
    expect(ix.keys[1].pubkey.toBase58()).toBe(market.toBase58());
    expect(flags[1]).toEqual([false, true]);
  });
  it("[2] payee record: v16.rs:24508 expect_writable(payee_ai); v16.rs:24513-24516 key must be derive_creator_fee_payee(market, asset_index)", () => {
    expect(ix.keys[2].pubkey.toBase58()).toBe(rustPayeePda(programId, market, 3)[0].toBase58());
    expect(flags[2]).toEqual([false, true]);
  });
  it("[3] system program: v16.rs:24510 key == system_program::ID; read-only", () => {
    expect(ix.keys[3].pubkey.toBase58()).toBe(SystemProgram.programId.toBase58());
    expect(flags[3]).toEqual([false, false]);
  });
  it("v16.rs:10722-10727 / 11787-11791 data = [125][asset_index u16][market_id u64][payee 32][authority_epoch u64] LE (51 bytes)", () => {
    const d = Buffer.from(ix.data);
    expect(d.length).toBe(51);
    expect(d[0]).toBe(125); // v16.rs:676 TAG_SET_CREATOR_FEE_PAYEE = 125
    expect(d.readUInt16LE(1)).toBe(3);
    expect(d.readBigUInt64LE(3)).toBe(0x1122_3344_5566_7788n);
    expect(new PublicKey(d.subarray(11, 43)).toBase58()).toBe(payee.toBase58());
    expect(d.readBigUInt64LE(43)).toBe(9n);
  });
});

// ============================================================================
// Row 3: tag 90 to the payee, accounts and data
// ============================================================================

describe("row 3: tag 90 payee route accounts and wire (v16.rs:24251-24338, v16.rs:24466-24481, v16.rs:10728-10732)", () => {
  const programId = pk(), market = pk(), caller = pk(), payee = pk(), vaultMint = pk(), vaultToken = pk();
  const ixs = B.buildClaimCreatorFeeToPayeeIxsV22({ programId, market, caller, assetIndex: 2, payee, vaultMint, vaultToken, amount: 77n, authorityEpoch: 4n });
  const ix = ixs[ixs.length - 1];
  const flags = ix.keys.map((k) => [k.isSigner, k.isWritable]);

  it("v16.rs:24258-24263 + 24335 exactly 7 accounts on the payee route ([6] read via account(accounts, 6))", () => {
    expect(ix.keys).toHaveLength(7);
    expect(P.WITHDRAW_CREATOR_FEE_PAYEE_ACCOUNT_INDEX_V22).toBe(6);
  });
  it("[0] caller: v16.rs:24264 expect_signer(authority) only (no expect_writable; the payee route is permissionless, v16.rs:24331)", () => {
    expect(ix.keys[0].pubkey.toBase58()).toBe(caller.toBase58());
    expect(flags[0]).toEqual([true, false]);
  });
  it("[1] market: v16.rs:24265 expect_writable(market_ai)", () => {
    expect(ix.keys[1].pubkey.toBase58()).toBe(market.toBase58());
    expect(flags[1]).toEqual([false, true]);
  });
  it("[2] payee token: v16.rs:24266 expect_writable(dest_token); v16.rs:24375 key == canonical_vault_address(payee, mint)", () => {
    expect(ix.keys[2].pubkey.toBase58()).toBe(rustCanonicalAta(payee, vaultMint).toBase58());
    expect(flags[2]).toEqual([false, true]);
  });
  it("[3] vault token: v16.rs:24267 expect_writable(vault_token)", () => {
    expect(ix.keys[3].pubkey.toBase58()).toBe(vaultToken.toBase58());
    expect(flags[3]).toEqual([false, true]);
  });
  it("[4] vault authority: v16.rs:24271-24272 expect_key(derive_vault_authority = ['vault', market]); read-only signer-by-seeds (v16.rs:24452)", () => {
    expect(ix.keys[4].pubkey.toBase58()).toBe(rustVaultAuthority(programId, market).toBase58());
    expect(flags[4]).toEqual([false, false]);
  });
  it("[5] token program: v16.rs:24269 / 50499 verify_token_program requires spl_token::ID (classic)", () => {
    expect(ix.keys[5].pubkey.toBase58()).toBe(SPL_TOKEN_ID.toBase58());
    expect(flags[5]).toEqual([false, false]);
  });
  it("[6] payee record: v16.rs:24472-24473 key == derive_creator_fee_payee(market, asset_index); v16.rs:24476 read only (try_borrow_data)", () => {
    expect(ix.keys[6].pubkey.toBase58()).toBe(rustPayeePda(programId, market, 2)[0].toBase58());
    expect(flags[6]).toEqual([false, false]);
  });
  it("v16.rs:10728-10732 data = [90][amount u128][asset_index u16][authority_epoch u64] LE (27 bytes)", () => {
    const d = Buffer.from(ix.data);
    expect(d.length).toBe(27);
    expect(d[0]).toBe(90);
    expect(d.readBigUInt64LE(1) + (d.readBigUInt64LE(9) << 64n)).toBe(77n);
    expect(d.readUInt16LE(17)).toBe(2);
    expect(d.readBigUInt64LE(19)).toBe(4n);
  });
  it("the ATA pre-create (default on) creates exactly the canonical ATA of v16.rs:50447-50457 under classic SPL Token", () => {
    expect(ixs).toHaveLength(2);
    const ata = ixs[0];
    expect(ata.programId.toBase58()).toBe(ATA_PROGRAM_ID.toBase58());
    expect(ata.keys[1].pubkey.toBase58()).toBe(rustCanonicalAta(payee, vaultMint).toBase58());
    expect(ata.keys[2].pubkey.toBase58()).toBe(payee.toBase58());
    expect(ata.keys[3].pubkey.toBase58()).toBe(vaultMint.toBase58());
    expect(ata.keys.some((k) => k.pubkey.equals(SPL_TOKEN_ID))).toBe(true);
  });
});

// ============================================================================
// Row 4: zero amount
// ============================================================================

describe("row 4: zero-amount boundary (v16.rs:24384-24386 `if amount == 0 { InvalidInstruction }`, cfp.rs:175-177)", () => {
  const base = { programId: pk(), market: pk(), caller: pk(), assetIndex: 0, payee: pk(), vaultMint: pk(), vaultToken: pk(), authorityEpoch: 0n };
  it("amount 0 is refused by the builder (Rust refuses it on chain)", () => {
    expect(() => B.buildClaimCreatorFeeToPayeeIxsV22({ ...base, amount: 0n })).toThrow(/> 0/);
  });
  it("amount 1 (smallest Rust-accepted claim) builds", () => {
    expect(B.buildClaimCreatorFeeToPayeeIxsV22({ ...base, amount: 1n, createPayeeAta: false })).toHaveLength(1);
  });
  it("amount -1 is refused (no u128 encoding exists for it; v16.rs:10729 read_u128)", () => {
    expect(() => B.buildClaimCreatorFeeToPayeeIxsV22({ ...base, amount: -1n })).toThrow();
  });
});

// ============================================================================
// Row 5: P4 flag bit
// ============================================================================

describe("row 5: payee flag = p4_flags bit 3 at profile byte +20 (cfp.rs:25, cfp.rs:38-41, v16.rs:844-845, v16.rs:4822-4824)", () => {
  it("cfp.rs:25 P4_FLAG_CREATOR_FEE_PAYEE = 1 << 3", () => {
    expect(P.hasCreatorFeePayeeFlagV22(1 << 3)).toBe(true);
  });
  it("cfp.rs:39-41 has_payee_bit(f) == (f & 8 != 0) for every byte value", () => {
    for (let f = 0; f < 256; f++) expect(P.hasCreatorFeePayeeFlagV22(f)).toBe((f & 8) !== 0);
  });
  it("v16.rs:844-845 profile byte +20 (_padding0[PROFILE_P4_FLAGS_IDX = 1]) is the byte the reader looks at", () => {
    expect(LAYOUT_V22.wrapperSlot.profileP4Flags).toBe(20);
    const d = market(1);
    d[slotOff(0) + LAYOUT_V22.wrapperSlot.oracleProfile + 20] = 0b1111_0111; // every bit but 3 (cfp.rs:257)
    expect(B.readCreatorFeeClaimStateV22(d, 0).payeeFlag).toBe(false);
    d[slotOff(0) + LAYOUT_V22.wrapperSlot.oracleProfile + 20] = 0b0000_1000;
    expect(B.readCreatorFeeClaimStateV22(d, 0).payeeFlag).toBe(true);
  });
  it("cfp.rs:91-99 claim_route: live admin -> AdminSigned, burned + bit -> Payee, burned no bit -> Refused", () => {
    const d = market(1);
    setAsset(d, 0, { p4: 8 });
    expect(B.readCreatorFeeClaimStateV22(d, 0).route).toBe("Payee");
    setAsset(d, 0, { p4: 0 });
    expect(B.readCreatorFeeClaimStateV22(d, 0).route).toBe("Refused");
    setAsset(d, 0, { admin: pk(), p4: 8 });
    expect(B.readCreatorFeeClaimStateV22(d, 0).route).toBe("AdminSigned");
  });
});

// ============================================================================
// Row 6: claimable sum per asset
// ============================================================================

/** v16.rs:24401-24408: `claimable = profile.creator_fee_claimable_atoms + (asset_index == 0 ? cfg.creator_fee_claimable_atoms : 0)` in u128. */
const rustClaimable = (assetIndex: number, assetPot: bigint, legacy: bigint): bigint => assetPot + (assetIndex === 0 ? legacy : 0n);

describe("row 6: claimable = asset counter + legacy WrapperConfig counter for asset 0 ONLY (v16.rs:24401-24411)", () => {
  // Asset 0 with legacy only, asset only, both; assets 1 and 2 never add it; u64::MAX + u64::MAX does not wrap (u128, v16.rs:24406-24408).
  const cases: Array<[number, bigint, bigint]> = [
    [0, 0n, 0n], [0, 0n, 5n], [0, 7n, 0n], [0, 40n, 2n], [0, U64_MAX, U64_MAX],
    [1, 0n, 1000n], [1, 7n, 1000n], [2, 9n, U64_MAX], [2, U64_MAX, U64_MAX],
  ];
  for (const [i, pot, legacy] of cases) {
    it(`asset ${i}, asset pot ${pot}, legacy ${legacy}: owed == Rust claimable ${rustClaimable(i, pot, legacy)}`, () => {
      const d = market(3);
      setLegacy(d, legacy);
      setAsset(d, i, { pot });
      expect(B.readCreatorFeeClaimStateV22(d, i).owed).toBe(rustClaimable(i, pot, legacy));
    });
  }
  it("v16.rs:2785 + 2832 legacy WrapperConfig.creator_fee_claimable_atoms sits at 568..576, after HEADER_LEN = 16 (v16.rs:133)", () => {
    const d = market(1);
    new DataView(d.buffer).setBigUint64(16 + 568, 123n, true);
    expect(B.readCreatorFeeClaimStateV22(d, 0).owed).toBe(123n);
  });
  it("v16.rs:2907 AssetOracleProfileV16.creator_fee_claimable_atoms is the u64 at profile +400", () => {
    const d = market(2);
    new DataView(d.buffer).setBigUint64(slotOff(1) + LAYOUT_V22.wrapperSlot.oracleProfile + 400, 321n, true);
    expect(B.readCreatorFeeClaimStateV22(d, 1).owed).toBe(321n);
  });
  it("v16.rs:24409-24411 `amount > claimable` is CreatorFeeOverClaim: `owed` equals the claimable sum Rust compares amount against (10 + 5, cfp.rs:244-247)", () => {
    const d = market(1);
    setLegacy(d, 5n);
    setAsset(d, 0, { pot: 10n });
    expect(B.readCreatorFeeClaimStateV22(d, 0).owed).toBe(15n);
  });
});

// ============================================================================
// Row 7: grace boundary
// ============================================================================

describe("row 7: grace = Resolved && now >= resolved_slot + 7*216,000 (cfp.rs:133, cfp.rs:142-147, v16.rs:25820-25824)", () => {
  const G = 7n * 216_000n; // cfp.rs:133
  it("cfp.rs:133 CREATOR_PAYEE_GRACE_SLOTS = 7 * 216_000 = 1,512,000", () => {
    expect(P.CREATOR_PAYEE_GRACE_SLOTS_V22).toBe(G);
    expect(G).toBe(1_512_000n);
  });
  const R = 1_000n;
  const rows: Array<[string, bigint, boolean]> = [
    ["resolved_slot + grace - 1 (cfp.rs:234 'end - 1 refused')", R + G - 1n, false],
    ["resolved_slot + grace exactly (cfp.rs:235 'end allowed', `now >= end`)", R + G, true],
    ["resolved_slot + grace + 1", R + G + 1n, true],
  ];
  for (const [what, now, over] of rows) {
    it(`pure rule and market reader agree: ${what} -> ${over}`, () => {
      expect(P.payeeGraceElapsedV22(true, R, now)).toBe(over);
      const d = market(1);
      setGroup(d, 1, R);
      expect(B.readCreatorFeeClaimStateV22(d, 0, now)).toMatchObject({ resolved: true, resolvedSlot: R, payeeGraceOver: over });
    });
  }
  it("cfp.rs:144 `resolved &&`: a Live market (mode 0) never elapses, even at u64::MAX", () => {
    const d = market(1);
    setGroup(d, 0, R);
    expect(B.readCreatorFeeClaimStateV22(d, 0, U64_MAX)).toMatchObject({ resolved: false, payeeGraceOver: false });
  });
  for (const mode of [2, 255]) {
    it(`v16.rs:25821 \`group.header.mode == 1\`: mode ${mode} is not Resolved, never elapses at u64::MAX`, () => {
      const d = market(1);
      setGroup(d, mode, R);
      expect(B.readCreatorFeeClaimStateV22(d, 0, U64_MAX)).toMatchObject({ resolved: false, payeeGraceOver: false });
    });
  }
  it("cfp.rs:145 / v16.rs:25823 no Clock (None) never elapses: the reader with no slot", () => {
    const d = market(1);
    setGroup(d, 1, R);
    expect(B.readCreatorFeeClaimStateV22(d, 0).payeeGraceOver).toBe(false);
  });
  it("cfp.rs:143 checked_add: end == u64::MAX elapses at u64::MAX; end overflowing u64 never elapses (cfp.rs:239)", () => {
    expect(P.payeeGraceElapsedV22(true, U64_MAX - G, U64_MAX)).toBe(true);
    expect(P.payeeGraceElapsedV22(true, U64_MAX - G + 1n, U64_MAX)).toBe(false);
    expect(P.payeeGraceElapsedV22(true, U64_MAX - 1n, U64_MAX)).toBe(false);
  });
  it("cfp.rs:155-167 creator_pot_orphaned at the boundary: Payee pot kept at end - 1, re-booked at end; zero pot never", () => {
    const d = market(1);
    setGroup(d, 1, R);
    setAsset(d, 0, { p4: 8, pot: 1n });
    const at = (now: bigint): boolean => {
      const s = B.readCreatorFeeClaimStateV22(d, 0, now);
      return P.creatorPotOrphanedV22(s.assetAdmin, s.payeeFlag, s.owed, s.payeeGraceOver);
    };
    expect(at(R + G - 1n)).toBe(false);
    expect(at(R + G)).toBe(true);
    setAsset(d, 0, { pot: 0n });
    expect(at(R + G + 1n)).toBe(false);
  });
});

// ============================================================================
// Synthetic market helpers (offsets quoted above; layout from LAYOUT_V22)
// ============================================================================

function market(n: number): Uint8Array {
  const L = LAYOUT_V22;
  return stampMarket(new Uint8Array(L.marketGroupOff + L.marketGroupLen + n * L.assetSlotStride), L.version);
}
function slotOff(i: number): number {
  return LAYOUT_V22.marketGroupOff + LAYOUT_V22.marketGroupLen + i * LAYOUT_V22.assetSlotStride;
}
function setAsset(d: Uint8Array, i: number, o: { admin?: PublicKey; p4?: number; pot?: bigint }): void {
  const prof = slotOff(i) + LAYOUT_V22.wrapperSlot.oracleProfile;
  if (o.admin) d.set(o.admin.toBytes(), prof + 368); // v16.rs:2883 AssetOracleProfileV16.asset_admin @368
  if (o.p4 !== undefined) d[prof + 20] = o.p4; // v16.rs:844 profile byte +20
  if (o.pot !== undefined) new DataView(d.buffer).setBigUint64(prof + 400, o.pot, true); // v16.rs:2907 u64 @400
}
function setLegacy(d: Uint8Array, v: bigint): void {
  new DataView(d.buffer).setBigUint64(16 + 568, v, true); // v16.rs:133 HEADER_LEN + v16.rs:2785 WrapperConfig 568..576
}
/**
 * Engine `MarketGroupV16HeaderAccount` (percolator engine 2f05df8c src/v16.rs:9254, fields `mode: u8` :9295 and
 * `resolved_slot: V16PodU64` :9296): rustc `offset_of!` = 674 / 675, as emitted by
 * scripts/creator-fee-payee-parity/sdk_587_parity.rs:89 into test/fixtures/creator-fee-payee-parity.json `groupOffsets`.
 * Literals here, not the SDK constants, so a wrong SDK offset fails this file.
 */
const GROUP_MODE_OFF = 674;
const GROUP_RESOLVED_SLOT_OFF = 675;
function setGroup(d: Uint8Array, mode: number, resolvedSlot: bigint): void {
  d[LAYOUT_V22.marketGroupOff + GROUP_MODE_OFF] = mode;
  new DataView(d.buffer).setBigUint64(LAYOUT_V22.marketGroupOff + GROUP_RESOLVED_SLOT_OFF, resolvedSlot, true);
}
