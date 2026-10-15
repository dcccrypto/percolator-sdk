import { PublicKey } from "@solana/web3.js";
const MAINNET_MARKETS = [
  { slabAddress: "7psyeWRts4pRX2cyAWD1NH87bR9ugXP7pe6ARgfG79Do", symbol: "SOL-PERP", name: "SOL/USDC Perpetual" }
];
const DEVNET_MARKETS = [
  // Populated from prior discoverMarkets() runs on devnet.
  // These serve as the tier-3 safety net for devnet users.
];
const STATIC_REGISTRY = {
  mainnet: MAINNET_MARKETS,
  devnet: DEVNET_MARKETS
};
const USER_MARKETS = {
  mainnet: [],
  devnet: []
};
function getStaticMarkets(network) {
  const builtin = STATIC_REGISTRY[network] ?? [];
  const user = USER_MARKETS[network] ?? [];
  if (user.length === 0) return [...builtin];
  const seen = /* @__PURE__ */ new Map();
  for (const entry of builtin) {
    seen.set(entry.slabAddress, entry);
  }
  for (const entry of user) {
    seen.set(entry.slabAddress, entry);
  }
  return [...seen.values()];
}
function registerStaticMarkets(network, entries) {
  const existing = USER_MARKETS[network];
  const seen = new Set(existing.map((e) => e.slabAddress));
  for (const entry of entries) {
    if (!entry.slabAddress) continue;
    if (seen.has(entry.slabAddress)) continue;
    try {
      new PublicKey(entry.slabAddress);
    } catch {
      console.warn(
        `[registerStaticMarkets] Skipping invalid slabAddress: ${entry.slabAddress}`
      );
      continue;
    }
    seen.add(entry.slabAddress);
    existing.push(entry);
  }
}
function clearStaticMarkets(network) {
  if (network) {
    USER_MARKETS[network] = [];
  } else {
    USER_MARKETS.mainnet = [];
    USER_MARKETS.devnet = [];
  }
}
export {
  clearStaticMarkets,
  getStaticMarkets,
  registerStaticMarkets
};
//# sourceMappingURL=static-markets.js.map