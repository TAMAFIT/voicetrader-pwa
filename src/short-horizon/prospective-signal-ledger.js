import { validateShortHorizonSignalRecord } from './signal-contract.js';

export const SHORT_HORIZON_SIGNAL_LEDGER_VERSION = 'short-horizon-signal-ledger-v1';

const clone = (value) => JSON.parse(JSON.stringify(value));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
};
const canonical = (value) => JSON.stringify(stable(value));

export function emptyShortHorizonSignalLedger() {
  return {
    schemaVersion:SHORT_HORIZON_SIGNAL_LEDGER_VERSION,
    records:[],
    updatedAtMs:null,
    methodology:{
      prospectiveOnly:true,
      immutableDecisionRecords:true,
      futureOutcomeStoredSeparately:true,
      futureOutcomeUsed:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
    },
  };
}

export function mergeProspectiveShortHorizonSignals(existing, incoming, { updatedAtMs = Date.now() } = {}) {
  const ledger = existing ? clone(existing) : emptyShortHorizonSignalLedger();
  if (ledger.schemaVersion !== SHORT_HORIZON_SIGNAL_LEDGER_VERSION) throw new Error('short-horizon-ledger-version-invalid');
  if (!Array.isArray(incoming)) throw new Error('short-horizon-ledger-incoming-invalid');

  const map = new Map();
  for (const record of ledger.records || []) {
    validateShortHorizonSignalRecord(record);
    if (record.observationMode !== 'prospective' || record.observedProspectively !== true) throw new Error('short-horizon-ledger-nonprospective-existing-record');
    if (map.has(record.signalId)) throw new Error(`short-horizon-ledger-duplicate-existing:${record.signalId}`);
    map.set(record.signalId, clone(record));
  }

  let added = 0;
  let duplicates = 0;
  for (const record of incoming) {
    validateShortHorizonSignalRecord(record);
    if (record.observationMode !== 'prospective' || record.observedProspectively !== true) {
      throw new Error('short-horizon-ledger-rejects-nonprospective-record');
    }
    const prior = map.get(record.signalId);
    if (!prior) {
      map.set(record.signalId, clone(record));
      added += 1;
      continue;
    }
    if (canonical(prior) !== canonical(record)) throw new Error(`short-horizon-signal-immutability-conflict:${record.signalId}`);
    duplicates += 1;
  }

  const records = [...map.values()].sort((a, b) =>
    Number(a.market?.sourceTimestampMs || 0) - Number(b.market?.sourceTimestampMs || 0) ||
    String(a.signalId).localeCompare(String(b.signalId)),
  );

  return {
    ledger:{
      ...ledger,
      records,
      updatedAtMs:Number(updatedAtMs),
    },
    summary:{ added, duplicates, total:records.length },
  };
}

export function auditShortHorizonSignalLedger(ledger) {
  const errors = [];
  if (ledger?.schemaVersion !== SHORT_HORIZON_SIGNAL_LEDGER_VERSION) errors.push('version-invalid');
  const records = Array.isArray(ledger?.records) ? ledger.records : [];
  const ids = records.map((record) => record?.signalId);
  if (new Set(ids).size !== ids.length) errors.push('duplicate-signal-id');
  for (const record of records) {
    try {
      validateShortHorizonSignalRecord(record);
    } catch (error) {
      errors.push(`record-invalid:${error?.message || error}`);
      continue;
    }
    if (record.observationMode !== 'prospective' || record.observedProspectively !== true) errors.push('nonprospective-record');
    if (record.futureOutcomeUsed !== false) errors.push('future-outcome-used');
  }
  if (ledger?.methodology?.executionAuthorized !== false || ledger?.methodology?.realMoneyRouting !== false || ledger?.methodology?.orderSubmission !== false) {
    errors.push('execution-guardrail-open');
  }
  return {
    schemaVersion:'short-horizon-signal-ledger-audit-v1',
    pass:errors.length === 0,
    status:errors.length ? 'fail' : 'pass',
    errorCount:errors.length,
    errorCodes:[...new Set(errors)],
    recordCount:records.length,
  };
}
