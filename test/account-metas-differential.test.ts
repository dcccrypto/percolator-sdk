import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as A from "../src/abi/accounts.js";

/** Verbatim copy of the pre-optimisation implementation (two-pass). */
function reference(spec: readonly A.AccountSpec[], keys: PublicKey[] | Record<string, PublicKey>) {
  let keysArray: PublicKey[];
  if (Array.isArray(keys)) {
    keysArray = keys;
  } else {
    keysArray = spec.map((s) => {
      const key = (keys as Record<string, PublicKey>)[s.name];
      if (!key) {
        throw new Error(
          `buildAccountMetas: missing key for account "${s.name}". ` +
          `Provided keys: [${Object.keys(keys).join(", ")}]`
        );
      }
      return key;
    });
  }
  if (keysArray.length !== spec.length) {
    throw new Error(`Account count mismatch: expected ${spec.length}, got ${keysArray.length}`);
  }
  return spec.map((s, i) => ({ pubkey: keysArray[i], isSigner: s.signer, isWritable: s.writable }));
}

const outcome = (f: () => unknown) => {
  try { return { ok: f() }; } catch (e) { return { err: (e as Error).message }; }
};

const specs = Object.entries(A).filter(
  ([k, v]) => k.startsWith("ACCOUNTS_") && Array.isArray(v),
) as [string, readonly A.AccountSpec[]][];

describe("buildAccountMetas differential vs reference", () => {
  it("covers every exported ACCOUNTS_* spec", () => {
    expect(specs.length).toBeGreaterThan(90);
  });

  for (const [name, spec] of specs) {
    it(name, () => {
      const arr = spec.map(() => Keypair.generate().publicKey);
      const map: Record<string, PublicKey> = {};
      spec.forEach((s, i) => { map[s.name] = arr[i]; });
      const cases: (PublicKey[] | Record<string, PublicKey>)[] = [
        arr, map,
        arr.slice(1), [...arr, arr[0]], [],
        { ...map, extra: arr[0] },
        {},
      ];
      if (spec.length > 0) {
        const missingLast = { ...map };
        delete missingLast[spec[spec.length - 1].name];
        cases.push(missingLast);
        const missingFirst = { ...map };
        delete missingFirst[spec[0].name];
        cases.push(missingFirst);
      }
      for (const c of cases) {
        expect(outcome(() => A.buildAccountMetas(spec, c))).toEqual(outcome(() => reference(spec, c)));
      }
    });
  }
});
