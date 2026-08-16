import { getLoadedBTCUSD4H } from '../data/market-data-provider.js';
import { FORWARD_EPOCH } from './forward-epoch.js';
import { ForwardEvidenceStore, buildResumeAfterByStrategy, detectObservedBarGaps } from './forward-evidence-store.js';
import { runProspectiveForwardSnapshot, summarizeForwardTrades } from './forward-demo-runner.js';
import { setLatestForwardDemoEvaluation } from './forward-demo-state.js';

let initialized = false;
const store = new ForwardEvidenceStore();

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

function formatUtcUnix(unix) {
  const number = Number(unix);
  if (!Number.isFinite(number) || number <= 0) return '—';
  return new Date(number * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
}

function ensureStylesheet() {
  if (document.querySelector('link[data-forward-demo-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './forward-demo.css';
  link.dataset.forwardDemoStyle = 'true';
  document.head.appendChild(link);
}

function sectionTemplate() {
  return `
    <div id="forwardDemoSection" class="forward-demo-section" aria-labelledby="forwardDemoTitle">
      <div class="forward-demo-head">
        <div>
          <div class="section-kicker">Prospective Forward Demo</div>
          <h3 id="forwardDemoTitle">凍結後に来た新しい足だけでも残る？</h3>
          <p id="forwardDemoMeta" class="forward-demo-meta">Forward Epochを読み込み中です。</p>
        </div>
        <span id="forwardDemoStatus" class="forward-demo-status pending">凍結済み</span>
      </div>

      <div class="forward-epoch-strip">
        <span><small>Epoch</small><b>${escapeHtml(FORWARD_EPOCH.id)}</b></span>
        <span><small>Freeze</small><b>${escapeHtml(FORWARD_EPOCH.frozenAtJst)}</b></span>
        <span><small>Engine</small><b>${escapeHtml(FORWARD_EPOCH.provenance.shadowEngineVersion)}</b></span>
        <span><small>Exit</small><b>${FORWARD_EPOCH.horizonBars} bars</b></span>
        <span><small>Promotion</small><b>OFF</b></span>
      </div>

      <div class="forward-demo-table" role="table" aria-label="Prospective forward strategy comparison">
        <div class="forward-demo-row forward-demo-header" role="row">
          <span>Strategy</span><span>Forward Return</span><span>PF</span><span>Avg net</span><span>Trades</span><span>Win rate</span><span>Last exit</span>
        </div>
        <div id="forwardDemoRows" class="forward-demo-rows">
          <div class="forward-demo-empty">凍結後の完了済み4H足を待っています。</div>
        </div>
      </div>

      <div id="forwardDemoContinuity" class="forward-demo-continuity"></div>
      <div class="forward-demo-note">
        2026-08-16 23:27 JSTより前の足は指標計算の文脈にだけ使い、Forward P&amp;Lには一切含めません。証拠はこのブラウザへ重複排除して保存します。サイトデータを消すとローカル証拠も消えるため、重要な節目ではJSON Exportを保存してください。Forward成績だけでChampionを自動昇格させることもありません。
      </div>
    </div>
  `;
}

function insertSection() {
  if (document.getElementById('forwardDemoSection')) return true;
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

function renderUnavailable(message = '実市場データが利用できないためForward Demoを停止しています。') {
  setLatestForwardDemoEvaluation(null);
  const rows = document.getElementById('forwardDemoRows');
  const status = document.getElementById('forwardDemoStatus');
  const meta = document.getElementById('forwardDemoMeta');
  if (rows) rows.innerHTML = `<div class="forward-demo-empty">${escapeHtml(message)}</div>`;
  if (status) {
    status.className = 'forward-demo-status unavailable';
    status.textContent = '対象外';
  }
  if (meta) meta.textContent = 'Synthetic fallbackはForward Evidence対象外です。';
}

function renderSummary(summary, archive, snapshot, meta) {
  const rows = document.getElementById('forwardDemoRows');
  const status = document.getElementById('forwardDemoStatus');
  const metaEl = document.getElementById('forwardDemoMeta');
  const continuity = document.getElementById('forwardDemoContinuity');
  if (!rows || !status || !metaEl || !continuity) return;

  const gaps = detectObservedBarGaps(archive.observedBarTimes, FORWARD_EPOCH.timeframeHours);
  const totalTrades = Number(summary.completedProspectiveTrades || 0);
  const bars = Number(summary.observedPostFreezeBars || 0);
  status.className = `forward-demo-status ${totalTrades ? 'collecting' : 'waiting'}`;
  status.textContent = totalTrades ? `${totalTrades} trade evidence` : `${bars} forward bars`;
  metaEl.textContent = `${meta?.label || 'BTC/USD 4H'} / Freeze ${FORWARD_EPOCH.frozenAtJst} / 観測 ${bars} bars / 現在signature ${snapshot?.dataSignature || '—'}`;

  rows.innerHTML = summary.results.map(strategy => {
    const champion = strategy.role === 'champion';
    return `
      <div class="forward-demo-row ${champion ? 'champion' : ''}" role="row">
        <span class="forward-demo-name">${escapeHtml(strategy.label)}<small>${champion ? 'FROZEN' : 'SHADOW'}</small></span>
        <span class="forward-demo-return ${strategy.returnPct > 0 ? 'positive' : strategy.returnPct < 0 ? 'negative' : ''}">${formatMetric(strategy.returnPct, '%', { signed: true })}</span>
        <span>${formatPf(strategy.profitFactor)}</span>
        <span>${formatMetric(strategy.avgNetBps, 'bp', { signed: true })}</span>
        <span>${strategy.trades}</span>
        <span>${formatMetric(strategy.winRatePct, '%')}</span>
        <span>${formatUtcUnix(strategy.lastExitTime)}</span>
      </div>
    `;
  }).join('');

  continuity.innerHTML = gaps.length
    ? `<span class="continuity-warning">観測履歴に ${gaps.length} 個の時間ギャップがあります。長期間アプリを開かなかった場合、完全な連続Forward証拠とは扱いません。</span>`
    : `<span class="continuity-ok">観測済みForward足の時間連続性：${bars > 1 ? 'OK' : '判定待ち'}</span>`;
}

function evaluateSnapshot(snapshot) {
  if (!snapshot?.series || !snapshot?.meta?.researchEligible) {
    renderUnavailable();
    return false;
  }

  const archiveBefore = store.load();
  const resumeAfterByStrategy = buildResumeAfterByStrategy(archiveBefore);
  const run = runProspectiveForwardSnapshot({
    series: snapshot.series,
    dataSignature: snapshot.meta.signature,
    instrument: 'BTCUSD',
    timeframeHours: 4,
    resumeAfterByStrategy,
  });
  if (run.status === 'blocked') {
    renderUnavailable(`Frozen runtime不一致のためForward Evidenceを停止しました: ${(run.runtimeErrors || []).join(', ')}`);
    return false;
  }
  if (run.status !== 'complete') {
    renderUnavailable('Forward Demoの計算に必要な市場履歴が不足しています。');
    return false;
  }

  const archive = store.merge(run);
  const summary = summarizeForwardTrades({
    trades: archive.trades,
    observedBarTimes: archive.observedBarTimes,
  });
  const exportPayload = {
    ...summary,
    epoch: run.epoch,
    archive: {
      version: archive.version,
      epochId: archive.epochId,
      createdAt: archive.createdAt,
      updatedAt: archive.updatedAt,
      dataSignatures: archive.dataSignatures,
      observedBarTimes: archive.observedBarTimes,
      trades: archive.trades,
      continuityGaps: detectObservedBarGaps(archive.observedBarTimes, FORWARD_EPOCH.timeframeHours),
    },
    latestSnapshot: {
      dataSignature: run.dataSignature,
      observedAt: run.observedAt,
      observedPostFreezeBars: run.observedPostFreezeBars,
      completedProspectiveTrades: run.completedProspectiveTrades,
      methodology: run.methodology,
    },
  };
  setLatestForwardDemoEvaluation(exportPayload);
  renderSummary(summary, archive, run, snapshot.meta);
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
  renderUnavailable('市場データの読み込み待ちがタイムアウトしました。');
}

export function setupForwardDemoUI() {
  if (initialized) return;
  initialized = true;
  ensureStylesheet();
  if (!insertSection()) {
    setTimeout(() => {
      if (insertSection()) waitForMarketSnapshot();
    }, 0);
    return;
  }
  document.title = 'VoiceTrader Demo v0.9 Forward Epoch';
  const footer = document.querySelector('.app-footer');
  if (footer) footer.textContent = 'VoiceTrader v0.9 Research Evaluation — Forward Demoは凍結後の新規4H足のみを証拠化し、自動昇格には使用しません。';
  waitForMarketSnapshot();
}
