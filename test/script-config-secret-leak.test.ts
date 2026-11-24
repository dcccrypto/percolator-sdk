import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import * as config from "../scripts/config.mjs";

// Operator scripts print whatever error escapes. Two inputs made them print secrets:
//
// 1. RPC URL. Every script passes requireRpcUrl() to `new Connection(...)`. When the URL cannot be
//    fetched as-is, web3.js/undici put the WHOLE URL (API key included) in the error:
//      bad port   -> "TypeError: Failed to parse URL from http://host:99999/?api-key=<key>"
//      user:pass@ -> "Request cannot be constructed from a URL that includes credentials: <url>"
//    requireRpcUrl must reject these up front without echoing the value.
//
// 2. Admin keypair. The 11 admin scripts did `JSON.parse(fs.readFileSync(path))`. A malformed file
//    (e.g. one trailing comma) throws a SyntaxError that Node prints with the whole input line:
//    all 64 secret-key bytes on stderr. readAdminSecretKey must fail without echoing the contents.

const SECRET = "FAKE123";
const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("requireRpcUrl never lets a bad RPC URL reach web3.js", () => {
  it.each([
    ["port out of range", `http://127.0.0.1:99999/${SECRET}/?api-key=${SECRET}`],
    ["space in host", `https://rpc ${SECRET}.example.invalid/?api-key=${SECRET}`],
    ["user:pass credentials", `https://${SECRET}user:${SECRET}pass@rpc.example.invalid/?api-key=${SECRET}`],
    ["user-only credentials", `https://${SECRET}@rpc.example.invalid/?api-key=${SECRET}`],
    ["password-only credentials", `https://:${SECRET}pass@rpc.example.invalid/?api-key=${SECRET}`],
    // `new URL` accepts these, but web3.js's Connection constructor echoes them in full.
    ["one-slash scheme", `https:/rpc.example.invalid/?api-key=${SECRET}`],
    ["no-slash scheme", `https:rpc.example.invalid/?api-key=${SECRET}`],
  ])("rejects %s without echoing the URL", (_label, url) => {
    const error = thrown(() => config.requireRpcUrl({ PERCOLATOR_RPC_URL: url }));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/^PERCOLATOR_RPC_URL /);
    // Whole error object, including any cause / input property.
    expect(inspect(error, { depth: 5 })).not.toContain(SECRET);
  });

  it.each([
    `https://rpc.example.invalid/?api-key=${SECRET}`,
    `https://rpc.example.invalid/v2/${SECRET}abcdefghijklmnop`,
    `http://127.0.0.1:8899`,
    `http://localhost:8899/`,
  ])("still returns a usable URL unchanged: %s", (url) => {
    expect(config.requireRpcUrl({ PERCOLATOR_RPC_URL: url })).toBe(url);
  });
});

describe("readAdminSecretKey never echoes keypair file contents", () => {
  const dir = mkdtempSync(join(tmpdir(), "script-config-key-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  // Distinctive throwaway bytes: 200..255 then 0..7 (64 values).
  const bytes = Array.from({ length: 64 }, (_, i) => (200 + i) % 256);
  const write = (name: string, body: string): string => {
    const path = join(dir, name);
    writeFileSync(path, body);
    return path;
  };
  const readAdminSecretKey = (path: string): unknown =>
    (config as { readAdminSecretKey?: (p: string) => unknown }).readAdminSecretKey!(path);

  it.each([
    ["trailing comma", `${JSON.stringify(bytes).slice(0, -1)},]`],
    ["truncated", JSON.stringify(bytes).slice(0, -5)],
    ["stray character", `${JSON.stringify(bytes).slice(0, -1)}x]`],
  ])("malformed file (%s): error holds none of the key bytes", (label, body) => {
    const error = thrown(() => readAdminSecretKey(write(`${label}.json`, body)));
    expect(error).toBeInstanceOf(Error);
    const shown = inspect(error, { depth: 5 });
    expect(shown).toMatch(/PERCOLATOR_ADMIN_KEYPAIR/);
    // No run of 3 consecutive key bytes anywhere in the error.
    for (let i = 0; i + 3 <= bytes.length; i++) {
      expect(shown).not.toContain(bytes.slice(i, i + 3).join(","));
    }
  });

  it("returns the 64 bytes of a well-formed file", () => {
    const key = readAdminSecretKey(write("good.json", JSON.stringify(bytes)));
    expect(Array.from(key as Uint8Array)).toEqual(bytes);
  });

  it("a missing file still reports the path, not contents", () => {
    const error = thrown(() => readAdminSecretKey(join(dir, "missing.json")));
    expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
  });
});
