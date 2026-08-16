import fs from 'node:fs';

const required = [
  'human-knowledge.css',
  'src/knowledge/knowledge-registry.js',
  'src/knowledge/knowledge-indicators.js',
  'src/knowledge/expert-library.js',
  'src/knowledge/human-knowledge-engine.js',
  'src/research/knowledge-shadow-runner.js',
  'src/research/knowledge-state.js',
  'src/research/knowledge-ui.js',
  'scripts/test-human-knowledge.mjs',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`missing Human Knowledge file: ${file}`);
}

const registry = fs.readFileSync('src/knowledge/knowledge-registry.js','utf8');
for (const marker of [
  'HUMAN_KNOWLEDGE_REGISTRY_VERSION','TREND_MACD_001','TREND_DMI_ADX_001','MOM_ROC_001','MR_BOLLINGER_Z_001','STRUCT_DONCHIAN_001','STRUCT_HHHL_001','VOL_OBV_CONFIRM_001','RISK_ATR_001','RISK_REALIZED_VOL_001','LIQ_VOLUME_PARTICIPATION_001','profitabilityClaim: false','activeInChampion: false','adaptiveWeights: false','automaticPromotion: false'
]) if (!registry.includes(marker)) throw new Error(`knowledge-registry missing marker: ${marker}`);

const indicators = fs.readFileSync('src/knowledge/knowledge-indicators.js','utf8');
for (const marker of ['ema(','macd(','bollinger(','stochastic(','donchian(','dmiAdx(','realizedVolPct(','obvSlopeNormalized(','volumeZScore(','marketStructure(','buildKnowledgeFeatures(']) {
  if (!indicators.includes(marker)) throw new Error(`knowledge-indicators missing marker: ${marker}`);
}

const experts = fs.readFileSync('src/knowledge/expert-library.js','utf8');
for (const marker of ['DIRECTIONAL_FAMILIES','runHumanAlphaExperts','aggregateFamilies','equalFamilyWeight: true','buildRegimeAndRiskContext','directionalVote: false']) {
  if (!experts.includes(marker)) throw new Error(`expert-library missing marker: ${marker}`);
}

const engine = fs.readFileSync('src/knowledge/human-knowledge-engine.js','utf8');
for (const marker of ['HumanKnowledgeEngine','human-knowledge-wave1-0.1','scoreIsExpectedReturn: false','confidenceIsCalibratedProbability: false','usedByLiveDecisionEngine: false','usedByForwardEvidence: false','championMutation: false']) {
  if (!engine.includes(marker)) throw new Error(`human-knowledge-engine missing marker: ${marker}`);
}

const runner = fs.readFileSync('src/research/knowledge-shadow-runner.js','utf8');
for (const marker of ['runKnowledgeShadow','fixedHorizonBars','nonOverlappingTrades: true','sameSeriesDiagnosticOnly: true','championMutation: false','usedByForwardEvidence: false']) {
  if (!runner.includes(marker)) throw new Error(`knowledge-shadow-runner missing marker: ${marker}`);
}

const ui = fs.readFileSync('src/research/knowledge-ui.js','utf8');
for (const marker of ['Human Trading Knowledge Engine','人類のトレード知識を、役割別Expertとしてコード化','RESEARCH ONLY','5 normalized','Champion','UNCHANGED','runKnowledgeShadow','setLatestKnowledgeEvaluation']) {
  if (!ui.includes(marker)) throw new Error(`knowledge-ui missing marker: ${marker}`);
}

const pwa = fs.readFileSync('src/pwa.js','utf8');
for (const marker of ['setupHumanKnowledgeUI','./research/knowledge-ui.js']) if (!pwa.includes(marker)) throw new Error(`pwa bootstrap missing marker: ${marker}`);
const sw = fs.readFileSync('sw.js','utf8');
for (const marker of ['human-knowledge.css','src/knowledge/knowledge-registry.js','src/knowledge/knowledge-indicators.js','src/knowledge/expert-library.js','src/knowledge/human-knowledge-engine.js','src/research/knowledge-shadow-runner.js','src/research/knowledge-state.js','src/research/knowledge-ui.js','v0.11-human-knowledge']) {
  if (!sw.includes(marker)) throw new Error(`service worker missing Human Knowledge marker: ${marker}`);
}

const champion = fs.readFileSync('src/engine/shadow-engine.js','utf8');
const live = fs.readFileSync('src/live/live-forward-paper.js','utf8');
const forward = fs.readFileSync('src/research/forward-demo-runner.js','utf8');
for (const [name, source] of [['champion',champion],['live-forward',live],['forward-evidence',forward]]) {
  if (source.includes('HumanKnowledgeEngine') || source.includes('/knowledge/')) throw new Error(`${name} is coupled to Human Knowledge research code`);
}

console.log('Human Trading Knowledge Engine v0.11 integrity validation passed.');
