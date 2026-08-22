import os from 'node:os';
import path from 'node:path';
import { appendFile, mkdir, readFile, rename, statfs, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  GMO_FX_PUBLIC_WS_URL,
  buildGmoFxTickerSubscription,
  buildGmoFxPublicQuote,
} from '../../src/short-horizon/gmo-fx-public-quote.js';
import {
  LOCAL_NODE_GMO_TICK_COLLECTOR,
  LOCAL_NODE_NETWORK_POLICY,
  buildLocalNodeStoragePaths,
  buildLocalNodeTickRecord,
  classifyRepeatedQuote,
} from '../../src/short-horizon/local-node-gmo-tick.js';

const DEFAULT_HEALTH_INTERVAL_MS = 30_000;
const DEFAULT_RECONNECT_MAX_MS = 60_000;
const DEFAULT_WARNING_FREE_BYTES = 20 * 1024 ** 3;
const DEFAULT_CRITICAL_FREE_BYTES = 2 * 1024 ** 3;

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--root') out.rootDir = argv[++index];
    else if (token === '--health-ms') out.healthIntervalMs = Number(argv[++index]);
    else if (token === '--warning-free-bytes') out.warningFreeBytes = Number(argv[++index]);
    else if (token === '--critical-free-bytes') out.criticalFreeBytes = Number(argv[++index]);
    else throw new Error(`local-node-unknown-argument:${token}`);
  }
  return out;
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive:true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function diskFreeBytes(rootDir) {
  const stats = await statfs(rootDir);
  return Number(stats.bavail) * Number(stats.bsize);
}

export class GmoLocalTickRecorder {
  constructor({
    rootDir,
    WebSocketImpl = globalThis.WebSocket,
    now = () => Date.now(),
    nodeId = os.hostname(),
    healthIntervalMs = DEFAULT_HEALTH_INTERVAL_MS,
    warningFreeBytes = DEFAULT_WARNING_FREE_BYTES,
    criticalFreeBytes = DEFAULT_CRITICAL_FREE_BYTES,
  } = {}) {
    if (!rootDir) throw new Error('local-node-root-required');
    if (typeof WebSocketImpl !== 'function') throw new Error('local-node-websocket-unavailable-node22-required');
    this.rootDir = path.resolve(rootDir);
    this.WebSocketImpl = WebSocketImpl;
    this.now = now;
    this.nodeId = nodeId;
    this.healthIntervalMs = healthIntervalMs;
    this.warningFreeBytes = warningFreeBytes;
    this.criticalFreeBytes = criticalFreeBytes;
    this.processStartedAtMs = this.now();
    this.connectionCounter = 0;
    this.sequence = 0;
    this.reconnectAttempt = 0;
    this.socket = null;
    this.reconnectTimer = null;
    this.healthTimer = null;
    this.shuttingDown = false;
    this.status = 'STARTING';
    this.lastQuote = null;
    this.lastQuoteReceivedAtMs = null;
    this.lastRawFile = null;
    this.lastError = null;
    this.counts = {
      receivedMessages:0,
      storedQuotes:0,
      duplicateQuotes:0,
      conflicts:0,
      reconnects:0,
      ignoredMessages:0,
    };
    this.writeChain = Promise.resolve();
    this.pendingWrites = 0;
  }

  async initialize() {
    const base = buildLocalNodeStoragePaths(this.rootDir, this.now());
    await Promise.all([
      mkdir(path.join(this.rootDir, 'raw'), { recursive:true }),
      mkdir(path.join(this.rootDir, 'derived'), { recursive:true }),
      mkdir(path.join(this.rootDir, 'candles'), { recursive:true }),
      mkdir(path.join(this.rootDir, 'research'), { recursive:true }),
      mkdir(path.join(this.rootDir, 'state'), { recursive:true }),
      mkdir(path.join(this.rootDir, 'logs'), { recursive:true }),
    ]);
    const prior = await readJsonIfPresent(base.lastQuoteFile);
    if (prior?.quote?.quoteId) this.lastQuote = prior.quote;
    await this.log('PROCESS_START', {
      collectorVersion:LOCAL_NODE_GMO_TICK_COLLECTOR,
      rootDir:this.rootDir,
      nodeId:this.nodeId,
      networkPolicy:LOCAL_NODE_NETWORK_POLICY,
    });
    await this.writeHealth();
  }

  async log(type, detail = {}) {
    const timestampMs = this.now();
    const paths = buildLocalNodeStoragePaths(this.rootDir, timestampMs);
    await mkdir(paths.logDir, { recursive:true });
    const line = {
      timestampMs,
      timestampIso:new Date(timestampMs).toISOString(),
      type,
      detail,
    };
    await appendFile(paths.logFile, `${JSON.stringify(line)}\n`, 'utf8');
  }

  scheduleHealth() {
    clearInterval(this.healthTimer);
    this.healthTimer = setInterval(() => {
      void this.healthTick();
    }, this.healthIntervalMs);
    if (typeof this.healthTimer.unref === 'function') this.healthTimer.unref();
  }

  async healthTick() {
    try {
      const freeBytes = await diskFreeBytes(this.rootDir);
      if (freeBytes < this.criticalFreeBytes) {
        await this.log('DISK_CRITICAL', { freeBytes, criticalFreeBytes:this.criticalFreeBytes });
        await this.fatal(new Error('local-node-disk-critical'));
        return;
      }
      if (freeBytes < this.warningFreeBytes) {
        await this.log('DISK_WARNING', { freeBytes, warningFreeBytes:this.warningFreeBytes });
      }
      await this.persistLastQuote();
      await this.writeHealth(freeBytes);
    } catch (error) {
      this.lastError = String(error?.stack || error);
      try { await this.log('HEALTH_ERROR', { error:this.lastError }); } catch {}
    }
  }

  async persistLastQuote() {
    if (!this.lastQuote) return;
    const paths = buildLocalNodeStoragePaths(this.rootDir, this.now());
    await atomicWriteJson(paths.lastQuoteFile, {
      updatedAtMs:this.now(),
      quote:this.lastQuote,
    });
  }

  async writeHealth(freeBytes = null) {
    const timestampMs = this.now();
    const paths = buildLocalNodeStoragePaths(this.rootDir, timestampMs);
    let diskBytes = freeBytes;
    if (!Number.isFinite(diskBytes)) {
      try { diskBytes = await diskFreeBytes(this.rootDir); } catch { diskBytes = null; }
    }
    const health = {
      schemaVersion:'voicetrader-local-node-health-v1',
      collectorVersion:LOCAL_NODE_GMO_TICK_COLLECTOR,
      timestampMs,
      timestampIso:new Date(timestampMs).toISOString(),
      nodeId:this.nodeId,
      pid:process.pid,
      status:this.status,
      processStartedAtMs:this.processStartedAtMs,
      uptimeMs:timestampMs - this.processStartedAtMs,
      dataRoot:this.rootDir,
      networkPolicy:LOCAL_NODE_NETWORK_POLICY,
      source:{
        provider:'GMO Coin Foreign Exchange FX',
        endpoint:GMO_FX_PUBLIC_WS_URL,
        symbol:'USD_JPY',
        publicOnly:true,
        authenticationRequired:false,
      },
      storage:{
        immutableRaw:true,
        partition:'received UTC hour',
        lastRawFile:this.lastRawFile,
        freeBytes:diskBytes,
        warningFreeBytes:this.warningFreeBytes,
        criticalFreeBytes:this.criticalFreeBytes,
      },
      connection:{
        active:Boolean(this.socket),
        connectionCounter:this.connectionCounter,
        reconnectAttempt:this.reconnectAttempt,
      },
      lastQuote: this.lastQuote ? {
        quoteId:this.lastQuote.quoteId,
        sourceTimestampMs:this.lastQuote.timing?.sourceTimestampMs,
        receivedTimestampMs:this.lastQuote.timing?.receivedTimestampMs,
        bid:this.lastQuote.quote?.bid,
        ask:this.lastQuote.quote?.ask,
        marketStatus:this.lastQuote.quote?.marketStatus,
      } : null,
      lastQuoteReceivedAtMs:this.lastQuoteReceivedAtMs,
      pendingWrites:this.pendingWrites,
      counts:this.counts,
      lastError:this.lastError,
      guarantees:{
        googleCloudUsed:false,
        cloudUpload:false,
        githubActionsRequired:false,
        orderSubmission:false,
        realMoneyRouting:false,
        decisionEngineMutation:false,
      },
    };
    await atomicWriteJson(paths.healthFile, health);
  }

  async start() {
    await this.initialize();
    this.status = 'CONNECTING';
    this.scheduleHealth();
    this.connect();
  }

  connect() {
    if (this.shuttingDown) return;
    clearTimeout(this.reconnectTimer);
    this.connectionCounter += 1;
    const connectionId = `${this.processStartedAtMs}-${this.connectionCounter}`;
    this.status = 'CONNECTING';
    const ws = new this.WebSocketImpl(GMO_FX_PUBLIC_WS_URL);
    this.socket = ws;
    const on = (name, handler) => {
      if (typeof ws.addEventListener === 'function') ws.addEventListener(name, handler);
      else ws[`on${name}`] = handler;
    };
    on('open', () => {
      if (this.socket !== ws || this.shuttingDown) return;
      this.status = 'RUNNING';
      this.reconnectAttempt = 0;
      ws.send(JSON.stringify(buildGmoFxTickerSubscription('USD_JPY')));
      void this.log('WEBSOCKET_OPEN', { connectionId, endpoint:GMO_FX_PUBLIC_WS_URL });
    });
    on('message', (event) => {
      if (this.socket !== ws || this.shuttingDown) return;
      this.counts.receivedMessages += 1;
      try {
        const raw = typeof event?.data === 'string' ? event.data : String(event?.data ?? '');
        const payload = JSON.parse(raw);
        if (payload?.symbol !== 'USD_JPY' || payload?.ask == null || payload?.bid == null || payload?.timestamp == null) {
          this.counts.ignoredMessages += 1;
          return;
        }
        const quote = buildGmoFxPublicQuote(payload, { receivedTimestampMs:this.now() });
        this.enqueueQuote(quote, connectionId);
      } catch (error) {
        void this.fatal(error);
      }
    });
    on('error', () => {
      if (this.socket !== ws || this.shuttingDown) return;
      this.lastError = 'gmo-fx-public-websocket-error';
      void this.log('WEBSOCKET_ERROR', { connectionId });
      try { ws.close(); } catch {}
    });
    on('close', () => {
      if (this.socket !== ws) return;
      this.socket = null;
      if (this.shuttingDown) return;
      this.status = 'RECONNECTING';
      this.scheduleReconnect(connectionId);
    });
  }

  scheduleReconnect(previousConnectionId) {
    this.reconnectAttempt += 1;
    this.counts.reconnects += 1;
    const delayMs = Math.min(DEFAULT_RECONNECT_MAX_MS, 1000 * (2 ** Math.min(this.reconnectAttempt - 1, 6)));
    void this.log('WEBSOCKET_RECONNECT_SCHEDULED', { previousConnectionId, attempt:this.reconnectAttempt, delayMs });
    this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
  }

  enqueueQuote(quote, connectionId) {
    const classification = classifyRepeatedQuote(this.lastQuote, quote);
    if (classification === 'DUPLICATE') {
      this.counts.duplicateQuotes += 1;
      return;
    }
    if (classification === 'CONFLICT') {
      this.counts.conflicts += 1;
      void this.fatal(new Error(`local-node-quote-conflict:${quote.quoteId}`));
      return;
    }
    this.pendingWrites += 1;
    this.writeChain = this.writeChain.then(async () => {
      this.sequence += 1;
      const record = buildLocalNodeTickRecord(quote, {
        nodeId:this.nodeId,
        processStartedAtMs:this.processStartedAtMs,
        connectionId,
        sequence:this.sequence,
      });
      const paths = buildLocalNodeStoragePaths(this.rootDir, quote.timing.receivedTimestampMs);
      await mkdir(paths.rawDir, { recursive:true });
      await appendFile(paths.rawFile, `${JSON.stringify(record)}\n`, 'utf8');
      this.lastQuote = quote;
      this.lastQuoteReceivedAtMs = quote.timing.receivedTimestampMs;
      this.lastRawFile = paths.rawFile;
      this.counts.storedQuotes += 1;
    }).catch((error) => {
      void this.fatal(error);
    }).finally(() => {
      this.pendingWrites -= 1;
    });
  }

  async fatal(error) {
    if (this.shuttingDown) return;
    this.status = 'FAILED';
    this.lastError = String(error?.stack || error);
    try { await this.log('FATAL', { error:this.lastError }); } catch {}
    await this.shutdown({ exitCode:1, reason:'fatal' });
  }

  async shutdown({ exitCode = 0, reason = 'requested' } = {}) {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.status = exitCode === 0 ? 'STOPPING' : 'FAILED';
    clearTimeout(this.reconnectTimer);
    clearInterval(this.healthTimer);
    const ws = this.socket;
    this.socket = null;
    try { ws?.close(); } catch {}
    try { await this.writeChain; } catch {}
    try { await this.persistLastQuote(); } catch {}
    try { await this.log('PROCESS_STOP', { exitCode, reason }); } catch {}
    this.status = exitCode === 0 ? 'STOPPED' : 'FAILED';
    try { await this.writeHealth(); } catch {}
    process.exitCode = exitCode;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = args.rootDir || process.env.VOICETRADER_DATA_ROOT;
  if (!rootDir) throw new Error('local-node-root-required');
  const recorder = new GmoLocalTickRecorder({
    rootDir,
    healthIntervalMs:Number.isFinite(args.healthIntervalMs) ? args.healthIntervalMs : DEFAULT_HEALTH_INTERVAL_MS,
    warningFreeBytes:Number.isFinite(args.warningFreeBytes) ? args.warningFreeBytes : DEFAULT_WARNING_FREE_BYTES,
    criticalFreeBytes:Number.isFinite(args.criticalFreeBytes) ? args.criticalFreeBytes : DEFAULT_CRITICAL_FREE_BYTES,
  });
  process.on('SIGINT', () => { void recorder.shutdown({ reason:'SIGINT' }); });
  process.on('SIGTERM', () => { void recorder.shutdown({ reason:'SIGTERM' }); });
  await recorder.start();
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
