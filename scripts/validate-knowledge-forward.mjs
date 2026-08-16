import fs from 'node:fs';

const required = [
  'knowledge-forward.css',
  'src/research/research-cost-model.js',
  'src/research/knowledge-forward-epoch.js',
  'src/research/knowledge-forward-runner.js',
  'src/research/knowledge-forward-store.js',
  'src/research/knowledge-forward-state.js',
  'src/research/knowledge-forward-ui.js',
  'scripts/test-knowledge-forward.mjs',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`missing Knowledge Forward file: ${file}`);

const cost = fs.readFileSync('src/research/research-cost-model.js','utf8');
for (const marker of ['research-cost-v0.1','estimateResearchRoundTripCostBps','atrPct','expectedRandomCoefficient','entryBarInformationOnly:true','includesExpectedSlippage:true']) if (!cost.includes(marker)) throw new Error(`research cost model missing marker: ${marker}`);

const epoch = fs.readFileSync('src/research/knowledge-forward-epoch.js','utf8');
for (const marker of ['knowledge-forward-epoch-0.1','knowledge-forward-001','2026-08-16T22:58:14Z','1786921094','828a0ccadded2c19fd1bde634dfdd77f348fa8d8','candidate-wave1-reference','candidate-playbook-reference','candidate-consensus','candidate-playbook-wave1-veto','champion-001','research-cost-v0.1','candleOpenTimestampStrictlyAfterFreeze:true','preFreezePnlForbidden:true','automaticPromotion:false','assertKnowledgeForwardEpochRuntime','knowledge-forward-runtime-version-mismatch']) if (!epoch.includes(marker)) throw new Error(`knowledge-forward epoch missing marker: ${marker}`);

const runner = fs.readFileSync('src/research/knowledge-forward-runner.js','utf8');
for (const marker of ['knowledge-forward-runner-0.1','runKnowledgeForwardSnapshot','isKnowledgeForwardEligibleBar','entryTime > KNOWLEDGE_FORWARD_FREEZE_UNIX','exitTime > KNOWLEDGE_FORWARD_FREEZE_UNIX','estimateResearchRoundTripCostBps','costUsesEntryBarInformationOnly:true','independentNonOverlappingPathPerSource:true','matchedChampionBenchmark:true','preFreezePnlForbidden:true','automaticSelection:false','existingForward001Unchanged:true']) if (!runner.includes(marker)) throw new Error(`knowledge-forward runner missing marker: ${marker}`);

const store = fs.readFileSync('src/research/knowledge-forward-store.js','utf8');
for (const marker of ['knowledge-forward-store-0.1','voicetrader-knowledge-forward-evidence-v1','mergeKnowledgeForwardArchive','decisionKey','evidenceKey','summarizeKnowledgeForwardArchive','serverDurable:false']) if (!store.includes(marker)) throw new Error(`knowledge-forward store missing marker: ${marker}`);

const ui = fs.readFileSync('src/research/knowledge-forward-ui.js','utf8');
for (const marker of ['Prospective Knowledge Candidate Epoch','過去を見た評価から切り離し、これから来る4H足だけを証拠化','knowledge-forward-001','4+benchmark','Browser local','runKnowledgeForwardSnapshot','mergeKnowledgeForwardArchive','setLatestKnowledgeForwardEvaluation','既存 forward-001']) if (!ui.includes(marker)) throw new Error(`knowledge-forward UI missing marker: ${marker}`);

const pwa = fs.readFileSync('src/pwa.js','utf8');
for (const marker of ['setupKnowledgeForwardUI','./research/knowledge-forward-ui.js']) if (!pwa.includes(marker)) throw new Error(`PWA bootstrap missing Knowledge Forward marker: ${marker}`);

const sw = fs.readFileSync('sw.js','utf8');
for (const marker of ['v0.15-knowledge-forward','knowledge-forward.css','src/research/research-cost-model.js','src/research/knowledge-forward-epoch.js','src/research/knowledge-forward-runner.js','src/research/knowledge-forward-store.js','src/research/knowledge-forward-state.js','src/research/knowledge-forward-ui.js']) if (!sw.includes(marker)) throw new Error(`service worker missing Knowledge Forward marker: ${marker}`);

const exportSource = fs.readFileSync('src/research/research-export.js','utf8');
for (const marker of ['research-export-0.10','getLatestKnowledgeForwardEvaluation','knowledgeForwardEvaluation','knowledge-forward-001','research-cost-v0.1']) if (!exportSource.includes(marker)) throw new Error(`research export missing Knowledge Forward marker: ${marker}`);

for (const [name,path] of [['champion','src/engine/shadow-engine.js'],['live-forward','src/live/live-forward-paper.js'],['existing-forward','src/research/forward-demo-runner.js']]) {
  const source = fs.readFileSync(path,'utf8');
  if (source.includes('knowledge-forward') || source.includes('KnowledgeForward')) throw new Error(`${name} is coupled to new Knowledge Forward epoch`);
}

for (const [name,path] of [['knowledge-ui','src/research/knowledge-ui.js'],['knowledge-attribution-ui','src/research/knowledge-attribution-ui.js'],['playbook-ui','src/research/playbook-ui.js'],['candidate-ui','src/research/knowledge-candidate-ui.js']]) {
  const source = fs.readFileSync(path,'utf8');
  if (source.includes("new ExecutionEngine({ random:() => .5, analyze:() => ({}) })")) throw new Error(`${name} still uses invalid dummy research cost wiring`);
  if (!source.includes('estimateResearchRoundTripCostBps')) throw new Error(`${name} does not use deterministic research cost model`);
}

const pkg = JSON.parse(fs.readFileSync('package.json','utf8'));
const [major,minor] = String(pkg.version || '').split('.').map(Number);
if (major !== 0 || minor < 15) throw new Error(`package version expected >=0.15.x, got ${pkg.version}`);
if (!pkg.scripts?.test?.includes('validate-knowledge-forward.mjs') || !pkg.scripts?.test?.includes('test-knowledge-forward.mjs')) throw new Error('npm test does not run Knowledge Forward validation/tests');

console.log('Prospective Knowledge Candidate Epoch v0.15 integrity validation passed.');
