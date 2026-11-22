/**
 * Differential test: every value in `src/abi/v22-launch-settings.ts` against what the on-chain
 * programs accept. If a row falls outside a Rust bound, every market launch of that asset class
 * fails at the last step (tag 38, stake InitPool or vault-LP bind), so the bounds are pinned here.
 *
 * Rust sources were read with `git show` only (no checkout, no cargo):
 *
 *   percolator-prog  origin/feat/v22-rc23-2026-10-22 @ bc657392c31b217f58c4c153aed96bd7c24dad2c
 *   percolator-stake origin/feat/v22-growth-stake    @ 0e19e36dd5b91a9576640c8b6287f348f4cdb98f
 *     (the v22 stake branch the SDK's v5 stake client cites; the same constants sit unchanged at
 *     the newer fix/v22-stake-310-313-combined a58219b and fix/v22-fresh-ids-pins 214c3e3.)
 *
 * The Rust literals below are copies. When those repos are checked out next to this one
 * (`~/agent-work/percolator-prog`, `~/agent-work/percolator-stake`, or PERCOLATOR_PROG_DIR /
 * PERCOLATOR_STAKE_DIR), the last block re-reads each line at the pinned SHA with `git show`
 * and checks the copy (expected text is built from `RUST`, so a drifted literal fails). CI (no
 * sibling repos) skips that block; the literal checks still run.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { PublicKey } from "@solana/web3.js";
import {
  V22_LAUNCH_SETTINGS,
  V22_MAJOR_MINTS,
  V22_STAKE_POOL_MODE_FEE_ONLY,
  type V22AssetClass,
} from "../src/abi/v22-launch-settings.js";

const PROG_SHA = "bc657392c31b217f58c4c153aed96bd7c24dad2c";
const STAKE_SHA = "0e19e36dd5b91a9576640c8b6287f348f4cdb98f";

/** Rust bounds and constants, each with the file:line it was copied from. */
const RUST = {
  // prog src/v16_program.rs:926 `pub const MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS: u64 = 9_000;`
  MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS: 9_000,
  // prog src/v16_program.rs:911 `pub const MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS: u64 = 6_480_000;`
  MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS: 6_480_000,
  // prog src/v16_program.rs:1144 `pub const MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS: u64 = 150;`
  MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS: 150,
  // prog src/v16_program.rs:1134 `pub const MAX_LP_REDEMPTION_COOLDOWN_SLOTS: u64 = 78_840_000;`
  MAX_LP_REDEMPTION_COOLDOWN_SLOTS: 78_840_000,
  // stake src/processor.rs:96 `const MAX_COOLDOWN_SLOTS: u64 = 78_840_000;`
  STAKE_MAX_COOLDOWN_SLOTS: 78_840_000,
  // stake src/state.rs:304-306 RISK_MODE_LEGACY = 0, RISK_MODE_FIRST_LOSS = 1, RISK_MODE_FEE_ONLY = 2
  RISK_MODE_LEGACY: 0,
  RISK_MODE_FIRST_LOSS: 1,
  RISK_MODE_FEE_ONLY: 2,
} as const;

// ---- The program checks, transcribed as predicates (true = the program accepts the value). ----

/**
 * prog src/v16_program.rs:29247-29253, `handle_configure_permissionless_resolve` (tag 38, decoded at
 * :10458): `stale_slots < MIN || stale_slots > MAX` -> InvalidInstruction. Inclusive range.
 */
const tag38AcceptsStale = (s: number) =>
  s >= RUST.MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS && s <= RUST.MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS;

/**
 * stake src/processor.rs:154-164 `validate_cooldown_slots`, called by `process_init_pool` (:566)
 * at :631 for both InitPool and InitPoolV5: `== 0` or `> MAX_COOLDOWN_SLOTS` -> InvalidArgument.
 */
const stakeInitPoolAcceptsCooldown = (c: number) => c !== 0 && c <= RUST.STAKE_MAX_COOLDOWN_SLOTS;

/**
 * stake src/processor.rs:548-556 `V5Init::validate`: only FIRST_LOSS (1) and FEE_ONLY (2) are
 * creatable (`_ => false`, legacy 0 is refused with InvalidDeployConfig).
 */
const stakeInitPoolAcceptsMode = (m: number) =>
  m === RUST.RISK_MODE_FIRST_LOSS || m === RUST.RISK_MODE_FEE_ONLY;

/**
 * Earn vault cooldown has two gates:
 *  - CreateLpVault, prog src/v16_program.rs:31987 (`handle_create_lp_vault` :31952):
 *    `> MAX_LP_REDEMPTION_COOLDOWN_SLOTS` -> refused;
 *  - vault-LP bind (tag 94 InitVaultLp), prog src/v16_program.rs:38056-38057 (`handle_init_vault_lp`
 *    :38008): `registry.redemption_cooldown_slots < MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS`
 *    -> InvalidInstruction (#569, D22).
 */
const vaultAcceptsCooldown = (c: number) =>
  c >= RUST.MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS && c <= RUST.MAX_LP_REDEMPTION_COOLDOWN_SLOTS;

const CLASSES: V22AssetClass[] = ["major", "meme"];

describe("v22 launch settings vs the Rust bounds (prog bc657392, stake 0e19e36)", () => {
  it("the predicates reject just outside each bound (the transcription is not vacuous)", () => {
    expect(tag38AcceptsStale(8_999)).toBe(false);
    expect(tag38AcceptsStale(9_000)).toBe(true);
    expect(tag38AcceptsStale(6_480_000)).toBe(true);
    expect(tag38AcceptsStale(6_480_001)).toBe(false);
    expect(stakeInitPoolAcceptsCooldown(0)).toBe(false);
    expect(stakeInitPoolAcceptsCooldown(1)).toBe(true);
    expect(stakeInitPoolAcceptsCooldown(78_840_001)).toBe(false);
    expect(stakeInitPoolAcceptsMode(0)).toBe(false);
    expect(stakeInitPoolAcceptsMode(3)).toBe(false);
    expect(vaultAcceptsCooldown(149)).toBe(false);
    expect(vaultAcceptsCooldown(150)).toBe(true);
    expect(vaultAcceptsCooldown(78_840_001)).toBe(false);
  });

  for (const cls of CLASSES) {
    describe(`${cls} row`, () => {
      const row = V22_LAUNCH_SETTINGS[cls];

      it(`staleWindowSlots ${row.staleWindowSlots} is inside tag 38's 9,000..=6,480,000`, () => {
        expect(Number.isSafeInteger(row.staleWindowSlots)).toBe(true);
        expect(tag38AcceptsStale(row.staleWindowSlots)).toBe(true);
      });

      it(`stakeCooldownSlots ${row.stakeCooldownSlots} passes stake InitPool's validate_cooldown_slots`, () => {
        expect(Number.isSafeInteger(row.stakeCooldownSlots)).toBe(true);
        expect(stakeInitPoolAcceptsCooldown(row.stakeCooldownSlots)).toBe(true);
      });

      it(`stakePoolMode ${row.stakePoolMode} equals stake RISK_MODE_FEE_ONLY and is creatable`, () => {
        expect(row.stakePoolMode).toBe(RUST.RISK_MODE_FEE_ONLY);
        expect(stakeInitPoolAcceptsMode(row.stakePoolMode)).toBe(true);
      });

      it(`earnRedemptionCooldownSlots ${row.earnRedemptionCooldownSlots} passes CreateLpVault and the vault-LP bind`, () => {
        expect(Number.isSafeInteger(row.earnRedemptionCooldownSlots)).toBe(true);
        expect(vaultAcceptsCooldown(row.earnRedemptionCooldownSlots)).toBe(true);
      });
    });
  }

  it("V22_STAKE_POOL_MODE_FEE_ONLY equals stake state.rs:306 RISK_MODE_FEE_ONLY (not 1 FIRST_LOSS, not 0 legacy)", () => {
    expect(V22_STAKE_POOL_MODE_FEE_ONLY).toBe(RUST.RISK_MODE_FEE_ONLY);
    expect(V22_STAKE_POOL_MODE_FEE_ONLY).not.toBe(RUST.RISK_MODE_FIRST_LOSS);
    expect(V22_STAKE_POOL_MODE_FEE_ONLY).not.toBe(RUST.RISK_MODE_LEGACY);
  });

  it("the 'program refuses < 150' doc claim equals prog MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS", () => {
    expect(RUST.MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS).toBe(150);
  });

  it("V22_MAJOR_MINTS: no Rust bound exists; each is a valid 32-byte key, wSOL is the SPL native mint", () => {
    // Neither program pins a major-mint list (grep of both trees at the pinned SHAs: only a wSOL
    // depth fixture under prog tests/). The class only picks the stale window, and BOTH windows
    // pass tag 38 (above), so a misclassified mint still launches.
    expect(V22_MAJOR_MINTS).toHaveLength(2);
    for (const m of V22_MAJOR_MINTS) {
      expect(new PublicKey(m).toBytes()).toHaveLength(32);
      expect(new PublicKey(m).toBase58()).toBe(m);
    }
    // spl-token NATIVE_MINT
    expect(V22_MAJOR_MINTS[0]).toBe("So11111111111111111111111111111111111111112");
    // Coinbase Wrapped BTC (cbBTC) mainnet mint
    expect(V22_MAJOR_MINTS[1]).toBe("cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij");
  });
});

// ---- Optional live re-read of the Rust at the pinned SHAs (skipped when the repos are absent). ----

function repoAt(envVar: string, name: string, sha: string): string | null {
  const dir = process.env[envVar] ?? join(homedir(), "agent-work", name);
  if (!existsSync(join(dir, ".git"))) return null;
  try {
    execFileSync("git", ["-C", dir, "cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
    return dir;
  } catch {
    console.warn(`${dir} exists but lacks ${sha}; fetch it to run the live Rust re-read`);
    return null;
  }
}

const rustFiles = new Map<string, string[]>();
function rustLine(dir: string, sha: string, file: string, line: number): string {
  const key = `${dir}\0${sha}\0${file}`;
  let lines = rustFiles.get(key);
  if (!lines) {
    lines = execFileSync("git", ["-C", dir, "show", `${sha}:${file}`], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    }).split("\n");
    rustFiles.set(key, lines);
  }
  return lines[line - 1] ?? "";
}

/** Rust integer literal for a JS number: 6480000 -> "6_480_000". */
const rs = (n: number) => n.toLocaleString("en-US").replace(/,/g, "_");

const PROG_DIR = repoAt("PERCOLATOR_PROG_DIR", "percolator-prog", PROG_SHA);
const STAKE_DIR = repoAt("PERCOLATOR_STAKE_DIR", "percolator-stake", STAKE_SHA);

describe.skipIf(!PROG_DIR)(`live: percolator-prog @ ${PROG_SHA.slice(0, 8)}`, () => {
  const F = "src/v16_program.rs";
  it.each([
    [911, `pub const MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS: u64 = ${rs(RUST.MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS)};`],
    [926, `pub const MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS: u64 = ${rs(RUST.MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS)};`],
    [1134, `pub const MAX_LP_REDEMPTION_COOLDOWN_SLOTS: u64 = ${rs(RUST.MAX_LP_REDEMPTION_COOLDOWN_SLOTS)};`],
    [1144, `pub const MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS: u64 = ${rs(RUST.MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS)};`],
    [10458, "38 => Self::ConfigurePermissionlessResolve {"],
    [29247, "if stale_slots < constants::MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS"],
    [29248, "|| stale_slots > constants::MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS"],
    [31987, "if redemption_cooldown_slots > crate::constants::MAX_LP_REDEMPTION_COOLDOWN_SLOTS {"],
    [38008, "fn handle_init_vault_lp<'a>("],
    [38057, "< crate::constants::MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS"],
  ])(`${F}:%i is %s`, (line, text) => {
    expect(rustLine(PROG_DIR!, PROG_SHA, F, line).trim()).toBe(text);
  });
});

describe.skipIf(!STAKE_DIR)(`live: percolator-stake @ ${STAKE_SHA.slice(0, 8)}`, () => {
  it.each([
    ["src/processor.rs", 96, `const MAX_COOLDOWN_SLOTS: u64 = ${rs(RUST.STAKE_MAX_COOLDOWN_SLOTS)};`],
    ["src/processor.rs", 155, "if cooldown_slots == 0 {"],
    ["src/processor.rs", 159, "if cooldown_slots > MAX_COOLDOWN_SLOTS {"],
    ["src/processor.rs", 554, "state::RISK_MODE_FEE_ONLY => self.deploy_target_bps == 0,"],
    ["src/processor.rs", 555, "_ => false,"],
    ["src/processor.rs", 631, "validate_cooldown_slots(cooldown_slots)?;"],
    ["src/state.rs", 304, `pub const RISK_MODE_LEGACY: u8 = ${RUST.RISK_MODE_LEGACY};`],
    ["src/state.rs", 305, `pub const RISK_MODE_FIRST_LOSS: u8 = ${RUST.RISK_MODE_FIRST_LOSS};`],
    ["src/state.rs", 306, `pub const RISK_MODE_FEE_ONLY: u8 = ${RUST.RISK_MODE_FEE_ONLY};`],
  ])("%s:%i is %s", (file, line, text) => {
    expect(rustLine(STAKE_DIR!, STAKE_SHA, file, line).trim()).toBe(text);
  });
});
