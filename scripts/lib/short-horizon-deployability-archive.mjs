import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateShortHorizonReferenceCostAssessment } from '../../src/short-horizon/reference-cost-binding.js';
import { validateShortHorizonDeployabilityProvider } from '../../src/short-horizon/deployability-registry.js';

export const SHORT_HORIZON_DEPLOYABILITY_ARCHIVE_VERSION = 'short-horizon-deployability-archive-v1';

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive:true });
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
const canonical = (value) => JSON.stringify(stable(value));

function immutableAssessmentView(record) {
  const value = clone(record);
  delete value.assessedAtMs;
  return value;
}

function utcDay(timestampMs) {
  const date = new Date(Number(timestampMs));
  if (!Number.isFinite(date.getTime())) throw new Error('deployability-archive-invalid-timestamp');
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return { year, month, isoDay:`${year}-${month}-${day}` };
}

function safeSegment(value, name) {
  const text = String(value || '').trim();
  if (!text || !/^[A-Za-z0-9._-]+$/.test(text)) throw new Error(`deployability-archive-invalid-${name}`);
  return text;
}

export function deployabilityRelativePath(record) {
  validateShortHorizonReferenceCostAssessment(record);
  const { year, month, isoDay } = utcDay(record.horizon.targetCloseTimestampMs);
  return path.posix.join(
    'data', 'short-horizon-deployability',
    safeSegment(record.market.assetClass, 'asset-class').toLowerCase(),
    safeSegment(record.market.researchInstrument, 'instrument'),
    `${Number(record.market.timeframeMinutes)}m`,
    year, month, `${isoDay}.ndjson`,
  );
}

function readNdjson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  return text.split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      const record = JSON.parse(line);
      validateShortHorizonReferenceCostAssessment(record);
      return record;
    } catch (error) {
      throw new Error(`deployability-archive-invalid-line:${filePath}:${index + 1}:${error?.message || error}`);
    }
  });
}

function writeNdjsonAtomic(filePath, records) {
  ensureDir(path.dirname(filePath));
  const sorted = [...records].sort((a, b) =>
    Number(a.horizon?.targetCloseTimestampMs || 0) - Number(b.horizon?.targetCloseTimestampMs || 0) ||
    String(a.assessmentId).localeCompare(String(b.assessmentId)),
  );
  const body = `${sorted.map((record) => JSON.stringify(record)).join('\n')}\n`;
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, body, 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function mergeDeployabilityAssessmentsIntoArchive({ rootDir, records } = {}) {
  if (!rootDir) throw new Error('deployability-archive-root-required');
  if (!Array.isArray(records)) throw new Error('deployability-archive-records-required');
  const grouped = new Map();
  for (const record of records) {
    validateShortHorizonReferenceCostAssessment(record);
    const relativePath = deployabilityRelativePath(record);
    if (!grouped.has(relativePath)) grouped.set(relativePath, []);
    grouped.get(relativePath).push(record);
  }

  const summary = { fetched:records.length, added:0, duplicates:0, filesTouched:0 };
  for (const [relativePath, incoming] of grouped.entries()) {
    const filePath = path.join(rootDir, ...relativePath.split('/'));
    const existing = readNdjson(filePath);
    const map = new Map();
    for (const record of existing) {
      if (map.has(record.assessmentId)) throw new Error(`deployability-archive-duplicate-existing:${record.assessmentId}`);
      map.set(record.assessmentId, record);
    }
    let changed = false;
    for (const record of incoming) {
      const prior = map.get(record.assessmentId);
      if (!prior) {
        map.set(record.assessmentId, record);
        summary.added += 1;
        changed = true;
        continue;
      }
      if (canonical(immutableAssessmentView(prior)) !== canonical(immutableAssessmentView(record))) {
        throw new Error(`short-horizon-deployability-immutability-conflict:${record.assessmentId}`);
      }
      summary.duplicates += 1;
    }
    if (changed) {
      writeNdjsonAtomic(filePath, [...map.values()]);
      summary.filesTouched += 1;
    }
  }
  return summary;
}

function walkFiles(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, output);
    else if (entry.isFile() && entry.name.endsWith('.ndjson')) output.push(full);
  }
  return output;
}

export function readDeployabilityAssessments(rootDir) {
  const base = path.join(rootDir, 'data', 'short-horizon-deployability');
  const files = walkFiles(base).sort();
  const records = files.flatMap(readNdjson).sort((a, b) =>
    Number(a.horizon?.targetCloseTimestampMs || 0) - Number(b.horizon?.targetCloseTimestampMs || 0) ||
    String(a.assessmentId).localeCompare(String(b.assessmentId)),
  );
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.assessmentId)) throw new Error(`deployability-archive-duplicate-id:${record.assessmentId}`);
    ids.add(record.assessmentId);
  }
  return { files, records };
}

function finite(values) {
  return values
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite);
}

function mean(values) {
  const list = finite(values);
  return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
}

function round(value, digits = 6) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const scale = 10 ** digits;
  return Math.round(number * scale) / scale;
}

function groupId(record) {
  const session = record.context.primarySession || 'UNKNOWN';
  const regime = record.context.regime || 'UNKNOWN';
  return `${record.market.researchInstrument}-${record.market.timeframeMinutes}m-${record.horizon.kind}-${record.horizon.minutes}m-${session}-${regime}`;
}

function summarizeGroup(id, items) {
  const directional = items.filter((item) => item.breakEvenComparison.directionalTrade === true);
  const within = directional.filter((item) => item.breakEvenComparison.publishedSpreadOnlyWithinBreakEven === true);
  const referenceSpreads = items.map((item) => item.publishedReferenceCost.publishedReferenceSpreadCostBps);
  const margins = directional.map((item) => item.breakEvenComparison.marginToBreakEvenAfterPublishedSpreadBps);
  return {
    id,
    providerId:items[0].provider.providerId,
    assetClass:items[0].market.assetClass,
    researchInstrument:items[0].market.researchInstrument,
    researchVenue:items[0].market.researchVenue,
    timeframeMinutes:Number(items[0].market.timeframeMinutes),
    horizonKind:items[0].horizon.kind,
    horizonMinutes:Number(items[0].horizon.minutes),
    primarySession:items[0].context.primarySession || null,
    regime:items[0].context.regime || null,
    recordCount:items.length,
    directionalCount:directional.length,
    waitCount:items.filter((item) => item.context.signal === 'WAIT').length,
    publishedReferenceEvidence:{
      meanPublishedReferenceSpreadCostBps:round(mean(referenceSpreads)),
      directionalPublishedSpreadWithinBreakEvenCount:within.length,
      directionalPublishedSpreadWithinBreakEvenRate:directional.length ? round(within.length / directional.length) : null,
      meanDirectionalMarginToBreakEvenAfterPublishedSpreadBps:round(mean(margins)),
      actualProviderCostBinding:false,
      actualNetEvAvailable:false,
    },
    deployability:{
      providerReferenceReady:true,
      operatorAccountEligibility:'UNVERIFIED',
      executableQuoteObserved:false,
      readinessStatus:'REFERENCE_READY_OPERATOR_ELIGIBILITY_UNVERIFIED',
    },
    firstTargetCloseTimestampMs:Math.min(...items.map((item) => Number(item.horizon.targetCloseTimestampMs))),
    lastTargetCloseTimestampMs:Math.max(...items.map((item) => Number(item.horizon.targetCloseTimestampMs))),
    contentSha256:sha256(items.map((item) => JSON.stringify(item)).join('\n')),
  };
}

export function inspectDeployabilityArchive(rootDir) {
  const { files, records } = readDeployabilityAssessments(rootDir);
  const groups = new Map();
  for (const record of records) {
    const id = groupId(record);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(record);
  }
  return {
    recordCount:records.length,
    fileCount:files.length,
    duplicateAssessmentIdCount:0,
    contentSha256:sha256(records.map((record) => JSON.stringify(record)).join('\n')),
    groups:[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, items]) => summarizeGroup(id, items)),
  };
}

export function writeDeployabilityManifest({ rootDir, lastRun, providerProfile } = {}) {
  if (!rootDir) throw new Error('deployability-archive-root-required');
  validateShortHorizonDeployabilityProvider(providerProfile);
  const inspected = inspectDeployabilityArchive(rootDir);
  const manifest = {
    schemaVersion:'short-horizon-deployability-manifest-v1',
    archiveVersion:SHORT_HORIZON_DEPLOYABILITY_ARCHIVE_VERSION,
    updatedAtMs:Date.now(),
    storage:{
      kind:'github-generated-data-branch',
      branch:'short-horizon-deployability-data',
      sourceCostAnalysisBranch:'short-horizon-cost-analysis-data',
      sourceOutcomesBranch:'short-horizon-outcome-data',
      format:'ndjson-daily-utc',
    },
    scope:{
      assetClass:'fx',
      instrument:'USDJPY',
      providerId:providerProfile.providerId,
      cryptoProvidersEvaluated:false,
    },
    providerReference:{
      providerId:providerProfile.providerId,
      legalName:providerProfile.provider.legalName,
      registrationStatus:providerProfile.provider.registration.status,
      registrationNumber:providerProfile.provider.registration.registrationNumber,
      providerInstrument:providerProfile.product.providerInstrument,
      publishedSpreadSen:providerProfile.product.publishedSpread.valueSen,
      publishedSpreadPriceUnits:providerProfile.product.publishedSpread.priceUnits,
      pricingStreamSupported:providerProfile.api.pricingStreamSupported,
      pricingStreamMaximumPricesPerSecondPerInstrumentReference:providerProfile.api.pricingStreamMaximumPricesPerSecondPerInstrumentReference,
      providerOrderSubmissionSupported:providerProfile.api.providerOrderSubmissionSupported,
      eligibilityStatus:providerProfile.eligibility.operatorEligibilityStatus,
      requiredNyServerBalanceJpy:providerProfile.eligibility.requiredNyServerBalanceJpy,
      requiredMembershipStatus:providerProfile.eligibility.requiredMembershipStatus,
      requiredCourse:providerProfile.eligibility.requiredCourse,
      evidenceVerifiedAt:providerProfile.evidence.verifiedAt,
      evidenceReferences:[...providerProfile.evidence.references],
    },
    methodology:{
      officialPublicReferenceOnly:true,
      publishedSpreadIsNotObservedExecutionCost:true,
      crossVenueQuoteMismatchAcknowledged:true,
      providerConnectionAttempted:false,
      operatorEligibilityVerified:false,
      actualProviderCostBinding:false,
      netReturnAvailable:false,
      optimizer:false,
      changesHumanCanonThresholds:false,
      profitabilityClaim:false,
    },
    archive:inspected,
    lastRun,
    guardrails:{
      credentialsPresent:false,
      secretRequiredForThisStage:false,
      usedByDecisionEngine:false,
      automaticPromotion:false,
      executionAuthorized:false,
      realMoneyRouting:false,
      orderSubmission:false,
      generatedDataOnly:true,
    },
  };
  const base = path.join(rootDir, 'data', 'short-horizon-deployability');
  ensureDir(base);
  fs.writeFileSync(path.join(base, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
