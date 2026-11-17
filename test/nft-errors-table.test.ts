import { describe, it, expect } from "vitest";
import { NFT_ERRORS } from "../src/abi/nft-errors.js";

/**
 * `NftError` (`#[repr(u32)]`) from dcccrypto/percolator-nft `src/error.rs`, identical on
 * 95dcece (fix/v22-audit-1017-s1-2-nft-incarnation) and b22280c (devnet/v22-fresh-ids):
 * enum lines 8-84. Append-only; keep this table in step with the program.
 */
const PROGRAM_NFT_ERRORS: ReadonlyArray<readonly [number, string]> = [
  [0, "PositionNotOpen"],
  [1, "NftAlreadyMinted"],
  [2, "InvalidNftPda"],
  [3, "InvalidSlabOwner"],
  [4, "SlabDataTooShort"],
  [5, "UserIndexOutOfRange"],
  [6, "PositionMismatch"],
  [7, "NotNftHolder"],
  [8, "FundingOverflow"],
  [9, "InvalidMintAuthority"],
  [10, "UnrecognizedSlabLayout"],
  [11, "PositionInLiquidation"],
  [12, "FundingNotSettled"],
  [13, "InvalidPercolatorProgram"],
  [14, "PositionNotClosed"],
  [15, "InvalidExtraAccountMetas"],
  [16, "InvalidTokenAccount"],
  [17, "UnauthorizedDirectInvocation"],
  [18, "LpAccountNotAllowed"],
  [19, "InvalidAccountId"],
  [20, "SlotReused"],
  [21, "InvalidPortfolioOwner"],
  [22, "LegNotActive"],
  [23, "PortfolioDecodeFailed"],
  [24, "TransferBlocked"],
  [25, "MarketIdMismatch"],
  [26, "RegistryNotConfigured"],
  [27, "MultiLegNotWrappable"],
  [28, "StalePortfolioIncarnation"],
];

describe("NFT_ERRORS matches percolator-nft NftError", () => {
  it.each(PROGRAM_NFT_ERRORS)("code %i is %s", (code, name) => {
    expect(NFT_ERRORS[code]?.name).toBe(name);
    expect(NFT_ERRORS[code]?.hint.length).toBeGreaterThan(0);
  });

  it("has no missing or extra codes", () => {
    const sdk = Object.keys(NFT_ERRORS).map(Number).sort((a, b) => a - b);
    expect(sdk).toEqual(PROGRAM_NFT_ERRORS.map(([c]) => c));
  });
});
