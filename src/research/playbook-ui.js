import { getLoadedBTCUSD4H } from '../data/market-data-provider.js';
import { ExecutionEngine } from '../engine/execution-engine.js';
import { HumanPlaybookEngine } from '../knowledge/playbook-engine.js';
import { HUMAN_PLAYBOOK_REGISTRY, getHumanPlaybookRegistrySnapshot } from '../knowledge/playbook-registry.js';
import { runPlaybookShadow } from './playbook-shadow-runner.js';
import { runPlaybookAttribution, PLAYBOOK_NEGATIVE_CONTROL_LAGS } from './playbook-attribution-runner.js';
import { runPlaybookWalkForward } from './playbook-walk-forward.js';
import { setLatestPlaybookEvaluation } from './playbook-state.js';

let initialized = false;

const escapeHtml = value => String(value ?? '')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

function fmt(value, suffix = '', signed = false) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const prefix = signed && number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(Math.abs(number) >= 100 ? 0 : 2)}${suffix}`;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-human-playbook-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './human-playbook.css';
  link.dataset.humanPlaybookStyle = 'true';
  document.head.appendChild(link);
}

function template() {
  const alphaCount = HUMAN_PLAYBOOK_REGISTRY.items.filter(item => item.role === 'alpha').length;
  const gateCount = HUMAN_PLAYBOOK_REGISTRY.items.filter(item => item.role === 'gate').length;
  return `
    <div id="humanPlaybookSection" class="human-playbook-section" aria-labelledby="humanPlaybookTitle">
      <div class="human-playbook-head">
        <div>
          <div class="section-kicker">Human Trading Playbook Engine — Wave 2</div>
          <h4 id="humanPlaybookTitle">単独指標ではなく「人間のトレードの型」を条件付きでコード化</h4>
          <p id="humanPlaybookMeta" class="human-playbook-meta">BTC/USD 4H実市場データを待っています。</p>
        </div>
        <span id="humanPlaybookStatus" class="human-playbook-status">RESEARCH ONLY</span>
      </div>
      <div class="human-playbook-strip">
        <span><small>Preregistered</small><b>${alphaCount} setups</b></span>
        <span><small>Entry gates</small><b>${gateCount}</b></span>
        <span><small>Archetypes</small><b>4 normalized</b></span>
        <span><small>Holdout</small><b>3 folds</b></span>
        <span><small>Null controls</small><b>${PLAYBOOK_NEGATIVE_CONTROL_LAGS.length} × archetype</b></span>
        <span><small>Champion</small><b>UNCHANGED</b></span>
      </div>
      <div class="human-playbook-now">
        <div class="human-playbook-primary">
          <small>Playbook Shadow 現在判断</small>
          <b id="humanPlaybookDecision">計算待ち</b>
          <span id="humanPlaybookScore">score —</span>
        </div>
        <div class="human-playbook-context">
          <span><small>Regime</small><b id="humanPlaybookRegime">—</b></span>
          <span><small>Active setups</small><b id="humanPlaybookActiveCount">—</b></span>
          <span><small>Agreement</small><b id="humanPlaybookAgreement">—</b></span>
          <span><small>Gate</small><b id="humanPlaybookGate">—</b></span>
        </div>
      </div>
      <div id="playbookArchetypeGrid" class="playbook-archetype-grid"></div>
      <div id="playbookActiveList" class="playbook-active-list"></div>
      <div id="humanPlaybookPerformance" class="human-playbook-performance"></div>

      <h5 class="human-playbook-subtitle">Archetype Attribution + Lag Negative Control</h5>
      <div class="playbook-table">
        <div class="playbook-row archetype header"><span>Archetype</span><span>ΔReturn</span><span>ΔAvg</span><span>Null95</span><span>Null≥Full</span><span>診断</span></div>
        <div id="playbookArchetypeRows"></div>
      </div>

      <h5 class="human-playbook-subtitle">Playbook Leave-one-out</h5>
      <div class="playbook-table">
        <div class="playbook-row setup header"><span>Setup</span><span>Type</span><span>ΔReturn</span><span>ΔAvg</span><span>感度</span></div>
        <div id="playbookAblationRows"></div>
      </div>

      <h5 class="human-playbook-subtitle">Chronological Holdout Diagnostic</h5>
      <div id="humanPlaybookHoldoutSummary" class="human-playbook-holdout-summary"></div>
      <div class="playbook-table">
        <div class="playbook-row fold header"><span>Fold</span><span>Playbook Return</span><span>Avg net</span><span>Wave1 Avg</span><span>Δ vs Wave1</span></div>
        <div id="playbookFoldRows"></div>
      </div>

      <div class="research-evaluation-note human-playbook-note">
        Wave 2はTrend Pullback、Trend/Volume Breakout、Squeeze Expansion、Range Mean Reversion、Failed Breakout Reversal、Structure/Momentum/OBV continuation、Volatility Expansion、Exhaustion Reversalなどを、複数条件を満たした時だけ有効になるPlaybookとして実装します。適合しないRegimeでは反対票を投じず inactive になります。Ablation・Lag Null・3-fold時系列Holdoutは研究診断であり、因果効果・正式なp値・pristine OOS証明ではありません。結果から自動削除・自動重み変更・Champion昇格は行わず、Live Forward / forward-001にも入力しません。
      </div>
    </div>
  `;
}

function insertSection() {
  if (document.getElementById('humanPlaybookSection')) return true;
  const host = document.getElementById('humanKnowledgeSection');
  if (!host) return false;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template().trim();
  const note = host.querySelector('.human-knowledge-note');
  if (note) host.insertBefore(wrapper.firstElementChild,note);
  else host.appendChild(wrapper.firstElementChild);
  return true;
}

function diagnosticLabel(value) {
  const labels = {
    'supportive-and-time-aligned':'支持 + 時間整合',
    'supportive-ablation-null-overlap':'支持 / Null重複',
    'supportive-sensitivity':'支持感度',
    'drag-in-sample':'外すと改善',
    'mixed-sensitivity':'混合',
  };
  return labels[value] || value || '—';
}

function renderUnavailable(message) {
  setLatestPlaybookEvaluation(null);
  const status = document.getElementById('humanPlaybookStatus');
  const meta = document.getElementById('humanPlaybookMeta');
  if (status) { status.className = 'human-playbook-status unavailable'; status.textContent = 'UNAVAILABLE'; }
  if (meta) meta.textContent = message;
}

function render({ snapshot, analysis, shadow, attribution, walkForward, costBps }) {
  const status = document.getElementById('humanPlaybookStatus');
  const meta = document.getElementById('humanPlaybookMeta');
  const decision = document.getElementById('humanPlaybookDecision');
  const score = document.getElementById('humanPlaybookScore');
  const regime = document.getElementById('humanPlaybookRegime');
  const activeCount = document.getElementById('humanPlaybookActiveCount');
  const agreement = document.getElementById('humanPlaybookAgreement');
  const gate = document.getElementById('humanPlaybookGate');
  const archetypes = document.getElementById('playbookArchetypeGrid');
  const activeList = document.getElementById('playbookActiveList');
  const perf = document.getElementById('humanPlaybookPerformance');
  const archetypeRows = document.getElementById('playbookArchetypeRows');
  const ablationRows = document.getElementById('playbookAblationRows');
  const holdoutSummary = document.getElementById('humanPlaybookHoldoutSummary');
  const foldRows = document.getElementById('playbookFoldRows');
  if (!status || !meta || !decision || !archetypes || !perf) return;

  status.className = 'human-playbook-status';
  status.textContent = 'RESEARCH ONLY';
  meta.textContent = `${snapshot.meta.label} / Wave 2 ${analysis.playbooks.length} playbooks / cost ${fmt(costBps,'bp')} / ${snapshot.meta.signature}`;
  const decisionMap = { ENTER_LONG:'買い候補',ENTER_SHORT:'売り候補',NO_ENTRY:'NO ENTRY' };
  decision.textContent = decisionMap[analysis.entryDecision] || analysis.entryDecision;
  decision.className = analysis.entryDecision === 'ENTER_LONG' ? 'decision-long' : analysis.entryDecision === 'ENTER_SHORT' ? 'decision-short' : 'decision-wait';
  score.textContent = `Playbook score ${fmt(analysis.playbookScore,'',true)} / max setup ${fmt(analysis.maxSetupStrength)} / Wave1 ref ${fmt(analysis.wave1Reference?.knowledgeScore,'',true)}`;
  regime.textContent = `${analysis.context.regime} / ${analysis.context.riskGate}`;
  activeCount.textContent = `${analysis.activePlaybookCount}`;
  agreement.textContent = fmt(analysis.archetypeAgreement * 100,'%');
  gate.textContent = analysis.gateReason || 'OPEN';

  archetypes.innerHTML = Object.entries(analysis.archetypes).map(([name,item]) => `
    <div class="playbook-archetype-card">
      <small>${escapeHtml(name)}</small>
      <b class="${item.score > 8 ? 'playbook-positive' : item.score < -8 ? 'playbook-negative' : 'playbook-neutral'}">${fmt(item.score,'',true)}</b>
      <span>${item.memberCount} active</span>
    </div>`).join('');

  const active = analysis.playbooks.filter(item => item.active).sort((a,b) => Math.abs(Number(b.score)) - Math.abs(Number(a.score)));
  activeList.innerHTML = active.length ? active.map(item => `
    <div class="playbook-active-item">
      <span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.archetype)}</small></span>
      <strong class="${item.score > 0 ? 'playbook-positive' : item.score < 0 ? 'playbook-negative' : ''}">${fmt(item.score,'',true)}</strong>
    </div>`).join('') : '<div class="playbook-active-item"><span><b>現在ActiveなPlaybookなし</b><small>Regime条件不一致</small></span><strong>—</strong></div>';

  const s = shadow.summary;
  perf.innerHTML = `
    <span><small>Shadow trades</small><b>${s.trades}</b></span>
    <span><small>Return</small><b>${fmt(s.returnPct,'%',true)}</b></span>
    <span><small>Avg net</small><b>${fmt(s.avgNetBps,'bp',true)}</b></span>
    <span><small>Win rate</small><b>${fmt(s.winRatePct,'%')}</b></span>
    <span><small>PF</small><b>${fmt(s.profitFactor)}</b></span>
    <span><small>MaxDD</small><b>${fmt(s.maxDrawdownPct,'%')}</b></span>`;

  archetypeRows.innerHTML = attribution.archetypeAblations.map(item => {
    const nc = item.negativeControl;
    const cls = item.diagnostic === 'supportive-and-time-aligned' ? 'playbook-positive' : item.diagnostic === 'drag-in-sample' ? 'playbook-negative' : '';
    return `<div class="playbook-row archetype">
      <span><b>${escapeHtml(item.archetype)}</b></span>
      <span class="${item.deltaReturnPct > 0 ? 'playbook-positive' : item.deltaReturnPct < 0 ? 'playbook-negative' : ''}">${fmt(item.deltaReturnPct,'%',true)}</span>
      <span class="${item.deltaAvgNetBps > 0 ? 'playbook-positive' : item.deltaAvgNetBps < 0 ? 'playbook-negative' : ''}">${fmt(item.deltaAvgNetBps,'bp',true)}</span>
      <span>${fmt(nc?.avgNetBpsNull?.p95,'bp',true)}</span>
      <span>${fmt(nc?.avgNetBpsNull?.exceedanceRatePct,'%')}</span>
      <span class="playbook-diagnostic ${cls}">${escapeHtml(diagnosticLabel(item.diagnostic))}</span>
    </div>`;
  }).join('');

  ablationRows.innerHTML = attribution.playbookAblations.map((item,index) => `<div class="playbook-row setup">
    <span><b>${index + 1}. ${escapeHtml(item.label)}</b></span>
    <span>${escapeHtml(item.archetype)}</span>
    <span class="${item.deltaReturnPct > 0 ? 'playbook-positive' : item.deltaReturnPct < 0 ? 'playbook-negative' : ''}">${fmt(item.deltaReturnPct,'%',true)}</span>
    <span class="${item.deltaAvgNetBps > 0 ? 'playbook-positive' : item.deltaAvgNetBps < 0 ? 'playbook-negative' : ''}">${fmt(item.deltaAvgNetBps,'bp',true)}</span>
    <span>${escapeHtml(diagnosticLabel(item.diagnostic))}</span>
  </div>`).join('');

  const w = walkForward.aggregate;
  holdoutSummary.innerHTML = `
    <span><small>Holdout trades</small><b>${w.trades}</b></span>
    <span><small>Return</small><b>${fmt(w.returnPct,'%',true)}</b></span>
    <span><small>Avg net</small><b>${fmt(w.avgNetBps,'bp',true)}</b></span>
    <span><small>Positive folds</small><b>${w.positiveFolds}/${walkForward.folds}</b></span>
    <span><small>Negative folds</small><b>${w.negativeFolds}/${walkForward.folds}</b></span>
    <span><small>Avg Δ vs Wave1</small><b>${fmt(w.avgFoldDeltaVsWave1Bps,'bp',true)}</b></span>`;
  foldRows.innerHTML = walkForward.foldResults.map(item => `<div class="playbook-row fold">
    <span><b>${item.fold}</b></span>
    <span>${fmt(item.playbookSummary?.returnPct,'%',true)}</span>
    <span>${fmt(item.playbookSummary?.avgNetBps,'bp',true)}</span>
    <span>${fmt(item.wave1Summary?.avgNetBps,'bp',true)}</span>
    <span class="${Number(item.deltaAvgNetBpsVsWave1) > 0 ? 'playbook-positive' : Number(item.deltaAvgNetBpsVsWave1) < 0 ? 'playbook-negative' : ''}">${fmt(item.deltaAvgNetBpsVsWave1,'bp',true)}</span>
  </div>`).join('');

  setLatestPlaybookEvaluation({
    registry:getHumanPlaybookRegistrySnapshot(),
    latestAnalysis:analysis,
    shadowEvaluation:shadow,
    attributionEvaluation:attribution,
    walkForwardEvaluation:walkForward,
    dataMeta:snapshot.meta,
    estimatedRoundTripCostBps:costBps,
  });
}

async function waitAndEvaluate() {
  for (let attempt = 0; attempt < 60; attempt++) {
    const snapshot = getLoadedBTCUSD4H();
    if (snapshot?.series && snapshot?.meta) {
      if (!snapshot.meta.researchEligible) {
        renderUnavailable('SyntheticデータはHuman Playbook研究評価の対象外です。');
        return;
      }
      const status = document.getElementById('humanPlaybookStatus');
      if (status) { status.className = 'human-playbook-status running'; status.textContent = '計算中'; }
      await new Promise(resolve => setTimeout(resolve,0));
      const execution = new ExecutionEngine({ random:() => .5, analyze:() => ({}) });
      const costBps = execution.estimateRoundTripCostBps('BTCUSD');
      const engine = new HumanPlaybookEngine();
      const idx = snapshot.series.length - 1;
      const analysis = engine.analyze(snapshot.series,idx);
      if (analysis.status !== 'complete') { renderUnavailable(`Playbook Engine停止: ${analysis.reason || analysis.status}`); return; }
      const shadow = runPlaybookShadow({ series:snapshot.series,endIndex:idx,estimatedRoundTripCostBps:costBps,dataSignature:snapshot.meta.signature });
      if (shadow.status !== 'complete') { renderUnavailable(`Playbook Shadow停止: ${shadow.reason || shadow.status}`); return; }
      const attribution = runPlaybookAttribution({ series:snapshot.series,endIndex:idx,estimatedRoundTripCostBps:costBps,dataSignature:snapshot.meta.signature });
      if (attribution.status !== 'complete') { renderUnavailable(`Playbook Attribution停止: ${attribution.reason || attribution.status}`); return; }
      const walkForward = runPlaybookWalkForward({ series:snapshot.series,endIndex:idx,estimatedRoundTripCostBps:costBps,dataSignature:snapshot.meta.signature });
      if (walkForward.status !== 'complete') { renderUnavailable(`Playbook Holdout停止: ${walkForward.reason || walkForward.status}`); return; }
      render({ snapshot,analysis,shadow,attribution,walkForward,costBps });
      return;
    }
    await new Promise(resolve => setTimeout(resolve,250));
  }
  renderUnavailable('BTC/USD 4H市場データの準備がタイムアウトしました。');
}

export function setupHumanPlaybookUI() {
  if (initialized) return;
  initialized = true;
  ensureStylesheet();
  if (!insertSection()) {
    setTimeout(() => { if (insertSection()) waitAndEvaluate(); },0);
    return;
  }
  waitAndEvaluate();
}
