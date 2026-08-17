import fs from 'node:fs';

const required=[
  'knowledge-forward-audit.css',
  'src/research/knowledge-forward-replay-audit.js',
  'src/research/knowledge-forward-replay-audit-state.js',
  'src/research/knowledge-forward-replay-audit-ui.js',
  'src/research/champion-promotion-replay-gate.js',
  'scripts/test-knowledge-forward-replay-audit.mjs',
];
for(const file of required)if(!fs.existsSync(file))throw new Error(`missing Evidence Replay Audit file: ${file}`);

const audit=fs.readFileSync('src/research/knowledge-forward-replay-audit.js','utf8');
for(const marker of ['knowledge-forward-replay-audit-0.1','auditKnowledgeForwardRemoteDocument','market-4h-gap','market-ohlc-inconsistent','decision-key-mismatch','decision-coverage-missing','decision-future-flag-invalid','evidence-key-mismatch','evidence-originating-decision-missing','evidence-horizon-mismatch','evidence-cost-mismatch','evidence-entry-price-mismatch','evidence-exit-price-mismatch','evidence-gross-bps-mismatch','evidence-net-bps-mismatch','evidence-source-overlap','evidence-expected-record-missing','evidence-unexpected-record','fullMarketReplay:true','evidenceCompletenessReplay:true','changesFrozenDecisionEngine:false','usedByLiveDecisionEngine:false'])if(!audit.includes(marker))throw new Error(`replay audit missing marker: ${marker}`);

const collector=fs.readFileSync('src/research/autonomous-knowledge-forward-collector.js','utf8');
for(const marker of ['autonomous-knowledge-forward-collector-0.2-replay-audit','PREVIOUS_AUTONOMOUS_KNOWLEDGE_FORWARD_COLLECTOR_VERSION','auditKnowledgeForwardRemoteDocument','knowledge-forward-replay-audit:','replayAuditRequiredOnceProspectiveBarsExist:true','no-post-freeze-closed-bar-yet','document.audit'])if(!collector.includes(marker))throw new Error(`collector replay gate missing marker: ${marker}`);

const promotionGate=fs.readFileSync('src/research/champion-promotion-replay-gate.js','utf8');
for(const marker of ['champion-promotion-replay-gate-0.1','evaluateAuditedChampionPromotionQualification','auditKnowledgeForwardRemoteDocument','evidence-replay-audit-not-pass','readyCandidateIds:[]','promotionEligible:false','automaticPromotion:false','freshReplayAuditRequired:true'])if(!promotionGate.includes(marker))throw new Error(`promotion replay gate missing marker: ${marker}`);
const promotionUI=fs.readFileSync('src/research/champion-promotion-ui.js','utf8');
for(const marker of ['evaluateAuditedChampionPromotionQualification','Fresh Replay','REPLAY PASS','fresh-replay-audit-not-pass'])if(!promotionUI.includes(marker))throw new Error(`promotion UI missing fresh replay gate: ${marker}`);

const auditUI=fs.readFileSync('src/research/knowledge-forward-replay-audit-ui.js','utf8');
for(const marker of ['Evidence Replay Audit — Market Archiveから証拠を全件再計算','setupKnowledgeForwardReplayAuditUI','Fresh Replay','PASS','WAITING','FAIL'])if(!auditUI.includes(marker))throw new Error(`audit UI missing marker: ${marker}`);
const pwa=fs.readFileSync('src/pwa.js','utf8');
for(const marker of ['setupKnowledgeForwardReplayAuditUI','./research/knowledge-forward-replay-audit-ui.js'])if(!pwa.includes(marker))throw new Error(`PWA missing replay audit bootstrap: ${marker}`);

const sw=fs.readFileSync('sw.js','utf8');
for(const marker of ['v0.18-evidence-replay-audit','knowledge-forward-audit.css','src/research/knowledge-forward-replay-audit.js','src/research/knowledge-forward-replay-audit-state.js','src/research/knowledge-forward-replay-audit-ui.js','src/research/champion-promotion-replay-gate.js'])if(!sw.includes(marker))throw new Error(`service worker missing replay audit marker: ${marker}`);
const exportSource=fs.readFileSync('src/research/research-export.js','utf8');
for(const marker of ['research-export-0.12','getLatestKnowledgeForwardReplayAudit','knowledgeForwardReplayAudit','full evidence replay','Fresh Replay Audit'])if(!exportSource.includes(marker))throw new Error(`research export missing replay audit marker: ${marker}`);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));const [major,minor]=String(pkg.version||'').split('.').map(Number);if(major!==0||minor<18)throw new Error(`package version expected >=0.18.x, got ${pkg.version}`);for(const marker of ['validate-knowledge-forward-replay-audit.mjs','test-knowledge-forward-replay-audit.mjs','knowledge-forward-replay-audit.js','knowledge-forward-replay-audit-state.js','knowledge-forward-replay-audit-ui.js','champion-promotion-replay-gate.js'])if(!pkg.scripts?.test?.includes(marker))throw new Error(`npm test missing replay audit marker: ${marker}`);

for(const [name,path] of [['champion','src/engine/shadow-engine.js'],['live-forward','src/live/live-forward-paper.js'],['knowledge-forward','src/research/knowledge-forward-runner.js'],['forward-001','src/research/forward-demo-runner.js']]){const source=fs.readFileSync(path,'utf8');if(source.includes('knowledge-forward-replay-audit')||source.includes('champion-promotion-replay-gate'))throw new Error(`${name} coupled to replay audit output`);}

console.log('Knowledge Forward Evidence Replay Audit v0.18 integrity validation passed.');
