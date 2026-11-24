// Fail-before / pass-after check for percolator-sdk PR #724 (run by merge-gate with cwd = PR worktree).
// Before (base package.json): `npm test` still spawns 8 tsx processes -> test 1 fails.
// After (PR head): `npm test` runs the 8 steps in one process via test/tsx-steps.ts, in the old order,
// every step is still excluded from vitest, and the entry exits 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const OLD_ORDER = ['abi', 'slab', 'validation', 'dex-oracle', 'trading', 'warmup-leverage-cap', 'dynamic-fees', 'oracle'];

test('npm test runs the tsx pre-steps in one process, then vitest', () => {
  const pj = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  assert.equal(pj.scripts.test, 'tsx test/tsx-steps.ts && vitest run');
});

test('tsx-steps.ts imports the same 8 steps in the old order, each excluded from vitest', () => {
  const src = fs.readFileSync(path.join(cwd, 'test/tsx-steps.ts'), 'utf8');
  const steps = [...src.matchAll(/^await import\("\.\/([\w-]+)\.test\.js"\);$/gm)].map(m => m[1]);
  assert.deepEqual(steps, OLD_ORDER);
  const vc = fs.readFileSync(path.join(cwd, 'vitest.config.ts'), 'utf8');
  for (const s of steps) assert.ok(vc.includes(`"test/${s}.test.ts"`), `${s} not excluded from vitest`);
});

test('the single-process entry exits 0', () => {
  const r = spawnSync('npx', ['tsx', 'test/tsx-steps.ts'], { cwd, encoding: 'utf8', timeout: 300000 });
  assert.equal(r.status, 0, (r.stdout || '').slice(-2000) + (r.stderr || '').slice(-2000));
});
