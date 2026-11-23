/**
 * READ-ONLY devnet differential for the SDK fetch path: src/solana/ata.ts fetchTokenAccount / getAtaSync
 * vs the real @solana/spl-token@0.4.14 getAccount / getAssociatedTokenAddressSync, on the collateral mints of
 * every v2.2 market of the devnet wrapper and the owner wallets of their portfolios.
 *
 * Per (wallet, mint) pair, for the ATA derived with the default program and with the mint's real program,
 * each fetched with both token programs as the expected owner: found / not found, every Account field
 * (incl. tlvData bytes), and the thrown error name/message. Both libraries see the SAME getAccountInfo
 * response (a recording proxy serves one RPC answer to both and logs the call args each lib made), so a
 * slot race can never fake a mismatch. Also: the wallet's actually held token accounts for the mint
 * (getTokenAccountsByOwner, both programs) vs the default-program ATA.
 *
 * Usage (from the SDK worktree): npx tsx scripts/ata-fetch-devnet-diff.ts [rpcUrl] [outJson]
 */
import { writeFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";
import type { AccountInfo, Commitment } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { fetchTokenAccount, getAtaSync, getAta } from "../src/solana/ata.js";
import { TokenError } from "../src/solana/spl-token-lite.js";
import { parseWrapperConfigV17, parsePortfolioV17, parseLpVaultRegistry } from "../src/solana/slab.js";
import { ACCOUNT_KIND } from "../src/abi/layout.js";
import { PROGRAM_IDS_DEVNET_V22 } from "../src/config/program-ids.js";
import { detectTokenProgram } from "../src/solana/token-program.js";

const RPC = process.argv[2] || ["https:", "", "api.devnet.solana.com"].join("/");
const OUT = process.argv[3] ?? "/tmp/ata-fetch-devnet-diff.json";
const conn = new Connection(RPC, "confirmed");
const WRAPPER = new PublicKey(PROGRAM_IDS_DEVNET_V22.percolator);
const TOKEN = spl.TOKEN_PROGRAM_ID;
const T22 = spl.TOKEN_2022_PROGRAM_ID;
const progName = (p: PublicKey | null) => (p == null ? "none" : p.equals(TOKEN) ? "Token" : p.equals(T22) ? "Token-2022" : p.toBase58().slice(0, 8));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let rpcCalls = 0;
async function retry<T>(f: () => Promise<T>, what: string): Promise<T> {
  for (let i = 0; ; i++) {
    try { rpcCalls++; const r = await f(); await sleep(120); return r; } catch (e) {
      if (i >= 7) throw new Error(`${what}: ${(e as Error).message}`);
      await sleep(600 * 2 ** i);
    }
  }
}

/** Serves one cached live getAccountInfo answer per address to every caller; records each caller's args. */
class RecordingConn {
  cache = new Map<string, AccountInfo<Buffer> | null>();
  calls: { lib: string; method: string; address: string; commitment: unknown }[] = [];
  lib = "";
  async getAccountInfo(address: PublicKey, commitment?: Commitment | { commitment?: Commitment }): Promise<AccountInfo<Buffer> | null> {
    this.calls.push({ lib: this.lib, method: "getAccountInfo", address: address.toBase58(), commitment: commitment ?? null });
    const k = address.toBase58();
    if (!this.cache.has(k)) this.cache.set(k, await retry(() => conn.getAccountInfo(address), `gai ${k}`));
    return this.cache.get(k)!;
  }
}
const rec = new RecordingConn();

type Outcome = { ok: true; acct: Record<string, string> } | { ok: false; name: string; message: string; isTokenError: boolean; ctor: string };
function norm(a: Record<string, unknown>): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of Object.keys(a).sort()) {
    const v = a[k];
    o[k] = v == null ? String(v) : v instanceof PublicKey ? v.toBase58() : Buffer.isBuffer(v) || v instanceof Uint8Array ? `0x${Buffer.from(v).toString("hex")}` : typeof v === "bigint" ? `${v}n` : `${typeof v}:${String(v)}`;
  }
  return o;
}
async function run(f: () => Promise<unknown>, isOurs: boolean): Promise<Outcome> {
  try { return { ok: true, acct: norm((await f()) as Record<string, unknown>) }; } catch (e) {
    const err = e as Error;
    return { ok: false, name: err.name, message: err.message, isTokenError: isOurs ? e instanceof TokenError : e instanceof spl.TokenError, ctor: err.constructor?.name ?? "?" };
  }
}
function syncRun(f: () => unknown): string { try { return (f() as PublicKey).toBase58(); } catch (e) { return `throw:${(e as Error).name}`; } }

const mismatches: unknown[] = [];
const caseCounts: Record<string, { n: number; same: number }> = {};
function tally(kind: string, same: boolean, detail: unknown) {
  (caseCounts[kind] ??= { n: 0, same: 0 }).n++;
  if (same) caseCounts[kind].same++; else mismatches.push({ kind, ...(detail as object) });
}

async function diffFetch(kind: string, address: PublicKey, prog: PublicKey | undefined, ctx: object): Promise<{ sdk: Outcome; spl: Outcome }> {
  const c = rec as unknown as Connection;
  const before = rec.calls.length;
  rec.lib = "sdk";
  const sdk = await run(() => (prog ? fetchTokenAccount(c, address, prog) : fetchTokenAccount(c, address)), true);
  rec.lib = "spl";
  const splo = await run(() => (prog ? spl.getAccount(c, address, undefined, prog) : spl.getAccount(c, address)), false);
  const calls = rec.calls.slice(before);
  const sdkCalls = JSON.stringify(calls.filter((x) => x.lib === "sdk").map(({ lib: _l, ...r }) => r));
  const splCalls = JSON.stringify(calls.filter((x) => x.lib === "spl").map(({ lib: _l, ...r }) => r));
  const same = JSON.stringify(sdk) === JSON.stringify(splo) && sdkCalls === splCalls;
  tally(kind, same, { address: address.toBase58(), prog: prog ? progName(prog) : "default", sdk, spl: splo, sdkCalls, splCalls, ...ctx });
  return { sdk, spl: splo };
}
const label = (o: Outcome) => (o.ok ? "found" : o.name);

async function main() {
  const t0 = Date.now();
  // 1. Every wrapper account, header + config prefix only (kind byte @10; collateral mints @48/@80).
  const all = await retry(() => conn.getProgramAccounts(WRAPPER, { dataSlice: { offset: 0, length: 112 } }), "gpa all");
  const byKind = new Map<number, PublicKey[]>();
  for (const a of all) { const k = a.account.data[10]; (byKind.get(k) ?? byKind.set(k, []).get(k)!).push(a.pubkey); }
  console.log(`wrapper ${WRAPPER.toBase58()}: ${all.length} accounts; kinds ${JSON.stringify([...byKind].map(([k, v]) => [k, v.length]))}`);

  // 2. Markets (kind 1): full config via SDK parser.
  const marketKeys = byKind.get(ACCOUNT_KIND.Market) ?? [];
  const markets: { key: string; collateral: string; secondary: string }[] = [];
  for (let i = 0; i < marketKeys.length; i += 100) {
    const chunk = marketKeys.slice(i, i + 100);
    const infos = await retry(() => conn.getMultipleAccountsInfo(chunk, { dataSlice: { offset: 0, length: 4096 } } as never), "gma markets");
    infos.forEach((inf, j) => {
      if (!inf) return;
      try { const cfg = parseWrapperConfigV17(new Uint8Array(inf.data)); markets.push({ key: chunk[j].toBase58(), collateral: cfg.collateralMint.toBase58(), secondary: cfg.secondaryCollateralMint.toBase58() }); }
      catch (e) { console.log(`market ${chunk[j].toBase58()} config decode fail: ${(e as Error).message}`); }
    });
  }
  // 3. Portfolios (kind 2). parsePortfolioV17 fails tight on this devnet build (engine disc 19, 10,603 B: pre-#299),
  // so wallets are read at the SDK's own provenance offsets (market @16, provenance owner @80, body owner @116), which
  // #299 did not move. The parser outcome is still recorded.
  const pfKeys = byKind.get(ACCOUNT_KIND.Portfolio) ?? [];
  const portfolios: { key: string; market: string; owner: string; provOwner: string }[] = [];
  const pfParse: Record<string, number> = {};
  for (let i = 0; i < pfKeys.length; i += 100) {
    const chunk = pfKeys.slice(i, i + 100);
    const infos = await retry(() => conn.getMultipleAccountsInfo(chunk), "gma pf");
    infos.forEach((inf, j) => {
      if (!inf) return;
      const d = new Uint8Array(inf.data);
      try { parsePortfolioV17(d); pfParse.ok = (pfParse.ok ?? 0) + 1; } catch (e) { const k = (e as Error).message.replace(/^.*?: /, "").slice(0, 70); pfParse[k] = (pfParse[k] ?? 0) + 1; }
      const k = (o: number) => new PublicKey(d.subarray(o, o + 32)).toBase58();
      portfolios.push({ key: chunk[j].toBase58(), market: k(16), owner: k(116), provOwner: k(80) });
    });
  }
  // 3b. LP vault registries (kind 5): the market's LP share mint, via the SDK parser.
  const regKeys = byKind.get(ACCOUNT_KIND.LpVaultRegistry) ?? [];
  const lpMints = new Map<string, string>(); // lpMint -> market
  for (let i = 0; i < regKeys.length; i += 100) {
    const chunk = regKeys.slice(i, i + 100);
    const infos = await retry(() => conn.getMultipleAccountsInfo(chunk), "gma reg");
    infos.forEach((inf) => { if (!inf) return; try { const r = parseLpVaultRegistry(new Uint8Array(inf.data)) as unknown as { lpMint: PublicKey; market?: PublicKey; marketGroup?: PublicKey }; lpMints.set(r.lpMint.toBase58(), (r.market ?? r.marketGroup ?? PublicKey.default).toBase58()); } catch { /* not a registry */ } });
  }
  const DEFAULT = PublicKey.default.toBase58();
  const mintSource = new Map<string, Set<string>>();
  const addMint = (m: string, src: string) => { if (m !== DEFAULT) (mintSource.get(m) ?? mintSource.set(m, new Set()).get(m)!).add(src); };
  for (const m of markets) { addMint(m.collateral, "collateral"); addMint(m.secondary, "secondaryCollateral"); }
  for (const m of lpMints.keys()) addMint(m, "lpShare");
  // 3c. Every token account each portfolio wallet holds, both programs.
  const wallets = [...new Set(portfolios.flatMap((p) => [p.owner, p.provOwner]).filter((w) => w !== DEFAULT))];
  const holdings = new Map<string, { key: string; mint: string; prog: PublicKey }[]>();
  for (const w of wallets) {
    const W = new PublicKey(w);
    const hs: { key: string; mint: string; prog: PublicKey }[] = [];
    for (const prog of [TOKEN, T22]) {
      const r = await retry(() => conn.getTokenAccountsByOwner(W, { programId: prog }), "gtabo");
      for (const v of r.value) { const mint = v.account.data.length >= 32 ? new PublicKey(v.account.data.subarray(0, 32)).toBase58() : "?"; hs.push({ key: v.pubkey.toBase58(), mint, prog }); addMint(mint, `held:${progName(prog)}`); }
    }
    holdings.set(w, hs);
  }
  const mintSet = new Set(mintSource.keys());
  console.log(`markets decoded ${markets.length}/${marketKeys.length}; portfolios ${portfolios.length} (parsePortfolioV17: ${JSON.stringify(pfParse)}); wallets ${wallets.length}; lp mints ${lpMints.size}; distinct mints ${mintSet.size}`);

  // 4. Mint program per mint (SDK detectTokenProgram vs raw owner).
  const mints = [...mintSet].map((s) => new PublicKey(s));
  const mintInfo = new Map<string, { owner: string; prog: PublicKey | null; detect: string; len: number }>();
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await retry(() => conn.getMultipleAccountsInfo(chunk), "gma mints");
    infos.forEach((inf, j) => {
      const owner = inf ? inf.owner : null;
      const prog = owner && (owner.equals(TOKEN) || owner.equals(T22)) ? owner : null;
      mintInfo.set(chunk[j].toBase58(), { owner: owner ? owner.toBase58() : "missing", prog, detect: "", len: inf?.data.length ?? -1 });
    });
  }
  for (const m of mints.slice(0, 400)) {
    const mi = mintInfo.get(m.toBase58())!;
    try { mi.detect = progName(await retry(() => detectTokenProgram(conn, m), "detect")); } catch (e) { mi.detect = `throw:${(e as Error).message.slice(0, 40)}`; }
    tally("detectTokenProgram vs mint owner", mi.detect === progName(mi.prog) || (mi.prog == null && mi.detect.startsWith("throw")), { mint: m.toBase58(), detect: mi.detect, owner: mi.owner });
  }
  const progCounts: Record<string, number> = {};
  for (const mi of mintInfo.values()) { const k = progName(mi.prog) + (mi.prog ? "" : `(${mi.owner.slice(0, 8)})`); progCounts[k] = (progCounts[k] ?? 0) + 1; }
  const srcCounts: Record<string, number> = {};
  for (const [m, ss] of mintSource) for (const s of ss) { const k = `${s}/${progName(mintInfo.get(m)!.prog)}`; srcCounts[k] = (srcCounts[k] ?? 0) + 1; }
  console.log(`mint programs: ${JSON.stringify(progCounts)}; by source: ${JSON.stringify(srcCounts)}`);

  // 5. (wallet, mint) pairs: the wallet's portfolio market collateral + that market's LP mint + every mint it holds.
  const marketMints = new Map(markets.map((m) => [m.key, [m.collateral, ...(m.secondary !== DEFAULT ? [m.secondary] : [])]]));
  const marketLp = new Map<string, string[]>();
  for (const [lp, mk] of lpMints) (marketLp.get(mk) ?? marketLp.set(mk, []).get(mk)!).push(lp);
  const pairs = new Map<string, { wallet: string; mint: string; portfolios: number }>();
  const addPair = (w: string, m: string) => { const k = `${w}:${m}`; const e = pairs.get(k); if (e) e.portfolios++; else pairs.set(k, { wallet: w, mint: m, portfolios: 1 }); };
  let orphanPf = 0;
  for (const p of portfolios) {
    const ms = marketMints.get(p.market);
    if (!ms) { orphanPf++; continue; }
    for (const w of new Set([p.owner, p.provOwner])) { if (w === DEFAULT) continue; for (const m of [...ms, ...(marketLp.get(p.market) ?? [])]) addPair(w, m); }
  }
  for (const [w, hs] of holdings) for (const h of hs) if (h.mint !== "?" && !pairs.has(`${w}:${h.mint}`)) addPair(w, h.mint);
  const PAIR_CAP = Number(process.env.PAIR_CAP ?? 600);
  const pairList = [...pairs.values()];
  // Round-robin by mint so the cap keeps mint coverage maximal.
  const byMint = new Map<string, typeof pairList>();
  for (const p of pairList) (byMint.get(p.mint) ?? byMint.set(p.mint, []).get(p.mint)!).push(p);
  const ordered: typeof pairList = [];
  for (let r = 0; ordered.length < pairList.length; r++) for (const l of byMint.values()) if (l[r]) ordered.push(l[r]);
  const sel = ordered.slice(0, PAIR_CAP);
  console.log(`(wallet,mint) pairs ${pairList.length} (orphan portfolios ${orphanPf}); mints with a holder ${byMint.size}; checking ${sel.length}`);

  // 6. Per pair.
  const t22Pairs: { wallet: string; mint: string; defaultAta: string; t22Ata: string; held: string[]; heldDefaultExists: boolean }[] = [];
  const perMint = new Map<string, { prog: string; pairs: number; heldDefaultMatch: number; heldProgMatch: number; heldAny: number; defaultReadZeroButHeld: number }>();
  let offCurve = 0;
  const closedCandidates: PublicKey[] = [];
  for (const [i, p] of sel.entries()) {
    const W = new PublicKey(p.wallet), M = new PublicKey(p.mint);
    const mi = mintInfo.get(p.mint)!;
    const pm = perMint.get(p.mint) ?? perMint.set(p.mint, { prog: progName(mi.prog), pairs: 0, heldDefaultMatch: 0, heldProgMatch: 0, heldAny: 0, defaultReadZeroButHeld: 0 }).get(p.mint)!;
    pm.pairs++;
    // ATA derivation, default and per-program, sync + async, off-curve false and true.
    for (const aoc of [false, true]) {
      for (const prog of [undefined, TOKEN, T22]) {
        const s = syncRun(() => (prog ? getAtaSync(W, M, aoc, prog) : getAtaSync(W, M, aoc)));
        const r = syncRun(() => (prog ? spl.getAssociatedTokenAddressSync(M, W, aoc, prog) : spl.getAssociatedTokenAddressSync(M, W, aoc)));
        let a: string; try { a = (await (prog ? getAta(W, M, aoc, prog) : getAta(W, M, aoc))).toBase58(); } catch (e) { a = `throw:${(e as Error).name}`; }
        tally(`getAtaSync/getAta vs spl (offCurve=${aoc}, prog=${prog ? progName(prog) : "default"})`, s === r && a === r, { wallet: p.wallet, mint: p.mint, sdkSync: s, sdkAsync: a, spl: r });
      }
    }
    const onCurve = PublicKey.isOnCurve(W.toBuffer());
    if (!onCurve) offCurve++;
    const defAta = getAtaSync(W, M, true);
    const tokAta = getAtaSync(W, M, true, TOKEN);
    const t22Ata = getAtaSync(W, M, true, T22);
    tally("default program === Token (ATA)", defAta.equals(tokAta), { wallet: p.wallet, mint: p.mint });
    const ctx = { wallet: p.wallet, mint: p.mint, mintProg: progName(mi.prog) };
    // fetch: Token-seeded ATA and T22-seeded ATA, each with default / Token / T22 expected program.
    const res: Record<string, Outcome> = {};
    for (const [seedName, addr] of [["TokenSeed", tokAta], ["T22Seed", t22Ata]] as const) {
      for (const [pn, prog] of [["default", undefined], ["Token", TOKEN], ["T22", T22]] as const) {
        const { sdk } = await diffFetch(`fetch ${seedName} ATA, expect=${pn}, mint=${progName(mi.prog)}`, addr, prog, ctx);
        res[`${seedName}/${pn}`] = sdk;
      }
    }
    // Held token accounts for this mint, both programs.
    const heldH = (holdings.get(p.wallet) ?? []).filter((h) => h.mint === p.mint);
    const heldKeys = heldH.map((h) => h.key);
    const heldOwners = heldH.map((h) => progName(h.prog));
    if (heldKeys.length) pm.heldAny++;
    if (heldKeys.includes(defAta.toBase58())) pm.heldDefaultMatch++;
    const progAta = mi.prog ? getAtaSync(W, M, true, mi.prog).toBase58() : "";
    if (heldKeys.includes(progAta)) pm.heldProgMatch++;
    // Every held account through the fetch path with the owning program and with the default.
    for (const [j, hk] of heldKeys.entries()) {
      await diffFetch(`fetch held account (owner ${heldOwners[j]}), expect=owning program`, new PublicKey(hk), heldH[j].prog, ctx);
      await diffFetch(`fetch held account (owner ${heldOwners[j]}), expect=default`, new PublicKey(hk), undefined, ctx);
    }
    const defRead = res["TokenSeed/default"];
    const heldBalance = heldKeys.length;
    if (!defRead.ok && heldKeys.length) pm.defaultReadZeroButHeld++;
    if (mi.prog?.equals(T22)) t22Pairs.push({ wallet: p.wallet, mint: p.mint, defaultAta: defAta.toBase58(), t22Ata: t22Ata.toBase58(), held: heldKeys.map((k, j) => `${k}(${heldOwners[j]})`), heldDefaultExists: defRead.ok });
    if (!res["TokenSeed/Token"].ok && !res["T22Seed/T22"].ok && !heldKeys.length) closedCandidates.push(mi.prog?.equals(T22) ? t22Ata : tokAta);
    if (i % 25 === 0) console.log(`  pair ${i}/${sel.length} rpc=${rpcCalls} mismatches=${mismatches.length} heldBal=${heldBalance}`);
  }

  // 7. Wrong-type accounts through the fetch path: the mint itself, a market, a portfolio (with each program).
  for (const m of mints) for (const [pn, prog] of [["default", undefined], ["Token", TOKEN], ["T22", T22]] as const)
    await diffFetch(`fetch MINT address, expect=${pn}, mint=${progName(mintInfo.get(m.toBase58())!.prog)}`, m, prog, { mint: m.toBase58() });
  for (const k of [...marketKeys.slice(0, 5), ...pfKeys.slice(0, 5)]) for (const prog of [undefined, TOKEN, T22])
    await diffFetch("fetch wrapper-owned account", k, prog, {});

  // 8. Closed accounts: missing ATAs that have signature history (= existed, then closed).
  const closed: string[] = [];
  for (const a of closedCandidates.slice(0, 80)) {
    const sigs = await retry(() => conn.getSignaturesForAddress(a, { limit: 1 }), "sigs");
    if (sigs.length) closed.push(a.toBase58());
  }
  for (const a of closed) for (const prog of [undefined, TOKEN, T22]) await diffFetch("fetch CLOSED account (sig history, no account)", new PublicKey(a), prog, {});

  const t22Mints = [...perMint.entries()].filter(([, v]) => v.prog === "Token-2022");
  const report = {
    rpc: RPC.replace(/\?.*$/, ""), wrapper: WRAPPER.toBase58(), slot: await retry(() => conn.getSlot(), "slot"), secs: (Date.now() - t0) / 1000, rpcCalls,
    accounts: all.length, markets: markets.length, portfolios: portfolios.length, portfolioParse: pfParse, wallets: wallets.length, lpMints: lpMints.size, mintSources: srcCounts, distinctMints: mints.length, mintPrograms: progCounts,
    pairsTotal: pairList.length, pairsChecked: sel.length, mintsWithHolder: byMint.size, offCurveWallets: offCurve, closedFound: closed,
    caseCounts, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 200),
    perMint: Object.fromEntries(perMint),
    t22: {
      mints: t22Mints.length,
      mintsWhereDefaultAtaDiffersFromHeld: t22Mints.filter(([m]) => t22Pairs.some((p) => p.mint === m && p.held.length && !p.held.some((h) => h.startsWith(p.defaultAta)))).length,
      mintsWhereDefaultAtaIsHeld: t22Mints.filter(([m]) => t22Pairs.some((p) => p.mint === m && p.held.some((h) => h.startsWith(p.defaultAta)))).length,
      examples: t22Pairs.filter((p) => p.held.length).slice(0, 10), pairs: t22Pairs.length,
    },
  };
  writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ ...report, mismatches: report.mismatches.slice(0, 5), perMint: undefined, t22: { ...report.t22, examples: report.t22.examples.slice(0, 3) } }, null, 1));
  console.log(`wrote ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
