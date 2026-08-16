import { instruments } from '../config.js';
import { sma, rsi, atrPct, clamp } from './indicators.js';
import { runAlphaExperts } from './experts.js';
import { decideEntry, entryDecisionToLegacyAction } from './decision-policy.js';

/**
 * Shadow Engine v0.4
 * Championの既存挙動を保ったまま、Alpha要因を独立Expertとして観測可能にする。
 * Expert weights are frozen; no tournament or online learning is performed here.
 */
export class ShadowEngine {
  constructor({ seriesProvider }) {
    this.seriesProvider = seriesProvider;
    this.version = '0.4-fixed-experts-policy';
  }

  analyze(key, idx) {
    const arr = this.seriesProvider(key);
    const market = instruments[key];
    const p = arr[idx].c;
    const fast = sma(arr, 12, idx) || p;
    const slow = sma(arr, 34, idx) || p;
    const rsiValue = rsi(arr, 14, idx);
    const atr = atrPct(arr, 14, idx);

    const recent = arr.slice(Math.max(0, idx - 18), idx).map(x => x.c);
    const hi = Math.max(...recent);
    const lo = Math.min(...recent);
    const expertSet = runAlphaExperts({
      fast,
      slow,
      rsiValue,
      price: p,
      recentHigh: hi,
      recentLow: lo,
    });
    const rawAlphaScore = expertSet.rawAlphaScore;

    const up = clamp(50 + rawAlphaScore, 12, 88);
    const dir = up >= 50 ? 'UP' : 'DOWN';
    const conf = Math.round(Math.max(up, 100 - up));
    const trendStrength = clamp(Math.abs((fast / slow) - 1) * 4200, 0, 100);
    const breakoutScore = expertSet.results.find(expert => expert.id === 'breakout')?.score || 0;
    const timing = Math.round(clamp(
      42 + trendStrength * .45 + Math.abs(rsiValue - 50) * .35 + (breakoutScore ? 12 : 0) - Math.max(0, atr - 2.2) * 8,
      8,
      96,
    ));
    const risk = Math.round(clamp(
      18 + atr * 13 + (market.spreadBps + market.feeBps) * .8 + Math.abs(rsiValue - 50) * .15,
      8,
      92,
    ));
    const decisionScore = timing - risk * .38 + (conf - 50) * .7;
    const entryDecision = decideEntry({
      decisionScore,
      confidenceScore: conf,
      direction: dir,
    });
    const action = entryDecisionToLegacyAction(entryDecision);

    const regime = trendStrength > 55
      ? (dir === 'UP' ? '上昇トレンド' : '下降トレンド')
      : (atr > 2 ? '荒いレンジ' : 'レンジ');

    let comment = '方向感が弱いため、無理に入らず様子を見る場面です。';
    if (entryDecision === 'ENTER_LONG') comment = '上向きの流れとタイミングが重なっています。買い候補ですが、損切り前提で考えます。';
    if (entryDecision === 'ENTER_SHORT') comment = '下向きの流れが優勢で、エントリー条件もそろっています。売り候補です。';
    if (conf > 67 && entryDecision === 'NO_ENTRY') comment = `${dir === 'UP' ? '上' : '下'}方向の見込みはありますが、今は入る位置・リスク条件が十分ではありません。`;

    const factors = {
      trend: expertSet.results.find(expert => expert.id === 'trend')?.score || 0,
      momentum: expertSet.results.find(expert => expert.id === 'momentum')?.score || 0,
      breakout: breakoutScore,
      trendStrength,
    };

    return {
      engineVersion: this.version,
      p, fast, slow, rsi: rsiValue, atr,
      up, dir, conf, timing, risk, action, entryDecision, regime, comment,
      rawAlphaScore,
      decisionScore,
      edge: decisionScore,
      factors,
      experts: expertSet,
    };
  }

  scan(keys, idx) {
    return keys
      .map(key => ({ key, a: this.analyze(key, idx) }))
      .sort((x, y) => y.a.decisionScore - x.a.decisionScore);
  }
}
