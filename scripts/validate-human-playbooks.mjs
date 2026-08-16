import fs from 'node:fs';

const required = [
  'human-playbook.css',
  'src/knowledge/playbook-registry.js',
  'src/knowledge/playbook-features.js',
  'src/knowledge/playbook-engine.js',
  'src/research/playbook-shadow-runner.js',
  'src/research/playbook-attribution-runner.js',
  'src/research/playbook-walk-forward.js',
  'src/research/playbook-state.js',
  'src/research/playbook-ui.js',
  'scripts/test-human-playbooks.mjs',
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`missing Human Playbook file: ${file}`);

const registry = fs.readFileSync('src/knowledge/playbook-registry.js','utf8');
for (const marker of [
  'human-playbook-registry-0.1','PB_TREND_PULLBACK_001','PB_TREND_BREAKOUT_001','PB_VOLUME_BREAKOUT_001','PB_SQUEEZE_EXPANSION_001','PB_RANGE_MEAN_REVERSION_001','PB_FAILED_BREAKOUT_REVERSAL_001','PB_STRUCTURE_CONTINUATION_001','PB_MOMENTUM_CONTINUATION_001','PB_OBV_TREND_CONFIRM_001','PB_VOL_EXPANSION_MOMENTUM_001','PB_EXHAUSTION_REVERSAL_001','PB_TREND_QUALITY_001','PB_LOW_QUALITY_BREAKOUT_GATE_001','preRegistered:true','profitabilityClaim:false','activeInChampion:false','automaticPromotion:false'
]) if (!registry.includes(marker)) throw new Error(`playbook-registry missing marker: ${marker}`);

const features = fs.readFileSync('src/knowledge/playbook-features.js','utf8');
for (const marker of ['efficiencyRatio','candleAnatomy','buildPlaybookFeatures','bbWidthExpansionRatio','previousBreakSign','currentInsideChannel']) if (!features.includes(marker)) throw new Error(`playbook-features missing marker: ${marker}`);

const engine = fs.readFileSync('src/knowledge/playbook-engine.js','utf8');
for (const marker of ['HumanPlaybookEngine','human-playbook-wave2-0.1','PLAYBOOK_ARCHETYPES','runHumanPlaybooks','aggregatePlaybookArchetypes','rebuildPlaybookDecision','equalArchetypeWeight:true','usedByLiveDecisionEngine:false','usedByForwardEvidence:false','automaticPruning:false']) if (!engine.includes(marker)) throw new Error(`playbook-engine missing marker: ${marker}`);

const shadow = fs.readFileSync('src/research/playbook-shadow-runner.js','utf8');
for (const marker of ['playbook-shadow-0.1','runPlaybookShadow','fixedHorizonBars','nonOverlappingTrades:true','sameSeriesDiagnosticOnly:true','usedByLiveDecisionEngine:false']) if (!shadow.includes(marker)) throw new Error(`playbook-shadow missing marker: ${marker}`);

const attribution = fs.readFileSync('src/research/playbook-attribution-runner.js','utf8');
for (const marker of ['playbook-attribution-0.1','runPlaybookAttribution','leaveOnePlaybookOut:true','leaveOneArchetypeOut:true','gateAblation:true','past-signal-lag-by-playbook-archetype','causalAttribution:false','formalPValue:false','automaticPruning:false']) if (!attribution.includes(marker)) throw new Error(`playbook-attribution missing marker: ${marker}`);

const walk = fs.readFileSync('src/research/playbook-walk-forward.js','utf8');
for (const marker of ['playbook-walk-forward-0.1','PLAYBOOK_WALK_FORWARD_FOLDS = 3','PLAYBOOK_WALK_FORWARD_EMBARGO_BARS = 3','runPlaybookWalkForward','chronologicalOrderPreserved:true','noFittingPerformed:true','pristineUntouchedOOS:false','promotionEligible:false']) if (!walk.includes(marker)) throw new Error(`playbook-walk-forward missing marker: ${marker}`);

const ui = fs.readFileSync('src/research/playbook-ui.js','utf8');
for (const marker of ['Human Trading Playbook Engine — Wave 2','単独指標ではなく「人間のトレードの型」を条件付きでコード化','runPlaybookShadow','runPlaybookAttribution','runPlaybookWalkForward','Champion','UNCHANGED','setLatestPlaybookEvaluation']) if (!ui.includes(marker)) throw new Error(`playbook-ui missing marker: ${marker}`);

const pwa = fs.readFileSync('src/pwa.js','utf8');
for (const marker of ['setupHumanPlaybookUI','./research/playbook-ui.js']) if (!pwa.includes(marker)) throw new Error(`pwa bootstrap missing Playbook marker: ${marker}`);

const exportSource = fs.readFileSync('src/research/research-export.js','utf8');
for (const marker of ['research-export-0.8','getLatestPlaybookEvaluation','playbookEvaluation','Human Trading Playbook Engine Wave 2']) if (!exportSource.includes(marker)) throw new Error(`research-export missing Playbook marker: ${marker}`);

const sw = fs.readFileSync('sw.js','utf8');
for (const marker of ['human-playbook.css','src/knowledge/playbook-registry.js','src/knowledge/playbook-features.js','src/knowledge/playbook-engine.js','src/research/playbook-shadow-runner.js','src/research/playbook-attribution-runner.js','src/research/playbook-walk-forward.js','src/research/playbook-state.js','src/research/playbook-ui.js','v0.13-human-playbook']) if (!sw.includes(marker)) throw new Error(`service worker missing Playbook marker: ${marker}`);

const champion = fs.readFileSync('src/engine/shadow-engine.js','utf8');
const live = fs.readFileSync('src/live/live-forward-paper.js','utf8');
const forward = fs.readFileSync('src/research/forward-demo-runner.js','utf8');
const wave1 = fs.readFileSync('src/knowledge/human-knowledge-engine.js','utf8');
for (const [name,source] of [['champion',champion],['live-forward',live],['forward-evidence',forward],['wave1',wave1]]) {
  if (source.includes('HumanPlaybookEngine') || source.includes('playbook-engine')) throw new Error(`${name} is coupled to Human Playbook research code`);
}

console.log('Human Trading Playbook Engine v0.13 integrity validation passed.');
