/**
 * Differential pin: src/abi/nft.ts instruction wire + account lists + PDA seeds vs the
 * percolator-nft Rust program.
 *
 * Source of truth: dcccrypto/percolator-nft main @ ba73df722273fd896aa1a2c609ba775a079a1d61
 * (read with `gh api .../contents/src/<file>.rs?ref=<sha>`; no cargo). Every row below carries
 * the Rust file:line it was transcribed from. The table is written out literally (NOT derived
 * from NFT_IX_TAG / ACCOUNTS_NFT_*), so a drift on either side fails here.
 *
 * Flags: "signer"/"writable" in the table are what the Rust handler REQUIRES — either an explicit
 * `is_signer` / `is_writable` guard, or an inner CPI/lamport move that needs it (cited per row).
 *
 * Tags  — src/instruction.rs:37,56,70,88,95,116,155,169; unpack src/instruction.rs:197-260.
 * Data  — Mint: tag + asset_index u16 LE, exactly 3 bytes (instruction.rs:214-221);
 *         Burn/SettleFunding/EmergencyBurn/Reconcile/Repair: tag only, trailing bytes rejected
 *         (instruction.rs:222-257).
 * Seeds — position_nft: state_v16.rs:34,130-145 ["position_nft", portfolio, market_id u64 LE];
 *         mint_authority: state_v16.rs:37,148-150 ["mint_authority"];
 *         extra-account-metas: transfer_hook.rs:68,71-73 ["extra-account-metas", mint];
 *         nft_registry (under the WRAPPER id): cpi_v16.rs:60,71-76 ["nft_registry", market_group].
 */
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ACCOUNTS_NFT_BURN,
  ACCOUNTS_NFT_EMERGENCY_BURN,
  ACCOUNTS_NFT_MINT,
  ACCOUNTS_NFT_RECONCILE,
  NFT_IX_TAG,
  NFT_PROGRAM_ID,
  buildNftAccountMetas,
  deriveExtraAccountMetas,
  deriveMintAuthority,
  deriveNftMint,
  deriveNftPda,
  encodeNftBurn,
  encodeNftEmergencyBurn,
  encodeNftMint,
  encodeNftReconcile,
  encodeNftSettleFunding,
} from "../src/abi/nft.js";
import { deriveNftRegistry } from "../src/solana/pda.js";

type Row = { name: string; signer: boolean; writable: boolean; rust: string };
const r = (name: string, signer: boolean, writable: boolean, rust: string): Row => ({ name, signer, writable, rust });

// ── Tags (src/instruction.rs) ─────────────────────────────────────────────────
const RUST_TAGS: Record<keyof typeof NFT_IX_TAG, [number, string]> = {
  MintPositionNft: [0, "instruction.rs:37"],
  BurnPositionNft: [1, "instruction.rs:56"],
  SettleFunding: [2, "instruction.rs:70"],
  GetPositionValue: [3, "instruction.rs:88"],
  ExecuteTransferHook: [4, "instruction.rs:95"],
  EmergencyBurn: [5, "instruction.rs:116"],
  RepairExtraMetas: [6, "instruction.rs:155"],
  ReconcileBurnedNft: [7, "instruction.rs:169"],
};

// ── Account tables (processor.rs handlers) ───────────────────────────────────
// MintPositionNft — process_mint_position_nft, processor.rs:298-316 (order), docs instruction.rs:16-34.
const RUST_MINT: Row[] = [
  r("owner", true, true, "processor.rs:305,333 is_signer; pays PositionNft PDA rent (processor.rs:459-460)"),
  r("nft_pda", false, true, "processor.rs:306,338 is_writable"),
  r("nft_mint", true, true, "processor.rs:307,341 is_writable; 435 is_signer (fresh keypair)"),
  r("owner_ata", false, true, "processor.rs:308,344 is_writable"),
  r("portfolio", false, true, "processor.rs:309; B-3 escrow CPI AccountMeta::new(portfolio) processor.rs:61"),
  r("mint_auth", false, false, "processor.rs:310,447 PDA check; CPI signer via invoke_signed (readonly, processor.rs:60)"),
  r("token_program", false, false, "processor.rs:311,319 key == TOKEN_2022"),
  r("ata_program", false, false, "processor.rs:312,323 key == ATA program"),
  r("system_program", false, false, "processor.rs:313,327 key == system"),
  r("extra_metas", false, true, "processor.rs:314; created by invoke_signed processor.rs:684-704"),
  r("nft_registry", false, false, "processor.rs:315,415 validate_nft_registry; CPI new_readonly processor.rs:62"),
  r("percolator_prog", false, false, "processor.rs:316; CPI program_id processor.rs:58"),
];

// BurnPositionNft — process_burn_position_nft, processor.rs:953-965, docs instruction.rs:43-53.
const RUST_BURN: Row[] = [
  r("holder", true, true, "processor.rs:956,967 is_signer; 971 require_writable_rent_recipient"),
  r("nft_pda", false, true, "processor.rs:957,973 is_writable"),
  r("nft_mint", false, true, "processor.rs:958,976 is_writable"),
  r("holder_ata", false, true, "processor.rs:959,979 is_writable"),
  r("portfolio", false, true, "processor.rs:960,982 is_writable"),
  r("mint_auth", false, false, "processor.rs:961,998 PDA check"),
  r("token_program", false, false, "processor.rs:962"),
  r("extra_metas", false, true, "processor.rs:963; close_extra_metas 1126 -> 883 is_writable"),
  r("nft_registry", false, false, "processor.rs:964,1079 validate_nft_registry"),
  r("percolator_prog", false, false, "processor.rs:965 unwrap CPI target"),
];

// EmergencyBurn — process_emergency_burn, processor.rs:1140-1152, docs instruction.rs:103-113.
const RUST_EMERGENCY_BURN: Row[] = [
  r("holder", true, true, "processor.rs:1143,1154 is_signer; 1158 require_writable_rent_recipient"),
  r("nft_pda", false, true, "processor.rs:1144,1174 is_writable"),
  r("nft_mint", false, true, "processor.rs:1145,1177 is_writable"),
  r("holder_ata", false, true, "processor.rs:1146,1180 is_writable"),
  r("portfolio", false, true, "processor.rs:1147,1160 is_writable"),
  r("mint_auth", false, false, "processor.rs:1148,1185 PDA check"),
  r("token_program", false, false, "processor.rs:1149"),
  r("extra_metas", false, true, "processor.rs:1150; close_extra_metas 1369 -> 883 is_writable"),
  r("nft_registry", false, false, "processor.rs:1151 unwrap CPI"),
  r("percolator_prog", false, false, "processor.rs:1152 unwrap CPI target"),
];

// ReconcileBurnedNft — process_reconcile_burned_nft, processor.rs:1402-1417, docs instruction.rs:159-168.
const RUST_RECONCILE: Row[] = [
  r("nft_pda", false, true, "processor.rs:1404,1423 is_writable"),
  r("nft_mint", false, true, "processor.rs:1405,1551 is_writable (#182 mint close)"),
  r("portfolio", false, true, "processor.rs:1406,1423 is_writable"),
  r("mint_auth", false, false, "processor.rs:1407,1461 PDA check"),
  r("nft_registry", false, false, "processor.rs:1408"),
  r("percolator_prog", false, false, "processor.rs:1409"),
  r("last_holder", false, true, "processor.rs:1410,1423 is_writable"),
  r("extra_metas", false, true, "processor.rs:1416; close_extra_metas 1569 -> 883 is_writable"),
  r("token_program", false, false, "processor.rs:1417,1547 key == TOKEN_2022"),
];

const keys = (n: number) => Array.from({ length: n }, () => Keypair.generate().publicKey);

function flagsOf(spec: Parameters<typeof buildNftAccountMetas>[0]) {
  return buildNftAccountMetas(spec, keys(spec.length)).map(({ isSigner, isWritable }) => ({ isSigner, isWritable }));
}

describe("NFT instruction tags vs percolator-nft src/instruction.rs", () => {
  it("SDK NFT_IX_TAG has exactly the Rust tags, value for value", () => {
    expect(Object.keys(NFT_IX_TAG).sort()).toEqual(Object.keys(RUST_TAGS).sort());
    for (const [name, [tag, src]] of Object.entries(RUST_TAGS)) {
      expect(NFT_IX_TAG[name as keyof typeof NFT_IX_TAG], `${name} (${src})`).toBe(tag);
    }
  });
});

describe("NFT instruction payloads vs NftInstruction::unpack (instruction.rs:197-260)", () => {
  it("MintPositionNft = [0, asset_index u16 LE], exactly 3 bytes (instruction.rs:214-221)", () => {
    expect([...encodeNftMint(7)]).toEqual([0, 7, 0]);
    expect([...encodeNftMint(0x1234)]).toEqual([0, 0x34, 0x12]);
    expect([...encodeNftMint(0xffff)]).toEqual([0, 0xff, 0xff]);
    // Rust field is u16; a value it cannot decode must not be encoded.
    expect(() => encodeNftMint(0x10000)).toThrow();
    expect(() => encodeNftMint(-1)).toThrow();
  });

  it("tag-only instructions are exactly one byte (rest.is_empty(), instruction.rs:222-251)", () => {
    expect([...encodeNftBurn()]).toEqual([1]);
    expect([...encodeNftSettleFunding()]).toEqual([2]);
    expect([...encodeNftEmergencyBurn()]).toEqual([5]);
    expect([...encodeNftReconcile()]).toEqual([7]);
  });
});

describe("NFT account lists vs processor.rs handlers", () => {
  const cases: [string, Parameters<typeof buildNftAccountMetas>[0], Row[]][] = [
    ["MintPositionNft", ACCOUNTS_NFT_MINT, RUST_MINT],
    ["BurnPositionNft", ACCOUNTS_NFT_BURN, RUST_BURN],
    ["EmergencyBurn", ACCOUNTS_NFT_EMERGENCY_BURN, RUST_EMERGENCY_BURN],
    ["ReconcileBurnedNft", ACCOUNTS_NFT_RECONCILE, RUST_RECONCILE],
  ];

  it.each(cases)("%s: same account count and signer/writable flag per index", (_name, sdk, rust) => {
    expect(sdk.length).toBe(rust.length);
    const got = flagsOf(sdk);
    rust.forEach((row, i) => {
      expect(got[i], `#${i} ${row.name} (${row.rust})`).toEqual({ isSigner: row.signer, isWritable: row.writable });
    });
  });

  it("table sizes match the Rust doc headers (Mint 12, Burn 10, EmergencyBurn 10, Reconcile 9)", () => {
    expect([RUST_MINT.length, RUST_BURN.length, RUST_EMERGENCY_BURN.length, RUST_RECONCILE.length]).toEqual([12, 10, 10, 9]);
  });

  it("buildNftAccountMetas keeps key order (Rust reads accounts positionally via next_account_info)", () => {
    const ks = keys(ACCOUNTS_NFT_MINT.length);
    expect(buildNftAccountMetas(ACCOUNTS_NFT_MINT, ks).map((m) => m.pubkey.toBase58())).toEqual(ks.map((k) => k.toBase58()));
  });
});

describe("NFT PDAs vs state_v16.rs / transfer_hook.rs / cpi_v16.rs seeds", () => {
  const enc = new TextEncoder();
  const other = Keypair.generate().publicKey;
  const programs = [NFT_PROGRAM_ID, other];

  it("deriveNftPda = ['position_nft', portfolio, market_id u64 LE] (state_v16.rs:130-145)", () => {
    const portfolio = Keypair.generate().publicKey;
    for (const pid of programs) {
      for (const marketId of [0n, 1n, 0x0102030405060708n, 0xffff_ffff_ffff_ffffn]) {
        const le = new Uint8Array(8);
        new DataView(le.buffer).setBigUint64(0, marketId, true);
        const want = PublicKey.findProgramAddressSync([enc.encode("position_nft"), portfolio.toBytes(), le], pid);
        const got = deriveNftPda(portfolio, marketId, pid);
        expect(got[0].toBase58()).toBe(want[0].toBase58());
        expect(got[1]).toBe(want[1]);
      }
    }
  });

  it("deriveMintAuthority = ['mint_authority'] (state_v16.rs:148-150)", () => {
    for (const pid of programs) {
      const want = PublicKey.findProgramAddressSync([enc.encode("mint_authority")], pid);
      const got = deriveMintAuthority(pid);
      expect(got[0].toBase58()).toBe(want[0].toBase58());
      expect(got[1]).toBe(want[1]);
    }
  });

  it("deriveExtraAccountMetas = ['extra-account-metas', mint] (transfer_hook.rs:68-73)", () => {
    const mint = Keypair.generate().publicKey;
    for (const pid of programs) {
      const want = PublicKey.findProgramAddressSync([enc.encode("extra-account-metas"), mint.toBytes()], pid);
      const got = deriveExtraAccountMetas(mint, pid);
      expect(got[0].toBase58()).toBe(want[0].toBase58());
      expect(got[1]).toBe(want[1]);
    }
  });

  it("deriveNftRegistry = ['nft_registry', market_group] under the WRAPPER id (cpi_v16.rs:60,71-76)", () => {
    const wrapper = Keypair.generate().publicKey;
    const group = Keypair.generate().publicKey;
    const want = PublicKey.findProgramAddressSync([enc.encode("nft_registry"), group.toBytes()], wrapper);
    expect(deriveNftRegistry(wrapper, group)[0].toBase58()).toBe(want[0].toBase58());
  });

  it("deriveNftMint throws: Rust requires the mint to be a fresh signer keypair (processor.rs:435-445)", () => {
    expect(() => deriveNftMint(other, 0)).toThrow(/fresh signer keypair/);
  });
});
