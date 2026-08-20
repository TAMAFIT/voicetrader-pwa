export const SHORT_HORIZON_SESSION_CONTEXT_VERSION = 'short-horizon-session-context-v1';

const FORMATTERS = new Map();

function formatter(timeZone) {
  if (!FORMATTERS.has(timeZone)) {
    FORMATTERS.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      hourCycle:'h23',
      weekday:'short',
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit',
    }));
  }
  return FORMATTERS.get(timeZone);
}

function zonedParts(timestampMs, timeZone) {
  const date = new Date(Number(timestampMs));
  if (!Number.isFinite(date.getTime())) throw new Error('session-context-invalid-timestamp');
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) throw new Error('session-context-timezone-format-failed');
  return {
    timeZone,
    weekday:parts.weekday,
    year:Number(parts.year),
    month:Number(parts.month),
    day:Number(parts.day),
    hour,
    minute,
    minuteOfDay:hour * 60 + minute,
  };
}

function inWindow(parts, startMinute, endMinute) {
  return parts.minuteOfDay >= startMinute && parts.minuteOfDay < endMinute;
}

const SESSION_DEFINITIONS = Object.freeze([
  Object.freeze({ id:'TOKYO', timeZone:'Asia/Tokyo', startMinute:9 * 60, endMinute:18 * 60 }),
  Object.freeze({ id:'LONDON', timeZone:'Europe/London', startMinute:8 * 60, endMinute:17 * 60 }),
  Object.freeze({ id:'NEW_YORK', timeZone:'America/New_York', startMinute:8 * 60, endMinute:17 * 60 }),
]);

export function classifyAnalyticalSessions(timestampMs) {
  const clocks = {};
  const activeSessionIds = [];
  for (const definition of SESSION_DEFINITIONS) {
    const parts = zonedParts(timestampMs, definition.timeZone);
    clocks[definition.id] = parts;
    if (inWindow(parts, definition.startMinute, definition.endMinute)) activeSessionIds.push(definition.id);
  }

  let primarySession = activeSessionIds[0] || 'OFF_HOURS';
  if (activeSessionIds.includes('LONDON') && activeSessionIds.includes('NEW_YORK')) {
    primarySession = 'LONDON_NEW_YORK_OVERLAP';
  } else if (activeSessionIds.includes('TOKYO') && activeSessionIds.includes('LONDON')) {
    primarySession = 'TOKYO_LONDON_OVERLAP';
  } else if (activeSessionIds.length > 1) {
    primarySession = `${activeSessionIds.join('_')}_OVERLAP`;
  }

  return {
    version:SHORT_HORIZON_SESSION_CONTEXT_VERSION,
    methodology:'analytical-session-buckets-v1',
    centralizedExchangeOpenClaim:false,
    dstHandledByIanaTimeZones:true,
    activeSessionIds,
    primarySession,
    clocks,
  };
}

export function buildShortHorizonTimeContext(timestampMs, { assetClass = null } = {}) {
  const utc = zonedParts(timestampMs, 'UTC');
  const jst = zonedParts(timestampMs, 'Asia/Tokyo');
  const sessions = classifyAnalyticalSessions(timestampMs);
  return {
    version:SHORT_HORIZON_SESSION_CONTEXT_VERSION,
    sourceTimestampMs:Number(timestampMs),
    assetClass:assetClass || null,
    continuityModel:assetClass === 'crypto' ? '24x7' : assetClass === 'fx' ? 'sessioned' : 'unknown',
    utc:{ weekday:utc.weekday, hour:utc.hour, minute:utc.minute },
    jst:{ weekday:jst.weekday, hour:jst.hour, minute:jst.minute },
    sessions,
  };
}

export function attachTimeContextToSignal(record, timeContext) {
  if (!record || typeof record !== 'object') throw new Error('session-context-signal-required');
  if (!timeContext || timeContext.version !== SHORT_HORIZON_SESSION_CONTEXT_VERSION) throw new Error('session-context-invalid');
  if (Number(record.market?.sourceTimestampMs) !== Number(timeContext.sourceTimestampMs)) {
    throw new Error('session-context-source-time-mismatch');
  }
  return {
    ...JSON.parse(JSON.stringify(record)),
    timeContext:JSON.parse(JSON.stringify(timeContext)),
  };
}
