import { instruments } from '../config.js';

const bps = x => x / 10000;

/** 決定論的市場分析とは分離した「現実の摩擦」層。 */
export class ExecutionEngine {
  constructor({ random = Math.random, analyze }) {
    this.random = random;
    this.analyze = analyze;
    this.profile = 'estimated-v0.2';
  }

  fillPrice(key, side, mid) {
    const market = instruments[key];
    const halfSpread = bps(market.spreadBps) / 2;
    const volatility = Math.max(.15, this.analyze(key).atr);
    const slipBps = (0.45 + this.random() * 1.15) * volatility * (market.market === 'crypto' ? 1.0 : .35);
    const slip = bps(slipBps);
    const sign = side === 'BUY' ? 1 : -1;
    return mid * (1 + sign * (halfSpread + slip));
  }

  fee(key, notional) {
    return notional * bps(instruments[key].feeBps);
  }
}
