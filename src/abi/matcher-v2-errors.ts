// Web3-free home of the matcher v2 error table. `matcher-v2.ts` re-exports it unchanged;
// `errors.ts` imports it from here so parsing errors does not pull @solana/web3.js into a bundle.

/** Matcher v2 custom error codes (`src/v2.rs`), attributed to the MATCHER program id. */
export const MATCHER_V2_ERRORS: Readonly<Record<number, { name: string; hint: string }>> = Object.freeze({
  8002: { name: "ERR_STALE_MARK", hint: "Matcher refused: the mark behind oracle_price_e6 is older than the ctx's max_mark_age_slots (call-extension mark_slot), or the observed-unchanged-price fallback tripped. Push a fresh mark, then retry. With STALE_ALLOW_REDUCING, reducing fills still pass." },
  8003: { name: "ERR_MARK_SLOT_IN_FUTURE", hint: "Matcher refused: call-extension mark_slot is greater than Clock.slot. The caller built a bad extension." },
  8004: { name: "ERR_ASSET_MISMATCH", hint: "Matcher refused: this kind-2 / observed-staleness context is bound to a different asset. One such context per asset." },
  8005: { name: "ERR_OWNER_PROOF_MISMATCH", hint: "Matcher tag 5 owner proof failed: create_program_address(['matcher', market, lp_portfolio, lp_owner, matcher_program, matcher_ctx, [bump]], wrapper) does not equal ctx.lp_pda. Check wrapper id, market, LP portfolio, signer = LP owner, and bump (deriveMatcherDelegate)." },
  8001: { name: "ERR_INCONSISTENT_LEG_ORACLE_PRICE", hint: "Matcher batch call: legs for the same asset carried different oracle prices." },
});
