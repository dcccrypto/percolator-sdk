import type { PublicKey } from "@solana/web3.js";

/**
 * Bounded memo for PDA derivations (findProgramAddressSync is ~3 ms each). Results are a pure
 * function of the key; the cache is cleared when full, and a fresh tuple is returned per call so
 * callers cannot corrupt a cached entry. Keys must be fixed-length byte concatenations.
 * @internal
 */
export function makePdaMemo(max: number): {
  get(key: string, compute: () => [PublicKey, number]): [PublicKey, number];
  size(): number;
} {
  const cache = new Map<string, [PublicKey, number]>();
  return {
    get(key, compute) {
      const hit = cache.get(key);
      if (hit) return [hit[0], hit[1]];
      const res = compute();
      if (cache.size >= max) cache.clear();
      cache.set(key, [res[0], res[1]]);
      return [res[0], res[1]];
    },
    size: () => cache.size,
  };
}

/** Latin-1 string key from fixed-length byte parts. @internal */
export function pdaMemoKey(...parts: Uint8Array[]): string {
  let s = "";
  for (const p of parts) s += String.fromCharCode(...p);
  return s;
}
