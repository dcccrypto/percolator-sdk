import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sdkRoot = resolve(here, "..");

const targets = [
  {
    cwd: resolve(sdkRoot, "..", "percolator-prog"),
    out: resolve(sdkRoot, "specs", "wrapper-tags.json"),
  },
  {
    cwd: resolve(sdkRoot, "..", "percolator-stake"),
    out: resolve(sdkRoot, "specs", "stake-parity.json"),
  },
  {
    cwd: resolve(sdkRoot, "..", "percolator-nft"),
    out: resolve(sdkRoot, "specs", "nft-parity.json"),
  },
  {
    cwd: resolve(sdkRoot, "..", "percolator-match"),
    out: resolve(sdkRoot, "specs", "matcher-parity.json"),
  },
];

for (const target of targets) {
  const stdout = execFileSync("cargo", ["run", "--quiet", "--bin", "sdk_parity_fixtures"], {
    cwd: target.cwd,
    encoding: "utf8",
  });
  mkdirSync(dirname(target.out), { recursive: true });
  writeFileSync(target.out, stdout);
  process.stdout.write(`wrote ${target.out}\n`);
}
