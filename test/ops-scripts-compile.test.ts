import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");

describe("operator scripts", () => {
  it("compile under tsc --noEmit (tsconfig.ops-scripts.json)", () => {
    const r = spawnSync(
      resolve(root, "node_modules/.bin/tsc"),
      ["-p", "tsconfig.ops-scripts.json", "--noEmit"],
      { cwd: root, encoding: "utf8" },
    );
    expect(r.stdout + r.stderr).toBe("");
    expect(r.status).toBe(0);
  }, 120_000);

  it("pinned scripts keep the canonical wrapper program id (no devnet swap)", () => {
    for (const f of ["deep-check.ts", "scripts/inspect-slab.ts"]) {
      expect(readFileSync(resolve(root, f), "utf8")).not.toContain('getProgramId("devnet")');
    }
  });
});
