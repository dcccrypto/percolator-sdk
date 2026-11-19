/**
 * Plain-node bench: parseChainlinkPrice / isValidChainlinkOracle.
 * Run: [ORACLE_MODULE=../test/fixtures/oracle-reference.js] npx tsx bench/oracle-parse.bench.ts
 * Reports median-of-5 ns/op over a real-size (248 B and 1024 B) fixture.
 */
const mod = await import(process.env.ORACLE_MODULE ?? "../src/solana/oracle.js");
const { parseChainlinkPrice, isValidChainlinkOracle } = mod;

function feed(len: number): Uint8Array {
  const buf = new Uint8Array(len);
  const dv = new DataView(buf.buffer);
  buf[138] = 8;
  dv.setUint32(208, 1_800_000_000, true);
  dv.setBigUint64(216, 100_000_000n, true);
  dv.setBigUint64(224, 0n, true);
  return buf;
}

const ITERS = 300_000;
const RUNS = 5;
let sink = 0n;

function time(fn: () => void): number {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ITERS; i++) fn();
  return Number(process.hrtime.bigint() - t0) / ITERS;
}

function median(xs: number[]): number {
  return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
}

for (const len of [248, 1024]) {
  const f = feed(len);
  const cases: [string, () => void][] = [
    ["parseChainlinkPrice", () => { sink ^= parseChainlinkPrice(f).price; }],
    ["isValidChainlinkOracle", () => { if (isValidChainlinkOracle(f)) sink ^= 1n; }],
  ];
  for (const [name, fn] of cases) {
    time(fn); // warmup
    const runs = Array.from({ length: RUNS }, () => time(fn));
    console.log(`${name} len=${len}: median ${median(runs).toFixed(1)} ns/op (runs: ${runs.map((r) => r.toFixed(0)).join(",")})`);
  }
}
if (sink === 42n) console.log("");
