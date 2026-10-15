import { PublicKey } from "@solana/web3.js";
function safeEnv(key) {
  try {
    return typeof process !== "undefined" && process?.env ? process.env[key] : void 0;
  } catch {
    return void 0;
  }
}
const PROGRAM_IDS = {
  devnet: {
    // v18.3 fresh-ID redeploy (SDK 8.0.0): the devnet wrapper moves to a BRAND-NEW program
    // address (ETDLAdi…) running the byte-identical v18.2 wrapper, so no market/portfolio
    // created under the previous v18 wrapper (GnwdeQr…, ABANDONED; 2026-09-22 → 8.0.0) or
    // the v17 wrapper (DhSkE7u…, ABANDONED) is visible to this SDK. This is the ACTIVE
    // devnet wrapper id that getProgramId() / getProgramId("devnet") resolves and that PDA
    // derivation + tx targeting use. Neither abandoned id is in the env-override allowlist;
    // pin @percolatorct/sdk@7.0.0 to talk to GnwdeQr…. ALL-FRESH relaunch (decided 2026-09-30):
    // matcher, stake/vault and nft ALSO move to brand-new devnet addresses (EDKKgRaV…, VmpVUArR…,
    // EMYT15LZ…), so the old GnwdeQr world (matcher 4seJWjv3…, stake GCHhcgw…, nft CNGBPZR…)
    // stays untouched. Pin @percolatorct/sdk@7.0.0 for any of the old addresses.
    percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB",
    matcher: "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX"
  },
  mainnet: {
    percolator: "ESa89R5Es3rJ5mnwGybVRG1GrNt9etP11Z5V2QWD4edv",
    matcher: "GDK8wx38kpiSVSfGTVNiSdptX3Z5R4kQyqh6Q3QX6wmi"
  }
};
Object.freeze(PROGRAM_IDS.devnet);
Object.freeze(PROGRAM_IDS.mainnet);
Object.freeze(PROGRAM_IDS);
const PROGRAM_IDS_V17 = {
  /** ACTIVE devnet wrapper (ETDLAdi…) — v18.3 fresh-ID cutover (SDK 8.0.0) from the
   *  abandoned GnwdeQr… (v18.0–v18.2) and DhSkE7u… (v17) wrappers. Kept in this "v17"-named object as a single source of truth with
   *  PROGRAM_IDS.devnet.percolator; @deprecated alias, prefer PROGRAM_IDS.devnet. */
  percolator: "ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB",
  /** Relaunch matcher (P2 4a0f696) — fresh devnet address (all-fresh relaunch, 8.0.0). */
  matcher: "EDKKgRaVHna6FCxiY1kgMzegD9rpaN1nwJNSzAzeBUBX",
  /** Relaunch nft (v18.3 7c50d01) — fresh devnet address (all-fresh relaunch, 8.0.0). */
  nft: "EMYT15LZWaP7Mmmm245kQPbrTyVjG16yZiU9kfNTF3GZ",
  /** Relaunch stake/vault (F-9, fresh-ID e0d72bd) — fresh devnet address (all-fresh relaunch, 8.0.0). */
  vault: "VmpVUArRnVkrjaPXQ2qaqCQa3ZrZFgsz7rjeALitF5w"
};
Object.freeze(PROGRAM_IDS_V17);
const PROGRAM_ID_V17 = new PublicKey(PROGRAM_IDS_V17.percolator);
const KNOWN_PROGRAM_IDS = /* @__PURE__ */ new Set([
  PROGRAM_IDS.devnet.percolator,
  PROGRAM_IDS.mainnet.percolator,
  PROGRAM_IDS_V17.percolator
]);
const KNOWN_MATCHER_IDS = /* @__PURE__ */ new Set([
  PROGRAM_IDS.devnet.matcher,
  PROGRAM_IDS.mainnet.matcher
]);
function programOverrideOptIn() {
  return safeEnv("PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE") === "1";
}
function getProgramId(network) {
  if (network === void 0) {
    const override = safeEnv("PROGRAM_ID");
    if (override) {
      if (!KNOWN_PROGRAM_IDS.has(override) && !programOverrideOptIn()) {
        throw new Error(
          `[percolator-sdk] PROGRAM_ID env var "${override}" is not a known program address. Allowed values: ${[...KNOWN_PROGRAM_IDS].join(", ")}. Pass an explicit network argument, or set PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 to intentionally allow an unlisted program (e.g. a fresh pre-deploy address).`
        );
      }
      console.warn(`[percolator-sdk] PROGRAM_ID env override active: ${override}`);
      return new PublicKey(override);
    }
  }
  const detectedNetwork = getCurrentNetwork();
  const targetNetwork = network ?? detectedNetwork;
  const programId = PROGRAM_IDS[targetNetwork].percolator;
  return new PublicKey(programId);
}
function getMatcherProgramId(network) {
  if (network === void 0) {
    const override = safeEnv("MATCHER_PROGRAM_ID");
    if (override) {
      if (!KNOWN_MATCHER_IDS.has(override) && !programOverrideOptIn()) {
        throw new Error(
          `[percolator-sdk] MATCHER_PROGRAM_ID env var "${override}" is not a known matcher program address. Allowed values: ${[...KNOWN_MATCHER_IDS].join(", ")}. Pass an explicit network argument, or set PERCOLATOR_SDK_ALLOW_PROGRAM_OVERRIDE=1 to intentionally allow an unlisted program (e.g. a fresh pre-deploy address).`
        );
      }
      console.warn(`[percolator-sdk] MATCHER_PROGRAM_ID env override active: ${override}`);
      return new PublicKey(override);
    }
  }
  const detectedNetwork = getCurrentNetwork();
  const targetNetwork = network ?? detectedNetwork;
  const programId = PROGRAM_IDS[targetNetwork].matcher;
  if (!programId) {
    throw new Error(`Matcher program not deployed on ${targetNetwork}`);
  }
  return new PublicKey(programId);
}
function getCurrentNetwork() {
  const network = safeEnv("NETWORK")?.toLowerCase();
  if (network === "mainnet" || network === "mainnet-beta") {
    return "mainnet";
  }
  return "devnet";
}
export {
  PROGRAM_IDS,
  PROGRAM_IDS_V17,
  PROGRAM_ID_V17,
  getCurrentNetwork,
  getMatcherProgramId,
  getProgramId,
  safeEnv
};
//# sourceMappingURL=program-ids.js.map