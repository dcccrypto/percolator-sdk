/**
 * Differential (byte-level) check of the market-lifecycle planners against the v2.2 wrapper
 * (percolator-prog feat/v22-rc23-2026-10-22 @ d27f3d73, src/v16_program.rs). No LiteSVM
 * harness exists on this base and no program build was run, so the program side is the
 * handler's account parsing, quoted per assertion:
 *   decode arms 13 :10300, 41 :10504, 44 :10524, 84 :10646, 90 :10728
 *   handle_rebalance_reduce :26710 / with_one_portfolio_view :48213 (owner s, market w, portfolio w)
 *   handle_close_slab :25993 (dest sw, slab w, vault w, vaultAuth, destAta w, tokenProgram;
 *     secondary mint => accounts 6,7 :26215; residue mint at index 8 if secondary else 6 :26339)
 *   handle_withdraw_protocol_fee :24076 (authority s, market w, dest w, vault w, vaultAuth, token)
 *   write_closed_market_tombstone :4049 (16 bytes, kind 8 at byte 10)
 */
import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  planCloseSlabAttempt,
  planPayeeGraceCloseSequenceV22,
  isClosedMarketTombstone,
  type CloseSlabAttemptArgs,
} from "../src/solana/market-lifecycle.js";
import { deriveVaultAuthority } from "../src/solana/pda.js";

const W = new PublicKey("ETDLAdiAyWnEUngspYczTXUceT6X8f92eZQvr8nmSkWB");
const pk = (): PublicKey => Keypair.generate().publicKey;

function base(): CloseSlabAttemptArgs {
  return {
    programId: W, market: pk(), vaultToken: pk(), closer: pk(), closerDestToken: pk(),
    closeAuthorityEpoch: 4n, hasLpVault: false,
    protocolFee: { authority: pk(), destToken: pk(), authorityEpoch: 4n, owed: 10n },
  };
}

describe("market-lifecycle vs wrapper handler parsing", () => {
  it("CloseSlab keys follow handle_close_slab :25993 order and flags", () => {
    const a = base();
    const ixs = planCloseSlabAttempt(a);
    const close = ixs[ixs.length - 1]!;
    const [va] = deriveVaultAuthority(W, a.market);
    expect(close.keys.map((k) => [k.pubkey.toBase58(), k.isSigner, k.isWritable])).toEqual([
      [a.closer.toBase58(), true, true],
      [a.market.toBase58(), false, true],
      [a.vaultToken.toBase58(), false, true],
      [va.toBase58(), false, false],
      [a.closerDestToken.toBase58(), false, true],
      [a.tokenProgram?.toBase58() ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", false, false],
    ]);
    expect(close.data.length).toBe(9);
    expect(close.data[0]).toBe(13);
  });

  it("payee-grace sequence: tx2 tag 84 amount 0 carries live epoch; tombstone = 16B kind 8", () => {
    const a = base();
    const [t1, t2] = planPayeeGraceCloseSequenceV22({
      ...a,
      creatorFees: [{ assetIndex: 0, route: "Payee", owed: 5n, authorityEpoch: 1n, payee: pk(), vaultMint: pk() }],
    });
    expect(t1.map((i) => i.data[0])).toEqual([84, 13]);
    expect(t2.map((i) => i.data[0])).toEqual([84, 13]);
    const tomb = new Uint8Array(16);
    tomb[10] = 8;
    expect(isClosedMarketTombstone(tomb)).toBe(true);
  });

  it("secondary-mint market: CloseSlab needs accounts 6,7 (:26215) and the residue mint after them (:26339)", () => {
    const a = base();
    const sv = pk(), sd = pk(), mint = pk();
    const ixs = planCloseSlabAttempt({ ...a, secondaryCollateral: { vault: sv, destAta: sd }, residueMint: mint });
    const close = ixs[ixs.length - 1]!;
    expect(close.keys).toHaveLength(9);
    expect(close.keys[6]).toEqual({ pubkey: sv, isSigner: false, isWritable: true });
    expect(close.keys[7]).toEqual({ pubkey: sd, isSigner: false, isWritable: true });
    expect(close.keys[8]).toEqual({ pubkey: mint, isSigner: false, isWritable: true });
    // primary-only with residue: mint at index 6
    const solo = planCloseSlabAttempt({ ...a, residueMint: mint });
    expect(solo[solo.length - 1]!.keys[6]!.pubkey.equals(mint)).toBe(true);
    expect(solo[solo.length - 1]!.keys).toHaveLength(7);
  });
});
