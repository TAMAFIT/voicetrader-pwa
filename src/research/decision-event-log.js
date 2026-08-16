import { resolvePositionDecision } from '../engine/decision-policy.js';
import { getLoadedBTCUSD4H } from '../data/market-data-provider.js';
import { buildFixedHorizonCounterfactual } from './counterfactual-shadow.js';

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

function counterfactualFor(payload) {
  if (!payload.researchEligible || payload.instrument !== 'BTCUSD' || payload.timeframeHours !== 4) return null;
  const snapshot = getLoadedBTCUSD4H();
  if (!snapshot?.series || snapshot.meta?.signature !== payload.dataSignature) {
    return {
      version: 'cf-fixed-horizons-0.1',
      clusterId: payload.eventId,
      independentSamples: false,
      usedByDecisionEngine: false,
      status: 'unavailable',
      reason: 'matching-research-series-not-loaded',
      outcomes: [],
    };
  }
  return {
    clusterId: payload.eventId,
    ...buildFixedHorizonCounterfactual({
      series: snapshot.series,
      entryIndex: payload.barIndex,
      estimatedRoundTripCostBps: payload.costs?.estimatedRoundTripCostBps || 0,
    }),
  };
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
      schemaVersion: 3,
      strategyVersion: this.strategyVersion,
      recordedAt: Date.now(),
      ...event,
    };
    payload.counterfactual = counterfactualFor(payload);
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

  async listAll() {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => {
        const events = Array.isArray(req.result) ? req.result : [];
        events.sort((a, b) => Number(a.candleTime || 0) - Number(b.candleTime || 0) || Number(a.recordedAt || 0) - Number(b.recordedAt || 0));
        resolve(events);
      };
      req.onerror = () => reject(req.error || new Error('DecisionEvent read failed'));
    });
  }
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
  const experts = analysis.experts?.results || [];
  const policyDecision = resolvePositionDecision({
    entryDecision: analysis.entryDecision,
    positionSide: aiPosition?.side,
  });
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
    expertSetVersion: analysis.experts?.version || null,
    expertWeights: analysis.experts?.weights ? { ...analysis.experts.weights } : {},
    experts: experts.map(expert => ({
      id: expert.id,
      version: expert.version,
      score: expert.score,
      weight: expert.weight,
      contribution: expert.contribution,
      inputs: { ...expert.inputs },
    })),
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
    entryDecision: analysis.entryDecision,
    legacyAction: analysis.action,
    policyDecision,
  };
}
