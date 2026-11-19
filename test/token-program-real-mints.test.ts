/**
 * Real-path differential test for detectTokenProgram.
 *
 * Mint account bytes + owner were captured read-only from devnet (see
 * test/fixtures/token-program-real-mints.json, each case carries slot + pubkey;
 * regenerate with scripts/capture-token-program-fixtures.mjs). The Connection is
 * a stub that serves those REAL account bytes, so detectTokenProgram runs on
 * chain data rather than hand-made owners. For each real mint we also check that
 * getAssociatedTokenAddressSync(mint, owner, true, detected) equals the ATA the
 * chain actually holds for a known owner.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  detectTokenProgram,
  isToken2022,
  isStandardToken,
  TOKEN_2022_PROGRAM_ID,
} from "../src/solana/token-program.js";
import { PROGRAM_IDS_DEVNET_V22 } from "../src/config/program-ids.js";

interface Case {
  mint: string;
  slot: number;
  owner: string;
  lamports: number;
  executable: boolean;
  dataBase64: string;
  ataOwner: string | null;
  chainAta: string | null;
}
const fx = JSON.parse(
  readFileSync(new URL("./fixtures/token-program-real-mints.json", import.meta.url), "utf8"),
) as { network: string; cases: Record<string, Case> };

function connFor(owner: PublicKey | null, data = Buffer.alloc(0)): Connection {
  return {
    getAccountInfo: async () =>
      owner === null ? null : { owner, data, lamports: 1, executable: false, rentEpoch: 0 },
  } as unknown as Connection;
}
const realConn = (c: Case) =>
  connFor(new PublicKey(c.owner), Buffer.from(c.dataBase64, "base64"));

describe("detectTokenProgram on real devnet mints", () => {
  it("fixtures are devnet captures with provenance", () => {
    expect(fx.network).toBe("devnet");
    for (const c of Object.values(fx.cases)) {
      expect(c.slot).toBeGreaterThan(0);
      expect(() => new PublicKey(c.mint)).not.toThrow();
    }
  });

  it("v2.2 devnet collateral mint -> SPL Token; derived ATA equals chain ATA", async () => {
    const c = fx.cases.v22_collateral_spl;
    const mint = new PublicKey(c.mint);
    const prog = await detectTokenProgram(realConn(c), mint);
    expect(prog.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(isStandardToken(prog)).toBe(true);
    expect(isToken2022(prog)).toBe(false);
    expect(c.ataOwner).not.toBeNull();
    const ata = getAssociatedTokenAddressSync(mint, new PublicKey(c.ataOwner!), true, prog);
    expect(ata.toBase58()).toBe(c.chainAta);
  });

  it("Token-2022 mint with extensions -> Token-2022; derived ATA equals chain ATA", async () => {
    const c = fx.cases.token2022_extensions;
    const mint = new PublicKey(c.mint);
    const data = Buffer.from(c.dataBase64, "base64");
    expect(data.length).toBeGreaterThan(82); // extension TLV data present
    const prog = await detectTokenProgram(realConn(c), mint);
    expect(prog.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(isToken2022(prog)).toBe(true);
    expect(c.ataOwner).not.toBeNull();
    const ata = getAssociatedTokenAddressSync(mint, new PublicKey(c.ataOwner!), true, prog);
    expect(ata.toBase58()).toBe(c.chainAta);
    // wrong program would give a different (non-chain) address
    const wrong = getAssociatedTokenAddressSync(mint, new PublicKey(c.ataOwner!), true, TOKEN_PROGRAM_ID);
    expect(wrong.toBase58()).not.toBe(c.chainAta);
  });
});

describe("detectTokenProgram fails closed on non-token owners", () => {
  const mint = new PublicKey(fx.cases.v22_collateral_spl.mint);
  it("system-program-owned account throws with mint in message", async () => {
    await expect(detectTokenProgram(connFor(SystemProgram.programId), mint)).rejects.toThrow(
      mint.toBase58(),
    );
  });
  it("wrapper-owned account throws with mint in message", async () => {
    const wrapper = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator);
    await expect(detectTokenProgram(connFor(wrapper), mint)).rejects.toThrow(mint.toBase58());
  });
  it("null account throws with mint in message", async () => {
    await expect(detectTokenProgram(connFor(null), mint)).rejects.toThrow(mint.toBase58());
  });
});
