import { describe, it, expect, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TokenOwnerOffCurveError,
  TokenInvalidAccountOwnerError,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { getAta, getAtaSync, fetchTokenAccount } from "../src/solana/ata.js";
import { TOKEN_2022_PROGRAM_ID } from "../src/solana/token-program.js";

const owner = Keypair.generate().publicKey;
const mint = Keypair.generate().publicKey;

/** Reference derivation: the canonical ATA PDA seeds. */
function expectedAta(o: PublicKey, m: PublicKey, program: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [o.toBuffer(), program.toBuffer(), m.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

describe("getAtaSync", () => {
  it("derives the canonical SPL Token ATA by default", () => {
    expect(getAtaSync(owner, mint).equals(expectedAta(owner, mint, TOKEN_PROGRAM_ID))).toBe(true);
  });

  it("derives a different Token-2022 ATA when the program is passed", () => {
    const t22 = getAtaSync(owner, mint, false, TOKEN_2022_PROGRAM_ID);
    expect(t22.equals(expectedAta(owner, mint, TOKEN_2022_PROGRAM_ID))).toBe(true);
    expect(t22.equals(getAtaSync(owner, mint))).toBe(false);
  });

  it("rejects an off-curve owner unless allowOwnerOffCurve is set", () => {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("x")], TOKEN_PROGRAM_ID);
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
    expect(() => getAtaSync(pda, mint)).toThrow(TokenOwnerOffCurveError);
    expect(getAtaSync(pda, mint, true).equals(expectedAta(pda, mint, TOKEN_PROGRAM_ID))).toBe(true);
  });
});

describe("getAta", () => {
  it("matches getAtaSync for both token programs", async () => {
    expect((await getAta(owner, mint)).equals(getAtaSync(owner, mint))).toBe(true);
    expect(
      (await getAta(owner, mint, false, TOKEN_2022_PROGRAM_ID)).equals(
        getAtaSync(owner, mint, false, TOKEN_2022_PROGRAM_ID),
      ),
    ).toBe(true);
  });

  it("rejects off-curve owners by default and allows them when flagged", async () => {
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("y")], TOKEN_PROGRAM_ID);
    await expect(getAta(pda, mint)).rejects.toThrow(TokenOwnerOffCurveError);
    expect((await getAta(pda, mint, true)).equals(getAtaSync(pda, mint, true))).toBe(true);
  });
});

describe("fetchTokenAccount", () => {
  /** Build a minimal 165-byte SPL token account owned by `program`. */
  function tokenAccountData(): Buffer {
    const buf = Buffer.alloc(165);
    mint.toBuffer().copy(buf, 0);
    owner.toBuffer().copy(buf, 32);
    buf.writeBigUInt64LE(1234n, 64);
    buf[108] = 1; // initialized
    return buf;
  }

  it("decodes an account via the default SPL Token program", async () => {
    const addr = Keypair.generate().publicKey;
    const conn = {
      getAccountInfo: vi.fn().mockResolvedValue({
        owner: TOKEN_PROGRAM_ID,
        data: tokenAccountData(),
        lamports: 1,
        executable: false,
      }),
    };
    const acct = await fetchTokenAccount(conn as never, addr);
    expect(acct.amount).toBe(1234n);
    expect(acct.mint.equals(mint)).toBe(true);
    expect(acct.owner.equals(owner)).toBe(true);
    expect(conn.getAccountInfo).toHaveBeenCalledWith(addr, undefined);
  });

  it("throws when the account is owned by a different token program than requested", async () => {
    const conn = {
      getAccountInfo: vi.fn().mockResolvedValue({
        owner: TOKEN_PROGRAM_ID,
        data: tokenAccountData(),
        lamports: 1,
        executable: false,
      }),
    };
    await expect(
      fetchTokenAccount(conn as never, Keypair.generate().publicKey, TOKEN_2022_PROGRAM_ID),
    ).rejects.toThrow(TokenInvalidAccountOwnerError);
  });

  it("throws when the account does not exist", async () => {
    const conn = { getAccountInfo: vi.fn().mockResolvedValue(null) };
    await expect(fetchTokenAccount(conn as never, Keypair.generate().publicKey)).rejects.toThrow(
      TokenAccountNotFoundError,
    );
  });
});
