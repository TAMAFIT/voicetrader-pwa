import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const fail=m=>{console.error(`PWA validation failed: ${m}`);process.exitCode=1;};
const required=[
  'index.html','styles.css','ui-hotfix.css','ui-layout.css','ui-viewport.css','research-evaluation.css','manifest.webmanifest','sw.js',
  'src/app.js','src/config.js','src/pwa.js',
  'src/data/market-data-provider.js','src/research/decision-event-log.js','src/research/counterfactual-shadow.js','src/research/baseline-runner.js','src/research/null-market-runner.js','src/research/research-export.js','src/research/research-evaluation-ui.js',
  'src/engine/indicators.js','src/engine/experts.js','src/engine/decision-policy.js','src/engine/shadow-engine.js','src/engine/execution-engine.js','src/engine/ai-provider.js',
  'assets/icons/icon-192.png','assets/icons/icon-512.png','assets/icons/icon-maskable-512.png','assets/icons/apple-touch-icon.png'
];
for(const file of required){if(!fs.existsSync(path.join(root,file)))fail(`missing required file: ${file}`)}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const controls=[...html].filter(ch=>{const n=ch.charCodeAt(0);return n<32&&![9,10,13].includes(n)});
if(controls.length)fail(`index.html contains ${controls.length} forbidden control characters`);
if(html.includes('\uFFFD'))fail('index.html contains Unicode replacement characters');
for(const marker of [
  'VoiceTrader','VoiceTrader Demo v0.4 Research','id="dataSourceBadge"','id="chartCanvas"','id="scannerGrid"','id="buyBtn"','id="waitBtn"','id="sellBtn"','id="humanEquity"','id="aiEquity"','class="duel-strip','class="decision-card',
  'class="topbar-main"','class="trade-context"','class="topbar-lower"','class="mode-control"','class="runtime-meta"','id="playBtn"','id="stepBtn"','id="runStateBadge"','id="connectionStatus"','id="engineVersion"','href="./ui-viewport.css"'
]){if(!html.includes(marker))fail(`index.html missing marker: ${marker}`)}
for(const m of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)){if(!fs.existsSync(path.join(root,m[1])))fail(`HTML references missing file: ${m[1]}`)}
JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const file of ['index.html','styles.css','ui-hotfix.css','ui-layout.css','ui-viewport.css','research-evaluation.css','manifest.webmanifest','src/app.js','src/config.js','src/pwa.js','src/data/market-data-provider.js','src/research/decision-event-log.js','src/research/counterfactual-shadow.js','src/research/baseline-runner.js','src/research/null-market-runner.js','src/research/research-export.js','src/research/research-evaluation-ui.js','src/engine/indicators.js','src/engine/experts.js','src/engine/decision-policy.js','src/engine/shadow-engine.js','src/engine/execution-engine.js','src/engine/ai-provider.js','assets/icons/icon-192.png','assets/icons/icon-512.png','assets/icons/icon-maskable-512.png']){if(!sw.includes(`./${file}`))fail(`service worker cache missing: ${file}`)}
const layout=fs.readFileSync(path.join(root,'ui-layout.css'),'utf8');
for(const marker of ['.topbar-main','.topbar-lower','.trade-context','.mode-control','.runtime-meta','--control-h:46px','@media (max-width:760px)']){if(!layout.includes(marker))fail(`ui-layout.css missing hierarchy/responsive marker: ${marker}`)}
const viewport=fs.readFileSync(path.join(root,'ui-viewport.css'),'utf8');
for(const marker of ['align-items:stretch','@media (min-width:1101px) and (max-height:900px)','grid-template-columns:repeat(4,minmax(0,1fr))','#chartCanvas','height:338px']){if(!viewport.includes(marker))fail(`ui-viewport.css missing density/equal-height marker: ${marker}`)}
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
for(const marker of ['loadBTCUSD4H','DecisionEventLogger','buildDecisionEvent','estimateRoundTripCostBps']){if(!app.includes(marker))fail(`src/app.js missing v0.4 marker: ${marker}`)}
const pwa=fs.readFileSync(path.join(root,'src/pwa.js'),'utf8');
for(const marker of ['setupResearchEvaluationUI','./research/research-evaluation-ui.js']){if(!pwa.includes(marker))fail(`src/pwa.js missing research UI bootstrap marker: ${marker}`)}
const shadow=fs.readFileSync(path.join(root,'src/engine/shadow-engine.js'),'utf8');
for(const marker of ['runAlphaExperts','entryDecision','experts: expertSet']){if(!shadow.includes(marker))fail(`shadow-engine.js missing policy/expert marker: ${marker}`)}
const policy=fs.readFileSync(path.join(root,'src/engine/decision-policy.js'),'utf8');
for(const marker of ['ENTER_LONG','ENTER_SHORT','NO_ENTRY','HOLD','EXIT_SIGNAL']){if(!policy.includes(marker))fail(`decision-policy.js missing state: ${marker}`)}
const experts=fs.readFileSync(path.join(root,'src/engine/experts.js'),'utf8');
for(const marker of ['Trend Expert','Momentum Expert','Breakout Expert','EXPERT_WEIGHTS']){if(!experts.includes(marker))fail(`experts.js missing fixed Expert marker: ${marker}`)}
const cf=fs.readFileSync(path.join(root,'src/research/counterfactual-shadow.js'),'utf8');
for(const marker of ['COUNTERFACTUAL_HORIZONS','independentSamples: false','usedByDecisionEngine: false','longMfeBps','shortMfeBps']){if(!cf.includes(marker))fail(`counterfactual-shadow.js missing guardrail marker: ${marker}`)}
const logger=fs.readFileSync(path.join(root,'src/research/decision-event-log.js'),'utf8');
for(const marker of ['getLoadedBTCUSD4H','buildFixedHorizonCounterfactual','clusterId: payload.eventId','async listAll()']){if(!logger.includes(marker))fail(`decision-event-log.js missing research/export wiring: ${marker}`)}
const baseline=fs.readFileSync(path.join(root,'src/research/baseline-runner.js'),'utf8');
for(const marker of ['BASELINE_RUNNER_VERSION','Matched Random','edgeProof: false','parameterSweep: false','championMutation: false']){if(!baseline.includes(marker))fail(`baseline-runner.js missing guardrail marker: ${marker}`)}
const nullMarket=fs.readFileSync(path.join(root,'src/research/null-market-runner.js'),'utf8');
for(const marker of ['NULL_CONTROL_VERSION','buildReturnShuffleSeries','buildBlockShuffleSeries','Signal Shift','formalPValue: false','usedByDecisionEngine: false','transformedSeriesInjectedIntoLiveEngine: false','parameterSweep: false']){if(!nullMarket.includes(marker))fail(`null-market-runner.js missing negative-control guardrail marker: ${marker}`)}
const researchExport=fs.readFileSync(path.join(root,'src/research/research-export.js'),'utf8');
for(const marker of ['research-export-0.2','researchEventsToCsv','buildResearchJson','nullMarketEvaluation','Null95','not IID']){if(!researchExport.includes(marker))fail(`research-export.js missing v0.6 export marker: ${marker}`)}
const researchUi=fs.readFileSync(path.join(root,'src/research/research-evaluation-ui.js'),'utf8');
for(const marker of ['Championは単純戦略より強い？','存在しないedgeまで発見していない？','exportResearchJson','runBaselineSuite','runNullMarketControls','正式なp値']){if(!researchUi.includes(marker))fail(`research-evaluation-ui.js missing v0.6 UI/safety marker: ${marker}`)}
const researchCss=fs.readFileSync(path.join(root,'research-evaluation.css'),'utf8');
for(const marker of ['.research-evaluation-card','.baseline-row.champion','.research-export-btn','.null-control-section','.null-control-row','.null-diagnostic.clean','@media (max-width:760px)']){if(!researchCss.includes(marker))fail(`research-evaluation.css missing v0.6 layout marker: ${marker}`)}
if(!process.exitCode)console.log('PWA v0.6 baseline + Null Market negative-control integrity validation passed.');
