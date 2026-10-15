import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
async function getAta(owner, mint, allowOwnerOffCurve = false, tokenProgramId = TOKEN_PROGRAM_ID) {
  return getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve, tokenProgramId);
}
function getAtaSync(owner, mint, allowOwnerOffCurve = false, tokenProgramId = TOKEN_PROGRAM_ID) {
  return getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve, tokenProgramId);
}
async function fetchTokenAccount(connection, address, tokenProgramId = TOKEN_PROGRAM_ID) {
  return getAccount(connection, address, void 0, tokenProgramId);
}
export {
  fetchTokenAccount,
  getAta,
  getAtaSync
};
//# sourceMappingURL=ata.js.map