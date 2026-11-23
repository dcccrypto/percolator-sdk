// Usage: node scripts/lp-redeem-floored-devnet-sim/summarize.mjs out/simulate.json > out/summary.txt
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync(process.argv[2], "utf8"));
const progLines = (logs) => logs.filter((l) => /6kpg2wi7|Program log|failed|Error/i.test(l) && !/ComputeBudget/.test(l)).slice(-4).join(" || ");
const len = (w) => (w && w[0] && w[0].data ? Buffer.from(w[0].data, "base64").length : null);
console.log(`program ${d.program}  rpc ${d.rpc}  at ${d.at}  throwaway ${d.throwaway}`);
for (const v of d.vaults) {
  console.log(`\nVAULT registry ${v.registry} market ${v.market} domain ${v.domain} cooldown ${v.cooldownSlots} holder ${v.holder?.owner} (${v.holder?.amount} shares)`);
  for (const c of v.cases) {
    const rl = len(c.watched);
    console.log(`  ${c.name.padEnd(10)} ${c.form.padEnd(10)} len=${c.dataLen} err=${JSON.stringify(c.err)} code=${c.code} cu=${c.unitsConsumed}${rl !== null ? ` redemptionPdaLen=${rl}` : ""}`);
    console.log(`     data ${c.dataHex}`);
    console.log(`     logs ${progLines(c.logs)}`);
  }
}
for (const p of d.pending ?? []) {
  console.log(`\nPENDING bound=${p.bound} ${p.redemption} (len ${p.len}) registry ${p.registry} redeemer ${p.redeemer} shares ${p.shares} storedFloor ${p.minPayoutStored} requestSlot ${p.requestSlot}${p.configError ? " CONFIG " + p.configError : ""}`);
  if (p.redeemerDest) console.log(`  dest ${p.redeemerDest.key} exists=${p.redeemerDest.exists} before=${p.redeemerDest.before} vaultToken ${p.vaultToken}`);
  for (const c of p.cases ?? []) {
    console.log(`  ${c.name.padEnd(14)} wireFloor=${c.minPayoutWire} quote=${c.quote} err=${JSON.stringify(c.err)} code=${c.code} classified=${JSON.stringify(c.classified)} cu=${c.unitsConsumed}`);
    console.log(`     logs ${progLines(c.logs)}`);
  }
}
