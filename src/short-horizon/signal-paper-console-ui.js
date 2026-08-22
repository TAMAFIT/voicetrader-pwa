import { fetchShortHorizonSignalPaperSnapshot } from './signal-paper-console-remote.js';

export const SHORT_HORIZON_SIGNAL_PAPER_CONSOLE_UI_VERSION = 'short-horizon-signal-paper-console-ui-v1';

let initialized = false;
let refreshTimer = null;
const REFRESH_MS = 5 * 60 * 1000;

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function fmtTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Date(n).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function fmtPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3) : '—';
}

function fmtBps(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(3)} bp`;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-short-horizon-console-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './short-horizon-signal-paper-console.css';
  link.dataset.shortHorizonConsoleStyle = 'true';
  document.head.appendChild(link);
}

function template() {
  return `
    <section id="shortHorizonSignalPaperConsole" class="short-horizon-console card" aria-labelledby="shortHorizonConsoleTitle">
      <div class="short-horizon-console-head">
        <div>
          <div class="section-kicker">Short-Horizon Live Evidence</div>
          <h2 id="shortHorizonConsoleTitle">USDJPY Signal / GMO Paper Console</h2>
          <p>凍結Human Canonの最新観測、GMO公開bid/ask、side-correct Paper証拠をread-onlyで表示します。</p>
        </div>
        <div class="short-horizon-console-actions">
          <span id="shortHorizonConsoleStatus" class="short-horizon-console-status loading">LOADING</span>
          <button id="shortHorizonConsoleRefresh" type="button">更新</button>
        </div>
      </div>

      <div id="shortHorizonCurrentState" class="short-horizon-current-state"></div>

      <div class="short-horizon-console-grid">
        <div class="short-horizon-panel">
          <div class="short-horizon-panel-title"><strong>Human Canon</strong><span>Last recorded / FROZEN</span></div>
          <div id="shortHorizonSignalCards" class="short-horizon-signal-cards"></div>
        </div>
        <div class="short-horizon-panel">
          <div class="short-horizon-panel-title"><strong>GMO USDJPY Public Quote</strong><span>not account-specific / no fill</span></div>
          <div id="shortHorizonQuoteCard" class="short-horizon-quote-card"></div>
        </div>
        <div class="short-horizon-panel">
          <div class="short-horizon-panel-title"><strong>Paper Evidence</strong><span>quoted spread embedded</span></div>
          <div id="shortHorizonPaperCard" class="short-horizon-paper-card"></div>
        </div>
      </div>

      <div class="short-horizon-recent">
        <div class="short-horizon-panel-title"><strong>Recent Paper Outcomes</strong><span>SIMULATED_EXECUTED / NO_TRADE</span></div>
        <div id="shortHorizonRecentRows" class="short-horizon-recent-rows"></div>
      </div>

      <div id="shortHorizonScientificNote" class="short-horizon-scientific-note">
        Research only: actual fill未観測、fees/slippage/swap未モデル、actualNetEvAvailable=false。表示結果はHuman Canonの閾値・重み・意思決定には戻しません。
      </div>
    </section>
  `;
}

function insertCard() {
  if (document.getElementById('shortHorizonSignalPaperConsole')) return true;
  const liveForward = document.getElementById('liveForwardCard');
  const researchCard = document.getElementById('researchEvaluationCard');
  const scanner = document.querySelector('.scanner-card');
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template().trim();
  const card = wrapper.firstElementChild;
  if (liveForward?.parentNode) {
    liveForward.parentNode.insertBefore(card, liveForward.nextSibling);
    return true;
  }
  const target = researchCard || scanner;
  if (!target?.parentNode) return false;
  target.parentNode.insertBefore(card, target);
  return true;
}

function signalCard(tf, record, currentStream, currentFx) {
  if (!record) return `<div class="short-horizon-signal-card unavailable"><b>${tf}</b><span>記録なし</span></div>`;
  const decision = record?.decision?.signal || '—';
  const stale = currentFx?.current !== true;
  const currentStatus = currentStream?.status || 'UNKNOWN';
  const reason = currentStream?.reason || currentStream?.freshness?.reason || null;
  return `
    <div class="short-horizon-signal-card ${String(decision).toLowerCase()}">
      <div><b>${tf}</b><strong>${esc(decision)}</strong></div>
      <span>Strength ${Number(record?.decision?.signalStrengthScore || 0).toFixed(1)} / Regime ${esc(record?.decision?.context?.regime || '—')}</span>
      <span>Close ${fmtPrice(record?.market?.close)} / ${esc(record?.timeContext?.sessions?.primarySession || '—')}</span>
      <small>Last recorded ${fmtTime(record?.market?.sourceTimestampMs)}</small>
      <small class="${stale ? 'stale' : 'current'}">Current collector: ${esc(currentStatus)}${reason ? ` / ${esc(reason)}` : ''}${stale ? ' — この過去シグナルを現在シグナルとして扱いません' : ''}</small>
    </div>
  `;
}

function renderRecent(records = []) {
  const host = document.getElementById('shortHorizonRecentRows');
  if (!host) return;
  if (!records.length) {
    host.innerHTML = '<div class="short-horizon-empty">直近Paperファイルを取得できませんでした。</div>';
    return;
  }
  const directional = records.filter(record => record?.status === 'SIMULATED_EXECUTED');
  const prioritized = [...directional, ...records.filter(record => record?.status !== 'SIMULATED_EXECUTED')]
    .filter((record, index, all) => all.findIndex(item => item?.paperId === record?.paperId) === index)
    .slice(0, 8);
  host.innerHTML = prioritized.map(record => {
    const executed = record?.status === 'SIMULATED_EXECUTED';
    const result = record?.result?.quotedRoundTripReturnBps;
    const cls = executed ? (Number(result) >= 0 ? 'positive' : 'negative') : 'neutral';
    return `
      <div class="short-horizon-paper-row">
        <span>${fmtTime(record?.evaluatedAtMs)}</span>
        <b>${Number(record?.researchMarket?.timeframeMinutes || 0)}m → ${Number(record?.horizon?.minutes || 0)}m</b>
        <span class="decision ${String(record?.signal?.decision || '').toLowerCase()}">${esc(record?.signal?.decision || '—')}</span>
        <span>${esc(record?.status || '—')}</span>
        <strong class="${cls}">${executed ? fmtBps(result) : 'NO TRADE'}</strong>
      </div>
    `;
  }).join('');
}

function render(snapshot) {
  const status = document.getElementById('shortHorizonConsoleStatus');
  const current = document.getElementById('shortHorizonCurrentState');
  const signals = document.getElementById('shortHorizonSignalCards');
  const quote = document.getElementById('shortHorizonQuoteCard');
  const paper = document.getElementById('shortHorizonPaperCard');
  if (!status || !current || !signals || !quote || !paper) return;

  const currentFx = snapshot.currentFx;
  const latestQuote = snapshot.quoteManifest?.lastRun?.captured || {};
  const quoteArchive = snapshot.quoteManifest?.archive || {};
  const paperArchive = snapshot.paperManifest?.archive || {};
  const paperRun = snapshot.paperManifest?.lastRun?.aggregate || {};
  const quoteOpen = latestQuote.marketStatus === 'OPEN';

  if (currentFx?.current && quoteOpen) {
    status.className = 'short-horizon-console-status live';
    status.textContent = 'CURRENT';
  } else if (!quoteOpen || currentFx?.current !== true) {
    status.className = 'short-horizon-console-status safe';
    status.textContent = quoteOpen ? 'NO CURRENT FX SIGNAL' : 'MARKET CLOSED / SAFE';
  }

  current.className = `short-horizon-current-state ${currentFx?.current ? 'current' : 'safe'}`;
  current.innerHTML = currentFx?.current
    ? `<strong>Current USDJPY collector: FRESH</strong><span>1m/5mとも今回runでprospective signalを記録しています。</span>`
    : `<strong>Current USDJPY collector: NO CURRENT SIGNAL</strong><span>${esc(currentFx?.reason || 'not current')}。最後の記録は参照できますが、現在シグナルとしては使用しません。</span>`;

  signals.innerHTML = [
    signalCard('1m', snapshot.latestSignals?.['1m'], currentFx?.streams?.['1m'], currentFx),
    signalCard('5m', snapshot.latestSignals?.['5m'], currentFx?.streams?.['5m'], currentFx),
  ].join('');

  quote.innerHTML = `
    <div class="short-horizon-kpi-pair"><span><small>Bid</small><b>${fmtPrice(latestQuote.bid)}</b></span><span><small>Ask</small><b>${fmtPrice(latestQuote.ask)}</b></span></div>
    <div class="short-horizon-kpi-pair"><span><small>Observed spread</small><b>${fmtBps(latestQuote.spreadBps)}</b></span><span><small>Market</small><b>${esc(latestQuote.marketStatus || '—')}</b></span></div>
    <small>Quotes ${Number(quoteArchive.recordCount || 0)} / OPEN ${Number(quoteArchive.openQuoteCount || 0)} / duplicates ${Number(quoteArchive.duplicateQuoteIdCount || 0)}</small>
    <small>Latest source ${fmtTime(latestQuote.sourceTimestampMs)}</small>
  `;

  const directional = Number(paperArchive.directionalCount || 0);
  const paperMean = directional > 0 ? fmtBps(paperArchive.meanQuotedRoundTripReturnBps) : '—';
  paper.innerHTML = `
    <div class="short-horizon-paper-kpis">
      <span><small>Records</small><b>${Number(paperArchive.recordCount || 0)}</b></span>
      <span><small>Directional</small><b>${directional}</b></span>
      <span><small>WAIT</small><b>${Number(paperArchive.waitCount || 0)}</b></span>
      <span><small>Quoted-spread-only mean</small><b>${paperMean}</b></span>
    </div>
    <div class="short-horizon-pending"><span>Pending entry <b>${Number(paperRun.pendingEntry || 0)}</b></span><span>Pending exit <b>${Number(paperRun.pendingExit || 0)}</b></span></div>
    <small>positive after observed quoted spread only: ${Number(paperArchive.positiveAfterObservedQuotedSpreadOnlyCount || 0)} / directional n=${directional}</small>
    <small>actualNetEvAvailable=false / profitabilityClaim=false</small>
  `;

  renderRecent(snapshot.recentPaperRecords || []);
}

function unavailable(message) {
  const status = document.getElementById('shortHorizonConsoleStatus');
  const current = document.getElementById('shortHorizonCurrentState');
  if (status) {
    status.className = 'short-horizon-console-status blocked';
    status.textContent = 'UNAVAILABLE';
  }
  if (current) {
    current.className = 'short-horizon-current-state blocked';
    current.innerHTML = `<strong>Remote evidence unavailable</strong><span>${esc(message)}</span>`;
  }
}

async function load() {
  const button = document.getElementById('shortHorizonConsoleRefresh');
  if (button) button.disabled = true;
  try {
    const snapshot = await fetchShortHorizonSignalPaperSnapshot();
    render(snapshot);
  } catch (error) {
    unavailable(String(error?.message || error));
  } finally {
    if (button) button.disabled = false;
  }
}

export function setupShortHorizonSignalPaperConsoleUI() {
  if (initialized) return;
  initialized = true;
  ensureStylesheet();
  if (!insertCard()) {
    setTimeout(() => {
      if (insertCard()) setupShortHorizonSignalPaperConsoleUIAfterInsert();
    }, 0);
    return;
  }
  setupShortHorizonSignalPaperConsoleUIAfterInsert();
}

function setupShortHorizonSignalPaperConsoleUIAfterInsert() {
  const button = document.getElementById('shortHorizonConsoleRefresh');
  button?.addEventListener('click', load);
  load();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!document.hidden && navigator.onLine) load();
  }, REFRESH_MS);
}
