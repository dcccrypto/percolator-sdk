import { PublicKey } from "@solana/web3.js";

/**
 * Centralized PROGRAM_ID configuration
 * 
 * Default to environment variable, then fall back to network-specific defaults.
 * This prevents hard-coded program IDs scattered across the codebase.
 */

export const PROGRAM_IDS = {
  devnet: {
    percolator: "FxfD37s1AZTeWfFQps9Zpebi2dNQ9QSSDtfMKdbsfKrD",
    matcher: "GTRgyTDfrMvBubALAqtHuQwT8tbGyXid7svXZKtWfC9k",
  },
  mainnet: {
    percolator: "GM8zjJ8LTBMv9xEsverh6H6wLyevgMHEJXcEzyY3rY24",
    matcher: "DHP6DtwXP1yJsz8YzfoeigRFPB979gzmumkmCxDLSkUX",
  },
} as const;

export type Network = "devnet" | "mainnet";

/**
 * Allowlist of all known valid program IDs (devnet + mainnet).
 * 
 * SECURITY: Any value supplied via PROGRAM_ID / MATCHER_PROGRAM_ID env vars
 * must appear here. If a value is not in this set we throw immediately —
 * accepting an arbitrary program ID is a fund-theft vector because it could
 * route user transactions through an attacker-controlled program.
 */
const KNOWN_PROGRAM_IDS: ReadonlySet<string> = new Set([
  PROGRAM_IDS.devnet.percolator,
  PROGRAM_IDS.devnet.matcher,
  PROGRAM_IDS.mainnet.percolator,
  // mainnet matcher intentionally omitted until deployed
]);

/**
 * Validate that a program ID string is on the known allowlist.
 * Throws a hard error if the value is unknown — do not fall back silently.
 *
 * @param raw - Raw string to validate (from env var or other external input)
 * @param source - Human-readable description of where the value came from (for error messages)
 */
function validateProgramId(raw: string, source: string): PublicKey {
  // Verify it is a valid base58 public key first
  let pk: PublicKey;
  try {
    pk = new PublicKey(raw);
  } catch {
    throw new Error(
      `[SECURITY] ${source} contains an invalid base58 public key: "${raw}". ` +
      "This is a hard error — check your environment variables."
    );
  }

  // Verify it is on the known allowlist
  if (!KNOWN_PROGRAM_IDS.has(pk.toBase58())) {
    throw new Error(
      `[SECURITY] ${source} value "${pk.toBase58()}" is not in the known program ID allowlist. ` +
      "Accepting unknown program IDs is a fund-theft vector. " +
      "If you are deploying a new program, add its ID to PROGRAM_IDS in program-ids.ts and rebuild."
    );
  }

  return pk;
}

/**
 * Get the Percolator program ID for the current network
 * 
 * Priority:
 * 1. PROGRAM_ID env var (explicit override, allowlist-validated)
 * 2. Network-specific default (NETWORK env var)
 * 3. Devnet default (safest fallback)
 */
export function getProgramId(network?: Network): PublicKey {
  // Explicit override takes precedence — but must be on the allowlist
  if (process.env.PROGRAM_ID) {
    return validateProgramId(process.env.PROGRAM_ID, "PROGRAM_ID env var");
  }

  // Use provided network or detect from env
  // Fail-closed: default to mainnet (not devnet) — matches RULES.md pattern.
  // Devnet must be explicitly requested via NETWORK=devnet or parameter.
  const targetNetwork = network ?? (process.env.NETWORK as Network) ?? "mainnet";
  const programId = PROGRAM_IDS[targetNetwork].percolator;

  return new PublicKey(programId);
}

/**
 * Get the Matcher program ID for the current network
 */
export function getMatcherProgramId(network?: Network): PublicKey {
  // Explicit override takes precedence — but must be on the allowlist
  if (process.env.MATCHER_PROGRAM_ID) {
    return validateProgramId(process.env.MATCHER_PROGRAM_ID, "MATCHER_PROGRAM_ID env var");
  }

  // Use provided network or detect from env
  // Fail-closed: default to mainnet (not devnet)
  const targetNetwork = network ?? (process.env.NETWORK as Network) ?? "mainnet";
  const programId = PROGRAM_IDS[targetNetwork].matcher;

  if (!programId) {
    throw new Error(`Matcher program not deployed on ${targetNetwork}`);
  }

  return new PublicKey(programId);
}

/**
 * Get the current network from environment
 * Defaults to mainnet (fail-closed)
 */
export function getCurrentNetwork(): Network {
  const network = process.env.NETWORK?.toLowerCase();
  if (network === "devnet") {
    return "devnet";
  }
  // Fail-closed: default to mainnet
  return "mainnet";
}
