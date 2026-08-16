import fs from 'node:fs';

const required = [
  'src/research/knowledge-attribution-runner.js',
  'src/research/knowledge-attribution-ui.js',
  'scripts/test-knowledge-attribution.mjs',
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`missing Knowledge Attribution file: ${file}`);
}

const runner = fs.readFileSync('src/research/knowledge-attribution-runner.js','utf8');
for (const marker of [
  'KNOWLEDGE_ATTRIBUTION_VERSION',
  'FAMILY_NEGATIVE_CONTROL_LAGS',
  'disabledExpertId',
  'disabledFamily',
  'lagFamily',
  'leaveOneExpertOut:true',
  'leaveOneFamilyOut:true',
  'causalAttribution:false',
  'familyNullUsesPastSignalsOnly:true',
  'familyNullPreservesMarketSeries:true',
  'formalPValue:false',
  'automaticPruning:false',
  'championMutation:false',
  'usedByLiveDecisionEngine:false',
  'usedByForwardEvidence:false',
]) if (!runner.includes(marker)) throw new Error(`knowledge-attribution-runner missing marker: ${marker}`);

const ui = fs.readFileSync('src/research/knowledge-attribution-ui.js','utf8');
for (const marker of [
  'Knowledge Attribution / Ablation',
  'どのExpert・Familyが実際に寄与している？',
  'runKnowledgeAttribution',
  'Null95',
  '自動削除',
  'setLatestKnowledgeEvaluation',
]) if (!ui.includes(marker)) throw new Error(`knowledge-attribution-ui missing marker: ${marker}`);

const pwa = fs.readFileSync('src/pwa.js','utf8');
for (const marker of ['setupKnowledgeAttributionUI','./research/knowledge-attribution-ui.js']) {
  if (!pwa.includes(marker)) throw new Error(`pwa bootstrap missing Knowledge Attribution marker: ${marker}`);
}

const css = fs.readFileSync('human-knowledge.css','utf8');
for (const marker of ['.knowledge-attribution-section','.knowledge-attribution-row','.knowledge-attribution-status.ready']) {
  if (!css.includes(marker)) throw new Error(`human-knowledge.css missing attribution marker: ${marker}`);
}

const sw = fs.readFileSync('sw.js','utf8');
for (const marker of ['v0.12-knowledge-attribution','src/research/knowledge-attribution-runner.js','src/research/knowledge-attribution-ui.js']) {
  if (!sw.includes(marker)) throw new Error(`service worker missing Knowledge Attribution marker: ${marker}`);
}

const researchExport = fs.readFileSync('src/research/research-export.js','utf8');
for (const marker of ['research-export-0.7','Knowledge Attribution','leave-one-Expert-out','not causal attribution']) {
  if (!researchExport.includes(marker)) throw new Error(`research export missing Knowledge Attribution marker: ${marker}`);
}

const champion = fs.readFileSync('src/engine/shadow-engine.js','utf8');
const live = fs.readFileSync('src/live/live-forward-paper.js','utf8');
const forward = fs.readFileSync('src/research/forward-demo-runner.js','utf8');
for (const [name, source] of [['champion',champion],['live-forward',live],['forward-evidence',forward]]) {
  if (source.includes('knowledge-attribution') || source.includes('runKnowledgeAttribution')) {
    throw new Error(`${name} is coupled to Knowledge Attribution research code`);
  }
}

const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const [major, minor] = String(pkg.version || '').split('.').map(Number);
if (major !== 0 || minor < 12) throw new Error(`package version expected >=0.12.x, got ${pkg.version}`);
if (!pkg.scripts?.test?.includes('test-knowledge-attribution.mjs')) throw new Error('npm test does not run Knowledge Attribution regression tests');

console.log('Knowledge Attribution / Ablation v0.12 integrity validation passed.');
