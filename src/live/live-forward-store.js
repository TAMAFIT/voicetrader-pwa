import { FORWARD_EPOCH } from '../research/forward-epoch.js';
import { LIVE_FORWARD_VERSION, createLiveForwardState } from './live-forward-paper.js';

export const LIVE_FORWARD_STORAGE_KEY = 'voicetrader-live-forward-paper-v0.10';

function resolveStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export class LiveForwardStore {
  constructor({ storage = null, key = LIVE_FORWARD_STORAGE_KEY, epoch = FORWARD_EPOCH } = {}) {
    this.storage = resolveStorage(storage);
    this.key = key;
    this.epoch = epoch;
  }

  load() {
    if (!this.storage) return createLiveForwardState({ epoch: this.epoch });
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return createLiveForwardState({ epoch: this.epoch });
      const parsed = JSON.parse(raw);
      if (parsed?.version !== LIVE_FORWARD_VERSION || parsed?.epochId !== this.epoch.id) {
        return createLiveForwardState({ epoch: this.epoch });
      }
      return parsed;
    } catch {
      return createLiveForwardState({ epoch: this.epoch });
    }
  }

  save(state) {
    if (!state || state.version !== LIVE_FORWARD_VERSION || state.epochId !== this.epoch.id) {
      throw new Error('LiveForwardStore refused incompatible state');
    }
    if (!this.storage) return state;
    this.storage.setItem(this.key, JSON.stringify(state));
    return state;
  }

  clear() {
    if (this.storage) this.storage.removeItem(this.key);
  }
}
