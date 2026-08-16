import { getLoadedBTCUSD4H } from '../data/market-data-provider.js';
import { ShadowEngine } from '../engine/shadow-engine.js';
import { ExecutionEngine } from '../engine/execution-engine.js';
import { runWalkForwardEvaluation } from './walk-forward-runner.js';
import { setLatestWalkForwardEvaluation } from './walk-forward-state.js';

let initialized = false;

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function formatMetric(value, suffix = '', { signed = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const prefix = signed && number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(Math.abs(number) >= 100 ? 0 : 2)}${suffix}`;
}

function formatPf(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '—';
}

function ensureStylesheet() {
  if (document.querySelector('link[data-walk-forward-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './walk-forward.css';
  link.dataset.walkForwardStyle = 'true';
  document.head.appendChild(link);
}

function sectionTemplate() {
  return `
    <div id="walkForwardSection" class="walk-forward-section" aria-labelledby="walkForwardTitle">
      <div class="walk-forward-head">
        <div>
          <div class="section-kicker">Chronological Holdout</div>
          <h3 id="walkForwardTitle">時系列を分けても成績は残る？</h3>
          <p id="walkForwardMeta" class="walk-forward-meta">固定Champion / Challengerを3分割の時系列Holdoutで診断します。</p>
        </div>
        <span id="walkForwardStatus" class="walk-forward-status pending">計算待ち</span>
      </div>
      <div class="walk-forward-table" role="table" aria-label="Chronological walk-forward comparison">
        <div class="walk-forward-row walk-forward-header" role="row">
          <span>Strategy</span><span>Holdout Return</span><span>PF</span><span>Avg net</span><span>Trades</span><span>Positive folds</span><span>Δ vs Champ</span>
        </div>
        <div id="walkForwardRows" class="walk-forward-rows">
          <div class="walk-forward-empty">実市場データの準備後に時系列Holdoutを計算します。</div>
        </div>
      </div>
      <div id="walkForwardFolds" class="walk-forward-folds" aria-label="Walk-forward fold windows"></div>
      <div class="walk-forward-note">
        3バーのEmbargoを各テスト区間の直前に置き、固定3バーExitが境界をまたがないようにします。戦略の学習・再調整は行いません。なお、この履歴系列は既にsame-series研究画面で観測済みのため、これは<strong>pristineな未使用OOS証明ではなく時系列Holdout診断</strong>です。Champion昇格には使わず、将来のForward Demoを別途必要とします。
      </div>
    </div>
  `;
}

function insertSection() {
  if (document.getElementById('walkForwardSection')) return true;
  const researchCard = document.getElementById('researchEvaluationCard');
  if (!researchCard) return false;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sectionTemplate().trim();
  const section = wrapper.firstElementChild;
  const nullSection = researchCard.querySelector('.null-control-section');
  if (nullSection) researchCard.insertBefore(section, nullSection);
  else researchCard.appendChild(section);
  return true;
}

function renderUnavailable(message = '実市場データが利用できないため時系列Holdoutを停止しています。') {
  setLatestWalkForwardEvaluation(null);
  const rows = document.getElementById('walkForwardRows');
  const status = document.getElementById('walkForwardStatus');
  const meta = document.getElementById('walkForwardMeta');
  const folds = document.getElementById('walkForwardFolds');
  if (rows) rows.innerHTML = `<div class="walk-forward-empty">${escapeHtml(message)}</div>`;
  if (status) {
    status.className = 'walk-forward-status unavailable';
    status.textContent = '対象外';
  }
  if (meta) meta.textContent = 'Synthetic fallbackは研究評価対象外です。';
  if (folds) folds.innerHTML = '';
}

function renderResult(result, meta) {
  const rows = document.getElementById('walkForwardRows');
  const status = document.getElementById('walkForwardStatus');
  const metaEl = document.getElementById('walkForwardMeta');
  const foldsEl = document.getElementById('walkForwardFolds');
  if (!rows || !status || !metaEl || !foldsEl) return;

  if (!result || result.status !== 'complete') {
    renderUnavailable(result?.reason === 'insufficient-bars-for-chronological-folds'
      ? '時系列3-fold診断に必要なバー数が不足しています。'
      : undefined);
    return;
  }

  setLatestWalkForwardEvaluation(result);
  status.className = 'walk-forward-status diagnostic';
  status.textContent = `${result.methodology.folds} folds / 昇格不可`;
  metaEl.textContent = `${meta?.label || 'BTC/USD 4H'} / Embargo ${result.methodology.embargoBars} bars / Exit ${result.methodology.commonExitHorizonBars} bars / fittingなし`;

  rows.innerHTML = result.results.map(strategy => {
    const champion = strategy.role === 'champion';
    const delta = Number(strategy.deltaVsChampion?.returnPct || 0);
    return `
      <div class="walk-forward-row ${champion ? 'champion' : ''}" role="row" title="${escapeHtml(strategy.hypothesis)}">
        <span class="walk-forward-name">${escapeHtml(strategy.label)}<small>${champion ? 'FROZEN' : 'SHADOW'}</small></span>
        <span class="walk-forward-return ${strategy.returnPct > 0 ? 'positive' : strategy.returnPct < 0 ? 'negative' : ''}">${formatMetric(strategy.returnPct, '%', { signed: true })}</span>
        <span>${formatPf(strategy.profitFactor)}</span>
        <span>${formatMetric(strategy.avgNetBps, 'bp', { signed: true })}</span>
        <span>${strategy.trades}</span>
        <span>${strategy.positiveFolds}/${result.methodology.folds}</span>
        <span class="walk-forward-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}">${champion ? '—' : formatMetric(delta, '%', { signed: true })}</span>
      </div>
    `;
  }).join('');

  foldsEl.innerHTML = result.folds.map(fold => {
    const champion = fold.results.find(item => item.role === 'champion');
    return `
      <div class="walk-forward-fold">
        <span>Fold ${fold.fold}</span>
        <b>${fold.testStart}–${fold.testEnd}</b>
        <small>Embargo ${fold.embargoStart}–${fold.embargoEnd} / Champion ${formatMetric(champion?.returnPct, '%', { signed: true })}</small>
      </div>
    `;
  }).join('');
}

function evaluateSnapshot(snapshot) {
  if (!snapshot?.series || !snapshot?.meta?.researchEligible) {
    renderUnavailable();
    return false;
  }
  const series = snapshot.series;
  const endIndex = series.length - 1;
  const engine = new ShadowEngine({ seriesProvider: () => series });
  const execution = new ExecutionEngine({
    random: () => 0.5,
    analyze: () => engine.analyze('BTCUSD', endIndex),
  });
  const result = runWalkForwardEvaluation({
    series,
    endIndex,
    estimatedRoundTripCostBps: execution.estimateRoundTripCostBps('BTCUSD'),
    dataSignature: snapshot.meta.signature,
    instrument: 'BTCUSD',
    timeframeHours: 4,
  });
  renderResult(result, snapshot.meta);
  return result.status === 'complete';
}

async function waitForMarketSnapshot() {
  for (let attempt = 0; attempt < 36; attempt++) {
    const snapshot = getLoadedBTCUSD4H();
    if (snapshot?.series && snapshot?.meta) {
      evaluateSnapshot(snapshot);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  renderUnavailable('市場データの読み込み待ちがタイムアウトしました。');
}

export function setupWalkForwardUI() {
  if (initialized) return;
  initialized = true;
  ensureStylesheet();
  if (!insertSection()) {
    setTimeout(() => {
      if (insertSection()) waitForMarketSnapshot();
    }, 0);
    return;
  }
  document.title = 'VoiceTrader Demo v0.8 Walk-forward';
  const footer = document.querySelector('.app-footer');
  if (footer) footer.textContent = 'VoiceTrader v0.8 Research Evaluation — Walk-forwardは時系列診断であり、pristine OOS証明や実際の投資判断には使用しないでください。';
  waitForMarketSnapshot();
}
