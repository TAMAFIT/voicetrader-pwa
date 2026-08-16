import { INITIAL_CAPITAL, instruments, knowledge } from './config.js';
import { sma } from './engine/indicators.js';
import { ShadowEngine } from './engine/shadow-engine.js';
import { ExecutionEngine } from './engine/execution-engine.js';
import { createAIProvider } from './engine/ai-provider.js';
import { loadBTCUSD4H, syntheticMeta } from './data/market-data-provider.js';
import { DecisionEventLogger, buildDecisionEvent } from './research/decision-event-log.js';
import { setupPWA } from './pwa.js';

function makeRng(initialSeed) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Market generation and execution randomness are intentionally isolated.
const marketRand = makeRng(20260816);
const executionRand = makeRng(20260817);
const gauss = () => {
  let u = 0; let v = 0;
  while (!u) u = marketRand();
  while (!v) v = marketRand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const money = n => `${Math.round(n).toLocaleString('ja-JP')}円`;
const pct = n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const $ = id => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const setHTML = (id, value) => { const el = $(id); if (el) el.innerHTML = value; };
const SYNTHETIC_START = Math.floor(Date.UTC(2026, 4, 1, 0, 0, 0) / 1000);
const FOUR_HOURS = 4 * 60 * 60;

const series = {};
const seriesMeta = {};

function makeSeries(key, n = 520) {
  const m = instruments[key];
  let p = m.base;
  const out = [];
  let regime = 0;
  for (let i = 0; i < n; i++) {
    if (i % 70 === 0) regime = (marketRand() - .48) * m.vol * .35;
    const cyc = Math.sin(i / 31) * m.vol * .11;
    const ret = regime + cyc + gauss() * m.vol * .48;
    const o = p;
    const c = Math.max(.00001, p * (1 + ret));
    const range = Math.abs(gauss()) * m.vol * .7 + m.vol * .2;
    const h = Math.max(o, c) * (1 + range * .45);
    const l = Math.min(o, c) * (1 - range * .45);
    out.push({
      o, h, l, c,
      t: SYNTHETIC_START + i * FOUR_HOURS,
      volume: Math.round(100 + marketRand() * 900),
    });
    p = c;
  }
  return out;
}

Object.keys(instruments).forEach((key) => {
  series[key] = makeSeries(key);
  seriesMeta[key] = syntheticMeta(key);
});

const shadowEngine = new ShadowEngine({ seriesProvider: key => series[key] });
const aiProvider = createAIProvider('rule-based');
const researchLog = new DecisionEventLogger({ strategyVersion: 'champion-001' });

let state = {
  market: 'crypto',
  instrument: 'BTCUSD',
  timeframe: 4,
  mode: 'battle',
  idx: 120,
  playing: false,
  dataSourceId: seriesMeta.BTCUSD.id,
  dataSignature: seriesMeta.BTCUSD.signature,
  human: { cash: INITIAL_CAPITAL, position: null, trades: 0 },
  ai: { cash: INITIAL_CAPITAL, positions: {}, trades: 0 },
  history: [],
  markers: [],
};

const STORAGE_KEY = 'voicetrader-v0.4-session';

function analyze(key, idx = state.idx) { return shadowEngine.analyze(key, idx); }
const execution = new ExecutionEngine({ random: executionRand, analyze: key => analyze(key) });

function currentPrice(key) { return series[key][state.idx].c; }
function formatPrice(key, p) {
  const m = instruments[key];
  return m.decimals === 0 ? `${Math.round(p).toLocaleString('ja-JP')}` : p.toFixed(m.decimals);
}

function persist() {
  try {
    const snapshot = {
      ...state,
      playing: false,
      cursorTime: series[state.instrument]?.[state.idx]?.t || null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {}
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || !instruments[saved.instrument]) return;
    state = { ...state, ...saved, playing: false };
  } catch {}
}

function resetPortfoliosAndReplayCursor() {
  const maxIndex = Math.max(120, series.BTCUSD.length - 121);
  state.idx = Math.min(maxIndex, series.BTCUSD.length - 2);
  state.human = { cash: INITIAL_CAPITAL, position: null, trades: 0 };
  state.ai = { cash: INITIAL_CAPITAL, positions: {}, trades: 0 };
  state.history = [];
  state.markers = [];
}

async function hydrateRealBTCUSD4H() {
  const badge = $('dataSourceBadge');
  if (badge) {
    badge.textContent = '実データ取得中';
    badge.className = 'data-source-badge loading';
  }

  const loaded = await loadBTCUSD4H();
  if (!loaded.series || !loaded.meta) {
    seriesMeta.BTCUSD = { ...syntheticMeta('BTCUSD'), label: 'Synthetic fallback' };
    state.dataSourceId = seriesMeta.BTCUSD.id;
    state.dataSignature = seriesMeta.BTCUSD.signature;
    syncTimeframeControls();
    render();
    return;
  }

  const previousSignature = state.dataSignature;
  series.BTCUSD = loaded.series.slice(-520);
  seriesMeta.BTCUSD = loaded.meta;
  state.instrument = 'BTCUSD';
  state.market = 'crypto';
  state.timeframe = 4;
  state.dataSourceId = loaded.meta.id;
  state.dataSignature = loaded.meta.signature;

  if (previousSignature !== loaded.meta.signature) resetPortfoliosAndReplayCursor();
  else state.idx = Math.min(Math.max(60, state.idx), series.BTCUSD.length - 2);

  syncMarketTabs();
  populate();
  syncTimeframeControls();
  renderHistory();
  render();
  persist();
}

function humanTrade(side) {
  const key = state.instrument;
  const p = currentPrice(key);
  const h = state.human;
  if (side === 'WAIT') {
    addHistory('あなた', 'WAIT', instruments[key].shortLabel, '今回は何もしない', '—');
    return;
  }
  if (h.position) {
    closeHuman('手動決済');
    if (h.position) return;
  }
  const entry = execution.fillPrice(key, side, p);
  const notional = h.cash * .25;
  const qty = notional / entry;
  const f = execution.fee(key, notional);
  h.cash -= f;
  h.position = { key, side, entry, qty, notional, opened: state.idx };
  h.trades++;
  state.markers.push({ idx: state.idx, key, side, who: 'human' });
  addHistory('あなた', side, instruments[key].shortLabel, `価格 ${formatPrice(key, entry)} でエントリー`, `手数料 -${money(f)}`);
}

function closeHuman(reason = '決済') {
  const h = state.human;
  const pos = h.position;
  if (!pos) return;
  const exit = execution.fillPrice(pos.key, pos.side === 'BUY' ? 'SELL' : 'BUY', currentPrice(pos.key));
  const pnl = (exit - pos.entry) * pos.qty * (pos.side === 'BUY' ? 1 : -1);
  const f = execution.fee(pos.key, pos.qty * exit);
  h.cash += pnl - f;
  h.position = null;
  addHistory('あなた', reason, instruments[pos.key].shortLabel, `${pos.side === 'BUY' ? '買い' : '売り'}ポジションを決済`, `${pnl - f >= 0 ? '+' : ''}${money(pnl - f)}`, (pnl - f) >= 0 ? 'good' : 'bad');
}

function humanEquity() {
  const h = state.human;
  if (!h.position) return h.cash;
  const pos = h.position;
  return h.cash + (currentPrice(pos.key) - pos.entry) * pos.qty * (pos.side === 'BUY' ? 1 : -1);
}

function aiEquity() {
  let eq = state.ai.cash;
  Object.values(state.ai.positions).forEach((pos) => {
    eq += (currentPrice(pos.key) - pos.entry) * pos.qty * (pos.side === 'BUY' ? 1 : -1);
  });
  return eq;
}

function recordResearchDecision(key, analysis) {
  const meta = seriesMeta[key];
  if (!meta?.researchEligible || key !== 'BTCUSD' || state.timeframe !== 4) return;
  const candle = series[key]?.[state.idx];
  if (!candle) return;
  const event = buildDecisionEvent({
    key,
    timeframe: state.timeframe,
    idx: state.idx,
    candle,
    analysis,
    dataMeta: meta,
    estimatedRoundTripCostBps: execution.estimateRoundTripCostBps(key),
    aiPosition: state.ai.positions[key] || null,
  });
  researchLog.record(event).catch(() => {});
}

function shadowTick() {
  const scored = shadowEngine.scan(Object.keys(instruments), state.idx);
  const btc = scored.find(item => item.key === 'BTCUSD');
  if (btc) recordResearchDecision('BTCUSD', btc.a);

  for (const [key, pos] of Object.entries(state.ai.positions)) {
    const a = analyze(key);
    const move = (currentPrice(key) - pos.entry) / pos.entry * (pos.side === 'BUY' ? 1 : -1);
    const opposite = (pos.side === 'BUY' && a.action === 'SELL') || (pos.side === 'SELL' && a.action === 'BUY');
    if (move > 0.018 || move < -0.010 || opposite || state.idx - pos.opened > 24) closeAI(key, move > 0 ? '利確' : '決済');
  }

  if (Object.keys(state.ai.positions).length < 2) {
    const candidate = scored.find(x => x.a.action !== 'WAIT' && !state.ai.positions[x.key] && x.a.decisionScore > 46);
    if (candidate) openAI(candidate.key, candidate.a.action);
  }
  return scored;
}

function openAI(key, side) {
  const ai = state.ai;
  const mid = currentPrice(key);
  const entry = execution.fillPrice(key, side, mid);
  const equity = aiEquity();
  const notional = Math.min(equity * .18, ai.cash * .35);
  if (notional < 1000) return;
  const qty = notional / entry;
  const f = execution.fee(key, notional);
  ai.cash -= f;
  ai.positions[key] = { key, side, entry, qty, opened: state.idx };
  ai.trades++;
  state.markers.push({ idx: state.idx, key, side, who: 'ai' });
  addHistory('影AI', side, instruments[key].shortLabel, '自動エントリー', `手数料 -${money(f)}`);
}

function closeAI(key, reason) {
  const ai = state.ai;
  const pos = ai.positions[key];
  if (!pos) return;
  const exit = execution.fillPrice(key, pos.side === 'BUY' ? 'SELL' : 'BUY', currentPrice(pos.key));
  const pnl = (exit - pos.entry) * pos.qty * (pos.side === 'BUY' ? 1 : -1);
  const f = execution.fee(pos.key, pos.qty * exit);
  ai.cash += pnl - f;
  delete ai.positions[key];
  addHistory('影AI', reason, instruments[pos.key].shortLabel, 'ポジションを決済', `${pnl - f >= 0 ? '+' : ''}${money(pnl - f)}`, (pnl - f) >= 0 ? 'good' : 'bad');
}

function addHistory(who, action, symbol, detail, result, cls = '') {
  state.history.unshift({
    idx: state.idx,
    candleTime: series[state.instrument]?.[state.idx]?.t || null,
    who, action, symbol, detail, result, cls,
  });
  state.history = state.history.slice(0, 18);
  renderHistory();
  persist();
}

function updateRunState() {
  const badge = $('runStateBadge');
  if (!badge) return;
  badge.textContent = state.playing ? '● デモ実行中' : '● 停止中';
  badge.style.background = state.playing ? '#edf8f0' : '#f3f5f8';
  badge.style.color = state.playing ? '#148548' : '#677489';
}

function step() {
  const maxIndex = Math.min(...Object.values(series).map(x => x.length)) - 2;
  if (state.idx >= maxIndex) {
    state.playing = false;
    clearInterval(timer);
    updateRunState();
    return;
  }
  state.idx++;
  if (state.human.position && state.idx - state.human.position.opened > 30) closeHuman('時間決済');
  shadowTick();
  render();
  persist();
}

let timer = null;
function togglePlay() {
  state.playing = !state.playing;
  setText('playBtn', state.playing ? '⏸ 一時停止' : '▶ デモ開始');
  if (state.playing) {
    clearInterval(timer);
    timer = setInterval(() => { if (state.playing) step(); }, 650);
  } else {
    clearInterval(timer);
  }
  updateRunState();
  persist();
}

const canvas = $('chartCanvas');
const ctx = canvas.getContext('2d');

function barLabel(bar, includeTime = false) {
  const dt = new Date(Number(bar?.t || 0) * 1000);
  if (Number.isNaN(dt.getTime())) return '';
  const date = `${dt.getMonth() + 1}/${dt.getDate()}`;
  if (!includeTime) return date;
  return `${date} ${String(dt.getHours()).padStart(2, '0')}:00`;
}

function drawChart() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = 430;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const arr = series[state.instrument];
  const end = state.idx;
  const start = Math.max(0, end - 70);
  const data = arr.slice(start, end + 1);
  if (!data.length) return;
  const pad = { l: 24, r: 68, t: 18, b: 28 };
  const W = cssW - pad.l - pad.r;
  const H = cssH - pad.t - pad.b;
  const values = data.flatMap(x => [x.h, x.l]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const y = p => pad.t + (max - p) / range * H;
  const x = i => pad.l + i / Math.max(1, data.length - 1) * W;

  ctx.strokeStyle = '#e7edf5';
  ctx.lineWidth = 1;
  ctx.font = '11px system-ui';
  ctx.fillStyle = '#7d8aa0';
  for (let i = 0; i < 5; i++) {
    const yy = pad.t + i * H / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(cssW - pad.r, yy);
    ctx.stroke();
    const val = max - i * range / 4;
    ctx.fillText(formatPrice(state.instrument, val), cssW - pad.r + 8, yy + 4);
  }

  function line(len, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let begun = false;
    for (let i = 0; i < data.length; i++) {
      const global = start + i;
      const v = sma(arr, len, global);
      if (v) {
        if (!begun) { ctx.moveTo(x(i), y(v)); begun = true; }
        else ctx.lineTo(x(i), y(v));
      }
    }
    ctx.stroke();
  }
  line(12, '#2f73e0');
  line(34, '#ff5e5e');

  const cw = Math.max(3, W / data.length * .55);
  data.forEach((bar, i) => {
    const xx = x(i);
    const up = bar.c >= bar.o;
    const col = up ? '#1fa56b' : '#db5a67';
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(xx, y(bar.h));
    ctx.lineTo(xx, y(bar.l));
    ctx.stroke();
    const top = Math.min(y(bar.o), y(bar.c));
    const bh = Math.max(1.2, Math.abs(y(bar.o) - y(bar.c)));
    ctx.fillRect(xx - cw / 2, top, cw, bh);
  });

  const current = data[data.length - 1];
  const currentY = y(current.c);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#7ed09d';
  ctx.beginPath();
  ctx.moveTo(pad.l, currentY);
  ctx.lineTo(cssW - pad.r, currentY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#1fa56b';
  ctx.fillRect(cssW - pad.r + 4, currentY - 11, 58, 22);
  ctx.fillStyle = '#fff';
  ctx.font = '12px system-ui';
  ctx.fillText(formatPrice(state.instrument, current.c), cssW - pad.r + 10, currentY + 4);

  state.markers.filter(m => m.key === state.instrument && m.idx >= start && m.idx <= end).slice(-16).forEach((marker) => {
    const i = marker.idx - start;
    const bar = arr[marker.idx];
    const xx = x(i);
    const yy = marker.side === 'BUY' ? y(bar.l) + 16 : y(bar.h) - 16;
    const sideLabel = marker.side === 'BUY' ? 'BUY' : 'SELL';
    const label = `${marker.who === 'ai' ? '影AI' : 'あなた'} ${sideLabel}`;
    const fill = marker.who === 'ai' ? '#8a5cff' : '#2f73e0';
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(xx, yy - 10);
    ctx.lineTo(xx - 7, yy + 2);
    ctx.lineTo(xx + 7, yy + 2);
    ctx.closePath();
    ctx.fill();
    const pillW = ctx.measureText(label).width + 16;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = fill;
    ctx.lineWidth = 1.5;
    const pillY = yy + 6;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(xx - pillW / 2, pillY, pillW, 26, 8);
    else ctx.rect(xx - pillW / 2, pillY, pillW, 26);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.font = '12px system-ui';
    ctx.fillText(label, xx - pillW / 2 + 8, pillY + 17);
  });

  ctx.fillStyle = '#8c98ab';
  ctx.font = '11px system-ui';
  for (let i = 0; i < 8; i++) {
    const localIdx = Math.floor(i * (data.length - 1) / 7);
    const label = barLabel(data[localIdx], i === 7);
    ctx.fillText(label, x(localIdx) - 10, cssH - 8);
  }
}

function scannerLabel(score) {
  if (score >= 80) return '強い好機';
  if (score >= 65) return '注目';
  if (score >= 45) return '待機';
  return '見送り';
}

function formatEventTime(item) {
  const t = Number(item?.candleTime || 0);
  if (t > 1_000_000_000) {
    const dt = new Date(t * 1000);
    return `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  }
  return `#${item?.idx ?? '-'}`;
}

function updateDataSourceBadge() {
  const badge = $('dataSourceBadge');
  if (!badge) return;
  const meta = seriesMeta[state.instrument] || syntheticMeta(state.instrument);
  badge.textContent = meta.label;
  badge.className = `data-source-badge ${meta.sourceType === 'real' ? 'real' : meta.sourceType === 'cached-real' ? 'cached' : 'synthetic'}`;
  badge.title = meta.researchEligible
    ? `${meta.provider} / research eligible / ${meta.signature}`
    : `${meta.provider} / UI・動作確認用。edge検証には使用しません。`;
}

function syncTimeframeControls() {
  const locked = state.instrument === 'BTCUSD' && Boolean(seriesMeta.BTCUSD?.researchEligible);
  const select = $('timeframeSelect');
  if (locked) state.timeframe = 4;
  if (select) {
    select.value = String(state.timeframe);
    select.disabled = locked;
    select.title = locked ? '実市場Vertical Sliceは現在4時間足のみです。' : '';
  }
  document.querySelectorAll('.tf-btn').forEach((btn) => {
    const value = Number(btn.dataset.value);
    btn.disabled = locked && value !== 4;
    btn.classList.toggle('active', value === state.timeframe);
  });
}

async function render() {
  state.idx = Math.min(state.idx, series[state.instrument].length - 2);
  const a = analyze(state.instrument);
  const m = instruments[state.instrument];
  const prev = series[state.instrument][Math.max(0, state.idx - 1)].c;
  const ch = (a.p / prev - 1) * 100;
  const aiReview = await aiProvider.review({ instrument: state.instrument, timeframe: state.timeframe, analysis: a });

  setText('providerBadge', aiProvider.name);
  setText('chartTitle', m.label);
  setText('priceLabel', formatPrice(state.instrument, a.p));
  const pm = $('priceMove');
  if (pm) {
    pm.textContent = `${ch >= 0 ? '+' : ''}${formatPrice(state.instrument, Math.abs(a.p - prev))} (${pct(ch)})`;
    pm.style.color = ch >= 0 ? 'var(--green)' : 'var(--red)';
  }
  setText('regimeBadge', a.regime);
  updateDataSourceBadge();
  syncTimeframeControls();

  const up = Math.round(a.up);
  setText('directionText', a.dir === 'UP' ? '上がりそう' : '下がりそう');
  setText('directionSub', `上方向スコア ${up} / 下方向 ${100 - up}`);
  setText('confidenceValue', a.conf);
  setText('timingValue', `${a.timing}`);
  setText('riskValue', `${a.risk}`);
  setText('aiComment', aiReview.explanation);

  const directionArrow = $('directionArrow');
  if (directionArrow) {
    directionArrow.textContent = a.dir === 'UP' ? '↗' : '↘';
    directionArrow.style.background = a.dir === 'UP'
      ? 'linear-gradient(180deg,#8bb7ff,#2e6ff2)'
      : 'linear-gradient(180deg,#ffb8b8,#eb3b3b)';
    directionArrow.style.webkitBackgroundClip = 'text';
    directionArrow.style.backgroundClip = 'text';
    directionArrow.style.color = 'transparent';
  }

  const timingBar = $('timingBar');
  if (timingBar) timingBar.style.width = `${a.timing}%`;
  const riskBar = $('riskBar');
  if (riskBar) riskBar.style.width = `${a.risk}%`;
  setText('aiActionText', aiReview.action === 'BUY' ? '買い候補' : aiReview.action === 'SELL' ? '売り候補' : 'まだ待つ');
  setHTML('knowledgeRow', knowledge.map(k => `<span title="${k.id}: ${k.hint}">${k.name}</span>`).join(''));

  const panel = $('signalPanel');
  if (panel) {
    if (state.mode === 'signal' && aiReview.action !== 'WAIT') {
      panel.classList.remove('hidden');
      setText('signalTitle', `AIシグナル：${aiReview.action === 'BUY' ? '買い候補' : '売り候補'}`);
      setText('signalText', `判断スコア ${a.conf}/100・タイミング ${a.timing}点。これは校正済み確率ではありません。`);
    } else {
      panel.classList.add('hidden');
    }
  }

  const human = humanEquity();
  const ai = aiEquity();
  setText('humanEquity', money(human));
  setText('humanReturn', pct((human / INITIAL_CAPITAL - 1) * 100));
  setText('aiEquity', money(ai));
  setText('aiReturn', pct((ai / INITIAL_CAPITAL - 1) * 100));
  setText('humanTrades', `${state.human.trades}`);
  setText('aiTrades', `${state.ai.trades}`);
  setText('aiPositions', `${Object.keys(state.ai.positions).length}`);
  setText('positionBox', state.human.position ? `現在ポジション：${state.human.position.side === 'BUY' ? '買い' : '売り'} / ${instruments[state.human.position.key].shortLabel}` : '現在ポジション：なし');

  const scored = shadowEngine.scan(Object.keys(instruments), state.idx);
  const best = scored[0];
  setHTML('scannerGrid', scored.map((x, i) => `
    <button class="scan-item ${i === 0 ? 'hot' : ''}" data-instrument="${x.key}">
      <div class="scan-rank">
        <span class="rank-circle">${i + 1}</span>
        <span>${i === 0 ? '🔥' : ' '}</span>
      </div>
      <div class="scan-symbol">${instruments[x.key].shortLabel}</div>
      <div class="scan-score-line">
        <span class="scan-score">${x.a.timing}</span>
        <span class="scan-label">${scannerLabel(x.a.timing)}</span>
      </div>
    </button>
  `).join(''));
  const disclosure = seriesMeta.BTCUSD?.researchEligible
    ? 'BTC/USDのみ実市場4H。他3市場はまだSynthetic検証用です。'
    : '現在は全市場Synthetic検証用です。';
  setText('scannerNote', `現在の影AI注目：${instruments[best.key].label}。${disclosure}`);
  document.querySelectorAll('.scan-item').forEach((btn) => btn.addEventListener('click', () => {
    const key = btn.dataset.instrument;
    state.instrument = key;
    state.market = instruments[key].market;
    syncMarketTabs();
    populate();
    syncTimeframeControls();
    render();
    persist();
  }));

  setText('spreadDisplay', `ON (${m.spreadBps.toFixed(1)}bp)`);
  setText('feeDisplay', `ON (${m.feeBps.toFixed(2)}bp)`);
  setText('slippageDisplay', `${execution.estimateSlippageBps(state.instrument).toFixed(2)}bp 推定`);
  setText('latencyDisplay', seriesMeta[state.instrument]?.researchEligible ? 'Replay' : '120ms');
  setText('engineVersion', `Shadow ${a.engineVersion}`);

  updateRunState();
  drawChart();
}

function renderHistory() {
  const el = $('historyRows');
  if (!el) return;
  if (!state.history.length) {
    el.innerHTML = '<div class="history-empty">まだ履歴はありません。デモを開始するとここに記録されます。</div>';
    return;
  }
  el.innerHTML = state.history.map(h => `
    <div class="history-row">
      <span>${formatEventTime(h)}</span>
      <span class="actor">${h.who}</span>
      <span><span class="action-pill">${h.symbol}</span> ${h.action}</span>
      <span>${h.detail}</span>
      <span class="result ${h.cls || ''}">${h.result}</span>
    </div>
  `).join('');
}

function populate() {
  const sel = $('instrumentSelect');
  const list = Object.entries(instruments).filter(([, value]) => value.market === state.market);
  if (!list.some(([key]) => key === state.instrument)) state.instrument = list[0][0];
  sel.innerHTML = list.map(([key, value]) => `<option value="${key}" ${key === state.instrument ? 'selected' : ''}>${value.shortLabel}</option>`).join('');
  sel.value = state.instrument;
}

function syncMarketTabs() {
  document.querySelectorAll('.seg').forEach(b => b.classList.toggle('active', b.dataset.market === state.market));
}

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode === 'battle') {
    setText('actionHeading', 'AIと競争してみる');
    setText('actionDescription', 'AIスコアは見えます。AIは裏で独立して自動売買します。');
  }
  if (mode === 'signal') {
    setText('actionHeading', 'AIの「今だ」を待つ');
    setText('actionDescription', 'シグナルが出たとき、実際に押すかはあなたが決めます。');
  }
  if (mode === 'free') {
    setText('actionHeading', '完全に自分で判断');
    setText('actionDescription', 'AIはスコアだけ表示。売買シグナルは出しません。');
  }
  render();
  persist();
}

function reset() {
  const meta = seriesMeta.BTCUSD;
  state = {
    market: 'crypto',
    instrument: 'BTCUSD',
    timeframe: 4,
    mode: 'battle',
    idx: Math.min(Math.max(120, series.BTCUSD.length - 121), series.BTCUSD.length - 2),
    playing: false,
    dataSourceId: meta.id,
    dataSignature: meta.signature,
    human: { cash: INITIAL_CAPITAL, position: null, trades: 0 },
    ai: { cash: INITIAL_CAPITAL, positions: {}, trades: 0 },
    history: [],
    markers: [],
  };
  clearInterval(timer);
  localStorage.removeItem(STORAGE_KEY);
  setText('playBtn', '▶ デモ開始');
  syncMarketTabs();
  populate();
  syncTimeframeControls();
  setMode('battle');
  renderHistory();
  render();
}

restore();
document.querySelectorAll('.seg').forEach(b => b.addEventListener('click', () => {
  state.market = b.dataset.market;
  syncMarketTabs();
  populate();
  syncTimeframeControls();
  render();
  persist();
}));
document.querySelectorAll('.mode-tab').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('instrumentSelect').addEventListener('change', (event) => {
  state.instrument = event.target.value;
  syncTimeframeControls();
  render();
  persist();
});
$('timeframeSelect').addEventListener('change', (event) => {
  state.timeframe = Number(event.target.value);
  syncTimeframeControls();
  render();
  persist();
});
document.querySelectorAll('.tf-btn').forEach(btn => btn.addEventListener('click', () => {
  if (btn.disabled) return;
  state.timeframe = Number(btn.dataset.value);
  $('timeframeSelect').value = String(state.timeframe);
  render();
  persist();
}));
$('playBtn').addEventListener('click', togglePlay);
$('stepBtn').addEventListener('click', step);
$('buyBtn').addEventListener('click', () => { humanTrade('BUY'); render(); });
$('waitBtn').addEventListener('click', () => { humanTrade('WAIT'); render(); });
$('sellBtn').addEventListener('click', () => { humanTrade('SELL'); render(); });
$('resetBtn').addEventListener('click', reset);
window.addEventListener('resize', drawChart);
window.addEventListener('pagehide', persist);

syncMarketTabs();
populate();
syncTimeframeControls();
setMode(state.mode);
renderHistory();
render();
setupPWA();
hydrateRealBTCUSD4H();
