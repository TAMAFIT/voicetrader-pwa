import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GMO_FX_PUBLIC_WS_URL,
  buildGmoFxTickerSubscription,
  buildGmoFxPublicQuote,
} from '../src/short-horizon/gmo-fx-public-quote.js';
import { mergeGmoQuotesIntoArchive, writeGmoQuoteManifest } from './lib/short-horizon-gmo-quote-archive.mjs';

export const GMO_FX_PUBLIC_QUOTE_COLLECTOR_VERSION = 'gmo-fx-public-quote-collector-v1';

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') out.rootDir = argv[++index];
    else if (argv[index] === '--timeout-ms') out.timeoutMs = Number(argv[++index]);
  }
  return out;
}

export async function captureOneGmoFxPublicQuote({
  WebSocketImpl = globalThis.WebSocket,
  timeoutMs = 15_000,
  receivedNow = () => Date.now(),
} = {}) {
  if (typeof WebSocketImpl !== 'function') throw new Error('gmo-fx-public-websocket-unavailable');
  return await new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocketImpl(GMO_FX_PUBLIC_WS_URL);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      if (error) reject(error); else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('gmo-fx-public-websocket-timeout')), timeoutMs);
    const on = (name, handler) => {
      if (typeof ws.addEventListener === 'function') ws.addEventListener(name, handler);
      else ws[`on${name}`] = handler;
    };
    on('open', () => {
      ws.send(JSON.stringify(buildGmoFxTickerSubscription('USD_JPY')));
    });
    on('error', () => finish(new Error('gmo-fx-public-websocket-error')));
    on('message', (event) => {
      try {
        const raw = typeof event?.data === 'string' ? event.data : String(event?.data ?? '');
        const payload = JSON.parse(raw);
        if (payload?.symbol !== 'USD_JPY' || payload?.ask == null || payload?.bid == null || payload?.timestamp == null) return;
        finish(null, buildGmoFxPublicQuote(payload, { receivedTimestampMs:receivedNow() }));
      } catch (error) {
        finish(error);
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.rootDir) throw new Error('gmo-fx-public-quote-root-required');
  const rootDir = path.resolve(args.rootDir);
  const startedAtMs = Date.now();
  const quote = await captureOneGmoFxPublicQuote({ timeoutMs:Number.isFinite(args.timeoutMs) ? args.timeoutMs : 15_000 });
  const merge = mergeGmoQuotesIntoArchive({ rootDir, records:[quote] });
  const finishedAtMs = Date.now();
  const lastRun = {
    status:'success',
    collectorVersion:GMO_FX_PUBLIC_QUOTE_COLLECTOR_VERSION,
    startedAtMs,
    finishedAtMs,
    durationMs:finishedAtMs - startedAtMs,
    cadenceMinutes:5,
    githubRunId:process.env.GITHUB_RUN_ID || null,
    githubRunAttempt:process.env.GITHUB_RUN_ATTEMPT || null,
    captured:{ quoteId:quote.quoteId, sourceTimestampMs:quote.timing.sourceTimestampMs, receivedTimestampMs:quote.timing.receivedTimestampMs, marketStatus:quote.quote.marketStatus, bid:quote.quote.bid, ask:quote.quote.ask, spreadBps:quote.quote.spreadBps },
    merge,
  };
  const manifest = writeGmoQuoteManifest({ rootDir, lastRun });
  console.log(JSON.stringify({ status:'success', quote:lastRun.captured, archive:manifest.archive }, null, 2));
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
