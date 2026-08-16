const DB_NAME = 'voicetrader-research-v1';
const DB_VERSION = 1;
const STORE = 'decisionEvents';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'eventId' });
        store.createIndex('candleTime', 'candleTime');
        store.createIndex('instrument', 'instrument');
        store.createIndex('strategyVersion', 'strategyVersion');
        store.createIndex('dataSourceId', 'dataSourceId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });
}

export class DecisionEventLogger {
  constructor({ strategyVersion = 'champion-001' } = {}) {
    this.strategyVersion = strategyVersion;
    this.dbPromise = null;
  }

  async db() {
    if (!this.dbPromise) this.dbPromise = openDb();
    return this.dbPromise;
  }

  async record(event) {
    const db = await this.db();
    const payload = {
      schemaVersion: 1,
      strategyVersion: this.strategyVersion,
      recordedAt: Date.now(),
      ...event,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(payload);
      tx.oncomplete = () => resolve(payload.eventId);
      tx.onerror = () => reject(tx.error || new Error('DecisionEvent write failed'));
      tx.onabort = () => reject(tx.error || new Error('DecisionEvent write aborted'));
    });
  }

  async count() {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('DecisionEvent count failed'));
    });
  }
}

export function policyDecision({ analysis, hasPosition, positionSide }) {
  if (!hasPosition) {
    if (analysis.action === 'BUY') return 'ENTER_LONG';
    if (analysis.action === 'SELL') return 'ENTER_SHORT';
    return 'NO_ENTRY';
  }
  const opposite = (positionSide === 'BUY' && analysis.action === 'SELL') || (positionSide === 'SELL' && analysis.action === 'BUY');
  return opposite ? 'EXIT_SIGNAL' : 'HOLD';
}

export function buildDecisionEvent({
  key,
  timeframe,
  idx,
  candle,
  analysis,
  dataMeta,
  estimatedRoundTripCostBps,
  aiPosition,
}) {
  const candleTime = Number(candle?.t || 0);
  return {
    eventId: `${dataMeta.id}:${key}:${timeframe}h:${candleTime}`,
    instrument: key,
    timeframeHours: timeframe,
    candleTime,
    barIndex: idx,
    dataSourceId: dataMeta.id,
    dataSourceType: dataMeta.sourceType,
    dataSignature: dataMeta.signature,
    researchEligible: Boolean(dataMeta.researchEligible),
    engineVersion: analysis.engineVersion,
    regime: analysis.regime,
    market: {
      price: analysis.p,
      fastMA: analysis.fast,
      slowMA: analysis.slow,
      rsi: analysis.rsi,
      atrPct: analysis.atr,
    },
    factors: { ...analysis.factors },
    scores: {
      rawAlphaScore: analysis.rawAlphaScore,
      decisionScore: analysis.decisionScore,
      confidenceScore: analysis.conf,
      timingScore: analysis.timing,
      riskScore: analysis.risk,
    },
    costs: {
      estimatedRoundTripCostBps,
    },
    rawAction: analysis.action,
    policyDecision: policyDecision({
      analysis,
      hasPosition: Boolean(aiPosition),
      positionSide: aiPosition?.side,
    }),
  };
}
