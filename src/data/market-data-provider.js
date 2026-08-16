const CACHE_KEY = 'voicetrader-market-cache-v1:BTCUSD:4h';
const MAX_SERIES = 520;
const INTERVAL_SECONDS = 4 * 60 * 60;
const KRAKEN_OHLC_URL = 'https://api.kraken.com/0/public/OHLC?pair=XXBTZUSD&interval=240';
let latestBTCUSD4HSnapshot = null;

function normalizeKraken(rows) {
  const now = Math.floor(Date.now() / 1000);
  return rows
    .map((row) => ({
      t: Number(row[0]),
      o: Number(row[1]),
      h: Number(row[2]),
      l: Number(row[3]),
      c: Number(row[4]),
      volume: Number(row[6] || 0),
      trades: Number(row[7] || 0),
    }))
    .filter((bar) => Number.isFinite(bar.t) && Number.isFinite(bar.o) && Number.isFinite(bar.h) && Number.isFinite(bar.l) && Number.isFinite(bar.c))
    .filter((bar) => bar.t + INTERVAL_SECONDS <= now)
    .sort((a, b) => a.t - b.t)
    .slice(-MAX_SERIES);
}

function buildMeta(series, sourceType, fetchedAt = Date.now()) {
  const first = series[0];
  const last = series[series.length - 1];
  return {
    id: 'kraken-spot-btcusd-4h-v1',
    label: sourceType === 'real' ? 'Kraken 実市場 4H' : 'Kraken キャッシュ 4H',
    sourceType,
    provider: 'Kraken public OHLC',
    instrument: 'BTCUSD',
    timeframeHours: 4,
    researchEligible: true,
    fetchedAt,
    signature: `${first?.t || 0}:${last?.t || 0}:${series.length}`,
  };
}

function remember(snapshot) {
  latestBTCUSD4HSnapshot = snapshot?.series && snapshot?.meta
    ? { series: snapshot.series, meta: snapshot.meta }
    : null;
  return snapshot;
}

function saveCache(series, meta) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ series, meta, savedAt: Date.now() }));
  } catch {}
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const series = Array.isArray(parsed.series) ? parsed.series.slice(-MAX_SERIES) : [];
    if (series.length < 120) return null;
    return { series, meta: buildMeta(series, 'cached-real', parsed.savedAt || Date.now()) };
  } catch {
    return null;
  }
}

export async function loadBTCUSD4H({ timeoutMs = 6500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(KRAKEN_OHLC_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Kraken HTTP ${response.status}`);
    const payload = await response.json();
    if (Array.isArray(payload.error) && payload.error.length) throw new Error(payload.error.join(', '));
    const result = payload.result || {};
    const pairKey = Object.keys(result).find((key) => key !== 'last');
    const rows = pairKey ? result[pairKey] : null;
    if (!Array.isArray(rows)) throw new Error('Kraken OHLC payload missing candle array');
    const series = normalizeKraken(rows);
    if (series.length < 120) throw new Error(`Kraken OHLC returned only ${series.length} closed candles`);
    const meta = buildMeta(series, 'real');
    saveCache(series, meta);
    return remember({ series, meta, error: null });
  } catch (error) {
    const cached = loadCache();
    if (cached) return remember({ ...cached, error: String(error?.message || error) });
    return remember({ series: null, meta: null, error: String(error?.message || error) });
  } finally {
    clearTimeout(timer);
  }
}

export function getLoadedBTCUSD4H() {
  return latestBTCUSD4HSnapshot;
}

export function syntheticMeta(key) {
  return {
    id: `synthetic-${key}-v0`,
    label: 'Synthetic 検証用',
    sourceType: 'synthetic',
    provider: 'VoiceTrader generator',
    instrument: key,
    timeframeHours: 4,
    researchEligible: false,
    fetchedAt: null,
    signature: `synthetic-${key}-v0`,
  };
}
