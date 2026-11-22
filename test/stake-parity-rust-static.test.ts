/**
 * Static differential test: specs/stake-parity.json + the SDK stake account builders vs the percolator-stake v2.2
 * Rust source, parsed in TypeScript. No cargo, no sibling repo, no RPC.
 *
 * Source pinned in test/fixtures/stake/v22-214c3e3/ (verbatim copies, sha256 checked below):
 *   dcccrypto/percolator-stake `fix/v22-fresh-ids-pins` @ 214c3e3915ae60950ee6d5ae67713ffdff6d9896
 *   (2026-11-05, "v2.2 fresh-address launch" head; contains 2f90683 devnet/v22-fresh-ids-stake-closeout,
 *   d26b759 #315, 037f8c9 D8, 72f3196 #341).
 *   - instruction.rs.txt          src/instruction.rs (StakeInstruction::unpack, the tag dispatcher)
 *   - processor.rs.txt            src/processor.rs   (process() dispatch + every handler's account reads)
 *   - sdk_parity_fixtures.rs.txt  src/bin/sdk_parity_fixtures.rs (variant_name: the names the spec uses)
 *   - state-1-300.rs.txt          src/state.rs lines 1..300 (StakePool struct + compile-time size asserts)
 *
 * What the parser reads per handler: `let x = next_account_info(accounts_iter)?` (required, in order),
 * `let x = accounts_iter.next()` (optional, in order), `let rest = accounts_iter.collect()` + `rest.first()` /
 * `rest.get(N)` (variadic tail), `!x.is_signer` (signer), `validate_account_writable(x)` / `!x.is_writable`
 * (writable), following calls into local helpers (e.g. `validate_group_a_proxy`) by parameter position.
 * Writability the runtime enforces only through a CPI (token transfer, mint) is NOT visible statically, so the
 * writable check is a lower bound: every account the Rust explicitly requires writable must be writable in the SDK.
 *
 * Every mismatch the diff finds must be listed in KNOWN below with the SDK builder that depends on it; a new one
 * fails the test. Mutation cases at the bottom prove the parser and the diff catch reordered, dropped, added and
 * re-flagged accounts and renumbered tags.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Keypair, PublicKey, SystemProgram, SYSVAR_CLOCK_PUBKEY, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import {
  STAKE_IX, initPoolAccounts, depositAccounts, depositJuniorAccounts, withdrawAccounts, accrueFeesAccounts,
  flushToInsuranceAccounts, bindInsuranceAuthorityAccounts, rotateInsuranceAccounts, burnAssetAdminAccounts,
  recoverFlushedInsuranceAccounts, adminResolveMarketCpiAccounts, stakeGroupAProxyAccounts, stakeGroupBProxyAccounts,
  recoverTerminalInsuranceAccounts, adminCloseSlabAccounts,
} from "../src/solana/stake.js";
import { buildRecoverTerminalInsuranceIx, buildAdminCloseSlabIx } from "../src/solana/stake-wind-down.js";
import {
  STAKE_IX_V5, ACCOUNTS_STAKE_DEPOSIT_V5, ACCOUNTS_STAKE_WITHDRAW_V5, ACCOUNTS_STAKE_SYNC_V5,
  ACCOUNTS_STAKE_PROPOSE_DEPLOY_TARGET_V5, ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, stakeMetasV5,
} from "../src/abi/v22-stake.js";

// ───────────────────────────── fixture ─────────────────────────────
const STAKE_COMMIT = "214c3e3915ae60950ee6d5ae67713ffdff6d9896";
const FIX = resolve(__dirname, "fixtures/stake/v22-214c3e3");
const SHA256: Record<string, string> = {
  "instruction.rs.txt": "e1ac69179a6ce939135e818604ebe9faeaca7a6747f420eca8450e46592c66ae",
  "processor.rs.txt": "99144d9e61c28e58718cb780512e86094e699b5c29dd85c52f089536716bcf0e",
  "sdk_parity_fixtures.rs.txt": "913a6ca133a0f3408150ba9508e5eb6b333b87e43866813cb7c473813aff3754",
  "state-1-300.rs.txt": "6bfbef4d8929a49393675aeedb1b63318f8296b40bab83a422e5eb836ee79709",
};
const raw = (f: string): string => readFileSync(resolve(FIX, f), "utf8");

// ───────────────────────────── Rust static parser ─────────────────────────────
/** Blank out comments and string/char literals (keeping length and newlines) so brace matching is safe. */
function stripRust(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i]!, n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && n === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;
    } else if (c === '"') {
      out += '"'; i++;
      while (i < src.length && src[i] !== '"') { if (src[i] === "\\") { out += " "; i++; } out += src[i] === "\n" ? "\n" : " "; i++; }
      out += '"'; i++;
    } else if (c === "'" && src[i + 2] === "'" ) {
      out += "' '"; i += 3; // char literal like '{'
    } else if (c === "'" && n === "\\" ) {
      const end = src.indexOf("'", i + 2); out += " ".repeat(end - i + 1); i = end + 1;
    } else { out += c; i++; }
  }
  return out;
}

function matchClose(s: string, open: number): number {
  const o = s[open]!, c = o === "{" ? "}" : o === "(" ? ")" : "]";
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === o) d++;
    else if (s[i] === c && --d === 0) return i;
  }
  throw new Error(`unbalanced ${o} at ${open}`);
}

function splitTop(s: string): string[] {
  const parts: string[] = [];
  let d = 0, cur = "";
  for (const ch of s) {
    if ("([{<".includes(ch)) d++;
    if (")]}>".includes(ch)) d--;
    if (ch === "," && d === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim());
}

type RustFn = { params: string[]; body: string };
function parseFns(src: string): Map<string, RustFn> {
  const s = stripRust(src);
  const fns = new Map<string, RustFn>();
  const re = /\bfn\s+(\w+)\s*(?:<[^(]*?>)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const pOpen = m.index + m[0].length - 1;
    const pClose = matchClose(s, pOpen);
    const bOpen = s.indexOf("{", pClose);
    const semi = s.indexOf(";", pClose);
    if (semi !== -1 && semi < bOpen) continue; // trait decl
    const bClose = matchClose(s, bOpen);
    const params = splitTop(s.slice(pOpen + 1, pClose)).map((p) => p.split(":")[0]!.replace(/^mut\s+/, "").trim());
    if (!fns.has(m[1]!)) fns.set(m[1]!, { params, body: s.slice(bOpen + 1, bClose) });
  }
  return fns;
}

/** Tag -> variants `StakeInstruction::unpack` returns for it, plus the payload lengths each arm checks. */
function parseUnpack(instructionRs: string): Map<number, { variants: string[]; lens: number[] }> {
  const fn = parseFns(instructionRs).get("unpack");
  if (!fn) throw new Error("unpack not found");
  const mt = fn.body.indexOf("match tag");
  const open = fn.body.indexOf("{", mt);
  const block = fn.body.slice(open + 1, matchClose(fn.body, open));
  const out = new Map<number, { variants: string[]; lens: number[] }>();
  const armRe = /(?:^|[\s}])(\d+)\s*=>\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = armRe.exec(block))) {
    const bo = m.index + m[0].length - 1;
    const bc = matchClose(block, bo);
    // Only top-level arms (depth 0 within the match block).
    const before = block.slice(0, m.index);
    const depth = (before.match(/\{/g)?.length ?? 0) - (before.match(/\}/g)?.length ?? 0);
    if (depth !== 0) continue;
    const arm = block.slice(bo + 1, bc);
    const variants = [...new Set([...arm.matchAll(/Self::(\w+)/g)].map((x) => x[1]!))];
    const lens = [...arm.matchAll(/rest\.len\(\)\s*[!=]=\s*(\d+)/g)].map((x) => Number(x[1]));
    if (/rest\.is_empty\(\)/.test(arm)) lens.push(0);
    out.set(Number(m[1]), { variants, lens: [...new Set(lens)].sort((a, b) => a - b) });
    armRe.lastIndex = bc;
  }
  return out;
}

/** `variant_name` in sdk_parity_fixtures.rs: Rust variant -> spec name. */
function parseVariantNames(gen: string): Map<string, string> {
  const fn = parseFns(gen).get("variant_name");
  if (!fn) throw new Error("variant_name not found");
  const raw = fn.body; // names are string literals: re-read them from the unstripped source
  const start = gen.indexOf("fn variant_name");
  const src = gen.slice(start, start + raw.length + 200);
  const out = new Map<string, string>();
  for (const m of src.matchAll(/((?:StakeInstruction::\w+(?:\s*\{\s*\.\.\s*\})?\s*\|?\s*)+)=>\s*\{?\s*"(\w+)"/g)) {
    for (const v of m[1]!.matchAll(/StakeInstruction::(\w+)/g)) out.set(v[1]!, m[2]!);
  }
  return out;
}

/** `process()` dispatch: variant -> handler fn name, or `Deprecated:<Error>` for arms that just return an error. */
function parseDispatch(processorRs: string): Map<string, string> {
  const fn = parseFns(processorRs).get("process");
  if (!fn) throw new Error("process not found");
  const out = new Map<string, string>();
  const re = /StakeInstruction::(\w+)/g;
  const hits = [...fn.body.matchAll(re)];
  hits.forEach((h, i) => {
    if (h[1] === "unpack") return;
    const seg = fn.body.slice(h.index! + h[0].length, hits[i + 1]?.index ?? fn.body.length);
    const arrow = seg.indexOf("=>");
    const rhs = seg.slice(arrow + 2);
    const call = /^\s*\{?\s*(process_\w+)\s*\(/.exec(rhs);
    const err = /^\s*\{?\s*Err\(\s*StakeError::(\w+)/.exec(rhs);
    out.set(h[1]!, call ? call[1]! : err ? `Deprecated:${err[1]}` : "?");
  });
  return out;
}

export type RustAcct = { name: string; kind: "required" | "optional" | "tail" };
export type RustAccounts = {
  fn: string;
  list: RustAcct[];
  /** Optional accounts the handler can demand with `.ok_or(NotEnoughAccountKeys)`. */
  demandable: Set<string>;
  signers: Set<string>;
  writable: Set<string>;
};

type Checks = { signers: Set<string>; writable: Set<string>; demands: Set<string> };
function checksIn(fns: Map<string, RustFn>, name: string, seen = new Set<string>()): Checks {
  const fn = fns.get(name)!;
  const signers = new Set<string>(), writable = new Set<string>(), demands = new Set<string>();
  // An Option<&AccountInfo> the body refuses to see as None: `x.ok_or(NotEnoughAccountKeys)` or `match x { .. None .. => Err(NotEnoughAccountKeys) }`.
  for (const m of fn.body.matchAll(/\b(\w+)\s*\.ok_or\(\s*ProgramError::NotEnoughAccountKeys/g)) demands.add(m[1]!);
  for (const m of fn.body.matchAll(/\bmatch\s+(\w+)\s*\{/g)) {
    const open = m.index! + m[0].length - 1;
    const arms = fn.body.slice(open, matchClose(fn.body, open) + 1);
    if (/None[^=]*=>[^;]*?\{?[^}]*NotEnoughAccountKeys/.test(arms)) demands.add(m[1]!);
  }
  for (const m of fn.body.matchAll(/!\s*(\w+)\.is_signer\b/g)) signers.add(m[1]!);
  for (const m of fn.body.matchAll(/!\s*(\w+)\.is_writable\b/g)) writable.add(m[1]!);
  for (const m of fn.body.matchAll(/validate_account_writable\(\s*(\w+)\s*\)/g)) writable.add(m[1]!);
  // Follow local helper calls by parameter position (validate_group_a_proxy, is_upgrade_authority, ...).
  for (const m of fn.body.matchAll(/\b(\w+)\s*\(/g)) {
    const callee = m[1]!;
    if (callee === name || seen.has(callee) || callee.startsWith("process_") || !fns.has(callee)) continue;
    if (callee === "validate_account_writable") continue;
    const open = m.index! + m[0].length - 1;
    const args = splitTop(fn.body.slice(open + 1, matchClose(fn.body, open)));
    const inner = checksIn(fns, callee, new Set([...seen, name]));
    const params = fns.get(callee)!.params;
    params.forEach((p, i) => {
      const arg = (args[i] ?? "").replace(/^&\s*(mut\s+)?/, "").trim();
      if (!/^\w+$/.test(arg)) return;
      if (inner.signers.has(p)) signers.add(arg);
      if (inner.writable.has(p)) writable.add(arg);
      if (inner.demands.has(p)) demands.add(arg);
    });
  }
  return { signers, writable, demands };
}

export function handlerAccounts(fns: Map<string, RustFn>, handler: string): RustAccounts {
  const fn = fns.get(handler);
  if (!fn) throw new Error(`handler ${handler} not found`);
  // Delegating handler (process_init_trading_pool -> process_init_pool(program_id, accounts, ..)).
  if (!/accounts_iter/.test(fn.body)) {
    const d = /\b(process_\w+)\s*\(\s*program_id\s*,\s*accounts\s*,/.exec(fn.body);
    if (d) return { ...handlerAccounts(fns, d[1]!), fn: handler };
  }
  const list: RustAcct[] = [];
  const re = /let\s+(\w+)\s*(?::[^=;]+)?=\s*(next_account_info\(\s*accounts_iter\s*\)\s*\?|accounts_iter\.next\(\)|accounts_iter\.collect\(\))/g;
  let tailName: string | null = null;
  for (const m of fn.body.matchAll(re)) {
    if (m[2]!.startsWith("next_account_info")) list.push({ name: m[1]!, kind: "required" });
    else if (m[2]!.startsWith("accounts_iter.next")) list.push({ name: m[1]!, kind: "optional" });
    else tailName = m[1]!;
  }
  if (tailName) {
    const idx = new Set<number>();
    for (const m of fn.body.matchAll(new RegExp(`\\b${tailName}\\.(first\\(\\)|get\\((\\d+)\\))`, "g"))) idx.add(m[2] ? Number(m[2]) : 0);
    for (const m of fn.body.matchAll(new RegExp(`\\b${tailName}\\.iter\\(\\)\\.take\\((\\d+)\\)`, "g"))) for (let k = 0; k < Number(m[1]); k++) idx.add(k);
    const n = idx.size ? Math.max(...idx) + 1 : 0;
    for (let k = 0; k < n; k++) list.push({ name: `${tailName}[${k}]`, kind: "tail" });
  }
  const { signers, writable, demands } = checksIn(fns, handler);
  const names = new Set(list.map((a) => a.name));
  const demandable = new Set([...demands].filter((d) => names.has(d)));
  for (const m of fn.body.matchAll(new RegExp(`\\*?${tailName ?? "\\u0000"}\\.(first\\(\\)|get\\((\\d+)\\))\\.ok_or\\(\\s*ProgramError::NotEnoughAccountKeys`, "g"))) demandable.add(`${tailName}[${m[2] ?? 0}]`);
  return { fn: handler, list, demandable, signers, writable };
}

// ───────────────────────────── SDK vs Rust diff ─────────────────────────────
type Meta = { pubkey: PublicKey; isSigner: boolean; isWritable: boolean };
export type Case = {
  /** SDK builder (function name) this case drives. */
  builder: string;
  tag: number;
  mode: string;
  metas: Meta[] | (() => Meta[]);
  /** Rust account name -> key the case passed for it (order check). Unlisted Rust names are not key-checked. */
  keys: Record<string, PublicKey>;
  /** Optional/tail Rust accounts this mode needs (beyond the required prefix). */
  needs?: string[];
  /** Instruction data the builder emits (build*Ix): tag byte and payload width are checked against `unpack`. */
  data?: Uint8Array;
};

export function diffCase(r: RustAccounts, c: Case, lens?: number[]): string[] {
  const out: string[] = [];
  const tagStr = `${c.builder} [tag ${c.tag}, ${c.mode}]`;
  if (c.data) {
    if (c.data[0] !== c.tag) out.push(`${tagStr}: data tag byte ${c.data[0]} != ${c.tag}`);
    if (lens && !lens.includes(c.data.length - 1)) out.push(`${tagStr}: payload ${c.data.length - 1} bytes, unpack takes ${lens.join("/")}`);
  }
  let metas: Meta[];
  try { metas = typeof c.metas === "function" ? c.metas() : c.metas; } catch (e) { return [`${tagStr}: builder throws (${(e as Error).message.slice(0, 80)})`]; }
  const required = r.list.filter((a) => a.kind === "required").length;
  const max = r.list.length;
  const needIdx = (c.needs ?? []).map((n) => r.list.findIndex((a) => a.name === n));
  const minForMode = Math.max(required, ...needIdx.map((i) => i + 1));
  const hasTail = r.list.some((a) => a.kind === "tail");
  if (metas.length < minForMode) out.push(`${tagStr}: count ${metas.length} < ${minForMode} the handler ${r.fn} reads in this mode`);
  else if (metas.length > max && !hasTail) out.push(`${tagStr}: count ${metas.length} > ${max} accounts ${r.fn} ever reads (extra trailing accounts are ignored)`);
  for (const n of c.needs ?? []) if (!r.demandable.has(n) && r.list.find((a) => a.name === n)?.kind !== "required") out.push(`${tagStr}: needs '${n}' but ${r.fn} never demands it`);
  r.list.forEach((a, i) => {
    const m = metas[i];
    if (!m) return;
    const want = c.keys[a.name];
    if (want && !m.pubkey.equals(want)) out.push(`${tagStr}: [${i}] is not '${a.name}' (order)`);
    if (r.signers.has(a.name) && !m.isSigner) out.push(`${tagStr}: [${i}] '${a.name}' must be signer`);
    if (!r.signers.has(a.name) && m.isSigner) out.push(`${tagStr}: [${i}] '${a.name}' is signer but ${r.fn} never checks it`);
    if (r.writable.has(a.name) && !m.isWritable) out.push(`${tagStr}: [${i}] '${a.name}' must be writable`);
  });
  return out;
}

// ───────────────────────────── cases ─────────────────────────────
const pk = (): PublicKey => Keypair.generate().publicKey;
const K = {
  admin: pk(), user: pk(), pool: pk(), slab: pk(), lpMint: pk(), vault: pk(), vaultAuth: pk(), collMint: pk(), wrapper: pk(),
  userAta: pk(), userLp: pk(), deposit: pk(), units: pk(), caller: pk(), wrapperVault: pk(), wrapperVaultAuth: pk(),
  newTarget: pk(), creator: pk(), stray: pk(), poolDest: pk(),
};
// Classic SPL Token (defined here, not imported, so the test runs on bases before and after the spl-token-lite move).
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN = TOKEN_PROGRAM_ID, SYS = SystemProgram.programId, CLOCK = SYSVAR_CLOCK_PUBKEY, RENT = SYSVAR_RENT_PUBKEY;
const dep = { user: K.user, pool: K.pool, userCollateralAta: K.userAta, vault: K.vault, lpMint: K.lpMint, userLpAta: K.userLp, vaultAuth: K.vaultAuth, depositPda: K.deposit, slab: K.slab };
const wd = { user: K.user, pool: K.pool, userLpAta: K.userLp, lpMint: K.lpMint, vault: K.vault, userCollateralAta: K.userAta, vaultAuth: K.vaultAuth, depositPda: K.deposit, slab: K.slab };
// #637 adds these optional fields; on a base without #637 they are ignored (spread keeps excess-property checks off).
const v5Route = { riskMode: 1, wrapperProgram: K.wrapper, insuranceUnits: K.units };
const depKeys = { user: K.user, pool_pda: K.pool, user_ata: K.userAta, vault: K.vault, lp_mint: K.lpMint, user_lp_ata: K.userLp, vault_auth: K.vaultAuth, deposit_pda: K.deposit, token_program: TOKEN, clock_sysvar: CLOCK, system_program: SYS, fee_slab: K.slab, v5_units_ai: K.units, v5_wrapper_ai: K.wrapper };
const wdKeys = { user: K.user, pool_pda: K.pool, user_lp_ata: K.userLp, lp_mint: K.lpMint, vault: K.vault, user_ata: K.userAta, vault_auth: K.vaultAuth, deposit_pda: K.deposit, token_program: TOKEN, clock_sysvar: CLOCK, fee_slab: K.slab, v5_units_ai: K.units, v5_wrapper_ai: K.wrapper, v5_system_ai: SYS };
const rti = { caller: K.caller, pool: K.pool, poolVault: K.vault, vaultAuth: K.vaultAuth, market: K.slab, wrapperVault: K.wrapperVault, wrapperVaultAuthority: K.wrapperVaultAuth, wrapperProgram: K.wrapper };
const rtiKeys = { _caller: K.caller, pool_pda: K.pool, vault: K.vault, vault_auth: K.vaultAuth, market: K.slab, wrapper_vault: K.wrapperVault, wrapper_vault_auth: K.wrapperVaultAuth, token_program: TOKEN, percolator_program: K.wrapper };
const proxyA = { admin: K.admin, poolPda: K.pool, slab: K.slab, percolatorProgram: K.wrapper };
const proxyAKeys = { admin: K.admin, pool_pda: K.pool, slab: K.slab, percolator_program: K.wrapper };
const proxyB = { ...proxyA, vaultAuth: K.vaultAuth };
const proxyBKeys = { admin: K.admin, pool_pda: K.pool, vault_auth: K.vaultAuth, slab: K.slab, percolator_program: K.wrapper };
const v5Keys = { user: K.user, pool: K.pool, userCollateral: K.userAta, vault: K.vault, lpMint: K.lpMint, userLp: K.userLp, vaultAuthority: K.vaultAuth, deposit: K.deposit, market: K.slab, insuranceUnits: K.units, wrapperProgram: K.wrapper };

const CASES: Case[] = [
  { builder: "initPoolAccounts", tag: 0, mode: "InitPool / InitPoolV5", metas: initPoolAccounts({ admin: K.admin, slab: K.slab, pool: K.pool, lpMint: K.lpMint, vault: K.vault, vaultAuth: K.vaultAuth, collateralMint: K.collMint, percolatorProgram: K.wrapper }),
    keys: { admin: K.admin, slab: K.slab, pool_pda: K.pool, lp_mint: K.lpMint, vault: K.vault, vault_auth: K.vaultAuth, collateral_mint: K.collMint, percolator_program: K.wrapper, token_program: TOKEN, system_program: SYS, rent_sysvar: RENT } },
  { builder: "initPoolAccounts", tag: 13, mode: "InitTradingPool", metas: initPoolAccounts({ admin: K.admin, slab: K.slab, pool: K.pool, lpMint: K.lpMint, vault: K.vault, vaultAuth: K.vaultAuth, collateralMint: K.collMint, percolatorProgram: K.wrapper }),
    keys: { admin: K.admin, slab: K.slab, pool_pda: K.pool } },
  { builder: "depositAccounts", tag: 1, mode: "legacy/FEE_ONLY (mode-0 slab)", metas: depositAccounts(dep), keys: depKeys, needs: ["fee_slab"] },
  { builder: "depositAccounts", tag: 1, mode: "FIRST_LOSS", metas: () => depositAccounts({ ...dep, ...v5Route } as typeof dep), keys: depKeys, needs: ["fee_slab", "v5_units_ai", "v5_wrapper_ai"] },
  { builder: "ACCOUNTS_STAKE_DEPOSIT_V5", tag: 1, mode: "FIRST_LOSS", metas: stakeMetasV5(ACCOUNTS_STAKE_DEPOSIT_V5, v5Keys), keys: depKeys, needs: ["fee_slab", "v5_units_ai", "v5_wrapper_ai"] },
  { builder: "depositJuniorAccounts", tag: 16, mode: "FEE_ONLY tranche", metas: depositJuniorAccounts(dep), keys: depKeys, needs: ["fee_slab"] },
  { builder: "withdrawAccounts", tag: 2, mode: "legacy/FEE_ONLY (with slab)", metas: withdrawAccounts(wd), keys: wdKeys, needs: ["fee_slab"] },
  { builder: "withdrawAccounts", tag: 2, mode: "FIRST_LOSS", metas: () => withdrawAccounts({ ...wd, ...v5Route } as typeof wd), keys: wdKeys, needs: ["fee_slab", "v5_units_ai", "v5_wrapper_ai", "v5_system_ai"] },
  { builder: "ACCOUNTS_STAKE_WITHDRAW_V5", tag: 2, mode: "FIRST_LOSS", metas: stakeMetasV5(ACCOUNTS_STAKE_WITHDRAW_V5, v5Keys), keys: wdKeys, needs: ["fee_slab", "v5_units_ai", "v5_wrapper_ai", "v5_system_ai"] },
  { builder: "accrueFeesAccounts", tag: 12, mode: "any", metas: accrueFeesAccounts({ caller: K.caller, pool: K.pool, vault: K.vault, slab: K.slab }),
    keys: { caller: K.caller, pool_ai: K.pool, vault_ai: K.vault, clock_ai: CLOCK, slab_ai: K.slab } },
  { builder: "flushToInsuranceAccounts", tag: 3, mode: "any", metas: flushToInsuranceAccounts({ caller: K.caller, pool: K.pool, vault: K.vault, vaultAuth: K.vaultAuth, slab: K.slab, wrapperVault: K.wrapperVault, percolatorProgram: K.wrapper }), keys: {} },
  { builder: "recoverFlushedInsuranceAccounts", tag: 23, mode: "any", metas: recoverFlushedInsuranceAccounts({ caller: K.caller, poolPda: K.pool, poolVault: K.vault, vaultAuth: K.vaultAuth, wrapperMarket: K.slab, wrapperVault: K.wrapperVault, wrapperVaultAuth: K.wrapperVaultAuth, tokenProgram: TOKEN, percolatorProgram: K.wrapper }), keys: {} },
  { builder: "bindInsuranceAuthorityAccounts", tag: 19, mode: "any", metas: bindInsuranceAuthorityAccounts({ admin: K.admin, poolPda: K.pool, vaultAuth: K.vaultAuth, slab: K.slab, percolatorProgram: K.wrapper }), keys: proxyBKeys },
  { builder: "rotateInsuranceAccounts", tag: 20, mode: "authority", metas: rotateInsuranceAccounts({ admin: K.admin, poolPda: K.pool, vaultAuth: K.vaultAuth, newTarget: K.newTarget, slab: K.slab, percolatorProgram: K.wrapper }),
    keys: { ...proxyBKeys, new_target: K.newTarget } },
  { builder: "rotateInsuranceAccounts", tag: 22, mode: "operator", metas: rotateInsuranceAccounts({ admin: K.admin, poolPda: K.pool, vaultAuth: K.vaultAuth, newTarget: K.newTarget, slab: K.slab, percolatorProgram: K.wrapper }),
    keys: { ...proxyBKeys, new_target: K.newTarget } },
  { builder: "burnAssetAdminAccounts", tag: 21, mode: "any", metas: burnAssetAdminAccounts({ admin: K.admin, poolPda: K.pool, vaultAuth: K.vaultAuth, slab: K.slab, percolatorProgram: K.wrapper }), keys: proxyBKeys },
  { builder: "adminResolveMarketCpiAccounts", tag: 24, mode: "any", metas: adminResolveMarketCpiAccounts(proxyA), keys: proxyAKeys },
  { builder: "stakeGroupAProxyAccounts", tag: 25, mode: "AdminUpdateFeeSplit", metas: stakeGroupAProxyAccounts(proxyA), keys: proxyAKeys },
  { builder: "stakeGroupAProxyAccounts", tag: 26, mode: "AdminUpdateMaintenanceFeePerSlot", metas: stakeGroupAProxyAccounts(proxyA), keys: proxyAKeys },
  { builder: "stakeGroupBProxyAccounts", tag: 27, mode: "AdminUpdateBackingFeePolicy", metas: stakeGroupBProxyAccounts(proxyB), keys: proxyBKeys },
  { builder: "stakeGroupBProxyAccounts", tag: 28, mode: "AdminUpdateTradeFeePolicy", metas: stakeGroupBProxyAccounts(proxyB), keys: proxyBKeys },
  { builder: "recoverTerminalInsuranceAccounts", tag: 29, mode: "legacy (+stray)", metas: recoverTerminalInsuranceAccounts({ ...rti, riskMode: 0, stray: K.stray }), keys: { ...rtiKeys, "rest[0]": K.stray } },
  { builder: "recoverTerminalInsuranceAccounts", tag: 29, mode: "FIRST_LOSS", metas: recoverTerminalInsuranceAccounts({ ...rti, riskMode: 1, insuranceUnits: K.units, creatorToken: K.creator, stray: K.stray }),
    keys: { ...rtiKeys, "rest[0]": K.units, "rest[1]": K.creator, "rest[2]": K.stray }, needs: ["rest[0]", "rest[1]"] },
  { builder: "recoverTerminalInsuranceAccounts", tag: 29, mode: "FEE_ONLY", metas: recoverTerminalInsuranceAccounts({ ...rti, riskMode: 2, creatorToken: K.creator }), keys: { ...rtiKeys, "rest[0]": K.creator } },
  ...(() => {
    const ix = buildRecoverTerminalInsuranceIx({ ...rti, stakeProgram: K.pool, riskMode: 1, insuranceUnits: K.units, creatorToken: K.creator }, 5n);
    return [{ builder: "buildRecoverTerminalInsuranceIx", tag: 29, mode: "FIRST_LOSS", metas: ix.keys, data: new Uint8Array(ix.data),
      keys: { ...rtiKeys, "rest[0]": K.units, "rest[1]": K.creator }, needs: ["rest[0]", "rest[1]"] } as Case];
  })(),
  ...(() => {
    const ix = buildAdminCloseSlabIx({ stakeProgram: K.pool, admin: K.admin, pool: K.pool, market: K.slab, wrapperVault: K.wrapperVault, wrapperVaultAuthority: K.wrapperVaultAuth, poolDestToken: K.poolDest, collateralMint: K.collMint, poolVault: K.vault, wrapperProgram: K.wrapper });
    return [{ builder: "buildAdminCloseSlabIx", tag: 30, mode: "any", metas: ix.keys, data: new Uint8Array(ix.data),
      keys: { admin: K.admin, market: K.slab, pool_dest: K.poolDest, mint: K.collMint, vault: K.vault, percolator_program: K.wrapper } } as Case];
  })(),
  { builder: "adminCloseSlabAccounts", tag: 30, mode: "any", metas: adminCloseSlabAccounts({ admin: K.admin, pool: K.pool, market: K.slab, wrapperVault: K.wrapperVault, wrapperVaultAuthority: K.wrapperVaultAuth, poolDestToken: K.poolDest, collateralMint: K.collMint, poolVault: K.vault, wrapperProgram: K.wrapper }),
    keys: { admin: K.admin, pool_pda: K.pool, market: K.slab, wrapper_vault: K.wrapperVault, wrapper_vault_auth: K.wrapperVaultAuth, pool_dest: K.poolDest, token_program: TOKEN, mint: K.collMint, vault: K.vault, percolator_program: K.wrapper } },
  { builder: "ACCOUNTS_STAKE_SYNC_V5", tag: 31, mode: "FIRST_LOSS", metas: stakeMetasV5(ACCOUNTS_STAKE_SYNC_V5, { caller: K.caller, pool: K.pool, vault: K.vault, vaultAuthority: K.vaultAuth, market: K.slab, wrapperVault: K.wrapperVault, wrapperVaultAuthority: K.wrapperVaultAuth, insuranceUnits: K.units, wrapperProgram: K.wrapper }),
    keys: { caller: K.caller, pool_pda: K.pool, vault: K.vault, vault_auth: K.vaultAuth, market: K.slab, wrapper_vault: K.wrapperVault, wrapper_vault_auth: K.wrapperVaultAuth, ins_units: K.units, token_program: TOKEN, percolator_program: K.wrapper, system_program: SYS } },
  { builder: "ACCOUNTS_STAKE_PROPOSE_DEPLOY_TARGET_V5", tag: 32, mode: "lower", metas: stakeMetasV5(ACCOUNTS_STAKE_PROPOSE_DEPLOY_TARGET_V5, { authority: K.admin, pool: K.pool }), keys: { signer: K.admin, pool_pda: K.pool } },
  { builder: "ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5", tag: 33, mode: "any", metas: stakeMetasV5(ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5, { anyone: K.caller, pool: K.pool }), keys: { signer: K.caller, pool_pda: K.pool } },
];

/**
 * Every mismatch the diff is allowed to find at 214c3e3, with the builder that depends on it.
 * `inScope` = the builder lives in a file an open PR touches (#637 src/solana/stake.ts, #540 stake-wind-down.ts).
 * An entry that stops firing (e.g. #637 merged) is fine; a NEW mismatch fails the test.
 */
const KNOWN: Record<string, { inScope: boolean; why: string }> = {
  "depositAccounts [tag 1, FIRST_LOSS]: count 12 < 14 the handler process_deposit reads in this mode":
    { inScope: true, why: "base depositAccounts has no riskMode route; FIRST_LOSS demands [12] units / [13] wrapper (NotEnoughAccountKeys). Fixed by open PR #637." },
  "withdrawAccounts [tag 2, FIRST_LOSS]: count 11 < 14 the handler process_withdraw reads in this mode":
    { inScope: true, why: "base withdrawAccounts has no riskMode route; FIRST_LOSS demands [11] units / [12] wrapper / [13] system. Fixed by open PR #637." },
  "ACCOUNTS_STAKE_COMMIT_DEPLOY_TARGET_V5 [tag 33, any]: count 3 > 2 accounts process_commit_deploy_target ever reads (extra trailing accounts are ignored)":
    { inScope: false, why: "v22-stake.ts (no open PR) sends a trailing clock the handler never reads (it uses Clock::get()); harmless." },
};

/** Builders whose tag the v2.2 processor no longer serves (dispatch arm returns an error). */
const KNOWN_DEPRECATED: Record<number, string[]> = {
  3: ["flushToInsuranceAccounts"],
  23: ["recoverFlushedInsuranceAccounts"],
};

// ───────────────────────────── tests ─────────────────────────────
const instructionRs = raw("instruction.rs.txt");
const processorRs = raw("processor.rs.txt");
const genRs = raw("sdk_parity_fixtures.rs.txt");
const stateRs = raw("state-1-300.rs.txt");
const fns = parseFns(processorRs);
const unpack = parseUnpack(instructionRs);
const names = parseVariantNames(genRs);
const dispatch = parseDispatch(processorRs);

function variantsToHandler(tag: number): { handler: string; variants: string[] } {
  const u = unpack.get(tag);
  if (!u) throw new Error(`tag ${tag} not live in unpack`);
  const handlers = [...new Set(u.variants.map((v) => dispatch.get(v)!))];
  if (handlers.length !== 1) throw new Error(`tag ${tag} -> ${handlers.join(",")}`);
  return { handler: handlers[0]!, variants: u.variants };
}

function runDiff(f: Map<string, RustFn>, cases: Case[]): string[] {
  const out: string[] = [];
  for (const c of cases) {
    const { handler } = variantsToHandler(c.tag);
    if (handler.startsWith("Deprecated:")) continue;
    out.push(...diffCase(handlerAccounts(f, handler), c, unpack.get(c.tag)!.lens));
  }
  return out;
}

const spec = JSON.parse(readFileSync(resolve(__dirname, "../specs/stake-parity.json"), "utf8")) as {
  live_tags: { name: string; tag: number }[]; removed_tags: number[]; stake_pool_size: number; stake_deposit_size: number;
  stake_pool_discriminator: number[];
};

describe(`stake v2.2 Rust (percolator-stake ${STAKE_COMMIT.slice(0, 7)}) static parity`, () => {
  it("fixture files are the pinned verbatim copies", () => {
    for (const [f, h] of Object.entries(SHA256)) expect(createHash("sha256").update(readFileSync(resolve(FIX, f))).digest("hex"), f).toBe(h);
  });

  it("parser sanity: finds the dispatcher, every handler and the account prefix of tag 1", () => {
    expect(unpack.size).toBe(32);
    expect(dispatch.size).toBe(34); // 32 tags; tags 0 and 1 have two variants each
    expect([...dispatch.values()].filter((h) => h === "?")).toEqual([]);
    for (const h of dispatch.values()) if (!h.startsWith("Deprecated:")) expect(fns.has(h), h).toBe(true);
    const d = handlerAccounts(fns, "process_deposit");
    expect(d.list.map((a) => a.name).slice(0, 3)).toEqual(["user", "pool_pda", "user_ata"]);
  });

  describe("tags: emulated sdk_parity_fixtures output at 214c3e3 vs specs/stake-parity.json", () => {
    const rustLive = [...unpack.entries()].sort((a, b) => a[0] - b[0]).map(([tag, u]) => {
      const ns = [...new Set(u.variants.map((v) => names.get(v)))];
      expect(ns, `tag ${tag} variant names`).toHaveLength(1);
      return { name: ns[0]!, tag };
    });
    const specByTag = new Map(spec.live_tags.map((t) => [t.tag, t.name]));
    const rustByTag = new Map(rustLive.map((t) => [t.tag, t.name]));

    it("every spec tag is live in the v2.2 dispatcher under the same name", () => {
      const diff = spec.live_tags.filter((t) => rustByTag.get(t.tag) !== t.name);
      expect(diff).toEqual([]);
    });

    it("v2.2 live tags missing from the spec: exactly 31/32/33 (v5), which the SDK carries in STAKE_IX_V5", () => {
      const missing = rustLive.filter((t) => !specByTag.has(t.tag));
      expect(missing).toEqual([
        { name: "SyncInsuranceDeployment", tag: 31 },
        { name: "ProposeDeployTarget", tag: 32 },
        { name: "CommitDeployTarget", tag: 33 },
      ]);
      for (const t of missing) expect(STAKE_IX_V5[t.name as keyof typeof STAKE_IX_V5]).toBe(t.tag);
    });

    it("removed_tags [11, 17] still matches the v2.2 gaps", () => {
      const top = Math.max(...rustLive.map((t) => t.tag));
      const gaps = Array.from({ length: top }, (_, i) => i).filter((t) => !rustByTag.has(t));
      expect(gaps).toEqual(spec.removed_tags);
    });

    it("every live tag the SDK's STAKE_IX names maps to the Rust tag of the same variant", () => {
      for (const t of rustLive) {
        const sdkName = t.name === "AdminResolveMarket" ? "AdminResolveMarketCpi" : t.name;
        const v = (STAKE_IX as Record<string, number>)[sdkName] ?? (STAKE_IX_V5 as Record<string, number>)[sdkName];
        expect(v, `SDK tag for ${t.name}`).toBe(t.tag);
      }
    });

    it("v5 payload widths: tag 0 also takes 23 bytes (InitPoolV5), tag 1 also takes 15 (DepositWithConsent)", () => {
      expect(unpack.get(0)).toEqual({ variants: ["InitPoolV5", "InitPool"], lens: [16, 23] });
      expect(unpack.get(1)).toEqual({ variants: ["DepositWithConsent", "Deposit"], lens: [8, 15] });
    });

    it("tags 3 and 23 still unpack (spec lists them) but the v2.2 processor answers DeprecatedV5", () => {
      const dead = [...unpack.entries()].filter(([, u]) => u.variants.every((v) => dispatch.get(v)!.startsWith("Deprecated:"))).map(([t]) => t);
      expect(dead.sort((a, b) => a - b)).toEqual([3, 23]);
      expect(dispatch.get("FlushToInsurance")).toBe("Deprecated:DeprecatedV5");
      expect(dispatch.get("RecoverFlushedInsurance")).toBe("Deprecated:DeprecatedV5");
      expect(Object.keys(KNOWN_DEPRECATED).map(Number)).toEqual(dead);
    });

    it("layout: spec stake_pool_size 408 is v4; the v2.2 StakePool is 480 (v5 appends at 408)", () => {
      expect(/assert!\(STAKE_POOL_SIZE == 480\);/.test(stateRs)).toBe(true);
      expect(/assert!\(offset_of!\(StakePool, risk_mode\) == 408\);/.test(stateRs)).toBe(true);
      expect(spec.stake_pool_size).toBe(408);
      const disc = /STAKE_POOL_DISCRIMINATOR: \[u8; 8\] = \[([^\]]+)\]/.exec(stateRs)![1]!.split(",").map((x) => Number(x.trim()));
      expect(disc).toEqual(spec.stake_pool_discriminator);
    });
  });

  describe("accounts: SDK builders vs each handler's account reads", () => {
    const found = runDiff(fns, CASES);

    it("every mismatch is a known, explained one (new drift fails here)", () => {
      expect(found.filter((m) => !KNOWN[m])).toEqual([]);
    });

    it("no tag the SDK builds for is left without a case (except deprecated ones)", () => {
      const covered = new Set(CASES.map((c) => c.tag));
      const live = [...unpack.keys()].filter((t) => !variantsToHandler(t).handler.startsWith("Deprecated:"));
      const noBuilder = live.filter((t) => !covered.has(t)).sort((a, b) => a - b);
      // Admin-only config tags with no SDK account builder (they take [admin signer, pool w] / + clock).
      expect(noBuilder).toEqual([4, 5, 6, 7, 8, 9, 10, 14, 15, 18]);
    });

    it("the tag 3 / 23 builders target handlers the v2.2 processor removed", () => {
      for (const [tag, builders] of Object.entries(KNOWN_DEPRECATED)) {
        expect(variantsToHandler(Number(tag)).handler).toBe("Deprecated:DeprecatedV5");
        for (const b of builders) expect(CASES.some((c) => c.builder === b && c.tag === Number(tag))).toBe(true);
      }
    });

    it("deposit/withdraw/wind-down Rust lists the SDK follows (order, demandable tail, flags)", () => {
      const d = handlerAccounts(fns, "process_deposit");
      expect(d.list.map((a) => `${a.name}:${a.kind[0]}`)).toEqual([
        "user:r", "pool_pda:r", "user_ata:r", "vault:r", "lp_mint:r", "user_lp_ata:r", "vault_auth:r", "deposit_pda:r",
        "token_program:r", "clock_sysvar:r", "system_program:r", "fee_slab:o", "v5_units_ai:o", "v5_wrapper_ai:o",
      ]);
      // fee_slab: mode-0 pricing (`pre_accrue_fee_modes(.., require_slab = true)` -> `None => NotEnoughAccountKeys`).
      expect([...d.demandable].sort()).toEqual(["fee_slab", "v5_units_ai", "v5_wrapper_ai"]);
      expect([...d.signers]).toEqual(["user"]);
      const w = handlerAccounts(fns, "process_withdraw");
      expect(w.list.length).toBe(14);
      expect(w.list.slice(10).map((a) => a.name)).toEqual(["fee_slab", "v5_units_ai", "v5_wrapper_ai", "v5_system_ai"]);
      // fee_slab: a mode-0 Withdraw may not skip the terminal-surplus booking (GH#315, d26b759).
      expect([...w.demandable].sort()).toEqual(["fee_slab", "v5_system_ai", "v5_units_ai", "v5_wrapper_ai"]);
      expect([...w.writable].sort()).toEqual(["deposit_pda", "pool_pda"]);
      const r = handlerAccounts(fns, "process_recover_terminal_insurance");
      expect(r.list.map((a) => a.name).slice(9)).toEqual(["rest[0]", "rest[1]", "rest[2]"]);
      expect([...r.signers]).toEqual([]);
      const c = handlerAccounts(fns, "process_admin_close_slab");
      expect(c.list).toHaveLength(10);
      expect([...c.signers]).toEqual(["admin"]);
      expect([...c.writable].sort()).toEqual(["admin", "pool_dest", "pool_pda", "vault"]);
    });

    it("report: mismatches found at 214c3e3", () => {
      const rows = found.map((m) => ({ m, ...KNOWN[m]! }));
      if (process.env.STAKE_PARITY_REPORT) console.log(JSON.stringify(rows, null, 2));
      expect(rows.every((r) => r.why)).toBe(true);
    });
  });

  describe("mutations: the parser + diff catch each class of drift", () => {
    const mutate = (from: string | RegExp, to: string): Map<string, RustFn> => {
      const next = processorRs.replace(from, to);
      expect(next).not.toBe(processorRs);
      return parseFns(next);
    };
    const depositCase = CASES.find((c) => c.builder === "depositAccounts" && c.mode.startsWith("legacy"))!;
    const closeCase = CASES.find((c) => c.builder === "adminCloseSlabAccounts")!;
    const v5DepCase = CASES.find((c) => c.builder === "ACCOUNTS_STAKE_DEPOSIT_V5")!;
    const rtiCase = CASES.find((c) => c.builder === "recoverTerminalInsuranceAccounts" && c.mode === "FIRST_LOSS")!;
    const one = (f: Map<string, RustFn>, c: Case): string[] => diffCase(handlerAccounts(f, variantsToHandler(c.tag).handler), c);

    it("baseline: the four probe cases are clean", () => {
      for (const c of [depositCase, closeCase, v5DepCase, rtiCase]) expect(one(fns, c)).toEqual([]);
    });
    it("swapped account order (deposit user_ata <-> vault)", () => {
      const f = mutate(
        "    let user_ata = next_account_info(accounts_iter)?;\n    let vault = next_account_info(accounts_iter)?;\n    let lp_mint",
        "    let vault = next_account_info(accounts_iter)?;\n    let user_ata = next_account_info(accounts_iter)?;\n    let lp_mint",
      );
      expect(one(f, depositCase).some((m) => m.includes("(order)"))).toBe(true);
    });
    it("new required account (deposit grows a 12th required)", () => {
      const f = mutate("    let system_program = next_account_info(accounts_iter)?;\n    // #290", "    let system_program = next_account_info(accounts_iter)?;\n    let extra = next_account_info(accounts_iter)?;\n    // #290");
      expect(one(f, depositCase).join("\n")).toMatch(/count 12 < 13|is not 'extra'|\(order\)/);
    });
    it("dropped optional account (v5 deposit loses its wrapper)", () => {
      const f = mutate("    let v5_wrapper_ai = accounts_iter.next();\n\n    if !user.is_signer", "\n    if !user.is_signer");
      expect(one(f, v5DepCase).join("\n")).toMatch(/count 14 > 13|never demands/);
    });
    it("new signer check (close slab: pool_dest must sign)", () => {
      const f = mutate("    validate_account_writable(pool_dest)?;", "    validate_account_writable(pool_dest)?;\n    if !pool_dest.is_signer { return Err(ProgramError::MissingRequiredSignature); }");
      expect(one(f, closeCase)).toContain("adminCloseSlabAccounts [tag 30, any]: [5] 'pool_dest' must be signer");
    });
    it("dropped signer check reported (deposit user no longer checked)", () => {
      const f = mutate("    if !user.is_signer {\n        return Err(ProgramError::MissingRequiredSignature);\n    }\n\n    // I4", "    // I4");
      expect(one(f, depositCase).some((m) => m.includes("'user' is signer but"))).toBe(true);
    });
    it("new writable requirement (close slab: wrapper_vault_auth writable)", () => {
      const f = mutate("    validate_account_writable(pool_dest)?;", "    validate_account_writable(pool_dest)?;\n    validate_account_writable(wrapper_vault_auth)?;");
      expect(one(f, closeCase)).toContain("adminCloseSlabAccounts [tag 30, any]: [4] 'wrapper_vault_auth' must be writable");
    });
    it("signer check moved into a helper is still followed (group A proxy)", () => {
      expect(handlerAccounts(fns, "process_admin_update_fee_split").signers.has("admin")).toBe(true);
      const g = mutate("    if !admin.is_signer {\n        return Err(ProgramError::MissingRequiredSignature);\n    }\n\n    validate_account_owner(pool_pda, program_id)?;\n    validate_account_not_empty(pool_pda)?;\n\n    let pool_data", "    validate_account_owner(pool_pda, program_id)?;\n    validate_account_not_empty(pool_pda)?;\n\n    let pool_data");
      expect(handlerAccounts(g, "process_admin_update_fee_split").signers.has("admin")).toBe(false);
    });
    it("wind-down tail shrinks (FIRST_LOSS creator no longer demanded)", () => {
      const f = mutate("let creator = *rest.get(1).ok_or(ProgramError::NotEnoughAccountKeys)?;", "let creator = *rest.first().ok_or(ProgramError::NotEnoughAccountKeys)?;");
      expect(one(f, rtiCase).some((m) => m.includes("never demands 'rest[1]'") || m.includes("never demands"))).toBe(true);
    });
    it("wrong tag byte / payload width from a build*Ix builder", () => {
      const c = CASES.find((x) => x.builder === "buildAdminCloseSlabIx")!;
      const r = handlerAccounts(fns, "process_admin_close_slab");
      expect(diffCase(r, c, [0])).toEqual([]);
      expect(diffCase(r, { ...c, data: Uint8Array.from([29]) }, [0])).toContain("buildAdminCloseSlabIx [tag 30, any]: data tag byte 29 != 30");
      expect(diffCase(r, { ...c, data: Uint8Array.from([30, 0]) }, [0])).toContain("buildAdminCloseSlabIx [tag 30, any]: payload 1 bytes, unpack takes 0");
    });
    it("renumbered tag (SyncInsuranceDeployment 31 -> 34) is caught by the tag diff", () => {
      const u = parseUnpack(instructionRs.replace("            31 => {\n                if !rest.is_empty()", "            34 => {\n                if !rest.is_empty()"));
      expect(u.has(31)).toBe(false);
      expect(u.get(34)?.variants).toEqual(["SyncInsuranceDeployment"]);
    });
  });
});
