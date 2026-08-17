import { ShadowEngine } from '../engine/shadow-engine.js';
import { HumanKnowledgeEngine } from '../knowledge/human-knowledge-engine.js';
import { HumanPlaybookEngine } from '../knowledge/playbook-engine.js';
import { KNOWLEDGE_FORWARD_EPOCH_ID } from './knowledge-forward-epoch.js';
import { PROSPECTIVE_ATTRIBUTION_LEDGER_VERSION } from './prospective-attribution-ledger.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const round=(value,digits=4)=>{const n=Number(value);if(!Number.isFinite(n))return null;const s=10**digits;return Math.round(n*s)/s;};
function sortedTimes(values=[]){return [...new Set(values.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);}
function indexByTime(series=[]){return new Map(series.map((bar,idx)=>[Number(bar?.t),idx]).filter(([time])=>Number.isFinite(time)));}
function compactExperts(experts=[]){return experts.map(item=>({id:item.id,label:item.label,family:item.family,score:round(item.score),active:item.active===undefined?true:Boolean(item.active)}));}
function compactFamilies(families={}){return Object.fromEntries(Object.entries(families||{}).map(([id,item])=>[id,{score:round(item?.score),memberCount:Number(item?.memberCount||0),memberIds:Array.isArray(item?.memberIds)?[...item.memberIds]:[]} ]));}
function compactPlaybooks(items=[]){return items.map(item=>({id:item.id,label:item.label,archetype:item.archetype||null,role:item.role,active:Boolean(item.active),score:round(item.score),direction:item.direction||null,blockedDirectionSign:Number(item.blockedDirectionSign||0),reason:item.reason||null,inputs:clone(item.inputs||{})}));}
function compactArchetypes(archetypes={}){return Object.fromEntries(Object.entries(archetypes||{}).map(([id,item])=>[id,{score:round(item?.score),memberCount:Number(item?.memberCount||0),memberIds:Array.isArray(item?.memberIds)?[...item.memberIds]:[]} ]));}

export function buildKnowledgeProspectiveAttributionSnapshot({series,observedBarTimes=[]}={}){
  const byTime=indexByTime(series);const wave1Engine=new HumanKnowledgeEngine();const wave2Engine=new HumanPlaybookEngine();const championEngine=new ShadowEngine({seriesProvider:()=>series});const records=[];
  for(const candleTime of sortedTimes(observedBarTimes)){
    const idx=byTime.get(candleTime);if(!Number.isInteger(idx))continue;const wave1=wave1Engine.analyze(series,idx);const wave2=wave2Engine.analyze(series,idx);const champion=championEngine.analyze('BTCUSD',idx);if(wave1.status!=='complete'||wave2.status!=='complete')continue;
    records.push({attributionKey:`${KNOWLEDGE_FORWARD_EPOCH_ID}:${candleTime}`,epochId:KNOWLEDGE_FORWARD_EPOCH_ID,candleTime,barIndex:idx,observedProspectively:true,futureOutcomeUsed:false,
      wave1:{version:wave1.version,entryDecision:wave1.entryDecision,knowledgeScore:round(wave1.knowledgeScore),familyAgreement:round(wave1.familyAgreement),direction:wave1.direction,context:clone(wave1.context||{}),features:clone(wave1.features||{}),families:compactFamilies(wave1.families),experts:compactExperts(wave1.experts),topSupport:clone(wave1.topSupport||[]),topOpposition:clone(wave1.topOpposition||[])},
      wave2:{version:wave2.version,registryVersion:wave2.registryVersion,entryDecision:wave2.entryDecision,playbookScore:round(wave2.playbookScore),archetypeAgreement:round(wave2.archetypeAgreement),activePlaybookCount:Number(wave2.activePlaybookCount||0),activeArchetypeCount:Number(wave2.activeArchetypeCount||0),maxSetupStrength:round(wave2.maxSetupStrength),gateReason:wave2.gateReason||null,archetypes:compactArchetypes(wave2.archetypes),playbooks:compactPlaybooks(wave2.playbooks),gates:compactPlaybooks(wave2.gates),features:clone(wave2.features||{})},
      champion:{engineVersion:champion.engineVersion||null,entryDecision:champion.entryDecision||null,rawAlphaScore:round(champion.rawAlphaScore),decisionScore:round(champion.decisionScore),confidenceScore:round(champion.conf)},
      governance:{researchOnly:true,changesFrozenDecision:false,causalAttribution:false,automaticLearning:false,usedByLiveDecisionEngine:false}});
  }
  return {version:PROSPECTIVE_ATTRIBUTION_LEDGER_VERSION,epochId:KNOWLEDGE_FORWARD_EPOCH_ID,records};
}
