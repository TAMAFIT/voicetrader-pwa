import fs from 'node:fs';

const required=['higher-timeframe.css','src/knowledge/higher-timeframe-registry.js','src/knowledge/higher-timeframe-features.js','src/knowledge/higher-timeframe-engine.js','src/research/higher-timeframe-runner.js','src/research/higher-timeframe-state.js','src/research/higher-timeframe-ui.js','scripts/test-higher-timeframe-wave3.mjs'];
for(const file of required)if(!fs.existsSync(file))throw new Error(`missing Higher-Timeframe Wave3 file: ${file}`);

const registry=fs.readFileSync('src/knowledge/higher-timeframe-registry.js','utf8');
for(const marker of ['higher-timeframe-registry-0.1','HIGHER_TIMEFRAME_COMPONENT_COUNT=6','HIGHER_TIMEFRAME_ALPHA_COUNT=4','HIGHER_TIMEFRAME_GATE_COUNT=2','HIGHER_TIMEFRAME_D1_MIN_BARS=40','HTF_D1_TREND_PULLBACK_001','HTF_D1_BREAKOUT_ALIGN_001','HTF_D1_MOMENTUM_ALIGN_001','HTF_D1_RANGE_REVERSION_001','HTF_D1_COUNTERTREND_VETO_001','HTF_D1_VOL_SHOCK_GATE_001','fullyClosedDailyContextOnly:true','partialDailyBarForbidden:true','futureFourHourBarsForbidden:true','generatedCombinations:false','rawScoreMinusCost:false','activeInKnowledgeForward001:false','automaticPromotion:false'])if(!registry.includes(marker))throw new Error(`HTF registry missing marker: ${marker}`);

const features=fs.readFileSync('src/knowledge/higher-timeframe-features.js','utf8');
for(const marker of ['higher-timeframe-features-0.1','UTC_D1_OPEN_SLOTS','buildClosedDailySeries','dayStart+DAY_SECONDS>decisionInfoTime','for(let i=0;i<=safeIdx;i++)','sourceBars:6','buildHigherTimeframeFeatures','fullyClosedUtcDailyBarsOnly:true','partialCurrentDailyBarForbidden:true','futureFourHourBarsForbidden:true'])if(!features.includes(marker))throw new Error(`HTF features missing marker: ${marker}`);

const engine=fs.readFileSync('src/knowledge/higher-timeframe-engine.js','utf8');
for(const marker of ['higher-timeframe-engine-0.1','HIGHER_TIMEFRAME_ENTRY_THRESHOLD=55','resolveHigherTimeframeDecision','equalActiveAlphaWeighting:true','gateIsDirectionalVote:false','scoreIsExpectedReturn:false','rawScoreMinusCost:false','activeInKnowledgeForward001:false','optimizer:false','automaticPromotion:false'])if(!engine.includes(marker))throw new Error(`HTF engine missing marker: ${marker}`);

const runner=fs.readFileSync('src/research/higher-timeframe-runner.js','utf8');
for(const marker of ['higher-timeframe-runner-0.1','HIGHER_TIMEFRAME_LAG_CONTROLS=Object.freeze([1,2,3,6,9,12,18,24])','HIGHER_TIMEFRAME_FOLDS=3','runHigherTimeframeWave3','leaveOneComponentOut:true','pastDecisionLagControls','foldOutcomeOverlap:false','pristineUntouchedOOS:false','noFittingPerformed:true','rawScoreMinusCost:false','promotionEligible:false','usedByKnowledgeForward001:false'])if(!runner.includes(marker))throw new Error(`HTF runner missing marker: ${marker}`);

const ui=fs.readFileSync('src/research/higher-timeframe-ui.js','utf8');
for(const marker of ['Human Trading Knowledge — Wave 3','Higher-Timeframe Context — 完全確定D1 × 4H Trigger','frozen knowledge-forward-001 とは完全分離','runHigherTimeframeWave3','Same-series diagnostic','Component LOO / activation','Chronological 3-fold','setupHigherTimeframeUI'])if(!ui.includes(marker))throw new Error(`HTF UI missing marker: ${marker}`);
const pwa=fs.readFileSync('src/pwa.js','utf8');for(const marker of ['setupHigherTimeframeUI','./research/higher-timeframe-ui.js'])if(!pwa.includes(marker))throw new Error(`PWA missing HTF bootstrap: ${marker}`);
const sw=fs.readFileSync('sw.js','utf8');for(const marker of ['v0.19-higher-timeframe-wave3','higher-timeframe.css','src/knowledge/higher-timeframe-registry.js','src/knowledge/higher-timeframe-features.js','src/knowledge/higher-timeframe-engine.js','src/research/higher-timeframe-runner.js','src/research/higher-timeframe-state.js','src/research/higher-timeframe-ui.js'])if(!sw.includes(marker))throw new Error(`service worker missing HTF marker: ${marker}`);
const exportSource=fs.readFileSync('src/research/research-export.js','utf8');for(const marker of ['research-export-0.13','getLatestHigherTimeframeEvaluation','higherTimeframeEvaluation','Higher-Timeframe Context Wave 3','fully closed UTC D1'])if(!exportSource.includes(marker))throw new Error(`research export missing HTF marker: ${marker}`);

const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));const [major,minor]=String(pkg.version||'').split('.').map(Number);if(major!==0||minor<19)throw new Error(`package version expected >=0.19.x, got ${pkg.version}`);for(const marker of ['validate-higher-timeframe-wave3.mjs','test-higher-timeframe-wave3.mjs','higher-timeframe-registry.js','higher-timeframe-features.js','higher-timeframe-engine.js','higher-timeframe-runner.js','higher-timeframe-state.js','higher-timeframe-ui.js'])if(!pkg.scripts?.test?.includes(marker))throw new Error(`npm test missing HTF marker: ${marker}`);

for(const [name,path] of [['champion','src/engine/shadow-engine.js'],['live-forward','src/live/live-forward-paper.js'],['forward-001','src/research/forward-demo-runner.js'],['knowledge-forward-001','src/research/knowledge-forward-runner.js'],['candidate-tournament','src/research/knowledge-candidate-tournament.js']]){const source=fs.readFileSync(path,'utf8');if(source.includes('higher-timeframe'))throw new Error(`${name} coupled to Wave3 output`);}
console.log('Higher-Timeframe Context Wave 3 v0.19 integrity validation passed.');
