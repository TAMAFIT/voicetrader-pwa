import { buildKnowledgeFeatures } from './knowledge-indicators.js';
import { buildPlaybookFeatures } from './playbook-features.js';
import { HIGHER_TIMEFRAME_D1_MIN_BARS } from './higher-timeframe-registry.js';

export const HIGHER_TIMEFRAME_FEATURE_VERSION='higher-timeframe-features-0.1';
export const FOUR_HOURS_SECONDS=4*60*60;
export const DAY_SECONDS=24*60*60;
export const UTC_D1_OPEN_SLOTS=Object.freeze([0,FOUR_HOURS_SECONDS,2*FOUR_HOURS_SECONDS,3*FOUR_HOURS_SECONDS,4*FOUR_HOURS_SECONDS,5*FOUR_HOURS_SECONDS]);

const finite=value=>Number.isFinite(Number(value));
const dayStartOf=t=>Math.floor(Number(t)/DAY_SECONDS)*DAY_SECONDS;

function aggregateCompleteDay(dayStart,slotMap){
  if(UTC_D1_OPEN_SLOTS.some(slot=>!slotMap.has(slot)))return null;
  const bars=UTC_D1_OPEN_SLOTS.map(slot=>slotMap.get(slot));
  if(bars.some(bar=>![bar?.t,bar?.o,bar?.h,bar?.l,bar?.c].every(finite)))return null;
  for(let i=0;i<bars.length;i++){
    if(Number(bars[i].t)!==dayStart+UTC_D1_OPEN_SLOTS[i])return null;
    if(i>0&&Number(bars[i].t)-Number(bars[i-1].t)!==FOUR_HOURS_SECONDS)return null;
  }
  return {
    t:dayStart,
    o:Number(bars[0].o),
    h:Math.max(...bars.map(bar=>Number(bar.h))),
    l:Math.min(...bars.map(bar=>Number(bar.l))),
    c:Number(bars.at(-1).c),
    volume:bars.reduce((sum,bar)=>sum+(finite(bar.volume)?Number(bar.volume):0),0),
    trades:bars.reduce((sum,bar)=>sum+(finite(bar.trades)?Number(bar.trades):0),0),
    sourceStartTime:Number(bars[0].t),
    sourceEndTime:Number(bars.at(-1).t),
    sourceBars:6,
  };
}

export function buildClosedDailySeries(series=[],idx=series.length-1){
  if(!Array.isArray(series)||!series.length||idx<0||!series[Math.min(idx,series.length-1)])return {daily:[],decisionInfoTime:null,lastDailyCloseTime:null};
  const safeIdx=Math.min(Math.floor(Number(idx)),series.length-1);
  const decisionBar=series[safeIdx];
  const decisionInfoTime=Number(decisionBar?.t)+FOUR_HOURS_SECONDS;
  if(!Number.isFinite(decisionInfoTime))return {daily:[],decisionInfoTime:null,lastDailyCloseTime:null};
  const days=new Map();
  for(let i=0;i<=safeIdx;i++){
    const bar=series[i];
    const t=Number(bar?.t);
    if(!Number.isFinite(t))continue;
    const dayStart=dayStartOf(t);
    const slot=t-dayStart;
    if(!UTC_D1_OPEN_SLOTS.includes(slot))continue;
    if(!days.has(dayStart))days.set(dayStart,new Map());
    const slots=days.get(dayStart);
    if(!slots.has(slot))slots.set(slot,bar);
  }
  const daily=[];
  for(const dayStart of [...days.keys()].sort((a,b)=>a-b)){
    if(dayStart+DAY_SECONDS>decisionInfoTime)continue;
    const aggregated=aggregateCompleteDay(dayStart,days.get(dayStart));
    if(aggregated)daily.push(aggregated);
  }
  return {daily,decisionInfoTime,lastDailyCloseTime:daily.length?daily.at(-1).t+DAY_SECONDS:null};
}

function dailyRegime(features){
  const adx=Number(features?.dmi?.adx||0);
  const direction=Number(features?.fast)>Number(features?.slow)?1:Number(features?.fast)<Number(features?.slow)?-1:0;
  if(adx>=22&&direction!==0)return 'trend';
  if(adx<=18)return 'range';
  return 'neutral';
}

export function buildHigherTimeframeFeatures(series=[],idx=series.length-1){
  const safeIdx=Math.min(Math.floor(Number(idx)),Math.max(0,series.length-1));
  if(!Array.isArray(series)||!series[safeIdx])return {version:HIGHER_TIMEFRAME_FEATURE_VERSION,status:'unavailable',reason:'missing-four-hour-series'};
  const sourceBefore=JSON.stringify(series);
  const fourHour=buildPlaybookFeatures(series,safeIdx);
  const closedDaily=buildClosedDailySeries(series,safeIdx);
  if(closedDaily.daily.length<HIGHER_TIMEFRAME_D1_MIN_BARS){
    return {
      version:HIGHER_TIMEFRAME_FEATURE_VERSION,status:'insufficient-daily-context',idx:safeIdx,
      requiredDailyBars:HIGHER_TIMEFRAME_D1_MIN_BARS,dailyBarCount:closedDaily.daily.length,
      decisionInfoTime:closedDaily.decisionInfoTime,lastDailyCloseTime:closedDaily.lastDailyCloseTime,
    };
  }
  const dailyIdx=closedDaily.daily.length-1;
  const daily=buildKnowledgeFeatures(closedDaily.daily,dailyIdx);
  const direction=Number(daily.fast)>Number(daily.slow)?1:Number(daily.fast)<Number(daily.slow)?-1:0;
  const momentum6=Math.sign(Number(daily.roc6Pct||0));
  const momentum24=Math.sign(Number(daily.roc24Pct||0));
  const momentumDirection=momentum6!==0&&momentum6===momentum24?momentum6:0;
  const regime=dailyRegime(daily);
  const maSeparationPct=Number(daily.price)>0?Math.abs(Number(daily.fast)-Number(daily.slow))/Number(daily.price)*100:0;
  const strongTrend=regime==='trend'&&Number(daily.dmi?.adx||0)>=25&&maSeparationPct>=0.25;
  const volatilityShock=Number(daily.atrPercentile||0)>=90&&Number(daily.realizedVolPercentile||0)>=85;
  const result={
    version:HIGHER_TIMEFRAME_FEATURE_VERSION,status:'complete',idx:safeIdx,
    decisionInfoTime:closedDaily.decisionInfoTime,
    dailyBarCount:closedDaily.daily.length,
    lastDailyBarOpenTime:Number(closedDaily.daily.at(-1)?.t)||null,
    lastDailyBarCloseTime:closedDaily.lastDailyCloseTime,
    dailySeries:closedDaily.daily,
    fourHour,
    daily:{
      ...daily,
      direction,momentumDirection,regime,strongTrend,volatilityShock,maSeparationPct,
    },
    causality:{
      sourceFourHourEndIndex:safeIdx,
      onlyBarsAtOrBeforeDecisionIndex:true,
      decisionInformationTime:closedDaily.decisionInfoTime,
      fullyClosedUtcDailyBarsOnly:true,
      partialCurrentDailyBarForbidden:true,
      futureFourHourBarsForbidden:true,
    },
  };
  if(JSON.stringify(series)!==sourceBefore)return {version:HIGHER_TIMEFRAME_FEATURE_VERSION,status:'blocked',reason:'source-series-mutated'};
  return result;
}
