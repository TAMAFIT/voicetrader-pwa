import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const errors = [];
const need = (condition, code) => { if (!condition) errors.push(code); };

const required = [
  'src/short-horizon/human-canon-registry.js',
  'src/short-horizon/human-canon-engine.js',
  'src/short-horizon/signal-contract.js',
  'src/short-horizon/prospective-signal-ledger.js',
  'scripts/test-short-horizon-human-canon.mjs',
  'scripts/test-short-horizon-signal-contract.mjs',
  '.github/workflows/v042-short-horizon-human-canon-ci.yml',
];
for (const file of required) need(fs.existsSync(file), `missing:${file}`);

const registry = read('src/short-horizon/human-canon-registry.js');
for (const marker of [
  'textbookCanonicalBaseline: true',
  'profitabilityClaim: false',
  'calibratedProbability: false',
  'expectedReturnModel: false',
  'optimizedOnObservedShortHorizonData: false',
  'parameterSweep: false',
  'adaptiveWeights: false',
  'selfLearning: false',
  'automaticPromotion: false',
  'equalFamilyWeight: true',
]) need(registry.includes(marker), `registry-guardrail-missing:${marker}`);
need(registry.includes('rsiExtremeHigh:70'), 'canonical-rsi-70-missing');
need(registry.includes('rsiExtremeLow:30'), 'canonical-rsi-30-missing');
need(registry.includes('bollingerExtremeZ:1.5'), 'canonical-bollinger-threshold-missing');

const engine = read('src/short-horizon/human-canon-engine.js');
need(engine.includes("from '../knowledge/knowledge-indicators.js'"), 'timeframe-neutral-indicator-reuse-missing');
need(!engine.includes('human-knowledge-engine.js'), 'legacy-4h-engine-imported');
need(!engine.includes('playbook-registry.js'), 'legacy-4h-playbook-imported');
need(engine.includes("signal = 'WAIT'"), 'wait-default-missing');
need(engine.includes("executionAuthorized:false"), 'engine-execution-guardrail-open');
need(engine.includes("confidenceIsCalibratedProbability:false"), 'engine-probability-claim-open');
need(engine.includes("scoreIsExpectedReturn:false"), 'engine-return-claim-open');

const signal = read('src/short-horizon/signal-contract.js');
need(signal.includes("observationMode = 'historical-replay'"), 'historical-default-missing');
need(signal.includes("futureOutcomeUsed:false"), 'signal-future-safety-missing');
need(signal.includes("outcomeStoredSeparately:true"), 'signal-outcome-separation-missing');
need(signal.includes("executionAuthorized:false"), 'signal-execution-guardrail-open');
need(signal.includes("realMoneyRouting:false"), 'signal-real-money-guardrail-open');
need(signal.includes("orderSubmission:false"), 'signal-order-guardrail-open');

const ledger = read('src/short-horizon/prospective-signal-ledger.js');
need(ledger.includes('short-horizon-signal-immutability-conflict'), 'ledger-immutability-conflict-missing');
need(ledger.includes('short-horizon-ledger-rejects-nonprospective-record'), 'ledger-prospective-only-gate-missing');
need(ledger.includes('futureOutcomeStoredSeparately:true'), 'ledger-outcome-separation-missing');

if (errors.length) {
  console.error(`Short-Horizon Human Canon validation failed: ${errors.join(',')}`);
  process.exit(1);
}
console.log('Short-Horizon Human Canon validation passed.');
