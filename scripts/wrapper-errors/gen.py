#!/usr/bin/env python3
"""Regenerate the wrapper error map from the REAL percolator-prog crate (rustc, not a regex).

Usage: gen.py <percolator-prog checkout> <out.json>
  1. parses the variant NAMES of `pub enum PercolatorError` from src/v16_program.rs
  2. writes src/bin/sdk_wrapper_errors.rs into the checkout (a scratch worktree; never commit it)
     that prints `PercolatorError::X as u32` for every name (rustc assigns the numbers)
  3. runs it and writes {"prog": <sha>, "errors": {"<code>": "<Name>"}} to <out.json>
The SDK test test/wrapper-errors.test.ts asserts PERCOLATOR_ERRORS against that fixture.
"""
import json, os, re, subprocess, sys

prog, out = sys.argv[1], sys.argv[2]
src = open(os.path.join(prog, "src/v16_program.rs")).read()
i = src.index("pub enum PercolatorError {")
d, j = 0, i
while True:
    c = src[j]
    if c == "{": d += 1
    elif c == "}":
        d -= 1
        if d == 0: break
    j += 1
body = re.sub(r"//[^\n]*", "", src[i + len("pub enum PercolatorError {"):j])
body = re.sub(r"#\[[^\]]*\]", "", body)
names = re.findall(r"\b([A-Z][A-Za-z0-9]*)\b\s*(?:=\s*\d+\s*)?,", body)
rs = ["use percolator_prog::error::PercolatorError as E;", "fn main() {", "    let v: &[(&str, u32)] = &["]
rs += [f'        ("{n}", E::{n} as u32),' for n in names]
rs += ["    ];", '    let s: Vec<String> = v.iter().map(|(n, c)| format!("\\"{c}\\":\\"{n}\\"")).collect();',
       '    println!("{{{}}}", s.join(","));', "}"]
os.makedirs(os.path.join(prog, "src/bin"), exist_ok=True)
binf = os.path.join(prog, "src/bin/sdk_wrapper_errors.rs")
open(binf, "w").write("\n".join(rs) + "\n")
try:
    raw = subprocess.check_output(["cargo", "run", "--quiet", "--bin", "sdk_wrapper_errors"], cwd=prog)
finally:
    os.remove(binf)
errors = json.loads(raw)
if len(errors) != len(names):
    sys.exit(f"duplicate discriminants? {len(names)} names -> {len(errors)} codes")
sha = subprocess.check_output(["git", "-C", prog, "rev-parse", "HEAD"]).decode().strip()
json.dump({"prog": sha, "count": len(errors), "errors": dict(sorted(errors.items(), key=lambda kv: int(kv[0])))},
          open(out, "w"), indent=2)
open(out, "a").write("\n")
print(f"{len(errors)} variants from {sha[:8]} -> {out}")
