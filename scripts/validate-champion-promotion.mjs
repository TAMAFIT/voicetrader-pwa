import fs from 'node:fs';

const required=[
  'champion-promotion.css',
  'src/research/champion-promotion-protocol.js',
  'src/research/champion-promotion-evaluator.js',
  'src/research/champion-promotion-state.js',
  'src/research/champion-promotion-ui.js',
  'scripts/test-champion-promotion.mjs',
];
for(const file of required)if(!fs.existsSync(file))throw new Error(`missing Champion promotion file: ${file}`);

const protocol=fs.readFileSync('src/research/champion-promotion-protocol.js','utf8');
for(const marker of ['champion-promotion-protocol-0.1','2026-08-16T23:54:09Z','CHAMPION_PROMOTION_QUALIFICATION_EPOCH_ID = KNOWLEDGE_FORWARD_EPOCH_ID','knowledge-confirm-001','champion-001','[1,2,3,6,9,12,18,24]','minElapsedCalendarDays:90','minObservedBars:540','minCandidateTrades:30','minBenchmarkTrades:30','directPromotionForbidden:true','qualificationDataCannotBeConfirmationData:true','automaticNomination:false','automaticPromotion:false','championMutation:false','assertChampionPromotionProtocol'])if(!protocol.includes(marker))throw new Error(`promotion protocol missing marker: ${marker}`);

const evaluator=fs.readFileSync('src/research/champion-promotion-evaluator.js','utf8');
for(const marker of ['champion-promotion-evaluator-0.1','evaluateChampionPromotionQualification','inspectChampionPromotionIntegrity','buildProspectiveLagControls','prospective-past-decision-lag','archivedPastDecisionsOnly:true','futureDecisionUsed:false','buildProspectivePromotionFolds','confirmationReviewReady','promotionEligible:false','selectedCandidateId:null','automaticNomination:false','automaticPromotion:false','championMutation:false','directChampion002PromotionForbidden:true','qualificationDataCannotBeConfirmationData:true','usedByLiveDecisionEngine:false','usedByKnowledgeForwardDecisionEngine:false'])if(!evaluator.includes(marker))throw new Error(`promotion evaluator missing marker: ${marker}`);
if(/function\s+evaluateChampionPromotionQualification\s*\([^)]*,/.test(evaluator))throw new Error('promotion evaluator exposes threshold/config override argument');

const ui=fs.readFileSync('src/research/champion-promotion-ui.js','utf8');
for(const marker of ['Champion-002 Promotion Protocol','Stage Aは「確認試験へ進めるか」だけを判定','knowledge-confirm-001','Remote Archive only','direct promotion forbidden','CONFIRMATION REVIEW READY','Promotion Protocol停止','setupChampionPromotionUI'])if(!ui.includes(marker))throw new Error(`promotion UI missing marker: ${marker}`);

const pwa=fs.readFileSync('src/pwa.js','utf8');
for(const marker of ['setupChampionPromotionUI','./research/champion-promotion-ui.js'])if(!pwa.includes(marker))throw new Error(`PWA missing promotion bootstrap: ${marker}`);
const sw=fs.readFileSync('sw.js','utf8');
for(const marker of ['v0.17-champion-promotion','champion-promotion.css','src/research/champion-promotion-protocol.js','src/research/champion-promotion-evaluator.js','src/research/champion-promotion-state.js','src/research/champion-promotion-ui.js'])if(!sw.includes(marker))throw new Error(`service worker missing promotion marker: ${marker}`);

const exportSource=fs.readFileSync('src/research/research-export.js','utf8');
for(const marker of ['research-export-0.11','getLatestChampionPromotionEvaluation','championPromotionEvaluation','knowledge-confirm-001','qualification data cannot be reused'])if(!exportSource.includes(marker))throw new Error(`research export missing promotion marker: ${marker}`);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));const [major,minor]=String(pkg.version||'').split('.').map(Number);if(major!==0||minor<17)throw new Error(`package version expected >=0.17.x, got ${pkg.version}`);for(const marker of ['validate-champion-promotion.mjs','test-champion-promotion.mjs','champion-promotion-protocol.js','champion-promotion-evaluator.js','champion-promotion-state.js','champion-promotion-ui.js'])if(!pkg.scripts?.test?.includes(marker))throw new Error(`npm test missing promotion marker: ${marker}`);

for(const [name,path] of [['champion','src/engine/shadow-engine.js'],['live-forward','src/live/live-forward-paper.js'],['knowledge-forward','src/research/knowledge-forward-runner.js'],['forward-001','src/research/forward-demo-runner.js']]){const source=fs.readFileSync(path,'utf8');if(source.includes('champion-promotion'))throw new Error(`${name} coupled to Champion promotion output`);}

console.log('Two-stage Champion-002 Promotion Protocol v0.17 integrity validation passed.');
