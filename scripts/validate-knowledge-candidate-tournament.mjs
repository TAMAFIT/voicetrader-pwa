import fs from 'node:fs';
const required=['candidate-tournament.css','src/research/knowledge-candidate-registry.js','src/research/knowledge-candidate-tournament.js','src/research/knowledge-candidate-state.js','src/research/knowledge-candidate-ui.js','scripts/test-knowledge-candidate-tournament.mjs'];
for(const file of required)if(!fs.existsSync(file))throw new Error(`missing Candidate Tournament file: ${file}`);
const registry=fs.readFileSync('src/research/knowledge-candidate-registry.js','utf8');
for(const marker of ['knowledge-candidate-registry-0.1','candidate-wave1-reference','candidate-playbook-reference','candidate-consensus','candidate-playbook-wave1-veto','fixedCandidateCount:4','generatedCombinations:false','rawScoreMinusCost:false','prospectiveEvidenceRequired:true','automaticPromotion:false'])if(!registry.includes(marker))throw new Error(`candidate registry missing: ${marker}`);
const runner=fs.readFileSync('src/research/knowledge-candidate-tournament.js','utf8');
for(const marker of ['knowledge-candidate-tournament-0.1','runKnowledgeCandidateTournament','buildCandidateDecision','candidate-decision-past-signal-lag','chronologicalFolds:KNOWLEDGE_CANDIDATE_FOLDS','noFittingPerformed:true','pristineUntouchedOOS:false','costAppliedToRealizedTradeReturnsOnly:true','automaticSelection:false','championMutation:false','usedByLiveDecisionEngine:false','usedByForwardEvidence:false'])if(!runner.includes(marker))throw new Error(`candidate tournament missing: ${marker}`);
const ui=fs.readFileSync('src/research/knowledge-candidate-ui.js','utf8');
for(const marker of ['Knowledge Candidate Tournament — Wave 1 × Wave 2','次世代Shadow候補を「固定4候補」だけで比較','Promotion Readiness Protocol','runKnowledgeCandidateTournament','champion-001 frozen','Prospective Epoch','setLatestKnowledgeCandidateTournament'])if(!ui.includes(marker))throw new Error(`candidate UI missing: ${marker}`);
const pwa=fs.readFileSync('src/pwa.js','utf8');
for(const marker of ['setupKnowledgeCandidateTournamentUI','./research/knowledge-candidate-ui.js'])if(!pwa.includes(marker))throw new Error(`pwa missing tournament bootstrap: ${marker}`);
const sw=fs.readFileSync('sw.js','utf8');
for(const marker of ['v0.14-candidate-tournament','candidate-tournament.css','src/research/knowledge-candidate-registry.js','src/research/knowledge-candidate-tournament.js','src/research/knowledge-candidate-state.js','src/research/knowledge-candidate-ui.js'])if(!sw.includes(marker))throw new Error(`sw missing tournament marker: ${marker}`);
const exportSource=fs.readFileSync('src/research/research-export.js','utf8');
for(const marker of ['research-export-0.9','getLatestKnowledgeCandidateTournament','knowledgeCandidateTournament','Knowledge Candidate Tournament contains exactly four'])if(!exportSource.includes(marker))throw new Error(`export missing tournament marker: ${marker}`);
for(const path of ['src/engine/shadow-engine.js','src/live/live-forward-paper.js','src/research/forward-demo-runner.js','src/knowledge/human-knowledge-engine.js','src/knowledge/playbook-engine.js']){
  const source=fs.readFileSync(path,'utf8');
  if(source.includes('knowledge-candidate-tournament')||source.includes('KnowledgeCandidateTournament'))throw new Error(`${path} is coupled to tournament output`);
}
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));const [major,minor]=String(pkg.version||'').split('.').map(Number);if(major!==0||minor<14)throw new Error(`package version expected >=0.14.x, got ${pkg.version}`);if(!pkg.scripts?.test?.includes('test-knowledge-candidate-tournament.mjs'))throw new Error('npm test does not run Candidate Tournament tests');
console.log('Knowledge Candidate Tournament v0.14 integrity validation passed.');
