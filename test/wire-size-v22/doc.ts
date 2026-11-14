import { ROWS, NO_SDK_ENCODER, SIZE, parseSpec, expectedLength } from "./table.js";

/** Renders specs/WIRE_SIZES_V22.md. Regenerate: pnpm exec tsx scripts/gen-wire-size-doc.ts */
export function renderDoc(): string {
  const out: string[] = [];
out.push("# v2.2 instruction wire table", "",
"Source: `dcccrypto/percolator-prog` @ `feat/v22-rc23-2026-10-22` (ab85662), `src/v16_program.rs`, `Instruction::decode` (lines 10052-10950).",
"The decoder rejects trailing bytes (line 10945), so the length is exact. `len` includes the tag byte. Offsets are from byte 0 (tag at 0).",
"Generated from `test/wire-size-v22/table.ts` (`pnpm exec tsx scripts/gen-wire-size-doc.ts > specs/WIRE_SIZES_V22.md`); checked by `test/wire-size-v22.test.ts`.", "",
"| tag | name | form | len | fields (offset:type) | program line |", "|---|---|---|---|---|---|");
for (const r of [...ROWS].sort((a,b)=>a.tag-b.tag)) {
  const f = parseSpec(r.spec); let off = 1;
  const cells = f.map(x => { const c = `${off}:${x.type}`; off += SIZE[x.type]; return c; }).join(" ");
  out.push(`| ${r.tag} | ${r.name} | ${r.form}${r.mismatch ? " **(SDK emits a rejected shape)**" : ""} | ${expectedLength(f)} | ${cells || "-"} | v16_program.rs:${r.prog} |`);
}
out.push("", "## Tags the program decodes with no SDK encoder", "", "| tag | name | len | program line |", "|---|---|---|---|");
for (const n of NO_SDK_ENCODER) out.push(`| ${n.tag} | ${n.name} | ${n.len} | v16_program.rs:${n.prog} |`);
return out.join("\n") + "\n";
}
