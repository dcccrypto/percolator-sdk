/**
 * drift-check-killers.test.ts
 *
 * Sibling to drift-check.test.ts. Each case kills drift that drift-check.test.ts lets through
 * (mutation run J-20261124-SDK-REPORT-DRIFTCHECKTESTMUT: 31/60 killed; with this file 60/60).
 * The mutant id(s) each case kills are named in its comment.
 *
 * Where the pinned values come from:
 *   - wrapper tags: percolator-prog feat/v22-rc23-2026-10-22 @ 08361ffc, src/v16_program.rs
 *     `Instruction::decode`. 8 ClosePortfolio, 9 TopUpInsurance, 13 CloseSlab and
 *     56 TopUpInsuranceDomain have decode arms there. 7 (LiquidateAtOracle) and 11/14/105 have
 *     no arm; 36 (PushEwmaMark) and 101 (VaultLpSettleResolved) are reused, so the removed
 *     v12.x encoders on 36/56/101 would be misread, not rejected. The tag-7 pin is SDK-only.
 *   - stake tags, Deposit/Withdraw v5 lists and the "stake_pool" seed: percolator-stake
 *     release/v22-stake @ 49e27e7, src/instruction.rs (`unpack`, account docs 106..172) and
 *     src/cpi.rs (`[b"stake_pool", slab, bump]`). Rust documents account 0 as `[signer]`;
 *     the SDK marks it writable as well (it pays for the deposit PDA; QA 2026-10-15).
 *   - NFT tags and Mint/Burn/EmergencyBurn flags: percolator-nft main @ ba73df7,
 *     src/instruction.rs (TAG_* consts, account docs 17..113).
 *   - V12_1 slab offsets and sizes are SDK-only (src/solana/slab.ts layout derivation);
 *     the legacy v12.1 engine source was not re-read for this file.
 */
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  IX_TAG,
  encodeUnresolveMarket,
  encodeSetRiskThreshold,
  encodeUpdateConfig,
  encodePauseMarket,
  encodeExecuteAdl,
  encodeTradeCpiV2,
} from "../src/abi/instructions.js";
import {
  STAKE_IX,
  STAKE_PROGRAM_IDS,
  deriveStakePool,
  getStakeProgramId,
  encodeStakeAdminSetOracleAuthority,
  encodeStakeAdminResolveMarket,
} from "../src/solana/stake.js";
import { ACCOUNTS_STAKE_DEPOSIT_V5, ACCOUNTS_STAKE_WITHDRAW_V5 } from "../src/abi/v22-stake.js";
import {
  NFT_IX_TAG,
  ACCOUNTS_NFT_MINT,
  ACCOUNTS_NFT_BURN,
  ACCOUNTS_NFT_EMERGENCY_BURN,
} from "../src/abi/nft.js";
import {
  detectSlabLayout,
  parseAccount,
  SLAB_TIERS_V12_1,
  SLAB_TIERS_V12_15,
} from "../src/solana/slab.js";
import { parseEngineLight } from "../src/solana/discovery.js";

describe("killers: instructions", () => {
  // I04-I08: every other removed wrapper encoder must throw and name its dead tag.
  it.each([
    ["UnresolveMarket", () => encodeUnresolveMarket({ confirmation: "1" }), 36],
    ["SetRiskThreshold", () => encodeSetRiskThreshold({ newThreshold: "1" }), 11],
    ["UpdateConfig", () => encodeUpdateConfig({} as never), 14],
    // tag 56 is TopUpInsuranceDomain in v2.2: serializing it is misread, not rejected
    ["PauseMarket", () => encodePauseMarket(), 56],
    ["ExecuteAdl", () => encodeExecuteAdl({ targetIdx: 0 } as never), 101],
  ])("%s throws instead of serializing tag %#", (_n, fn, tag) => {
    expect(fn).toThrow(new RegExp(`\\(tag ${tag}\\)`));
  });

  // I18: a renamed export makes the import undefined, and calling undefined throws a TypeError
  // that drift-check's bare `.toThrow()` accepts. Pin the export AND the guard message.
  it("encodeTradeCpiV2 is still exported and throws its own tag-105 refusal", () => {
    expect(typeof encodeTradeCpiV2).toBe("function");
    expect(() => encodeTradeCpiV2({ lpIdx: 1, userIdx: 2, size: "3", bump: 4 })).toThrow(/\(tag 105\)/);
  });

  // I12-I15: retained core tags not pinned in drift-check.
  it("retained core tags 7/8/9/13", () => {
    expect(IX_TAG.LiquidateAtOracle).toBe(7);
    expect(IX_TAG.ClosePortfolio).toBe(8);
    expect(IX_TAG.CloseAccount).toBe(8);
    expect(IX_TAG.TopUpInsurance).toBe(9);
    expect(IX_TAG.CloseSlab).toBe(13);
  });
});

describe("killers: stake", () => {
  // S03 (+ the full adopted-lineage map)
  it("STAKE_IX adopted-lineage core tags", () => {
    expect(STAKE_IX).toMatchObject({
      InitPool: 0, Deposit: 1, Withdraw: 2, FlushToInsurance: 3, UpdateConfig: 4,
      ProposeAdmin: 5, AcceptAdmin: 6, ProposeCooldownIncrease: 7,
      CommitCooldownIncrease: 8, CancelCooldownIncrease: 9, ReturnInsurance: 10,
      SetMarketResolved: 18,
    });
  });

  // S05/S06: legacy admin encoders whose tags were reused must keep throwing.
  it("legacy admin encoders on reused tags 6/9 throw", () => {
    expect(() => encodeStakeAdminSetOracleAuthority(PublicKey.unique())).toThrow(/tag 6/);
    expect(() => encodeStakeAdminResolveMarket()).toThrow(/tag 9/);
  });

  // S08: pool PDA seed.
  it("deriveStakePool uses the 'stake_pool' seed", () => {
    const slab = PublicKey.unique();
    const pid = new PublicKey(STAKE_PROGRAM_IDS.devnet);
    const [expected] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("stake_pool"), slab.toBytes()], pid);
    expect(deriveStakePool(slab, pid)[0].equals(expected)).toBe(true);
  });

  // S09/S10: v5 FIRST_LOSS account lists (14 each) — count, order and flags.
  const shape = (l: readonly { name: string; signer: boolean; writable: boolean }[]) =>
    l.map((a) => `${a.name}:${a.signer ? "s" : ""}${a.writable ? "w" : ""}`);
  it("ACCOUNTS_STAKE_DEPOSIT_V5 is the 14-account FIRST_LOSS list", () => {
    expect(shape(ACCOUNTS_STAKE_DEPOSIT_V5)).toEqual([
      "user:sw", "pool:w", "userCollateral:w", "vault:w", "lpMint:w", "userLp:w",
      "vaultAuthority:", "deposit:w", "tokenProgram:", "clock:", "systemProgram:",
      "market:w", "insuranceUnits:w", "wrapperProgram:",
    ]);
  });
  it("ACCOUNTS_STAKE_WITHDRAW_V5 is the 14-account FIRST_LOSS list", () => {
    expect(shape(ACCOUNTS_STAKE_WITHDRAW_V5)).toEqual([
      "user:sw", "pool:w", "userLp:w", "lpMint:w", "vault:w", "userCollateral:w",
      "vaultAuthority:", "deposit:w", "tokenProgram:", "clock:", "market:w",
      "insuranceUnits:w", "wrapperProgram:", "systemProgram:",
    ]);
  });

  // S12: unlisted env override is refused (#308).
  it("an unlisted STAKE_PROGRAM_ID override throws", () => {
    const saved = process.env.STAKE_PROGRAM_ID;
    const savedAllow = process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    process.env.STAKE_PROGRAM_ID = PublicKey.unique().toBase58();
    delete process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE;
    try {
      expect(() => getStakeProgramId()).toThrow(/not a known stake program/);
    } finally {
      if (saved === undefined) delete process.env.STAKE_PROGRAM_ID; else process.env.STAKE_PROGRAM_ID = saved;
      if (savedAllow !== undefined) process.env.PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE = savedAllow;
    }
  });
});

describe("killers: nft", () => {
  // N02/N03/N05/N06: full flag tables, not just accounts 0/2/7.
  it("MintPositionNft / Burn / EmergencyBurn flag tables", () => {
    expect([...ACCOUNTS_NFT_MINT]).toEqual(["sw", "w", "sw", "w", "w", "r", "r", "r", "r", "w", "r", "r"]);
    expect([...ACCOUNTS_NFT_BURN]).toEqual(["sw", "w", "w", "w", "w", "r", "r", "w", "r", "r"]);
    expect([...ACCOUNTS_NFT_EMERGENCY_BURN]).toEqual(["sw", "w", "w", "w", "w", "r", "r", "w", "r", "r"]);
  });

  // N09/N10: NFT program tag map.
  it("NFT_IX_TAG matches percolator-nft instruction.rs", () => {
    expect({ ...NFT_IX_TAG }).toEqual({
      MintPositionNft: 0, BurnPositionNft: 1, SettleFunding: 2, GetPositionValue: 3,
      ExecuteTransferHook: 4, EmergencyBurn: 5, RepairExtraMetas: 6, ReconcileBurnedNft: 7,
    });
  });
});

describe("killers: slab", () => {
  // L09/L10/L13: V12_1 account fields the drift-check builder never asserts.
  it("V12_1 small parseAccount reads matcherProgram@144, feeCredits@240, positionSize@88", () => {
    const layout = detectSlabLayout(84152)!;
    const buf = new Uint8Array(84152);
    const dv = new DataView(buf.buffer);
    dv.setBigUint64(layout.engineOff + layout.engineBitmapOff, 1n, true);
    const a = layout.accountsOff;
    for (let i = 0; i < 32; i++) buf[a + 144 + i] = 0xcd;
    dv.setBigInt64(a + 240, 4242n, true);
    dv.setBigInt64(a + 88, -77n, true);
    dv.setBigInt64(a + 96, -1n, true); // sign-extend the i128
    const acct = parseAccount(buf, 0);
    expect(acct.matcherProgram.toBytes().every((b) => b === 0xcd)).toBe(true);
    expect(acct.feeCredits).toBe(4242n);
    expect(acct.positionSize).toBe(-77n);
  });

  // L12: all four V12_1 tiers, not just small/medium.
  it("SLAB_TIERS_V12_1 micro/large sizes", () => {
    expect(SLAB_TIERS_V12_1.micro.maxAccounts).toBe(64);
    expect(SLAB_TIERS_V12_1.micro.dataSize).toBe(22304);
    expect(SLAB_TIERS_V12_1.large.maxAccounts).toBe(4096);
    expect(SLAB_TIERS_V12_1.large.dataSize).toBe(1321112);
  });

  // L11: the deployed SBF V12_1 layout (engineOff 616), not only the host one.
  it("V12_1 SBF small (73448 B) detects engineOff=616, accountSize=280, bitmap=584", () => {
    const l = detectSlabLayout(73448)!;
    expect(l.engineOff).toBe(616);
    expect(l.accountSize).toBe(280);
    expect(l.engineBitmapOff).toBe(584);
    expect(l.maxAccounts).toBe(256);
  });

  // L14: emergencyOiMode is guarded like every other absent field.
  it("V12_15: absent emergencyOiMode reads false with the pre-engine byte poisoned", () => {
    const size = SLAB_TIERS_V12_15.micro.dataSize;
    const l = detectSlabLayout(size)!;
    expect(l.engineEmergencyOiModeOff).toBe(-1);
    const buf = new Uint8Array(size);
    buf[l.engineOff - 1] = 1;
    expect(parseEngineLight(buf, l, l.maxAccounts).emergencyOiMode).toBe(false);
  });
});
