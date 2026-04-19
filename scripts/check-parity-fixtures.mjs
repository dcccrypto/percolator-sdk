import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sdkRoot = resolve(here, "..");

const targets = [
  {
    label: "percolator-prog",
    cwd: resolve(sdkRoot, "..", "percolator-prog"),
    spec: resolve(sdkRoot, "specs", "wrapper-tags.json"),
  },
  {
    label: "percolator-stake",
    cwd: resolve(sdkRoot, "..", "percolator-stake"),
    spec: resolve(sdkRoot, "specs", "stake-parity.json"),
  },
  {
    label: "percolator-nft",
    cwd: resolve(sdkRoot, "..", "percolator-nft"),
    spec: resolve(sdkRoot, "specs", "nft-parity.json"),
  },
  {
    label: "percolator-match",
    cwd: resolve(sdkRoot, "..", "percolator-match"),
    spec: resolve(sdkRoot, "specs", "matcher-parity.json"),
  },
];

let failed = false;

for (const target of targets) {
  let fresh;
  try {
    fresh = execFileSync(
      "cargo",
      ["run", "--quiet", "--bin", "sdk_parity_fixtures"],
      { cwd: target.cwd, encoding: "utf8" },
    );
  } catch (err) {
    process.stderr.write(`[${target.label}] cargo run failed:\n${err.message}\n`);
    failed = true;
    continue;
  }

  let committed;
  try {
    committed = readFileSync(target.spec, "utf8");
  } catch {
    process.stderr.write(
      `[${target.label}] spec file missing: ${target.spec}\n` +
        `  Run pnpm update-parity-fixtures to generate it.\n`,
    );
    failed = true;
    continue;
  }

  // Normalise line endings before comparing.
  const freshNorm = fresh.replace(/\r\n/g, "\n").trimEnd();
  const committedNorm = committed.replace(/\r\n/g, "\n").trimEnd();

  if (freshNorm === committedNorm) {
    process.stdout.write(`[${target.label}] parity OK\n`);
    continue;
  }

  // Produce a simple unified diff without requiring the `diff` binary.
  process.stderr.write(`[${target.label}] DRIFT DETECTED — committed spec does not match cargo output.\n`);
  process.stderr.write(unifiedDiff(committedNorm, freshNorm, target.spec));
  process.stderr.write(
    `\n  To fix: run  pnpm update-parity-fixtures  then review and commit the spec changes.\n\n`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Minimal line-level unified diff (no external dependencies).
// ---------------------------------------------------------------------------

/**
 * @param {string} a - committed text
 * @param {string} b - fresh text
 * @param {string} filename
 * @returns {string}
 */
function unifiedDiff(a, b, filename) {
  const aLines = a.split("\n");
  const bLines = b.split("\n");

  // Build LCS-based edit list via Myers diff (simplified O(ND) variant).
  const edits = myersDiff(aLines, bLines);

  const CONTEXT = 3;
  const hunks = buildHunks(edits, aLines, bLines, CONTEXT);

  if (hunks.length === 0) return "";

  const lines = [`--- a/${filename}`, `+++ b/${filename}`];
  for (const hunk of hunks) {
    lines.push(hunk.header);
    lines.push(...hunk.lines);
  }
  return lines.join("\n") + "\n";
}

/**
 * Myers diff — returns array of { type: "equal"|"remove"|"insert", aIdx, bIdx }.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {Array<{type: string, aIdx: number, bIdx: number}>}
 */
function myersDiff(a, b) {
  const N = a.length;
  const M = b.length;
  const MAX = N + M;
  const v = new Array(2 * MAX + 1).fill(0);
  const trace = [];

  for (let d = 0; d <= MAX; d++) {
    trace.push([...v]);
    for (let k = -d; k <= d; k += 2) {
      const ki = k + MAX;
      let x;
      if (k === -d || (k !== d && v[ki - 1] < v[ki + 1])) {
        x = v[ki + 1];
      } else {
        x = v[ki - 1] + 1;
      }
      let y = x - k;
      while (x < N && y < M && a[x] === b[y]) { x++; y++; }
      v[ki] = x;
      if (x >= N && y >= M) {
        return backtrack(trace, a, b, MAX, d);
      }
    }
  }
  return backtrack(trace, a, b, MAX, MAX);
}

function backtrack(trace, a, b, MAX, d) {
  const edits = [];
  let x = a.length;
  let y = b.length;

  for (let dd = d; dd > 0; dd--) {
    const v = trace[dd];
    const k = x - y;
    const ki = k + MAX;
    const prevK =
      k === -dd || (k !== dd && v[ki - 1] < v[ki + 1]) ? k + 1 : k - 1;
    const prevX = v[prevK + MAX];
    const prevY = prevX - prevK;

    while (x > prevX + 1 && y > prevY + 1) {
      edits.unshift({ type: "equal", aIdx: x - 1, bIdx: y - 1 });
      x--; y--;
    }
    if (dd > 0) {
      if (x === prevX) {
        edits.unshift({ type: "insert", aIdx: x, bIdx: y - 1 });
        y--;
      } else {
        edits.unshift({ type: "remove", aIdx: x - 1, bIdx: y });
        x--;
      }
    }
    while (x > prevX && y > prevY) {
      edits.unshift({ type: "equal", aIdx: x - 1, bIdx: y - 1 });
      x--; y--;
    }
  }
  while (x > 0 && y > 0) {
    edits.unshift({ type: "equal", aIdx: x - 1, bIdx: y - 1 });
    x--; y--;
  }
  return edits;
}

function buildHunks(edits, aLines, bLines, ctx) {
  const hunks = [];
  let i = 0;
  while (i < edits.length) {
    if (edits[i].type === "equal") { i++; continue; }

    // Start of a changed region.
    const start = Math.max(0, i - ctx);
    const hunkEdits = [];

    let aStart = edits[start]?.aIdx ?? 0;
    let bStart = edits[start]?.bIdx ?? 0;

    let j = start;
    while (j < edits.length) {
      const e = edits[j];
      if (e.type !== "equal") {
        hunkEdits.push(e);
        j++;
        continue;
      }
      // Lookahead: is the next change within ctx lines?
      let nextChange = j + 1;
      while (nextChange < edits.length && edits[nextChange].type === "equal") nextChange++;
      if (nextChange < edits.length && nextChange - j <= ctx * 2) {
        for (let k = j; k < nextChange; k++) hunkEdits.push(edits[k]);
        j = nextChange;
      } else {
        // Emit trailing context up to ctx lines.
        for (let k = j; k < Math.min(j + ctx, edits.length); k++) hunkEdits.push(edits[k]);
        i = nextChange;
        break;
      }
    }
    if (j >= edits.length) i = j;

    // Build hunk lines.
    let aCount = 0, bCount = 0;
    const hunkLines = [];
    for (const e of hunkEdits) {
      if (e.type === "equal") {
        hunkLines.push(` ${aLines[e.aIdx]}`); aCount++; bCount++;
      } else if (e.type === "remove") {
        hunkLines.push(`-${aLines[e.aIdx]}`); aCount++;
      } else {
        hunkLines.push(`+${bLines[e.bIdx]}`); bCount++;
      }
    }
    const header = `@@ -${aStart + 1},${aCount} +${bStart + 1},${bCount} @@`;
    hunks.push({ header, lines: hunkLines });
  }
  return hunks;
}
