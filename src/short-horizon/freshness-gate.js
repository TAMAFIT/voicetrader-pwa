import { validateMarketEvent } from './market-event.js';

export const SHORT_HORIZON_FRESHNESS_GATE_VERSION = 'short-horizon-freshness-gate-v1';

export function defaultFreshnessLagMinutes(timeframeMinutes) {
  const timeframe = Number(timeframeMinutes);
  if (!Number.isInteger(timeframe) || timeframe <= 0) throw new Error('freshness-invalid-timeframe');
  return Math.max(5, timeframe * 2);
}

export function assessShortHorizonFreshness(events, {
  nowMs = Date.now(),
  minimumHistoryBars = 120,
  maxLagMinutes = null,
} = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      version:SHORT_HORIZON_FRESHNESS_GATE_VERSION,
      status:'INSUFFICIENT_HISTORY',
      fresh:false,
      reason:'no-events',
      eventCount:Array.isArray(events) ? events.length : 0,
    };
  }

  const sorted = [...events].sort((a, b) => Number(a.sourceTimestampMs) - Number(b.sourceTimestampMs));
  const first = sorted[0];
  validateMarketEvent(first);
  for (const event of sorted) {
    validateMarketEvent(event);
    if (
      event.assetClass !== first.assetClass ||
      event.instrument !== first.instrument ||
      event.venue !== first.venue ||
      Number(event.timeframeMinutes) !== Number(first.timeframeMinutes)
    ) throw new Error('freshness-mixed-stream');
  }

  const timeframeMinutes = Number(first.timeframeMinutes);
  const requiredBars = Number(minimumHistoryBars);
  const latest = sorted.at(-1);
  const barCloseTimestampMs = Number(latest.sourceTimestampMs) + timeframeMinutes * 60_000;
  const observedAtMs = Number(nowMs);
  if (!Number.isFinite(observedAtMs)) throw new Error('freshness-invalid-now');
  const lagMs = observedAtMs - barCloseTimestampMs;
  const allowedLagMinutes = maxLagMinutes == null
    ? defaultFreshnessLagMinutes(timeframeMinutes)
    : Number(maxLagMinutes);
  if (!Number.isFinite(allowedLagMinutes) || allowedLagMinutes < 0) throw new Error('freshness-invalid-max-lag');

  const base = {
    version:SHORT_HORIZON_FRESHNESS_GATE_VERSION,
    stream:{
      assetClass:first.assetClass,
      instrument:first.instrument,
      venue:first.venue,
      timeframeMinutes,
    },
    eventCount:sorted.length,
    minimumHistoryBars:requiredBars,
    latestSourceTimestampMs:Number(latest.sourceTimestampMs),
    latestBarCloseTimestampMs:barCloseTimestampMs,
    observedAtMs,
    lagMs,
    lagMinutes:lagMs / 60_000,
    maxLagMinutes:allowedLagMinutes,
  };

  if (sorted.length < requiredBars) {
    return { ...base, status:'INSUFFICIENT_HISTORY', fresh:false, reason:'minimum-history-not-met' };
  }
  if (lagMs < -1000) {
    return { ...base, status:'FUTURE_DATA', fresh:false, reason:'latest-bar-not-closed-at-observation-time' };
  }
  if (lagMs > allowedLagMinutes * 60_000) {
    return { ...base, status:'STALE', fresh:false, reason:'latest-closed-bar-too-old' };
  }
  return { ...base, status:'FRESH', fresh:true, reason:null };
}
