/**
 * Regression tests for #266 — detectTokenProgram must FAIL CLOSED.
 *
 * The old implementation returned `info.owner` verbatim, accepting an account
 * owned by an arbitrary program and propagating that owner as the "token
 * program". A forged program could then be injected into a downstream token CPI.
 * detectTokenProgram now returns ONLY TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID
 * (branching on the exact owner) and throws for anything else.
 */

import { describe, it, expect } from "vitest";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  detectTokenProgram,
  isToken2022,
  isStandardToken,
  TOKEN_2022_PROGRAM_ID,
} from "../src/solana/token-program.js";

/** Build a fake Connection whose getAccountInfo returns the given owner (or null). */
function makeConn(owner: PublicKey | null): Connection {
  return {
    getAccountInfo: async () =>
      owner === null ? null : { owner, data: new Uint8Array(0), lamports: 1, executable: false, rentEpoch: 0 },
  } as unknown as Connection;
}

const mint = PublicKey.unique();

describe("#266 — detectTokenProgram fails closed", () => {
  it("returns TOKEN_PROGRAM_ID for an SPL-Token-owned mint", async () => {
    const conn = makeConn(TOKEN_PROGRAM_ID);
    const got = await detectTokenProgram(conn, mint);
    expect(got.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  it("returns TOKEN_2022_PROGRAM_ID for a Token-2022-owned mint", async () => {
    const conn = makeConn(TOKEN_2022_PROGRAM_ID);
    const got = await detectTokenProgram(conn, mint);
    expect(got.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });

  it("throws for an arbitrary (attacker-controlled) owner — no fail-open", async () => {
    const attacker = PublicKey.unique();
    const conn = makeConn(attacker);
    await expect(detectTokenProgram(conn, mint)).rejects.toThrow(/not a token mint/);
  });

  it("throws for the System Program owner (uninitialized / wrong account)", async () => {
    const conn = makeConn(new PublicKey("11111111111111111111111111111111"));
    await expect(detectTokenProgram(conn, mint)).rejects.toThrow(/not a token mint/);
  });

  it("throws when the mint account does not exist", async () => {
    const conn = makeConn(null);
    await expect(detectTokenProgram(conn, mint)).rejects.toThrow(/not found/);
  });
});

describe("isToken2022 / isStandardToken", () => {
  const other = PublicKey.unique();

  it("TOKEN_2022_PROGRAM_ID is the canonical Token Extensions id", () => {
    expect(TOKEN_2022_PROGRAM_ID.toBase58()).toBe("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
  });

  it("isToken2022 is true only for Token-2022", () => {
    expect(isToken2022(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(isToken2022(TOKEN_PROGRAM_ID)).toBe(false);
    expect(isToken2022(other)).toBe(false);
  });

  it("isStandardToken is true only for SPL Token", () => {
    expect(isStandardToken(TOKEN_PROGRAM_ID)).toBe(true);
    expect(isStandardToken(TOKEN_2022_PROGRAM_ID)).toBe(false);
    expect(isStandardToken(other)).toBe(false);
  });

  it("the two predicates are mutually exclusive for the two real programs", () => {
    for (const id of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      expect(isToken2022(id)).not.toBe(isStandardToken(id));
    }
  });
});
