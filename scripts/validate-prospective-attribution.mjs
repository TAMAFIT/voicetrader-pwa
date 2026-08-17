import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const ledger=read('src/research/prospective-attribution-ledger.js');const knowledge=read('src/research/autonomous-knowledge-forward-collector.js');const htf=read('src/research/autonomous-higher-timeframe-forward-collector.js');const pkg=JSON.parse(read('package.json'));
assert.equal(pkg.version,'0.22.0');
for(const marker of ['prospective-attribution-ledger-0.1','descriptiveProvenanceOnly:true','causalAttribution:false','futureOutcomeUsed:false','automaticPruning:false','automaticPromotion:false','usedByLiveDecisionEngine:false','buildKnowledgeProspectiveAttributionSnapshot','buildHigherTimeframeProspectiveAttributionSnapshot','auditProspectiveAttributionLedger'])assert.ok(ledger.includes(marker),`missing ledger marker ${marker}`);
for(const [name,text] of [['knowledge',knowledge],['htf',htf]]){assert.ok(text.includes("from './prospective-attribution-ledger.js'"),`${name} collector missing attribution import`);assert.ok(text.includes('attributionLedgerRequired:true'),`${name} collector missing attribution guardrail`);assert.ok(text.includes('attributionAudit'),`${name} collector missing attribution audit`);}
assert.ok(pkg.scripts.test.includes('validate-prospective-attribution.mjs'));assert.ok(pkg.scripts.test.includes('test-prospective-attribution-ledger.mjs'));assert.ok(pkg.scripts.test.includes('node --check src/research/prospective-attribution-ledger.js'));
for(const forbidden of ['src/live/live-forward-paper.js','src/engine/shadow-engine.js']){const text=read(forbidden);assert.ok(!text.includes('prospective-attribution-ledger'),`${forbidden} must not depend on attribution ledger`);}
console.log('Prospective Attribution Ledger v0.22 integrity validation passed.');
