import { FORWARD_EPOCH } from './forward-epoch.js';

export const FORWARD_EVIDENCE_STORE_VERSION = 'forward-evidence-store-0.1';
const STORAGE_PREFIX = 'voicetrader-forward-evidence-v1:';

function emptyArchive(epoch = FORWARD_EPOCH) {
  return {
    version: FORWARD_EVIDENCE_STORE_VERSION,
    epochId: epoch.id,
    frozenAtUnix: epoch.frozenAtUnix,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    observedBarTimes: [],
    dataSignatures: [],
    trades: [],
  };
}

export function mergeForwardEvidence(archive, snapshot, epoch = FORWARD_EPOCH) {
  const base = archive?.epochId === epoch.id ? JSON.parse(JSON.stringify(archive)) : emptyArchive(epoch);
  const tradeMap = new Map((base.trades || []).map(trade => [trade.evidenceKey, trade]));
  for (const trade of snapshot?.trades || []) {
    if (trade?.epochId !== epoch.id || !trade?.evidenceKey) continue;
    if (!(Number(trade.entryTime) > epoch.frozenAtUnix)) continue;
    tradeMap.set(trade.evidenceKey, trade);
  }

  const observed = new Set((base.observedBarTimes || []).map(Number).filter(Number.isFinite));
  for (const t of snapshot?.postFreezeBarTimes || []) {
    const value = Number(t);
    if (Number.isFinite(value) && value > epoch.frozenAtUnix) observed.add(value);
  }

  const signatures = new Set((base.dataSignatures || []).filter(Boolean));
  if (snapshot?.dataSignature) signatures.add(snapshot.dataSignature);

  base.updatedAt = Date.now();
  base.observedBarTimes = [...observed].sort((a, b) => a - b);
  base.dataSignatures = [...signatures].slice(-32);
  base.trades = [...tradeMap.values()].sort((a, b) => {
    const timeDelta = Number(a.entryTime) - Number(b.entryTime);
    return timeDelta || String(a.strategyId).localeCompare(String(b.strategyId));
  });
  return base;
}

export function buildResumeAfterByStrategy(archive, epoch = FORWARD_EPOCH) {
  const out = {};
  for (const strategy of epoch.strategies) {
    const exits = (archive?.trades || [])
      .filter(trade => trade.epochId === epoch.id && trade.strategyId === strategy.id)
      .map(trade => Number(trade.exitTime))
      .filter(Number.isFinite);
    out[strategy.id] = exits.length ? Math.max(...exits) : epoch.frozenAtUnix;
  }
  return out;
}

export function detectObservedBarGaps(observedBarTimes = [], timeframeHours = 4) {
  const expected = timeframeHours * 60 * 60;
  const sorted = [...new Set(observedBarTimes.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const delta = sorted[i] - sorted[i - 1];
    if (delta > expected) gaps.push({ from: sorted[i - 1], to: sorted[i], missingBars: Math.max(0, Math.round(delta / expected) - 1) });
  }
  return gaps;
}

export class ForwardEvidenceStore {
  constructor({ epoch = FORWARD_EPOCH, storage = globalThis.localStorage } = {}) {
    this.epoch = epoch;
    this.storage = storage;
    this.key = `${STORAGE_PREFIX}${epoch.id}`;
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return emptyArchive(this.epoch);
      const parsed = JSON.parse(raw);
      if (parsed?.epochId !== this.epoch.id || parsed?.frozenAtUnix !== this.epoch.frozenAtUnix) return emptyArchive(this.epoch);
      return parsed;
    } catch {
      return emptyArchive(this.epoch);
    }
  }

  save(archive) {
    try {
      this.storage?.setItem(this.key, JSON.stringify(archive));
      return true;
    } catch {
      return false;
    }
  }

  merge(snapshot) {
    const merged = mergeForwardEvidence(this.load(), snapshot, this.epoch);
    this.save(merged);
    return merged;
  }
}
