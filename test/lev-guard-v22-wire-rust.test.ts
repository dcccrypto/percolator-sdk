/**
 * Differential wire test: the SDK's tag-124 leverage-guard builders vs the Rust program.
 *
 * Rust source: dcccrypto/percolator-prog feat/v22-rc23-2026-10-22 @ 4a5065f5, read with `git show` (no checkout, no cargo).
 *   P = src/v16_program.rs, L = src/lev_guard_v22.rs, D = src/depth_src_v22.rs.
 *
 * Every number in the RUST_* tables below is transcribed from that source with its file:line. The tests check the SDK
 * against the tables, and fuzz 2,000 random payloads per op through the SDK encoder and a hand-port of the Rust
 * `Instruction::decode` (P:10926-10960 with the readers at P:12175-12243 and the trailing-byte check at P:10958) and
 * `Instruction::encode` (P:12155-12170).
 *
 * The account table records two things per slot: what the Rust handler REQUIRES (an explicit `expect_signer` /
 * `expect_writable` / key check, or a store that calls `expect_writable`), and what the SDK SENDS. The SDK may grant
 * more than the handler requires (the permissionless caller is listed as signer because it pays the fee) but never less.
 */
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import * as G from "../src/abi/lev-guard-v22.js";
import * as B from "../src/solana/lev-guard-v22.js";

// ============================================================================
// Rust constants (transcribed)
// ============================================================================

/** P:669 `pub const TAG_LEV_GUARD: u8 = 124;` */
const RUST_TAG_LEV_GUARD = 124;
/** L:907-913 `OP_INIT = 0 … OP_SET_T0 = 6`. */
const RUST_OP = { INIT: 0, SET_RISK_KEY: 1, REPORT: 2, TIGHTEN: 3, POKE: 4, LP_STOP: 5, SET_T0: 6 } as const;
/** Seeds: L:893 `LEV_GUARD_SEED`, P:519 `VAULT_LP_STATE_SEED`, P:599 `VAULT_LP_EXT_SEED`, D:327 `DEPTH_SOURCE_SEED`. */
const RUST_SEEDS = { levGuard: "lev_guard", vaultLpState: "vault_lp", vaultLpExt: "vault_lp_ext", depthSource: "depth_src" } as const;
/** P:50389 `derive_program_data_address`: `[program_id]` under bpf_loader_upgradeable. */
const BPF_LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
/** L:105-107 `report_ok`: j_dump, m_ind, n_mult each <= 10_000; l_cap_x100 unbounded. */
const rustReportOk = (r: readonly number[]): boolean => r[0] <= 10_000 && r[1] <= 10_000 && r[3] <= 10_000;

// ============================================================================
// Payload table (offsets include the 2 header bytes [tag, op])
// ============================================================================

type FieldKind = "u64le" | "bytes32" | "u16le";
interface FieldRow { name: string; off: number; width: number; kind: FieldKind }
interface PayloadRow { op: number; name: string; len: number; fields: FieldRow[]; rust: string }

const RUST_PAYLOAD: Record<string, PayloadRow> = {
  Init: { op: RUST_OP.INIT, name: "OP_INIT", len: 10, fields: [{ name: "t0", off: 2, width: 8, kind: "u64le" }],
    rust: "L:907 op; P:10931 `t0 = read_u64` (P:12183 u64::from_le_bytes); P:10958 no trailing bytes" },
  SetRiskKey: { op: RUST_OP.SET_RISK_KEY, name: "OP_SET_RISK_KEY", len: 34, fields: [{ name: "key", off: 2, width: 32, kind: "bytes32" }],
    rust: "L:908 op; P:10932 `key = read_bytes32` (P:12237); P:10958" },
  Report: { op: RUST_OP.REPORT, name: "OP_REPORT", len: 10, fields: [
    { name: "j_dump_bps", off: 2, width: 2, kind: "u16le" }, { name: "m_ind_bps", off: 4, width: 2, kind: "u16le" },
    { name: "l_cap_x100", off: 6, width: 2, kind: "u16le" }, { name: "n_mult_bps", off: 8, width: 2, kind: "u16le" }],
    rust: "L:909 op; P:10933-10937 4x `read_u16` (P:12192 u16::from_le_bytes) into report[0..4], mapped at P:46322-46325; P:10958" },
  Tighten: { op: RUST_OP.TIGHTEN, name: "OP_TIGHTEN", len: 2, fields: [], rust: "L:910 op; P:10938 no payload; P:10958" },
  Poke: { op: RUST_OP.POKE, name: "OP_POKE", len: 2, fields: [], rust: "L:911 op; P:10938 no payload; P:10958" },
  LpStop: { op: RUST_OP.LP_STOP, name: "OP_LP_STOP", len: 2, fields: [], rust: "L:912 op; P:10938 no payload; P:10958" },
  SetT0: { op: RUST_OP.SET_T0, name: "OP_SET_T0", len: 10, fields: [{ name: "t0", off: 2, width: 8, kind: "u64le" }],
    rust: "L:913 op; P:10931 `t0 = read_u64`; handler refuses t0 == 0 at P:46304; P:10958" },
};

// ============================================================================
// Account table
// ============================================================================

interface AcctRow {
  idx: number; role: string;
  /** What the handler requires. */
  rustSigner: boolean; rustWritable: boolean;
  /** What the SDK sends. */
  sdkSigner: boolean; sdkWritable: boolean;
  optional?: boolean;
  rust: string;
}
interface AcctTable { op: string; handler: string; rows: AcctRow[] }

const RUST_ACCOUNTS: Record<string, AcctTable> = {
  Init: { op: "Init", handler: "lev_guard_init P:46346", rows: [
    { idx: 0, role: "authority", rustSigner: true, rustWritable: true, sdkSigner: true, sdkWritable: true, rust: "P:46353, expect_signer P:46358, expect_writable P:46359 (rent payer)" },
    { idx: 1, role: "programData", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46354, key == derive_program_data_address P:46258-46259" },
    { idx: 2, role: "market", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46355, expect_writable P:46360" },
    { idx: 3, role: "guard", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46356, expect_writable P:46361, PDA P:46366 / seeds P:46402" },
    { idx: 4, role: "systemProgram", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46357, key == system_program::ID P:46363" },
  ] },
  SetRiskKey: { op: "SetRiskKey", handler: "handle_lev_guard OP_SET_RISK_KEY P:46291", rows: [
    { idx: 0, role: "upgradeAuthority", rustSigner: true, rustWritable: false, sdkSigner: true, sdkWritable: false, rust: "P:46292, is_signer via lev_is_upgrade_authority P:46259 (called P:46296)" },
    { idx: 1, role: "programData", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46293, key check P:46259" },
    { idx: 2, role: "market", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46294, expect_owner only" },
    { idx: 3, role: "guard", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46295, lev_guard_store P:46309 -> expect_writable P:46024" },
  ] },
  Report: { op: "Report", handler: "handle_lev_guard OP_REPORT P:46311", rows: [
    { idx: 0, role: "riskKey", rustSigner: true, rustWritable: false, sdkSigner: true, sdkWritable: false, rust: "P:46312, expect_signer P:46315" },
    { idx: 1, role: "market", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46313, expect_owner only" },
    { idx: 2, role: "guard", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46314, lev_guard_store P:46336 -> P:46024" },
  ] },
  Tighten: { op: "Tighten", handler: "lev_guard_tighten P:46421", rows: [
    { idx: 0, role: "caller", rustSigner: false, rustWritable: false, sdkSigner: true, sdkWritable: false, rust: "never read (P:46428 starts at [1]); SDK lists it as signer (fee payer)" },
    { idx: 1, role: "market", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46428, expect_owner only" },
    { idx: 2, role: "guard", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46429, lev_guard_store P:46491 -> P:46024" },
    { idx: 3, role: "depthSource", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46430, key == derive_depth_source P:46439-46440" },
    { idx: 4, role: "baseMint", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46431, key == pin.base_mint P:46447" },
    { idx: 5, role: "poolBaseVault", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46432, key == pin.base_vault P:46447" },
    { idx: 6, role: "holderTokenAccount", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, optional: true, rust: "accounts.get(6) P:46470, read only" },
  ] },
  Poke: { op: "Poke", handler: "lev_guard_poke P:46665", rows: [
    { idx: 0, role: "caller", rustSigner: false, rustWritable: false, sdkSigner: true, sdkWritable: false, rust: "never read (P:46670 starts at [1]); SDK lists it as signer (fee payer)" },
    { idx: 1, role: "market", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46670, expect_writable P:46676" },
    { idx: 2, role: "guard", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46671, lev_guard_store P:46724 -> P:46024" },
    { idx: 3, role: "vaultLpPortfolio", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46672, expect_writable P:46677" },
    { idx: 4, role: "vaultLpState", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, optional: true, rust: "accounts.get(4) P:46681, PDA via load_vault_lp_state P:37913" },
    { idx: 5, role: "vaultLpExt", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, optional: true, rust: "accounts.get(5) P:46682, required with [4] P:46532, PDA P:46533" },
  ] },
  LpStop: { op: "LpStop", handler: "lev_guard_lp_stop P:46804 (dispatch P:17222-17229)", rows: [
    { idx: 0, role: "caller", rustSigner: false, rustWritable: false, sdkSigner: true, sdkWritable: false, rust: "never read (P:46810 starts at [1]); SDK lists it as signer (fee payer)" },
    { idx: 1, role: "market", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46810, expect_writable P:46814" },
    { idx: 2, role: "guard", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46811, expect_writable P:46815" },
    { idx: 3, role: "vaultLpPortfolio", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, rust: "P:46812, expect_writable P:46816" },
    { idx: 4, role: "vaultLpState", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "P:46813 (required), PDA via load_vault_lp_state P:37913" },
    { idx: 5, role: "vaultLpExt", rustSigner: false, rustWritable: false, sdkSigner: false, sdkWritable: false, rust: "accounts.get(5) P:46821, required P:46532, PDA P:46533" },
    { idx: 6, role: "opposing[0..]", rustSigner: false, rustWritable: true, sdkSigner: false, sdkWritable: true, optional: true, rust: "accounts.iter().skip(6) P:46880, expect_writable P:46901" },
  ] },
};
// SetT0 shares the SetRiskKey arm (P:46291 `OP_SET_RISK_KEY | OP_SET_T0`).
RUST_ACCOUNTS.SetT0 = { ...RUST_ACCOUNTS.SetRiskKey, op: "SetT0", handler: "handle_lev_guard OP_SET_T0 P:46291" };

// ============================================================================
// Hand-port of the Rust decoder / encoder
// ============================================================================

class InvalidInstructionData extends Error {}
interface RustLevGuard { op: number; t0: bigint; key: Uint8Array; report: number[] }

/** P:10065-10068 tag split, P:10926-10942 the TAG_LEV_GUARD arm, P:10958-10960 trailing bytes refused. */
function rustDecode(input: Uint8Array): RustLevGuard {
  let rest = input;
  const need = (n: number): Uint8Array => {
    if (rest.length < n) throw new InvalidInstructionData(`short: need ${n}, have ${rest.length}`);
    const b = rest.subarray(0, n);
    rest = rest.subarray(n);
    return b;
  };
  const readU8 = (): number => need(1)[0]; // P:12175
  const readU16 = (): number => { const b = need(2); return b[0] | (b[1] << 8); }; // P:12192
  const readU64 = (): bigint => { const b = need(8); let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v; }; // P:12183
  const readBytes32 = (): Uint8Array => Uint8Array.from(need(32)); // P:12237
  const tag = readU8();
  if (tag !== RUST_TAG_LEV_GUARD) throw new InvalidInstructionData(`not tag 124: ${tag}`);
  const op = readU8();
  let t0 = 0n; let key = new Uint8Array(32); const report = [0, 0, 0, 0];
  switch (op) {
    case RUST_OP.INIT: case RUST_OP.SET_T0: t0 = readU64(); break;
    case RUST_OP.SET_RISK_KEY: key = readBytes32(); break;
    case RUST_OP.REPORT: for (let i = 0; i < 4; i++) report[i] = readU16(); break;
    case RUST_OP.TIGHTEN: case RUST_OP.POKE: case RUST_OP.LP_STOP: break;
    default: throw new InvalidInstructionData(`unknown op ${op}`);
  }
  if (rest.length !== 0) throw new InvalidInstructionData(`trailing ${rest.length} bytes`);
  return { op, t0, key, report };
}

/** P:12155-12170 `Self::LevGuard { .. } => encode`. */
function rustEncode(ix: RustLevGuard): Uint8Array {
  const out: number[] = [RUST_TAG_LEV_GUARD, ix.op];
  const pushU64 = (v: bigint): void => { for (let i = 0; i < 8; i++) out.push(Number((v >> BigInt(8 * i)) & 0xffn)); };
  const pushU16 = (v: number): void => { out.push(v & 0xff, (v >> 8) & 0xff); };
  if (ix.op === RUST_OP.INIT || ix.op === RUST_OP.SET_T0) pushU64(ix.t0);
  else if (ix.op === RUST_OP.SET_RISK_KEY) out.push(...ix.key);
  else if (ix.op === RUST_OP.REPORT) ix.report.forEach(pushU16);
  return Uint8Array.from(out);
}

// ============================================================================
// Deterministic RNG
// ============================================================================

const FUZZ_N = 2_000;
/** Builder runs derive PDAs (findProgramAddressSync), so the builder-level pass is smaller; the 2,000 per op run on the encoders. */
const BUILDER_N = 200;
const hex = (b: Uint8Array): string => Buffer.from(b).toString("hex");
let seed = 0x9e3779b9;
function rnd32(): number {
  seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
  return seed;
}
const rndU16 = (): number => rnd32() & 0xffff;
const rndBytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => rnd32() & 0xff);
const U64_MAX = (1n << 64n) - 1n;
const U64_EDGES = [0n, 1n, 0xffn, 0x100n, 0xffff_ffffn, 0x1_0000_0000n, 1n << 63n, U64_MAX - 1n, U64_MAX];
function rndU64(i: number): bigint {
  if (i < U64_EDGES.length) return U64_EDGES[i];
  const shape = rnd32() % 3;
  if (shape === 0) return BigInt(rnd32()); // small
  return (BigInt(rnd32()) << 32n) | BigInt(rnd32());
}

/** Reads a field from the SDK bytes using the table's offset, width and endianness. */
function readField(b: Uint8Array, f: FieldRow): bigint | Uint8Array {
  const slice = b.subarray(f.off, f.off + f.width);
  if (f.kind === "bytes32") return Uint8Array.from(slice);
  let v = 0n;
  for (let i = f.width - 1; i >= 0; i--) v = (v << 8n) | BigInt(slice[i]); // little-endian
  return v;
}

function checkHeaderAndLen(b: Uint8Array, row: PayloadRow): void {
  expect(b.length).toBe(row.len);
  expect(b[0]).toBe(RUST_TAG_LEV_GUARD);
  expect(b[1]).toBe(row.op);
  // The fields tile the payload exactly: no gaps, no overlaps.
  let end = 2;
  for (const f of row.fields) { expect(f.off).toBe(end); end += f.width; }
  expect(end).toBe(row.len);
}

// ============================================================================
// Tests
// ============================================================================

describe("tag 124 constants vs Rust", { timeout: 60_000 }, () => {
  it("tag, op bytes and seed match P:669, L:907-913, L:893", () => {
    expect(G.TAG_LEV_GUARD_V22).toBe(RUST_TAG_LEV_GUARD);
    expect(G.LEV_GUARD_OP_V22).toEqual({
      Init: RUST_OP.INIT, SetRiskKey: RUST_OP.SET_RISK_KEY, Report: RUST_OP.REPORT, Tighten: RUST_OP.TIGHTEN,
      Poke: RUST_OP.POKE, LpStop: RUST_OP.LP_STOP, SetT0: RUST_OP.SET_T0,
    });
    expect(G.LEV_GUARD_SEEDS_V22.guard).toBe(RUST_SEEDS.levGuard);
    expect(G.LEV_GUARD_SEEDS_V22.vaultLpState).toBe(RUST_SEEDS.vaultLpState);
    expect(G.LEV_GUARD_SEEDS_V22.vaultLpExt).toBe(RUST_SEEDS.vaultLpExt);
    expect(G.LEV_GUARD_SEEDS_V22.depthSource).toBe(RUST_SEEDS.depthSource);
  });

  it("deriveLevGuardV22 = find_program_address([b\"lev_guard\", market]) (P:8035-8043, L:893) for 64 random markets", () => {
    for (let i = 0; i < 64; i++) {
      const programId = new PublicKey(rndBytes(32));
      const market = new PublicKey(rndBytes(32));
      const want = PublicKey.findProgramAddressSync([Buffer.from(RUST_SEEDS.levGuard, "utf8"), market.toBuffer()], programId);
      const got = B.deriveLevGuardV22(programId, market);
      expect(got[0].equals(want[0])).toBe(true);
      expect(got[1]).toBe(want[1]);
    }
  });

  it("the other PDAs the builders pass match their Rust seeds (P:7023, P:7162, P:50389)", () => {
    const programId = Keypair.generate().publicKey;
    const market = Keypair.generate().publicKey;
    const f = (seeds: Buffer[], p = programId): PublicKey => PublicKey.findProgramAddressSync(seeds, p)[0];
    expect(B.deriveVaultLpStateV22(programId, market)[0].equals(f([Buffer.from(RUST_SEEDS.vaultLpState), market.toBuffer()]))).toBe(true);
    expect(B.deriveVaultLpExtV22(programId, market)[0].equals(f([Buffer.from(RUST_SEEDS.vaultLpExt), market.toBuffer()]))).toBe(true);
    expect(B.deriveProgramDataV22(programId)[0].equals(f([programId.toBuffer()], BPF_LOADER_UPGRADEABLE))).toBe(true);
  });
});

describe("tag 124 payload layout vs Rust, 2,000 fuzz cases per op", { timeout: 60_000 }, () => {
  it("Init: [124, 0, t0 u64 LE] (len 10)", () => {
    const row = RUST_PAYLOAD.Init;
    for (let i = 0; i < FUZZ_N; i++) {
      const t0 = rndU64(i);
      const b = G.encodeLevGuardInitV22(t0);
      checkHeaderAndLen(b, row);
      expect(readField(b, row.fields[0])).toBe(t0);
      const d = rustDecode(b);
      expect(d.op).toBe(RUST_OP.INIT);
      expect(d.t0).toBe(t0);
      expect(hex(rustEncode(d))).toBe(hex(b));
    }
    // Default t0 = 0 (now) on the wire as eight zero bytes.
    expect(rustDecode(G.encodeLevGuardInitV22()).t0).toBe(0n);
  });

  it("SetT0: [124, 6, t0 u64 LE] (len 10); SDK refuses 0 exactly as the handler does (P:46304)", () => {
    const row = RUST_PAYLOAD.SetT0;
    for (let i = 0; i < FUZZ_N; i++) {
      const t0 = rndU64(i);
      if (t0 === 0n) { expect(() => G.encodeLevGuardSetT0V22(t0)).toThrow(); continue; }
      const b = G.encodeLevGuardSetT0V22(t0);
      checkHeaderAndLen(b, row);
      expect(readField(b, row.fields[0])).toBe(t0);
      const d = rustDecode(b);
      expect(d.op).toBe(RUST_OP.SET_T0);
      expect(d.t0).toBe(t0);
      expect(hex(rustEncode(d))).toBe(hex(b));
    }
  });

  it("SetRiskKey: [124, 1, key 32 B] (len 34)", () => {
    const row = RUST_PAYLOAD.SetRiskKey;
    for (let i = 0; i < FUZZ_N; i++) {
      const key = i === 0 ? new Uint8Array(32) : i === 1 ? new Uint8Array(32).fill(0xff) : rndBytes(32);
      const form = i % 3;
      const b = G.encodeLevGuardSetRiskKeyV22(form === 0 ? key : form === 1 ? new PublicKey(key) : key.every((x) => x === 0) ? null : key);
      checkHeaderAndLen(b, row);
      expect(hex(readField(b, row.fields[0]) as Uint8Array)).toBe(hex(key));
      const d = rustDecode(b);
      expect(d.op).toBe(RUST_OP.SET_RISK_KEY);
      expect(hex(d.key)).toBe(hex(key));
      expect(hex(rustEncode(d))).toBe(hex(b));
    }
    expect(rustDecode(G.encodeLevGuardSetRiskKeyV22(null)).key).toEqual(new Uint8Array(32));
  });

  it("Report: [124, 2, j u16, m u16, l u16, n u16] LE (len 10); SDK accepts exactly what report_ok accepts (L:105)", () => {
    const row = RUST_PAYLOAD.Report;
    let accepted = 0;
    for (let i = 0; i < FUZZ_N; i++) {
      // Half the cases in the valid domain, half over the whole u16 domain.
      const bps = (): number => (i % 2 === 0 ? rnd32() % 10_001 : rndU16());
      const rep = [bps(), bps(), rndU16(), bps()];
      const input = { jDumpBps: rep[0], mIndBps: rep[1], lCapX100: rep[2], nMultBps: rep[3] };
      if (!rustReportOk(rep)) { expect(() => G.encodeLevGuardReportV22(input)).toThrow(); continue; }
      accepted++;
      const b = G.encodeLevGuardReportV22(input);
      checkHeaderAndLen(b, row);
      row.fields.forEach((f, k) => expect(readField(b, f)).toBe(BigInt(rep[k])));
      const d = rustDecode(b);
      expect(d.op).toBe(RUST_OP.REPORT);
      expect(d.report.join()).toBe(rep.join()); // report[0..4] = j, m, l, n (P:46322-46325)
      expect(hex(rustEncode(d))).toBe(hex(b));
    }
    // Every even case is valid by construction; the odd cases must hit the refusal path at least once.
    expect(accepted).toBeGreaterThanOrEqual(FUZZ_N / 2);
    expect(accepted).toBeLessThan(FUZZ_N);
    // Boundaries of report_ok.
    expect(() => G.encodeLevGuardReportV22({ jDumpBps: 10_000, mIndBps: 10_000, lCapX100: 0xffff, nMultBps: 10_000 })).not.toThrow();
    expect(() => G.encodeLevGuardReportV22({ jDumpBps: 10_001, mIndBps: 0, lCapX100: 0, nMultBps: 0 })).toThrow();
  });

  for (const [name, enc] of [
    ["Tighten", G.encodeLevGuardTightenV22], ["Poke", G.encodeLevGuardPokeV22], ["LpStop", G.encodeLevGuardLpStopV22],
  ] as const) {
    it(`${name}: [124, ${RUST_PAYLOAD[name].op}] (len 2, no payload); 2,000 random tails are refused by the Rust decode`, () => {
      const row = RUST_PAYLOAD[name];
      const b = enc();
      checkHeaderAndLen(b, row);
      const d = rustDecode(b);
      expect(d.op).toBe(row.op);
      expect(hex(rustEncode(d))).toBe(hex(b));
      for (let i = 0; i < FUZZ_N; i++) {
        expect(hex(enc())).toBe(hex(b)); // the encoder is constant
        const tail = rndBytes(1 + (rnd32() % 40));
        const bad = new Uint8Array(2 + tail.length);
        bad.set(b); bad.set(tail, 2);
        expect(() => rustDecode(bad)).toThrow(InvalidInstructionData); // P:10958 trailing bytes
      }
    });
  }

  it("the Rust decode port is strict: truncations, one extra byte, and unknown ops are refused", () => {
    const samples = [
      G.encodeLevGuardInitV22(123n), G.encodeLevGuardSetT0V22(9n), G.encodeLevGuardSetRiskKeyV22(rndBytes(32)),
      G.encodeLevGuardReportV22({ jDumpBps: 1, mIndBps: 2, lCapX100: 3, nMultBps: 4 }),
    ];
    for (const s of samples) {
      for (let n = 0; n < s.length; n++) expect(() => rustDecode(s.subarray(0, n))).toThrow(InvalidInstructionData);
      expect(() => rustDecode(Uint8Array.from([...s, 0]))).toThrow(InvalidInstructionData);
    }
    for (let op = 7; op < 256; op++) expect(() => rustDecode(Uint8Array.from([RUST_TAG_LEV_GUARD, op]))).toThrow(InvalidInstructionData);
  });
});

describe("tag 124 accounts vs Rust handler", { timeout: 60_000 }, () => {
  const programId = Keypair.generate().publicKey;
  const market = Keypair.generate().publicKey;
  const c = { programId, market };
  const signer = Keypair.generate().publicKey;
  const guard = B.deriveLevGuardV22(programId, market)[0];
  const pd = B.deriveProgramDataV22(programId)[0];
  const vls = B.deriveVaultLpStateV22(programId, market)[0];
  const vle = B.deriveVaultLpExtV22(programId, market)[0];
  const lp = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;
  const vault = Keypair.generate().publicKey;
  const holder = Keypair.generate().publicKey;
  const depth = PublicKey.findProgramAddressSync([Buffer.from(RUST_SEEDS.depthSource), market.toBuffer()], programId)[0];
  const victims = [Keypair.generate().publicKey, Keypair.generate().publicKey, Keypair.generate().publicKey];

  /** Expected pubkey per role. */
  const KEY: Record<string, PublicKey> = {
    authority: signer, upgradeAuthority: signer, riskKey: signer, caller: signer, programData: pd, market, guard,
    systemProgram: SystemProgram.programId, depthSource: depth, baseMint: mint, poolBaseVault: vault, holderTokenAccount: holder,
    vaultLpPortfolio: lp, vaultLpState: vls, vaultLpExt: vle,
  };

  // `len` is the exact key count the handler reads for that call (see the account table above):
  // Init 5, SetRiskKey/SetT0 4, Report 3, Tighten 6 (+1 with the optional holder [6]),
  // Poke 4 or 6 ([4]+[5] together), LpStop 6 + one per opposing portfolio [6..].
  const cases: { op: string; ix: ReturnType<typeof B.buildLevGuardInitIxV22>; payload: string; len: number; extra?: PublicKey[] }[] = [
    { op: "Init", payload: "Init", len: 5, ix: B.buildLevGuardInitIxV22(c, signer, 5n) },
    { op: "SetRiskKey", payload: "SetRiskKey", len: 4, ix: B.buildLevGuardSetRiskKeyIxV22(c, signer, holder) },
    { op: "SetT0", payload: "SetT0", len: 4, ix: B.buildLevGuardSetT0IxV22(c, signer, 7n) },
    { op: "Report", payload: "Report", len: 3, ix: B.buildLevGuardReportIxV22(c, signer, { jDumpBps: 1, mIndBps: 2, lCapX100: 3, nMultBps: 4 }) },
    { op: "Tighten", payload: "Tighten", len: 6, ix: B.buildLevGuardTightenIxV22(c, signer, { baseMint: mint, poolBaseVault: vault }) },
    { op: "Tighten", payload: "Tighten", len: 7, ix: B.buildLevGuardTightenIxV22(c, signer, { baseMint: mint, poolBaseVault: vault, holderTokenAccount: holder }) },
    { op: "Poke", payload: "Poke", len: 4, ix: B.buildLevGuardPokeIxV22(c, signer, { vaultLpPortfolio: lp }) },
    { op: "Poke", payload: "Poke", len: 6, ix: B.buildLevGuardPokeIxV22(c, signer, { vaultLpPortfolio: lp, sampleNav: true }) },
    { op: "LpStop", payload: "LpStop", len: 6, ix: B.buildLevGuardLpStopIxV22(c, signer, lp) },
    { op: "LpStop", payload: "LpStop", len: 6 + victims.length, ix: B.buildLevGuardLpStopIxV22(c, signer, lp, victims), extra: victims },
  ];

  for (const k of cases) {
    const t = RUST_ACCOUNTS[k.op];
    it(`${k.op} (${t.handler}) with ${k.len} accounts: exact count, order, isSigner, isWritable`, () => {
      expect(k.ix.programId.equals(programId)).toBe(true);
      expect(k.ix.keys.length, `${k.op} exact key count`).toBe(k.len);
      expect(rustDecode(k.ix.data).op).toBe(RUST_PAYLOAD[k.payload].op);
      const required = t.rows.filter((r) => !r.optional).length;
      const fixed = t.rows.filter((r) => r.role !== "opposing[0..]");
      expect(k.ix.keys.length).toBeGreaterThanOrEqual(required);
      if (!k.extra) expect(k.ix.keys.length).toBeLessThanOrEqual(fixed.length);
      k.ix.keys.forEach((meta, i) => {
        const row = i < fixed.length ? fixed[i] : t.rows[t.rows.length - 1];
        const want = row.role === "opposing[0..]" ? k.extra![i - 6] : KEY[row.role];
        expect(meta.pubkey.equals(want), `${k.op}[${i}] ${row.role}`).toBe(true);
        expect(meta.isSigner, `${k.op}[${i}] ${row.role} isSigner (${row.rust})`).toBe(row.sdkSigner);
        expect(meta.isWritable, `${k.op}[${i}] ${row.role} isWritable (${row.rust})`).toBe(row.sdkWritable);
        // Never less than the handler requires.
        if (row.rustSigner) expect(meta.isSigner, `${k.op}[${i}] required signer`).toBe(true);
        if (row.rustWritable) expect(meta.isWritable, `${k.op}[${i}] required writable`).toBe(true);
      });
    });
  }

  it("Tighten appends the optional holder as [6] (read-only, P:46470) only when given, and nothing else", () => {
    const base = B.buildLevGuardTightenIxV22(c, signer, { baseMint: mint, poolBaseVault: vault });
    const withHolder = B.buildLevGuardTightenIxV22(c, signer, { baseMint: mint, poolBaseVault: vault, holderTokenAccount: holder });
    expect(base.keys.length).toBe(6);
    expect(withHolder.keys.length).toBe(7);
    expect(withHolder.keys[6].pubkey.equals(holder)).toBe(true);
    expect(withHolder.keys[6].isSigner).toBe(false);
    expect(withHolder.keys[6].isWritable).toBe(false);
    // The first six metas are identical with and without the holder.
    expect(withHolder.keys.slice(0, 6).map((m) => [m.pubkey.toBase58(), m.isSigner, m.isWritable]))
      .toEqual(base.keys.map((m) => [m.pubkey.toBase58(), m.isSigner, m.isWritable]));
  });

  it("LpStop passes every opposing portfolio as [6..], writable, in order, for n = 0..8 (P:46880, expect_writable P:46901)", () => {
    for (let n = 0; n <= 8; n++) {
      const opp = Array.from({ length: n }, () => Keypair.generate().publicKey);
      const ix = B.buildLevGuardLpStopIxV22(c, signer, lp, opp);
      expect(ix.keys.length, `LpStop n=${n} exact key count`).toBe(6 + n);
      opp.forEach((p, j) => {
        const m = ix.keys[6 + j];
        expect(m.pubkey.equals(p), `LpStop n=${n} opposing[${j}]`).toBe(true);
        expect(m.isSigner, `LpStop n=${n} opposing[${j}] isSigner`).toBe(false);
        expect(m.isWritable, `LpStop n=${n} opposing[${j}] isWritable`).toBe(true);
      });
    }
  });

  it("Poke sends [4] and [5] together (the handler requires the ext whenever vault_lp_state is passed, P:46532)", () => {
    const plain = B.buildLevGuardPokeIxV22(c, signer, { vaultLpPortfolio: lp });
    const nav = B.buildLevGuardPokeIxV22(c, signer, { vaultLpPortfolio: lp, sampleNav: true });
    expect(plain.keys.length).toBe(4);
    expect(nav.keys.length).toBe(6);
  });

  it("the SDK's AccountSpec lists equal the transcribed table (non-optional rows)", () => {
    const specs: Record<string, readonly { name: string; signer: boolean; writable: boolean }[]> = {
      Init: G.ACCOUNTS_LEV_GUARD_INIT_V22, SetRiskKey: G.ACCOUNTS_LEV_GUARD_ADMIN_V22, SetT0: G.ACCOUNTS_LEV_GUARD_ADMIN_V22,
      Report: G.ACCOUNTS_LEV_GUARD_REPORT_V22, Tighten: G.ACCOUNTS_LEV_GUARD_TIGHTEN_V22, Poke: G.ACCOUNTS_LEV_GUARD_POKE_V22,
      LpStop: G.ACCOUNTS_LEV_GUARD_LP_STOP_V22,
    };
    for (const [op, spec] of Object.entries(specs)) {
      const rows = RUST_ACCOUNTS[op].rows.filter((r) => !r.optional);
      expect(spec.map((s) => [s.name, s.signer, s.writable]), op).toEqual(rows.map((r) => [r.role, r.sdkSigner, r.sdkWritable]));
    }
  });

  it(`every builder's data equals the encoder output (${BUILDER_N} random Init / SetT0 / Report / SetRiskKey payloads via the builder)`, () => {
    for (let i = 0; i < BUILDER_N; i++) {
      const which = i % 4;
      if (which === 0) {
        const t0 = rndU64(i);
        expect(hex(B.buildLevGuardInitIxV22(c, signer, t0).data)).toBe(hex(G.encodeLevGuardInitV22(t0)));
      } else if (which === 1) {
        const t0 = rndU64(i) || 1n;
        expect(hex(B.buildLevGuardSetT0IxV22(c, signer, t0).data)).toBe(hex(G.encodeLevGuardSetT0V22(t0)));
      } else if (which === 2) {
        const r = { jDumpBps: rnd32() % 10_001, mIndBps: rnd32() % 10_001, lCapX100: rndU16(), nMultBps: rnd32() % 10_001 };
        expect(hex(B.buildLevGuardReportIxV22(c, signer, r).data)).toBe(hex(G.encodeLevGuardReportV22(r)));
      } else {
        const key = rndBytes(32);
        expect(hex(B.buildLevGuardSetRiskKeyIxV22(c, signer, key).data)).toBe(hex(G.encodeLevGuardSetRiskKeyV22(key)));
      }
    }
  });
});
