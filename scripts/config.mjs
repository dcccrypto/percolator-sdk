import "dotenv/config";

export function requireEnvironmentVariable(name, environment = process.env) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
}

export function requireRpcUrl(environment = process.env) {
  return requireEnvironmentVariable("PERCOLATOR_RPC_URL", environment);
}

export function requireAdminKeypairPath(environment = process.env) {
  return requireEnvironmentVariable("PERCOLATOR_ADMIN_KEYPAIR", environment);
}