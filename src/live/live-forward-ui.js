import { getLoadedBTCUSD4H, loadBTCUSD4H } from '../data/market-data-provider.js';
import { FORWARD_EPOCH } from '../research/forward-epoch.js';
import { processLiveForwardSnapshot, summarizeLiveForwardState } from './live-forward-paper.js';
import { LiveForwardStore } from './live-forward-store.js';

export const LIVE_FORWARD_POLL_MS = 2 * 60 * 1000;

let initialized = false;
let pollTimer = null;
let pollInFlight = false;
let lastPollAttemptAt = null;
const store = new LiveForwardStore();

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

function fmtUnix(unix) {
  const number = Number(unix);
  if (!Number.isFinite(number) || number <= 0) return '—';
  return new Date(number * 1000).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function fmtMs(ms) {
  const number = Number(ms);
  if (!Number.isFinite(number) || number <= 0) return '—';
  return new Date(number).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function fmtPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';
}

function fmtSigned(value, suffix = '') {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number > 0 ? '+' : ''}${number.toFixed(Math.abs(number) >= 100 ? 0 : 2)}${suffix}`;
}

function ensureStylesheet() {
  if (document.querySelector('link[data-live-forward-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './live-forward.css';
  link.dataset.liveForwardStyle = 'true';
  document.head.appendChild(link);
}

function template() {
  return `
    <section id="liveForwardCard" class="live-forward-card card" aria-labelledby="liveForwardTitle">
      <div class="live-forward-head">
        <div>
          <div class="section-kicker">Live Forward Paper Trading</div>
          <h2 id="liveForwardTitle">実市場の新しい4H足で自動デモ売買</h2>
          <p id="liveForwardMeta" class="live-forward-meta">ブラウザOpen中は2分ごとにKrakenを確認し、確定済みの新しい4H足だけを1回処理します。</p>
        </div>
        <div class="live-forward-actions">
          <span id="liveForwardStatus" class="live-forward-status syncing">STARTING</span>
          <button id="liveForwardSyncBtn" class="live-forward-sync" type="button">今すぐ同期</button>
        </div>
      </div>

      <div class="live-forward-kpis">
        <div><small>Paper Equity</small><b id="liveForwardEquity">100,000</b><span id="liveForwardReturn">±0.00%</span></div>
        <div><small>Position</small><b id="liveForwardPosition">FLAT</b><span id="liveForwardPositionSub">新足待ち</span></div>
        <div><small>Auto Trades</small><b id="liveForwardTrades">0</b><span id="liveForwardWinRate">勝率 —</span></div>
        <div><small>Processed 4H</small><b id="liveForwardCandles">0</b><span id="liveForwardLastCandle">最終 —</span></div>
      </div>

      <div class="live-forward-runtime">
        <span><small>Last poll</small><b id="liveForwardLastPoll">—</b></span>
        <span><small>Next expected close</small><b id="liveForwardNextClose">—</b></span>
        <span><small>Epoch</small><b>${escapeHtml(FORWARD_EPOCH.id)}</b></span>
        <span><small>Strategy</small><b>champion-001 / FROZEN</b></span>
        <span><small>Exit</small><b>${FORWARD_EPOCH.horizonBars} closed bars</b></span>
      </div>

      <div class="live-forward-recent">
        <div class="live-forward-recent-head"><strong>最近の自動決済</strong><span>expected spread / fee / slippage 込み</span></div>
        <div id="liveForwardRecentRows" class="live-forward-recent-rows"><div class="live-forward-empty">まだ自動決済はありません。</div></div>
      </div>

      <div id="liveForwardNotice" class="live-forward-notice">
        これは実注文を送らないPaper Tradingです。ブラウザを閉じている間は実行されませんが、次回起動時にKrakenの保持範囲内なら未処理の確定4H足を時系列順にcatch-upします。Forward Evidenceとは別保存で、研究証拠を変更しません。
      </div>
    </section>
  `;
}

function insertCard() {
  if (document.getElementById('liveForwardCard')) return true;
  const researchCard = document.getElementById('researchEvaluationCard');
  const scanner = document.querySelector('.scanner-card');
  const target = researchCard || scanner;
  if (!target?.parentNode) return false;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = template().trim();
  target.parentNode.insertBefore(wrapper.firstElementChild, target);
  return true;
}

function setStatus(kind, text) {
  const status = document.getElementById('liveForwardStatus');
  if (!status) return;
  status.className = `live-forward-status ${kind}`;
  status.textContent = text;
}

function renderRecent(trades = []) {
  const rows = document.getElementById('liveForwardRecentRows');
  if (!rows) return;
  if (!trades.length) {
    rows.innerHTML = '<div class="live-forward-empty">まだ自動決済はありません。</div>';
    return;
  }
  rows.innerHTML = trades.map(trade => `
    <div class="live-forward-trade-row">
      <span>${fmtUnix(trade.exitTime)}</span>
      <b class="${trade.side === 'LONG' ? 'long' : 'short'}">${escapeHtml(trade.side)}</b>
      <span>${fmtPrice(trade.entryPrice)} → ${fmtPrice(trade.exitPrice)}</span>
      <strong class="${Number(trade.netReturnBps) >= 0 ? 'positive' : 'negative'}">${fmtSigned(trade.netReturnBps, 'bp')}</strong>
    </div>
  `).join('');
}

function renderState(result, snapshot = null) {
  const state = result?.state || store.load();
  const latestPrice = Number(snapshot?.series?.at(-1)?.c);
  const summary = summarizeLiveForwardState(state, latestPrice);
  const equity = document.getElementById('liveForwardEquity');
  const ret = document.getElementById('liveForwardReturn');
  const pos = document.getElementById('liveForwardPosition');
  const posSub = document.getElementById('liveForwardPositionSub');
  const trades = document.getElementById('liveForwardTrades');
  const winRate = document.getElementById('liveForwardWinRate');
  const candles = document.getElementById('liveForwardCandles');
  const lastCandle = document.getElementById('liveForwardLastCandle');
  const lastPoll = document.getElementById('liveForwardLastPoll');
  const nextClose = document.getElementById('liveForwardNextClose');
  const meta = document.getElementById('liveForwardMeta');
  const notice = document.getElementById('liveForwardNotice');

  if (equity) equity.textContent = Number(summary.equity || 0).toLocaleString('ja-JP', { maximumFractionDigits: 0 });
  if (ret) {
    ret.textContent = fmtSigned(summary.realizedReturnPct, '%');
    ret.className = Number(summary.realizedReturnPct) > 0 ? 'positive' : Number(summary.realizedReturnPct) < 0 ? 'negative' : '';
  }
  if (pos) pos.textContent = summary.position ? summary.position.side : 'FLAT';
  if (posSub) {
    posSub.textContent = summary.position
      ? `${fmtPrice(summary.position.entryPrice)} / exit ${fmtUnix(summary.position.dueExitTime)} / unrealized ${fmtSigned(summary.position.unrealizedGrossBps, 'bp')}`
      : '新しい確定4H足のChampion判断を待機';
  }
  if (trades) trades.textContent = String(summary.trades);
  if (winRate) winRate.textContent = summary.trades ? `勝率 ${summary.winRatePct}%` : '勝率 —';
  if (candles) candles.textContent = String(summary.processedCandles);
  if (lastCandle) lastCandle.textContent = `最終 ${fmtUnix(summary.lastProcessedCandleTime)}`;
  if (lastPoll) lastPoll.textContent = fmtMs(lastPollAttemptAt || state.lastPollAt);
  const nextOpen = Number(result?.nextExpectedCandleTime || (summary.lastProcessedCandleTime ? summary.lastProcessedCandleTime + 4 * 60 * 60 : 0));
  if (nextClose) nextClose.textContent = nextOpen ? fmtUnix(nextOpen + 4 * 60 * 60) : '—';
  if (meta) meta.textContent = `${snapshot?.meta?.label || 'BTC/USD 4H'} / 2分poll / 今回 ${Number(result?.processedNow || 0)} candles処理 / signature ${snapshot?.meta?.signature || state.lastDataSignature || '—'}`;

  if (result?.status === 'blocked') {
    setStatus('blocked', 'BLOCKED');
    if (notice) notice.textContent = `自動売買を停止しました: ${result.reason}${result.runtimeErrors?.length ? ` / ${result.runtimeErrors.join(', ')}` : ''}。実注文は送信されていません。`;
  } else if (result?.status === 'running') {
    setStatus('running', 'RUNNING');
    if (notice) notice.textContent = `新しい確定4H足を${result.processedNow}本処理しました。Paper Tradingのみで、実注文・Forward Evidence・Champion定義には触れていません。`;
  } else {
    setStatus('waiting', 'WAITING');
    if (notice) notice.textContent = '新しい確定4H足を待っています。ブラウザOpen中は2分ごとに自動同期し、同じ足は二重処理しません。';
  }
  renderRecent(summary.recentTrades);
}

function processSnapshot(snapshot) {
  const previous = store.load();
  const result = processLiveForwardSnapshot({
    series: snapshot?.series,
    meta: snapshot?.meta,
    state: previous,
  });
  if (result.state && result.status !== 'blocked') {
    store.save(result.state);
  }
  renderState(result, snapshot);
  return result;
}

async function pollNow() {
  if (pollInFlight) return;
  pollInFlight = true;
  lastPollAttemptAt = Date.now();
  setStatus('syncing', 'SYNCING');
  try {
    const snapshot = await loadBTCUSD4H({ timeoutMs: 6500 });
    processSnapshot(snapshot);
  } catch (error) {
    renderState({ status: 'blocked', reason: `poll-error:${String(error?.message || error)}`, state: store.load() }, getLoadedBTCUSD4H());
  } finally {
    pollInFlight = false;
  }
}

async function bootstrap() {
  for (let attempt = 0; attempt < 32; attempt++) {
    const snapshot = getLoadedBTCUSD4H();
    if (snapshot?.series && snapshot?.meta) {
      lastPollAttemptAt = Date.now();
      processSnapshot(snapshot);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!getLoadedBTCUSD4H()?.series) await pollNow();
  pollTimer = window.setInterval(pollNow, LIVE_FORWARD_POLL_MS);
}

export function setupLiveForwardTradingUI() {
  if (initialized) return;
  initialized = true;
  ensureStylesheet();
  if (!insertCard()) {
    setTimeout(() => {
      if (insertCard()) bootstrap();
    }, 0);
    return;
  }
  document.title = 'VoiceTrader Demo v0.10 Live Forward';
  const footer = document.querySelector('.app-footer');
  if (footer) footer.textContent = 'VoiceTrader v0.10 Live Forward — 実市場4HをブラウザOpen中に自動Paper Trading。実注文は送信しません。';
  document.getElementById('liveForwardSyncBtn')?.addEventListener('click', pollNow);
  window.addEventListener('online', pollNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pollNow();
  });
  window.addEventListener('pagehide', () => {
    if (pollTimer) window.clearInterval(pollTimer);
  }, { once: true });
  bootstrap();
}
