/** #349: every third-party GitHub Action must be pinned to a full commit SHA with a version comment. */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..", ".github", "workflows");
describe("#349 workflow actions are SHA-pinned", () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".yml") || n.endsWith(".yaml"))) {
    it(`${f}: every 'uses:' is owner/repo@<40-hex> # <ref>`, () => {
      const bad = readFileSync(join(dir, f), "utf8")
        .split("\n")
        .filter((l) => /^\s*-?\s*uses:/.test(l) && !l.includes("./"))
        .filter((l) => !/uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s*\S+/.test(l));
      expect(bad).toEqual([]);
    });
  }
});
