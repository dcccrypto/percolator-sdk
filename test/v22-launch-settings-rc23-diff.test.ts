/**
 * Differential test at the CURRENT v2.2 program base: every value in
 * `src/abi/v22-launch-settings.ts` against the bounds the rc23 wrapper and the stake program it
 * ships against accept, checked at each bound, bound - 1 and bound + 1.
 *
 * `test/v22-launch-settings-prog-diff.test.ts` pins prog bc657392 / stake 0e19e36. Both are older
 * than what rc23 runs now, so this file re-reads the Rust (with `git show` / `git grep` only, no
 * checkout, no cargo) at:
 *
 *   percolator-prog  origin/feat/v22-rc23-2026-10-22 @ 3b256d490fe28a1147cf0c977f4cde1f3a348e8a
 *   percolator-stake 53f548034f188ce3a348bfd37a8f51be6cc82802
 *     the stake commit rc23 builds and tests against: prog ci/deployed-refs.env:37
 *     `STAKE_DEPLOYED=53f5480…` and :195 `STAKE_CANDIDATE=53f5480…` (ci.yml checks stake out at
 *     STAKE_DEPLOYED for the cross-program suites).
 *
 * Result: every value is inside every rc23 bound. The bounds did not change since bc657392 /
 * 0e19e36; only line numbers moved (prog +13..+68 lines, stake state.rs +1).
 *
 * Scope: the table has exactly four fields per class (staleWindowSlots, stakeCooldownSlots,
 * stakePoolMode, earnRedemptionCooldownSlots) plus the major-mint list. It holds NO leverage,
 * fee or depth-floor values (those are open decisions, see the module doc), so there is nothing
 * of that kind to compare; the key-set test below fails if one is added without a comparison.
 *
 * The live block at the bottom re-reads each quoted line at the pinned SHAs when the sibling repos
 * are present (`~/agent-work/percolator-prog`, `~/agent-work/percolator-stake`, or
 * PERCOLATOR_PROG_DIR / PERCOLATOR_STAKE_DIR); CI without them skips that block.
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
  classifyV22Asset,
  v22LaunchSettings,
  type V22AssetClass,
} from "../src/abi/v22-launch-settings.js";

const PROG_SHA = "3b256d490fe28a1147cf0c977f4cde1f3a348e8a";
const STAKE_SHA = "53f548034f188ce3a348bfd37a8f51be6cc82802";

/** rc23 bounds, each with the file:line it was copied from. */
const RUST = {
  // prog src/v16_program.rs:926 `pub const MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS: u64 = 9_000;`
  MIN_STALE: 9_000,
  // prog src/v16_program.rs:911 `pub const MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS: u64 = 6_480_000;`
  MAX_STALE: 6_480_000,
  // prog src/v16_program.rs:1144 `pub const MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS: u64 = 150;`
  MIN_BOUND_VAULT_COOLDOWN: 150,
  // prog src/v16_program.rs:1134 `pub const MAX_LP_REDEMPTION_COOLDOWN_SLOTS: u64 = 78_840_000;`
  MAX_LP_COOLDOWN: 78_840_000,
  // stake src/processor.rs:96 `const MAX_COOLDOWN_SLOTS: u64 = 78_840_000;`
  STAKE_MAX_COOLDOWN: 78_840_000,
  // stake src/state.rs:305-307 RISK_MODE_LEGACY = 0, RISK_MODE_FIRST_LOSS = 1, RISK_MODE_FEE_ONLY = 2
  RISK_MODE_LEGACY: 0,
  RISK_MODE_FIRST_LOSS: 1,
  RISK_MODE_FEE_ONLY: 2,
} as const;

// ---- The rc23 checks as predicates (true = the program accepts the value). ----

/**
 * Tag 38 ConfigurePermissionlessResolve (decoded at prog src/v16_program.rs:10471,
 * `handle_configure_permissionless_resolve` :29302): :29315-29316
 * `stale_slots < MIN || stale_slots > MAX` -> InvalidInstruction. Inclusive range.
 */
const tag38AcceptsStale = (s: number) => s >= RUST.MIN_STALE && s <= RUST.MAX_STALE;

/**
 * stake src/processor.rs:154-164 `validate_cooldown_slots` (`== 0` at :155, `> MAX_COOLDOWN_SLOTS`
 * at :159 -> InvalidArgument), called by `process_init_pool` (:566) at :631.
 */
const stakeAcceptsCooldown = (c: number) => c !== 0 && c <= RUST.STAKE_MAX_COOLDOWN;

/**
 * stake src/processor.rs:548-555 `V5Init::validate` (called first in `process_init_pool`):
 * FIRST_LOSS (:550) and FEE_ONLY (:554) are creatable, anything else hits `_ => false` (:555).
 */
const stakeAcceptsMode = (m: number) => m === RUST.RISK_MODE_FIRST_LOSS || m === RUST.RISK_MODE_FEE_ONLY;

/**
 * Earn vault cooldown, two gates:
 *  - CreateLpVault (`handle_create_lp_vault` prog src/v16_program.rs:32020): :32055
 *    `> MAX_LP_REDEMPTION_COOLDOWN_SLOTS` -> InvalidInstruction;
 *  - vault-LP bind tag 94 (`handle_init_vault_lp` :38076): :38124-38125
 *    `< MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS` -> InvalidInstruction.
 */
const vaultAcceptsCooldown = (c: number) => c >= RUST.MIN_BOUND_VAULT_COOLDOWN && c <= RUST.MAX_LP_COOLDOWN;

const CLASSES: V22AssetClass[] = ["major", "meme"];

describe("v22 launch settings vs rc23 bounds (prog 3b256d49, stake 53f54803)", () => {
  describe("each rc23 bound at bound - 1, bound, bound + 1", () => {
    it.each([
      // [name, predicate, bound, accepts(bound-1), accepts(bound), accepts(bound+1)]
      ["tag 38 MIN stale (v16_program.rs:926)", tag38AcceptsStale, RUST.MIN_STALE, false, true, true],
      ["tag 38 MAX stale (v16_program.rs:911)", tag38AcceptsStale, RUST.MAX_STALE, true, true, false],
      ["stake cooldown != 0 (processor.rs:155)", stakeAcceptsCooldown, 0, false, false, true],
      ["stake MAX_COOLDOWN (processor.rs:96)", stakeAcceptsCooldown, RUST.STAKE_MAX_COOLDOWN, true, true, false],
      ["vault-LP bind MIN (v16_program.rs:1144)", vaultAcceptsCooldown, RUST.MIN_BOUND_VAULT_COOLDOWN, false, true, true],
      ["CreateLpVault MAX (v16_program.rs:1134)", vaultAcceptsCooldown, RUST.MAX_LP_COOLDOWN, true, true, false],
      ["stake mode FIRST_LOSS (state.rs:306)", stakeAcceptsMode, RUST.RISK_MODE_FIRST_LOSS, false, true, true],
      ["stake mode FEE_ONLY (state.rs:307)", stakeAcceptsMode, RUST.RISK_MODE_FEE_ONLY, true, true, false],
    ] as const)("%s", (_name, accepts, bound, below, at, above) => {
      // bound 0 has no bound - 1 in u64; -1 would not decode, so it is not a launchable input.
      if (bound > 0) expect(accepts(bound - 1)).toBe(below);
      expect(accepts(bound)).toBe(at);
      expect(accepts(bound + 1)).toBe(above);
    });
  });

  for (const cls of CLASSES) {
    describe(`${cls} row: value - 1, value, value + 1`, () => {
      const row = v22LaunchSettings(cls);

      it(`staleWindowSlots ${row.staleWindowSlots}: all three inside tag 38's 9,000..=6,480,000`, () => {
        const v = row.staleWindowSlots;
        expect(Number.isSafeInteger(v)).toBe(true);
        expect([v - 1, v, v + 1].map(tag38AcceptsStale)).toEqual([true, true, true]);
        // margin to each edge is real, not zero
        expect(v - RUST.MIN_STALE).toBeGreaterThan(0);
        expect(RUST.MAX_STALE - v).toBeGreaterThan(0);
      });

      it(`stakeCooldownSlots ${row.stakeCooldownSlots}: all three pass validate_cooldown_slots`, () => {
        const v = row.stakeCooldownSlots;
        expect(Number.isSafeInteger(v)).toBe(true);
        expect([v - 1, v, v + 1].map(stakeAcceptsCooldown)).toEqual([true, true, true]);
      });

      it(`stakePoolMode ${row.stakePoolMode}: is FEE_ONLY; -1 is FIRST_LOSS (creatable, wrong policy), +1 refused`, () => {
        const v = row.stakePoolMode;
        expect(v).toBe(RUST.RISK_MODE_FEE_ONLY);
        expect([v - 1, v, v + 1].map(stakeAcceptsMode)).toEqual([true, true, false]);
        expect(v - 1).toBe(RUST.RISK_MODE_FIRST_LOSS);
      });

      it(`earnRedemptionCooldownSlots ${row.earnRedemptionCooldownSlots}: sits ON the vault-LP bind floor (value - 1 refused)`, () => {
        const v = row.earnRedemptionCooldownSlots;
        expect(Number.isSafeInteger(v)).toBe(true);
        expect(v).toBe(RUST.MIN_BOUND_VAULT_COOLDOWN);
        expect([v - 1, v, v + 1].map(vaultAcceptsCooldown)).toEqual([false, true, true]);
      });
    });
  }

  it("the table compares exactly these fields per class (no leverage / fee / depth-floor fields to diff)", () => {
    expect(Object.keys(V22_LAUNCH_SETTINGS).sort()).toEqual(["major", "meme"]);
    for (const cls of CLASSES) {
      expect(Object.keys(V22_LAUNCH_SETTINGS[cls]).sort()).toEqual([
        "earnRedemptionCooldownSlots",
        "stakeCooldownSlots",
        "stakePoolMode",
        "staleWindowSlots",
      ]);
    }
  });

  it("V22_STAKE_POOL_MODE_FEE_ONLY equals stake state.rs:307 RISK_MODE_FEE_ONLY", () => {
    expect(V22_STAKE_POOL_MODE_FEE_ONLY).toBe(RUST.RISK_MODE_FEE_ONLY);
  });

  it("V22_MAJOR_MINTS: no rc23 Rust list exists (src/ has neither mint); each is a valid key and classifies major", () => {
    // `git grep` at both SHAs: wSOL appears only in prog tests/ (a depth fixture and
    // tests/v22_dex_depth.rs), cbBTC nowhere; the live block re-checks src/ has neither. The class
    // only picks the stale window and both windows pass tag 38 (above), so a misclassified mint
    // still launches.
    expect(V22_MAJOR_MINTS).toEqual([
      "So11111111111111111111111111111111111111112",
      "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
    ]);
    for (const m of V22_MAJOR_MINTS) {
      expect(new PublicKey(m).toBase58()).toBe(m);
      expect(classifyV22Asset(m)).toBe("major");
    }
    expect(classifyV22Asset("8PzFWyLpCVEmbZmVJcaRTU5r69XKJx1rd7YGpWvnpump")).toBe("meme");
  });
});

// ---- Live re-read of the Rust at the pinned SHAs (skipped when the repos are absent). ----

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

/** Files under `src/` at `sha` that contain `needle` (empty when none). */
function grepSrc(dir: string, sha: string, needle: string): string[] {
  try {
    return execFileSync("git", ["-C", dir, "grep", "-l", "-F", needle, sha, "--", "src"], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return []; // git grep exits 1 on no match
  }
}

/** Rust integer literal for a JS number: 6480000 -> "6_480_000". */
const rs = (n: number) => n.toLocaleString("en-US").replace(/,/g, "_");

const PROG_DIR = repoAt("PERCOLATOR_PROG_DIR", "percolator-prog", PROG_SHA);
const STAKE_DIR = repoAt("PERCOLATOR_STAKE_DIR", "percolator-stake", STAKE_SHA);

describe.skipIf(!PROG_DIR)(`live: percolator-prog @ ${PROG_SHA.slice(0, 8)}`, () => {
  const F = "src/v16_program.rs";
  it.each([
    [F, 911, `pub const MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS: u64 = ${rs(RUST.MAX_STALE)};`],
    [F, 926, `pub const MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS: u64 = ${rs(RUST.MIN_STALE)};`],
    [F, 1134, `pub const MAX_LP_REDEMPTION_COOLDOWN_SLOTS: u64 = ${rs(RUST.MAX_LP_COOLDOWN)};`],
    [F, 1144, `pub const MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS: u64 = ${rs(RUST.MIN_BOUND_VAULT_COOLDOWN)};`],
    [F, 10471, "38 => Self::ConfigurePermissionlessResolve {"],
    [F, 29302, "fn handle_configure_permissionless_resolve<'a>("],
    [F, 29315, "if stale_slots < constants::MIN_PERMISSIONLESS_RESOLVE_STALE_SLOTS"],
    [F, 29316, "|| stale_slots > constants::MAX_PERMISSIONLESS_RESOLVE_STALE_SLOTS"],
    [F, 32020, "fn handle_create_lp_vault<'a>("],
    [F, 32055, "if redemption_cooldown_slots > crate::constants::MAX_LP_REDEMPTION_COOLDOWN_SLOTS {"],
    [F, 38076, "fn handle_init_vault_lp<'a>("],
    [F, 38124, "if registry.redemption_cooldown_slots"],
    [F, 38125, "< crate::constants::MIN_BOUND_VAULT_REDEMPTION_COOLDOWN_SLOTS"],
    ["ci/deployed-refs.env", 37, `STAKE_DEPLOYED=${STAKE_SHA}`],
    ["ci/deployed-refs.env", 195, `STAKE_CANDIDATE=${STAKE_SHA}`],
  ])("%s:%i is %s", (file, line, text) => {
    expect(rustLine(PROG_DIR!, PROG_SHA, file, line).trim()).toBe(text);
  });

  it("src/ pins no major-mint list (neither wSOL nor cbBTC appears)", () => {
    for (const m of V22_MAJOR_MINTS) expect(grepSrc(PROG_DIR!, PROG_SHA, m)).toEqual([]);
  });
});

describe.skipIf(!STAKE_DIR)(`live: percolator-stake @ ${STAKE_SHA.slice(0, 8)}`, () => {
  it.each([
    ["src/processor.rs", 96, `const MAX_COOLDOWN_SLOTS: u64 = ${rs(RUST.STAKE_MAX_COOLDOWN)};`],
    ["src/processor.rs", 154, "fn validate_cooldown_slots(cooldown_slots: u64) -> ProgramResult {"],
    ["src/processor.rs", 155, "if cooldown_slots == 0 {"],
    ["src/processor.rs", 159, "if cooldown_slots > MAX_COOLDOWN_SLOTS {"],
    ["src/processor.rs", 550, "state::RISK_MODE_FIRST_LOSS => {"],
    ["src/processor.rs", 554, "state::RISK_MODE_FEE_ONLY => self.deploy_target_bps == 0,"],
    ["src/processor.rs", 555, "_ => false,"],
    ["src/processor.rs", 566, "fn process_init_pool("],
    ["src/processor.rs", 631, "validate_cooldown_slots(cooldown_slots)?;"],
    ["src/state.rs", 305, `pub const RISK_MODE_LEGACY: u8 = ${RUST.RISK_MODE_LEGACY};`],
    ["src/state.rs", 306, `pub const RISK_MODE_FIRST_LOSS: u8 = ${RUST.RISK_MODE_FIRST_LOSS};`],
    ["src/state.rs", 307, `pub const RISK_MODE_FEE_ONLY: u8 = ${RUST.RISK_MODE_FEE_ONLY};`],
  ])("%s:%i is %s", (file, line, text) => {
    expect(rustLine(STAKE_DIR!, STAKE_SHA, file, line).trim()).toBe(text);
  });

  it("src/ pins no major-mint list (neither wSOL nor cbBTC appears)", () => {
    for (const m of V22_MAJOR_MINTS) expect(grepSrc(STAKE_DIR!, STAKE_SHA, m)).toEqual([]);
  });
});
