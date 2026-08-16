export const INITIAL_CAPITAL = 100000;

export const instruments = {
  BTCUSD: { label:'BTC / USD（ビットコイン）', shortLabel:'BTC / USD', market:'crypto', base:9800000, vol:0.011, spreadBps:4.0, feeBps:6.0, decimals:0 },
  ETHUSD: { label:'ETH / USD（イーサリアム）', shortLabel:'ETH / USD', market:'crypto', base:560000, vol:0.013, spreadBps:5.0, feeBps:6.0, decimals:0 },
  USDJPY: { label:'USD / JPY（ドル円）', shortLabel:'USD / JPY', market:'fx', base:148.20, vol:0.0025, spreadBps:0.8, feeBps:0.25, decimals:3 },
  EURUSD: { label:'EUR / USD（ユーロドル）', shortLabel:'EUR / USD', market:'fx', base:1.085, vol:0.0022, spreadBps:0.7, feeBps:0.25, decimals:5 },
};

export const knowledge = [
  {id:'TREND_MA_001', name:'トレンド', hint:'短期と長期の流れ'},
  {id:'MOM_RSI_001', name:'RSI', hint:'勢いと過熱感'},
  {id:'VOL_ATR_001', name:'ATR', hint:'値動きの大きさ'},
  {id:'RISK_RR_001', name:'リスク管理', hint:'無理をしない'},
  {id:'STRUCT_BREAK_001', name:'ブレイク', hint:'直近高値・安値'},
];
