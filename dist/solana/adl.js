import {
  fetchSlab,
  parseAllAccounts,
  parseEngine,
  parseConfig,
  detectSlabLayout,
  AccountKind
} from "./slab.js";
const V17_ADL_UNSUPPORTED_MESSAGE = "buildAdlInstruction: ExecuteAdl transaction building is not supported by the v17 SDK because ExecuteAdl is not accepted by the v17 wrapper. Use ranking/API helpers only, or use a version-specific SDK for deployed legacy ADL.";
function computePnlPct(pnl, capital) {
  if (capital === 0n) return 0n;
  return pnl * 10000n / capital;
}
function isAdlTriggered(slabData) {
  const layout = detectSlabLayout(slabData.length, slabData);
  if (!layout) return false;
  try {
    const engine = parseEngine(slabData);
    if (engine.pnlPosTot === 0n) return false;
    const config = parseConfig(slabData, layout);
    if (config.maxPnlCap === 0n) return false;
    return engine.pnlPosTot > config.maxPnlCap;
  } catch {
    return false;
  }
}
async function fetchAdlRankedPositions(connection, slab) {
  const data = await fetchSlab(connection, slab);
  return rankAdlPositions(data);
}
function rankAdlPositions(slabData) {
  const layout = detectSlabLayout(slabData.length, slabData);
  let pnlPosTot = 0n;
  let dominantSide = null;
  try {
    const engine = parseEngine(slabData);
    pnlPosTot = engine.pnlPosTot;
    const hasOiFields = layout !== null && layout.engineLongOiOff >= 0 && layout.engineShortOiOff >= 0;
    if (hasOiFields) {
      dominantSide = engine.shortOi > engine.longOi ? "short" : "long";
    }
  } catch (err) {
    console.warn(
      `[rankAdlPositions] parseEngine failed:`,
      err instanceof Error ? err.message : err
    );
  }
  let maxPnlCap = 0n;
  let isTriggered = false;
  if (layout) {
    try {
      const config = parseConfig(slabData, layout);
      maxPnlCap = config.maxPnlCap;
      isTriggered = maxPnlCap > 0n && pnlPosTot > maxPnlCap;
    } catch {
    }
  }
  const accounts = parseAllAccounts(slabData);
  const positions = [];
  for (const { idx, account } of accounts) {
    if (account.kind !== AccountKind.User) continue;
    if (account.positionSize === 0n) continue;
    const side = account.positionSize > 0n ? "long" : "short";
    const pnlPct = computePnlPct(account.pnl, account.capital);
    positions.push({
      idx,
      owner: account.owner,
      positionSize: account.positionSize,
      pnl: account.pnl,
      capital: account.capital,
      pnlPct,
      side,
      adlRank: -1
      // assigned below
    });
  }
  const longs = positions.filter((p) => p.side === "long").sort((a, b) => b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0);
  longs.forEach((p, i) => {
    p.adlRank = i;
  });
  const shorts = positions.filter((p) => p.side === "short").sort((a, b) => b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0);
  shorts.forEach((p, i) => {
    p.adlRank = i;
  });
  const ranked = [...longs, ...shorts].sort(
    (a, b) => b.pnlPct > a.pnlPct ? 1 : b.pnlPct < a.pnlPct ? -1 : 0
  );
  return { ranked, longs, shorts, isTriggered, pnlPosTot, maxPnlCap, dominantSide };
}
function buildAdlInstruction(_caller, _slab, _oracle, _programId, targetIdx, _backupOracles = []) {
  if (!Number.isInteger(targetIdx) || targetIdx < 0) {
    throw new Error(
      `buildAdlInstruction: targetIdx must be a non-negative integer, got ${targetIdx}`
    );
  }
  throw new Error(V17_ADL_UNSUPPORTED_MESSAGE);
}
function selectAdlTarget(ranking, preferSide) {
  if (preferSide === "long") return ranking.longs[0];
  if (preferSide === "short") return ranking.shorts[0];
  if (ranking.dominantSide === "long") return ranking.longs[0];
  if (ranking.dominantSide === "short") return ranking.shorts[0];
  return ranking.ranked[0];
}
async function buildAdlTransaction(connection, caller, slab, oracle, programId, preferSide, backupOracles = []) {
  const ranking = await fetchAdlRankedPositions(connection, slab);
  if (!ranking.isTriggered) return null;
  const target = selectAdlTarget(ranking, preferSide);
  if (!target) return null;
  return buildAdlInstruction(caller, slab, oracle, programId, target.idx, backupOracles);
}
const ADL_EVENT_TAG = 0xAD1E0001n;
function parseAdlEvent(logs, percolatorProgramId) {
  let insidePercolator = percolatorProgramId === void 0;
  let cpiDepth = 0;
  for (const line of logs) {
    if (typeof line !== "string") continue;
    if (percolatorProgramId !== void 0) {
      if (line.startsWith(`Program ${percolatorProgramId} invoke`)) {
        insidePercolator = true;
        cpiDepth = 0;
        continue;
      }
      if (line.startsWith(`Program ${percolatorProgramId} success`) || line.startsWith(`Program ${percolatorProgramId} failed`)) {
        insidePercolator = false;
        continue;
      }
      if (insidePercolator) {
        if (/^Program \S+ invoke/.test(line)) {
          cpiDepth++;
          continue;
        }
        if (/^Program \S+ (?:success|failed)$/.test(line)) {
          cpiDepth = Math.max(0, cpiDepth - 1);
          continue;
        }
      }
      if (!insidePercolator || cpiDepth > 0) continue;
    }
    const match = line.match(
      /^Program log: (\d+) (\d+) (\d+) (\d+) (\d+)$/
    );
    if (!match) continue;
    let tag;
    try {
      tag = BigInt(match[1]);
    } catch {
      continue;
    }
    if (tag !== ADL_EVENT_TAG) continue;
    try {
      const targetIdx = Number(BigInt(match[2]));
      const price = BigInt(match[3]);
      const closedLo = BigInt(match[4]);
      const closedHi = BigInt(match[5]);
      const closedAbs = closedHi << 64n | closedLo;
      return { tag, targetIdx, price, closedAbs };
    } catch {
      continue;
    }
  }
  return null;
}
async function fetchAdlRankings(apiBase, slab, fetchFn = fetch) {
  const slabStr = typeof slab === "string" ? slab : slab.toBase58();
  const base = apiBase.replace(/\/$/, "");
  const url = `${base}/api/adl/rankings?slab=${encodeURIComponent(slabStr)}`;
  const res = await fetchFn(url);
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
    }
    throw new Error(
      `fetchAdlRankings: HTTP ${res.status} from ${url}${body ? ` \u2014 ${body}` : ""}`
    );
  }
  const json = await res.json();
  if (typeof json !== "object" || json === null) {
    throw new Error("fetchAdlRankings: API returned non-object response");
  }
  const obj = json;
  if (!Array.isArray(obj.rankings)) {
    throw new Error("fetchAdlRankings: API response missing rankings array");
  }
  if (typeof obj.adlNeeded !== "boolean") {
    throw new Error(`fetchAdlRankings: invalid adlNeeded field: ${obj.adlNeeded}`);
  }
  if (typeof obj.capExceeded !== "boolean") {
    throw new Error(`fetchAdlRankings: invalid capExceeded field: ${obj.capExceeded}`);
  }
  if (typeof obj.slabAddress !== "string") {
    throw new Error(`fetchAdlRankings: invalid slabAddress field: ${obj.slabAddress}`);
  }
  if (typeof obj.pnlPosTot !== "string") {
    throw new Error(`fetchAdlRankings: invalid pnlPosTot field: ${obj.pnlPosTot}`);
  }
  if (typeof obj.maxPnlCap !== "string") {
    throw new Error(`fetchAdlRankings: invalid maxPnlCap field: ${obj.maxPnlCap}`);
  }
  for (const entry of obj.rankings) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("fetchAdlRankings: invalid ranking entry (not an object)");
    }
    const r = entry;
    if (typeof r.idx !== "number" || !Number.isInteger(r.idx) || r.idx < 0) {
      throw new Error(`fetchAdlRankings: invalid ranking idx: ${r.idx}`);
    }
  }
  return json;
}
export {
  buildAdlInstruction,
  buildAdlTransaction,
  fetchAdlRankedPositions,
  fetchAdlRankings,
  isAdlTriggered,
  parseAdlEvent,
  rankAdlPositions,
  selectAdlTarget
};
//# sourceMappingURL=adl.js.map