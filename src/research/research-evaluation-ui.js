import { getLoadedBTCUSD4H } from '../data/market-data-provider.js';
import { ShadowEngine } from '../engine/shadow-engine.js';
import { ExecutionEngine } from '../engine/execution-engine.js';
import { DecisionEventLogger } from './decision-event-log.js';
import { runBaselineSuite } from './baseline-runner.js';
import { buildResearchJson, researchEventsToCsv, downloadResearchText } from './research-export.js';

const logger = new DecisionEventLogger({ strategyVersion: 'champion-001' });
let latestBaseline = null;
let latestDataMeta = null;
let initialized = false;

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function ensureStylesheet() {
  if (document.querySelector('link[data-research-evaluation-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './research-evaluation.css';
  link.dataset.researchEvaluationStyle = 'true';
  document.head.appendChild(link);
}

function compactBaselineForExport(suite) {
  if (!suite) return null;
  return {
    ...suite,
    results: suite.results.map(({ tradesDetail, ...summary }) => summary),
  };
}

function formatMetric(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  const prefix = suffix === '%' && number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(Math.abs(number) >= 100 ? 0 : 2)}${suffix}`;
}

function formatPf(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '—';
}

function cardTemplate() {
  return `
    <section id="researchEvaluationCard" class="research-evaluation-card card" aria-labelledby="researchEvaluationTitle">
      <div class="research-evaluation-head">
        <div>
          <div class="section-kicker">研究評価・Baseline</div>
          <h2 id="researchEvaluationTitle">Championは単純戦略より強い？</h2>
          <p id="researchEvaluationMeta" class="research-evaluation-meta">Kraken実市場4Hデータを待っています。</p>
        </div>
        <div class="research-export-actions" aria-label="研究ログを書き出す">
          <span id="researchEventCount" class="research-event-count">DecisionEvent 0件</span>
          <button id="exportResearchJson" class="research-export-btn">JSON</button>
          <button id="exportResearchCsv" class="research-export-btn">CSV</button>
        </div>
      </div>
      <div class="baseline-table" role="table" aria-label="Baseline comparison">
        <div class="baseline-row baseline-header" role="row">
          <span>戦略</span><span>Return</span><span>PF</span><span>勝率</span><span>取引</span><span>MaxDD</span><span>Exposure</span>
        </div>
        <div id="baselineRows" class="baseline-rows">
          <div class="research-evaluation-empty">実市場データの準備後に自動評価します。</div>
        </div>
      </div>
      <div class="research-evaluation-note">
        同一のBTC/USD 4H履歴上で、固定3バーExitと決定論的コストを使う比較です。Baselineは説明用の対照群であり、再現可能なedgeの証明・自動最適化・Champion更新には使用しません。
      </div>
    </section>
  `;
}

function insertCard() {
  if (document.getElementById('researchEvaluationCard')) return;
  const scanner = document.querySelector('.scanner-card');
  if (!scanner) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = cardTemplate().trim();
  scanner.parentNode.insertBefore(wrapper.firstElementChild, scanner);
}

function renderBaseline(suite, meta) {
  const rows = document.getElementById('baselineRows');
  const metaEl = document.getElementById('researchEvaluationMeta');
  if (!rows || !metaEl) return;

  if (!suite || suite.status !== 'complete') {
    rows.innerHTML = '<div class="research-evaluation-empty">実市場データが利用できないためBaseline評価を停止しています。</div>';
    metaEl.textContent = 'Synthetic fallbackは研究評価対象外です。';
    return;
  }

  metaEl.textContent = `${meta?.label || 'BTC/USD 4H'} / ${suite.observedBars} bars / 推定往復コスト ${suite.estimatedRoundTripCostBps.toFixed(2)}bp / 共通Exit ${suite.methodology.commonSignalExitHorizonBars} bars`;
  rows.innerHTML = suite.results.map((result) => `
    <div class="baseline-row ${result.id === 'champion' ? 'champion' : ''}" role="row" title="${escapeHtml(result.note)}">
      <span class="baseline-name">${escapeHtml(result.label)}${result.id === 'champion' ? '<small>正式ロジック</small>' : ''}</span>
      <span class="baseline-return ${result.returnPct > 0 ? 'positive' : result.returnPct < 0 ? 'negative' : ''}">${formatMetric(result.returnPct, '%')}</span>
      <span>${formatPf(result.profitFactor)}</span>
      <span>${formatMetric(result.winRatePct, '%')}</span>
      <span>${result.trades}</span>
      <span>${formatMetric(-Math.abs(result.maxDrawdownPct), '%')}</span>
      <span>${formatMetric(result.exposurePct, '%')}</span>
    </div>
  `).join('');
}

async function refreshEventCount() {
  const el = document.getElementById('researchEventCount');
  if (!el) return;
  try {
    const count = await logger.count();
    el.textContent = `DecisionEvent ${count}件`;
  } catch {
    el.textContent = 'DecisionEvent 利用不可';
  }
}

function exportFilename(ext) {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  return `voicetrader-research-${stamp}.${ext}`;
}

async function exportJson() {
  const button = document.getElementById('exportResearchJson');
  if (button) button.disabled = true;
  try {
    const events = await logger.listAll();
    const text = buildResearchJson({
      events,
      baselineEvaluation: compactBaselineForExport(latestBaseline),
      dataMeta: latestDataMeta,
    });
    downloadResearchText({
      filename: exportFilename('json'),
      text,
      mimeType: 'application/json;charset=utf-8',
    });
  } finally {
    if (button) button.disabled = false;
    refreshEventCount();
  }
}

async function exportCsv() {
  const button = document.getElementById('exportResearchCsv');
  if (button) button.disabled = true;
  try {
    const events = await logger.listAll();
    downloadResearchText({
      filename: exportFilename('csv'),
      text: researchEventsToCsv(events),
      mimeType: 'text/csv;charset=utf-8',
    });
  } finally {
    if (button) button.disabled = false;
    refreshEventCount();
  }
}

function evaluateSnapshot(snapshot) {
  if (!snapshot?.series || !snapshot?.meta?.researchEligible) {
    renderBaseline(null, snapshot?.meta || null);
    return false;
  }
  const series = snapshot.series;
  const endIndex = series.length - 1;
  const engine = new ShadowEngine({ seriesProvider: () => series });
  const execution = new ExecutionEngine({
    random: () => 0.5,
    analyze: () => engine.analyze('BTCUSD', endIndex),
  });
  latestBaseline = runBaselineSuite({
    series,
    endIndex,
    estimatedRoundTripCostBps: execution.estimateRoundTripCostBps('BTCUSD'),
    dataSignature: snapshot.meta.signature,
    instrument: 'BTCUSD',
    timeframeHours: 4,
  });
  latestDataMeta = { ...snapshot.meta };
  renderBaseline(latestBaseline, latestDataMeta);
  return true;
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
  renderBaseline(null, null);
}

export function setupResearchEvaluationUI() {
  if (initialized) return;
  initialized = true;
  ensureStylesheet();
  insertCard();
  document.title = 'VoiceTrader Demo v0.5 Research Evaluation';
  const footer = document.querySelector('.app-footer');
  if (footer) footer.textContent = 'VoiceTrader v0.5 Research Evaluation — デモ研究用。Baselineは同一履歴上の対照評価であり、実際の投資判断には使用しないでください。';
  document.getElementById('exportResearchJson')?.addEventListener('click', exportJson);
  document.getElementById('exportResearchCsv')?.addEventListener('click', exportCsv);
  refreshEventCount();
  setInterval(refreshEventCount, 2500);
  waitForMarketSnapshot();
}
