import { instruments } from '../config.js';
import { sma, rsi, atrPct, clamp } from './indicators.js';

/**
 * Shadow Engine v0.2
 * 人類の既存金融知識を決定論的な計算へ落とす層。
 * LLMではなく、同じ入力には同じ出力を返す「機械的な採点機」。
 */
export class ShadowEngine {
  constructor({ seriesProvider }) {
    this.seriesProvider = seriesProvider;
    this.version = '0.2-rule';
  }

  analyze(key, idx) {
    const arr = this.seriesProvider(key);
    const market = instruments[key];
    const p = arr[idx].c;
    const fast = sma(arr, 12, idx) || p;
    const slow = sma(arr, 34, idx) || p;
    const rsiValue = rsi(arr, 14, idx);
    const atr = atrPct(arr, 14, idx);

    const trend = clamp(((fast / slow) - 1) * 1600, -22, 22);
    const momentum = clamp((rsiValue - 50) * .52, -18, 18);
    const recent = arr.slice(Math.max(0, idx - 18), idx).map(x => x.c);
    const hi = Math.max(...recent);
    const lo = Math.min(...recent);
    let breakout = 0;
    if (p > hi) breakout = 10;
    if (p < lo) breakout = -10;

    const raw = trend + momentum + breakout;
    const up = clamp(50 + raw, 12, 88);
    const dir = up >= 50 ? 'UP' : 'DOWN';
    const conf = Math.round(Math.max(up, 100 - up));
    const trendStrength = clamp(Math.abs((fast / slow) - 1) * 4200, 0, 100);
    const timing = Math.round(clamp(
      42 + trendStrength * .45 + Math.abs(rsiValue - 50) * .35 + (breakout ? 12 : 0) - Math.max(0, atr - 2.2) * 8,
      8,
      96,
    ));
    const risk = Math.round(clamp(
      18 + atr * 13 + (market.spreadBps + market.feeBps) * .8 + Math.abs(rsiValue - 50) * .15,
      8,
      92,
    ));
    const edge = timing - risk * .38 + (conf - 50) * .7;

    let action = 'WAIT';
    if (edge > 42 && conf >= 61) action = dir === 'UP' ? 'BUY' : 'SELL';

    const regime = trendStrength > 55
      ? (dir === 'UP' ? '上昇トレンド' : '下降トレンド')
      : (atr > 2 ? '荒いレンジ' : 'レンジ');

    let comment = '方向感が弱いため、無理に入らず様子を見る場面です。';
    if (action === 'BUY') comment = '上向きの流れとタイミングが重なっています。買い候補ですが、損切り前提で考えます。';
    if (action === 'SELL') comment = '下向きの流れが優勢で、エントリー条件もそろっています。売り候補です。';
    if (conf > 67 && action === 'WAIT') comment = `${dir === 'UP' ? '上' : '下'}方向の見込みはありますが、今は入る位置・リスク条件が十分ではありません。`;

    return {
      engineVersion: this.version,
      p, fast, slow, rsi: rsiValue, atr,
      up, dir, conf, timing, risk, action, regime, comment, edge,
      factors: { trend, momentum, breakout, trendStrength },
    };
  }

  scan(keys, idx) {
    return keys
      .map(key => ({ key, a: this.analyze(key, idx) }))
      .sort((x, y) => y.a.edge - x.a.edge);
  }
}
