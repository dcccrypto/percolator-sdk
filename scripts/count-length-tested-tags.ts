/**
 * Count v2.2 instruction tags that have a byte-length / exact-bytes assertion in the test suite.
 *
 *   pnpm exec tsx scripts/count-length-tested-tags.ts
 *
 * Same command before and after: if test/wire-size-v22.test.ts exists, every tag that has a row in
 * test/wire-size-v22/table.ts counts as tested by it (that test asserts exact length and field
 * offsets for each row, against the program table).
 *
 * Method (a heuristic, and generous): for every table row we take the SDK encoder names used by
 * its `enc` function. A tag counts as length-tested when some test file calls one of those
 * encoders and, within the 14 lines starting at that call, asserts on the length or the exact
 * bytes (`.length`, `byteLength`, `toHaveLength`, `.done()`, `check(`, or `toEqual([...`).
 * It does NOT check that the asserted number equals the program's. So BEFORE is an upper bound;
 * the new test (test/wire-size-v22.test.ts) is the only one tied to the program table.
 * Tags with no SDK encoder cannot be tested and are reported separately.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { ROWS, NO_SDK_ENCODER } from "../test/wire-size-v22/table.js";

const includeNew = existsSync(new URL("../test/wire-size-v22.test.ts", import.meta.url).pathname);
const dir = new URL("../test/", import.meta.url).pathname;
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".ts"))
  .filter((f) => !f.startsWith("wire-size-v22"))
  .filter((f) => !f.startsWith("devnet-") && !f.startsWith("mainnet-"));

const LEN = /\.length\b|byteLength|toHaveLength|\.done\(\)|\bcheck\(|toEqual\(\s*\[/;
const texts = files.map((f) => ({ f, lines: readFileSync(dir + f, "utf8").split("\n") }));

const encoderNames = (fn: Function): string[] => [...new Set(fn.toString().match(/\bencode[A-Za-z0-9]+/g) ?? [])];

const tested = new Map<number, string>();
const byTag = new Map<number, Set<string>>();
for (const r of ROWS) {
  const s = byTag.get(r.tag) ?? new Set<string>();
  encoderNames(r.enc).forEach((n) => s.add(n));
  byTag.set(r.tag, s);
}
for (const [tag, names] of byTag) {
  if (includeNew) { tested.set(tag, "wire-size-v22.test.ts"); continue; }
  outer: for (const { f, lines } of texts) {
    for (let i = 0; i < lines.length; i++) {
      if ([...names].some((n) => new RegExp(`\\b${n}\\b\\s*\\(`).test(lines[i]))) {
        if (lines.slice(i, i + 14).some((l) => LEN.test(l))) {
          tested.set(tag, f);
          break outer;
        }
      }
    }
  }
}

const allTags = [...byTag.keys()].sort((a, b) => a - b);
const total = allTags.length;
console.log(`mode: ${includeNew ? "wire-size-v22.test.ts present" : "existing tests only"}`);
console.log(`program tags with an SDK encoder: ${total}`);
console.log(`tags with a length/exact-bytes test: ${tested.size}`);
console.log(`untested: ${allTags.filter((t) => !tested.has(t)).join(",")}`);
console.log(`tags the program decodes but the SDK has no encoder for: ${NO_SDK_ENCODER.length} (${NO_SDK_ENCODER.map((x) => x.tag).join(",")})`);
