import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const fail=m=>{console.error(`PWA validation failed: ${m}`);process.exitCode=1;};
const required=[
  'index.html','styles.css','ui-hotfix.css','ui-layout.css','manifest.webmanifest','sw.js',
  'src/app.js','src/config.js','src/pwa.js',
  'src/data/market-data-provider.js','src/research/decision-event-log.js','src/research/counterfactual-shadow.js',
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
  'class="topbar-main"','class="trade-context"','class="topbar-lower"','class="mode-control"','class="runtime-meta"','id="playBtn"','id="stepBtn"','id="runStateBadge"','id="connectionStatus"','id="engineVersion"'
]){if(!html.includes(marker))fail(`index.html missing marker: ${marker}`)}
for(const m of html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g)){if(!fs.existsSync(path.join(root,m[1])))fail(`HTML references missing file: ${m[1]}`)}
JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const file of ['index.html','styles.css','ui-hotfix.css','ui-layout.css','manifest.webmanifest','src/app.js','src/config.js','src/pwa.js','src/data/market-data-provider.js','src/research/decision-event-log.js','src/research/counterfactual-shadow.js','src/engine/indicators.js','src/engine/experts.js','src/engine/decision-policy.js','src/engine/shadow-engine.js','src/engine/execution-engine.js','src/engine/ai-provider.js','assets/icons/icon-192.png','assets/icons/icon-512.png','assets/icons/icon-maskable-512.png']){if(!sw.includes(`./${file}`))fail(`service worker cache missing: ${file}`)}
const layout=fs.readFileSync(path.join(root,'ui-layout.css'),'utf8');
for(const marker of ['.topbar-main','.topbar-lower','.trade-context','.mode-control','.runtime-meta','--control-h:46px','@media (max-width:760px)']){if(!layout.includes(marker))fail(`ui-layout.css missing hierarchy/responsive marker: ${marker}`)}
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
for(const marker of ['loadBTCUSD4H','DecisionEventLogger','buildDecisionEvent','estimateRoundTripCostBps']){if(!app.includes(marker))fail(`src/app.js missing v0.4 marker: ${marker}`)}
const shadow=fs.readFileSync(path.join(root,'src/engine/shadow-engine.js'),'utf8');
for(const marker of ['runAlphaExperts','entryDecision','experts: expertSet']){if(!shadow.includes(marker))fail(`shadow-engine.js missing policy/expert marker: ${marker}`)}
const policy=fs.readFileSync(path.join(root,'src/engine/decision-policy.js'),'utf8');
for(const marker of ['ENTER_LONG','ENTER_SHORT','NO_ENTRY','HOLD','EXIT_SIGNAL']){if(!policy.includes(marker))fail(`decision-policy.js missing state: ${marker}`)}
const experts=fs.readFileSync(path.join(root,'src/engine/experts.js'),'utf8');
for(const marker of ['Trend Expert','Momentum Expert','Breakout Expert','EXPERT_WEIGHTS']){if(!experts.includes(marker))fail(`experts.js missing fixed Expert marker: ${marker}`)}
const cf=fs.readFileSync(path.join(root,'src/research/counterfactual-shadow.js'),'utf8');
for(const marker of ['COUNTERFACTUAL_HORIZONS','independentSamples: false','usedByDecisionEngine: false','longMfeBps','shortMfeBps']){if(!cf.includes(marker))fail(`counterfactual-shadow.js missing guardrail marker: ${marker}`)}
const logger=fs.readFileSync(path.join(root,'src/research/decision-event-log.js'),'utf8');
for(const marker of ['getLoadedBTCUSD4H','buildFixedHorizonCounterfactual','clusterId: payload.eventId']){if(!logger.includes(marker))fail(`decision-event-log.js missing counterfactual wiring: ${marker}`)}
if(!process.exitCode)console.log('PWA v0.4.3 UI hierarchy + research integrity validation passed.');
