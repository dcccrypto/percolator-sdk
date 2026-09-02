import { describe, expect, it } from "vitest";
import { ACCOUNTS_NFT_BURN, ACCOUNTS_NFT_EMERGENCY_BURN, buildNftAccountMetas } from "../src/abi/nft";
import { EXPECTED_SLAB_VERSION } from "../src/abi/instructions";
import { PublicKey } from "@solana/web3.js";

describe("#376 — NFT burn holder must be signer AND writable", () => {
  // The holder is the RENT RECIPIENT for every account these instructions close.
  // percolator-nft `require_writable_rent_recipient` is called by
  // process_burn_position_nft (processor.rs:884) and process_emergency_burn
  // (processor.rs:1055). A non-writable holder is rejected InvalidAccountData.
  it("marks the holder writable on BurnPositionNft", () => {
    expect(ACCOUNTS_NFT_BURN[0]).toBe("sw");
  });

  it("marks the holder writable on EmergencyBurn", () => {
    expect(ACCOUNTS_NFT_EMERGENCY_BURN[0]).toBe("sw");
  });

  it("produces isWritable:true for the holder through buildNftAccountMetas", () => {
    const keys = ACCOUNTS_NFT_BURN.map(() => PublicKey.default);
    const metas = buildNftAccountMetas(ACCOUNTS_NFT_BURN, keys);
    expect(metas[0].isSigner).toBe(true);
    expect(metas[0].isWritable).toBe(true);
  });
});

describe("#379 — EXPECTED_SLAB_VERSION tracks the deployed wrapper", () => {
  // percolator-prog/src/v16_program.rs:51 -> `pub const VERSION: u16 = 17`,
  // written into data[8..10] and hard-checked. A stale 16 here makes any
  // integrator gating on this constant reject EVERY live account.
  it("is 17, matching the deployed wrapper VERSION", () => {
    expect(EXPECTED_SLAB_VERSION).toBe(17);
  });
});
