import "dotenv/config";
import { readFileSync } from "node:fs";

export function requireEnvironmentVariable(name, environment = process.env) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

export function requireRpcUrl(environment = process.env) {
  const value = requireEnvironmentVariable("PERCOLATOR_RPC_URL", environment);
  // web3.js/undici echo the whole URL (API key included) when it cannot be fetched as-is, so
  // reject those URLs here with a message that never contains the value.
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PERCOLATOR_RPC_URL is not a valid URL (value not shown).");
  }
  if (url.username || url.password) {
    throw new Error("PERCOLATOR_RPC_URL must not contain user:password credentials (value not shown).");
  }
  // web3.js's own endpoint pattern; `https:/host` parses above but Connection echoes it on failure.
  if (!/^https?:\/\/([^:[]+|\[[^\]]+\])(:\d+)?/.test(value)) {
    throw new Error("PERCOLATOR_RPC_URL must start with http:// or https:// (value not shown).");
  }
  return value;
}

export function requireAdminKeypairPath(environment = process.env) {
  return requireEnvironmentVariable("PERCOLATOR_ADMIN_KEYPAIR", environment);
}

/**
 * Read a Solana CLI keypair file. A bare JSON.parse SyntaxError prints the input, i.e. the
 * secret key, so parse errors are replaced by one that never shows the contents.
 */
export function readAdminSecretKey(path) {
  const text = readFileSync(path, "utf8");
  try {
    return Uint8Array.from(JSON.parse(text));
  } catch {
    throw new Error("PERCOLATOR_ADMIN_KEYPAIR file is not a valid JSON keypair (contents not shown).");
  }
}
