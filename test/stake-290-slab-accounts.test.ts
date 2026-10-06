/**
 * percolator-stake #290 / #298 (stake v18.2): Deposit, DepositJunior, Withdraw
 * and AccrueFees take the pool's wrapper market (`pool.slab`) as ONE extra
 * trailing account. Without it a v18.2 mode-0 Deposit/DepositJunior/AccrueFees
 * fails with NotEnoughAccountKeys.
 *
 * This suite checks every account-meta builder against the program's OWN
 * account docs — a verbatim excerpt of percolator-stake `src/instruction.rs`
 * (test/fixtures/stake/instruction-290-excerpt.rs.txt) — index by index: count,
 * signer flag, writable flag, and which pubkey sits at each slot.
 *
 * Set PERCOLATOR_STAKE_SRC=/path/to/percolator-stake to additionally prove the
 * fixture still matches the live source (doc blocks byte-identical) and that the
 * processor parses the slab at the documented index.
 */
process.env.NETWORK ??= "devnet";

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

import {
  depositAccounts,
  depositJuniorAccounts,
  withdrawAccounts,
  accrueFeesAccounts,
} from "../src/solana/stake.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(
  join(HERE, "fixtures/stake/instruction-290-excerpt.rs.txt"),
  "utf8",
);

interface DocAccount {
  index: number;
  signer: boolean;
  writable: boolean;
  name: string;
}

interface Meta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

/** Cut the `/// <tag>: ...` doc block through its enum variant line. */
function docBlock(src: string, tag: number, variant: string): string {
  const lines = src.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^\\s*/// ${tag}: `).test(l));
  if (start < 0) throw new Error(`tag ${tag} doc block not found`);
  const end = lines.findIndex((l, i) => i > start && new RegExp(`^\\s*${variant}\\b`).test(l));
  if (end < 0) throw new Error(`variant ${variant} not found after tag ${tag}`);
  return lines.slice(start, end + 1).join("\n");
}

/** Parse `///   N. \`[flags]\` Name` lines into account specs. */
function parseAccounts(block: string): DocAccount[] {
  const out: DocAccount[] = [];
  for (const l of block.split("\n")) {
    const m = /^\s*\/\/\/\s+(\d+)\. `\[([^\]]*)\]` (.*)$/.exec(l);
    if (!m) continue;
    const flags = m[2].split(",").map((f) => f.trim());
    out.push({
      index: Number(m[1]),
      signer: flags.includes("signer"),
      writable: flags.includes("writable"),
      name: m[3],
    });
  }
  out.forEach((a, i) => {
    if (a.index !== i) throw new Error(`non-contiguous account doc at ${i}: ${a.name}`);
  });
  return out;
}

const K = () => Keypair.generate().publicKey;
const keys = {
  user: K(),
  caller: K(),
  pool: K(),
  userCollateralAta: K(),
  vault: K(),
  lpMint: K(),
  userLpAta: K(),
  vaultAuth: K(),
  depositPda: K(),
  slab: K(),
};

/** Map a documented account name to the pubkey the builder must put there. */
function expectedKey(name: string): PublicKey {
  const rules: Array<[RegExp, PublicKey]> = [
    [/`pool\.slab`/, keys.slab],
    [/^Caller/, keys.caller],
    [/^User (depositing|withdrawing)/, keys.user],
    [/^Pool PDA/, keys.pool],
    [/^User's collateral token account/, keys.userCollateralAta],
    [/^Pool vault token account/, keys.vault],
    [/^LP mint/, keys.lpMint],
    [/^User's LP token account/, keys.userLpAta],
    [/^Vault authority PDA/, keys.vaultAuth],
    [/^Deposit PDA/, keys.depositPda],
    [/^Token program/, TOKEN_PROGRAM_ID],
    [/^Clock sysvar/, SYSVAR_CLOCK_PUBKEY],
    [/^System program/, SystemProgram.programId],
  ];
  for (const [re, pk] of rules) if (re.test(name)) return pk;
  throw new Error(`unmapped stake account doc name: ${name}`);
}

function assertMatchesDoc(metas: Meta[], doc: DocAccount[]): void {
  expect(metas.map((m) => m.pubkey.toBase58())).toEqual(
    doc.map((d) => expectedKey(d.name).toBase58()),
  );
  expect(metas.map((m) => m.isSigner)).toEqual(doc.map((d) => d.signer));
  expect(metas.map((m) => m.isWritable)).toEqual(doc.map((d) => d.writable));
}

const DEPOSIT_DOC = parseAccounts(docBlock(FIXTURE, 1, "Deposit"));
const WITHDRAW_DOC = parseAccounts(docBlock(FIXTURE, 2, "Withdraw"));
const ACCRUE_DOC = parseAccounts(docBlock(FIXTURE, 12, "AccrueFees"));
const JUNIOR_BLOCK = docBlock(FIXTURE, 16, "DepositJunior");

/**
 * Doc erratum: instruction.rs documents Deposit account 0 as `[signer]`, but
 * process_deposit / process_deposit_junior pass `user` as the PAYER of
 * create_or_adopt_pda on a first deposit (system create_account / transfer
 * debit it), so the user must also be writable. The builders follow the
 * processor; everything else is still checked against the doc verbatim.
 */
const DEPOSIT_EXPECTED: DocAccount[] = DEPOSIT_DOC.map((d, i) =>
  i === 0 ? { ...d, writable: true } : d,
);

const depositArgs = {
  user: keys.user,
  pool: keys.pool,
  userCollateralAta: keys.userCollateralAta,
  vault: keys.vault,
  lpMint: keys.lpMint,
  userLpAta: keys.userLpAta,
  vaultAuth: keys.vaultAuth,
  depositPda: keys.depositPda,
  slab: keys.slab,
};
const withdrawArgs = { ...depositArgs };
const accrueArgs = { caller: keys.caller, pool: keys.pool, vault: keys.vault, slab: keys.slab };

describe("stake #290: pool.slab trailing account (v18.2)", () => {
  it("fixture documents the slab at Deposit[11], Withdraw[10], AccrueFees[4]", () => {
    const slabIdx = (d: DocAccount[]) => d.findIndex((a) => a.name.includes("`pool.slab`"));
    expect(DEPOSIT_DOC).toHaveLength(12);
    expect(slabIdx(DEPOSIT_DOC)).toBe(11);
    expect(WITHDRAW_DOC).toHaveLength(11);
    expect(slabIdx(WITHDRAW_DOC)).toBe(10);
    expect(ACCRUE_DOC).toHaveLength(5);
    expect(slabIdx(ACCRUE_DOC)).toBe(4);
    expect(JUNIOR_BLOCK).toMatch(/same as Deposit, including the #290 wrapper market at index 11/);
  });

  it("depositAccounts matches instruction.rs Deposit, index by index", () => {
    assertMatchesDoc(depositAccounts(depositArgs), DEPOSIT_EXPECTED);
  });

  it("depositJuniorAccounts matches instruction.rs DepositJunior (= Deposit)", () => {
    assertMatchesDoc(depositJuniorAccounts(depositArgs), DEPOSIT_EXPECTED);
  });

  it("Deposit/DepositJunior: the user pays the deposit-PDA rent, so it is signer AND writable", () => {
    // The doc still says `[signer]` only; when it is corrected this flips and
    // DEPOSIT_EXPECTED can go back to DEPOSIT_DOC.
    expect(DEPOSIT_DOC[0]).toMatchObject({ signer: true, writable: false });
    for (const metas of [depositAccounts(depositArgs), depositJuniorAccounts(depositArgs)]) {
      expect(metas[0].pubkey.equals(keys.user)).toBe(true);
      expect(metas[0].isSigner).toBe(true);
      expect(metas[0].isWritable).toBe(true);
    }
    // Withdraw creates nothing, so its user stays read-only.
    expect(withdrawAccounts(withdrawArgs)[0].isWritable).toBe(false);
  });

  it("withdrawAccounts matches instruction.rs Withdraw, index by index", () => {
    assertMatchesDoc(withdrawAccounts(withdrawArgs), WITHDRAW_DOC);
  });

  it("accrueFeesAccounts matches instruction.rs AccrueFees, index by index", () => {
    assertMatchesDoc(accrueFeesAccounts(accrueArgs), ACCRUE_DOC);
  });

  it("v18.1 compatibility: the slab is strictly trailing (prefix unchanged)", () => {
    // v18.1 stake (deploy/v18.1-stake@7dae291) parses these handlers with
    // next_account_info and has no account-count check, so an appended account
    // is ignored. That only holds if the pre-#290 prefix is untouched.
    const d = depositAccounts(depositArgs);
    expect(d.slice(0, 11).some((m) => m.pubkey.equals(keys.slab))).toBe(false);
    const w = withdrawAccounts(withdrawArgs);
    expect(w.slice(0, 10).some((m) => m.pubkey.equals(keys.slab))).toBe(false);
    const a = accrueFeesAccounts(accrueArgs);
    expect(a.slice(0, 4).some((m) => m.pubkey.equals(keys.slab))).toBe(false);
  });

  it("negative control: the pre-#290 11-account Deposit shape is rejected by the doc check", () => {
    const legacy = depositAccounts(depositArgs).slice(0, 11);
    expect(() => assertMatchesDoc(legacy, DEPOSIT_EXPECTED)).toThrow();
    const swapped = depositAccounts(depositArgs);
    [swapped[10], swapped[11]] = [swapped[11], swapped[10]];
    expect(() => assertMatchesDoc(swapped, DEPOSIT_EXPECTED)).toThrow();
  });
});

const STAKE_SRC = process.env.PERCOLATOR_STAKE_SRC;
describe.skipIf(!STAKE_SRC)("stake #290 fixture vs live percolator-stake source", () => {
  const read = (p: string) => readFileSync(join(STAKE_SRC as string, p), "utf8");

  it("instruction.rs doc blocks are byte-identical to the fixture", () => {
    expect(existsSync(join(STAKE_SRC as string, "src/instruction.rs"))).toBe(true);
    const live = read("src/instruction.rs");
    for (const [tag, v] of [[1, "Deposit"], [2, "Withdraw"], [12, "AccrueFees"], [16, "DepositJunior"]] as const) {
      expect(docBlock(live, tag, v)).toBe(docBlock(FIXTURE, tag, v));
    }
  });

  it("processor.rs makes the Deposit/DepositJunior user the deposit-PDA rent payer", () => {
    const proc = read("src/processor.rs");
    for (const fn of ["process_deposit(", "process_deposit_junior("]) {
      const at = proc.indexOf(`fn ${fn}`);
      expect(at, fn).toBeGreaterThanOrEqual(0);
      const body = proc.slice(at, proc.indexOf("\nfn ", at + 1));
      expect(body, fn).toMatch(/let user = next_account_info\(accounts_iter\)\?;/);
      expect(body, fn).toMatch(/create_or_adopt_pda\(\s*deposit_pda,\s*user,/);
    }
  });

  it("processor.rs parses the slab after exactly the documented prefix", () => {
    const proc = read("src/processor.rs");
    const cases: Array<[string, RegExp, number]> = [
      ["process_deposit(", /let fee_slab = accounts_iter\.next\(\);/, 11],
      ["process_deposit_junior(", /let fee_slab = accounts_iter\.next\(\);/, 11],
      ["process_withdraw(", /let fee_slab = accounts_iter\.next\(\);/, 10],
      ["process_accrue_fees(", /let slab_ai = accounts_iter\.next\(\);/, 4],
    ];
    for (const [fn, slabRe, idx] of cases) {
      const at = proc.indexOf(`fn ${fn}`);
      expect(at, fn).toBeGreaterThanOrEqual(0);
      const body = proc.slice(at);
      const m = slabRe.exec(body);
      expect(m, fn).not.toBeNull();
      const prefix = body.slice(0, (m as RegExpExecArray).index);
      expect((prefix.match(/next_account_info\(accounts_iter\)/g) ?? []).length, fn).toBe(idx);
    }
  });
});
