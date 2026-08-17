import { getLatestWalkForwardEvaluation } from './walk-forward-state.js';
import { getLatestForwardDemoEvaluation } from './forward-demo-state.js';
import { getLatestKnowledgeEvaluation } from './knowledge-state.js';
import { getLatestPlaybookEvaluation } from './playbook-state.js';
import { getLatestKnowledgeCandidateTournament } from './knowledge-candidate-state.js';
import { getLatestKnowledgeForwardEvaluation } from './knowledge-forward-state.js';
import { getLatestChampionPromotionEvaluation } from './champion-promotion-state.js';
import { getLatestKnowledgeForwardReplayAudit } from './knowledge-forward-replay-audit-state.js';

export const RESEARCH_EXPORT_VERSION='research-export-0.12';
export const PREVIOUS_RESEARCH_EXPORT_VERSION='research-export-0.11';
export const LEGACY_RESEARCH_EXPORT_VERSION_V10='research-export-0.10';
export const LEGACY_RESEARCH_EXPORT_VERSION_V09='research-export-0.9';
export const LEGACY_RESEARCH_EXPORT_VERSION_V08='research-export-0.8';
export const LEGACY_RESEARCH_EXPORT_VERSION_V07='research-export-0.7';
export const LEGACY_RESEARCH_EXPORT_VERSION='research-export-0.6';
export const LEGACY_RESEARCH_EXPORT_VERSION_V05='research-export-0.5';
const round=(value,digits=4)=>{if(value===null||value===undefined||value==='')return '';const n=Number(value);if(!Number.isFinite(n))return value;const s=10**digits;return Math.round(n*s)/s;};
function expertScore(event,id){return event?.experts?.find(x=>x.id===id)?.score??'';}
function counterfactualOutcome(event,horizonBars){return event?.counterfactual?.outcomes?.find(x=>x.horizonBars===horizonBars)||null;}
function safeSpreadsheetText(value){const text=value===null||value===undefined?'':String(value);return /^[=+\-@]/.test(text)?`'${text}`:text;}
function csvCell(value){return `"${safeSpreadsheetText(value).replaceAll('"','""')}"`;}
export function flattenDecisionEvent(event){const cf1=counterfactualOutcome(event,1),cf3=counterfactualOutcome(event,3),cf6=counterfactualOutcome(event,6);return {eventId:event?.eventId||'',recordedAt:event?.recordedAt||'',strategyVersion:event?.strategyVersion||'',instrument:event?.instrument||'',timeframeHours:event?.timeframeHours||'',candleTime:event?.candleTime||'',barIndex:event?.barIndex??'',dataSourceId:event?.dataSourceId||'',dataSourceType:event?.dataSourceType||'',dataSignature:event?.dataSignature||'',researchEligible:event?.researchEligible??'',engineVersion:event?.engineVersion||'',expertSetVersion:event?.expertSetVersion||'',regime:event?.regime||'',marketPrice:round(event?.market?.price),fastMA:round(event?.market?.fastMA),slowMA:round(event?.market?.slowMA),rsi:round(event?.market?.rsi),atrPct:round(event?.market?.atrPct),rawAlphaScore:round(event?.scores?.rawAlphaScore),decisionScore:round(event?.scores?.decisionScore),confidenceScore:round(event?.scores?.confidenceScore),timingScore:round(event?.scores?.timingScore),riskScore:round(event?.scores?.riskScore),estimatedRoundTripCostBps:round(event?.costs?.estimatedRoundTripCostBps),entryDecision:event?.entryDecision||'',policyDecision:event?.policyDecision||'',legacyAction:event?.legacyAction||'',trendExpertScore:round(expertScore(event,'trend')),momentumExpertScore:round(expertScore(event,'momentum')),breakoutExpertScore:round(expertScore(event,'breakout')),cfLong1NetBps:round(cf1?.long?.netReturnBps),cfShort1NetBps:round(cf1?.short?.netReturnBps),cfLong3NetBps:round(cf3?.long?.netReturnBps),cfShort3NetBps:round(cf3?.short?.netReturnBps),cfLong6NetBps:round(cf6?.long?.netReturnBps),cfShort6NetBps:round(cf6?.short?.netReturnBps),cfLong3MfeBps:round(cf3?.longMfeBps),cfLong3MaeBps:round(cf3?.longMaeBps),cfShort3MfeBps:round(cf3?.shortMfeBps),cfShort3MaeBps:round(cf3?.shortMaeBps),counterfactualStatus:event?.counterfactual?.status||''};}
export function researchEventsToCsv(events=[]){const rows=events.map(flattenDecisionEvent),headers=Object.keys(flattenDecisionEvent({})),lines=[headers.map(csvCell).join(',')];for(const row of rows)lines.push(headers.map(h=>csvCell(row[h])).join(','));return `\uFEFF${lines.join('\r\n')}`;}
export function buildResearchJson({events=[],baselineEvaluation=null,strategyRegistry=null,challengerEvaluation=null,walkForwardEvaluation=undefined,forwardDemoEvaluation=undefined,knowledgeEvaluation=undefined,playbookEvaluation=undefined,knowledgeCandidateTournament=undefined,knowledgeForwardEvaluation=undefined,championPromotionEvaluation=undefined,knowledgeForwardReplayAudit=undefined,nullMarketEvaluation=null,dataMeta=null}={}){const resolvedWalk=walkForwardEvaluation===undefined?getLatestWalkForwardEvaluation():walkForwardEvaluation;const resolvedForward=forwardDemoEvaluation===undefined?getLatestForwardDemoEvaluation():forwardDemoEvaluation;const resolvedKnowledge=knowledgeEvaluation===undefined?getLatestKnowledgeEvaluation():knowledgeEvaluation;const resolvedPlaybook=playbookEvaluation===undefined?getLatestPlaybookEvaluation():playbookEvaluation;const resolvedTournament=knowledgeCandidateTournament===undefined?getLatestKnowledgeCandidateTournament():knowledgeCandidateTournament;const resolvedKnowledgeForward=knowledgeForwardEvaluation===undefined?getLatestKnowledgeForwardEvaluation():knowledgeForwardEvaluation;const resolvedChampionPromotion=championPromotionEvaluation===undefined?getLatestChampionPromotionEvaluation():championPromotionEvaluation;const resolvedKnowledgeForwardReplayAudit=knowledgeForwardReplayAudit===undefined?getLatestKnowledgeForwardReplayAudit():knowledgeForwardReplayAudit;return JSON.stringify({exportVersion:RESEARCH_EXPORT_VERSION,exportedAt:new Date().toISOString(),eventCount:events.length,notes:[
'DecisionEvent counterfactual outcomes from the same event are clustered observations and are not IID samples.',
'Baseline evaluation is a descriptive same-series comparator and is not proof of a reproducible edge.',
'Strategy Registry Challenger results are same-series Shadow diagnostics only and cannot automatically promote or mutate the frozen Champion.',
'Human Trading Knowledge Engine Wave 1 is research-only. Its score is neither expected return nor a calibrated probability.',
'Knowledge Attribution leave-one-Expert-out / leave-one-Family-out and Family lag controls are sensitivity/screening diagnostics, not causal attribution or formal p-values.',
'Human Trading Playbook Engine Wave 2 encodes preregistered multi-condition setups and is inactive outside intended context rather than casting arbitrary opposite votes.',
'Playbook Shadow, ablation, lag controls and chronological holdout are research diagnostics only; historical data already inspected is not pristine untouched OOS.',
'Knowledge Candidate Tournament contains exactly four preregistered integration candidates and never generates/searches candidate combinations.',
'Candidate Tournament rankings, past-decision lag controls and historical holdout cannot automatically select/promote a candidate.',
'Raw Knowledge/Playbook scores are never treated as basis-point returns; execution cost applies only to simulated realized trade returns.',
'Research cost model research-cost-v0.1 deterministically estimates spread, fees and expected slippage from ATR using available bar information; it is not a realized-fill guarantee.',
'Prospective Knowledge Candidate Epoch knowledge-forward-001 is frozen at 2026-08-16T22:58:14Z. Only fully closed BTC/USD 4H candles whose OPEN timestamp is strictly after that boundary may create prospective evidence.',
'knowledge-forward-001 tracks exactly four frozen candidates plus champion-001 as a matched benchmark. Pre-freeze bars are indicator context only and never prospective P&L.',
'Knowledge prospective evidence uses deterministic entry-bar research cost, independent non-overlapping 3-bar paths per source, and stores both decision observations and completed trade evidence.',
'Autonomous GitHub Remote Archive is the durable authority when available; browser-local storage remains a fallback/cache and can be cleared.',
'Knowledge Forward Evidence Replay Audit performs full evidence replay against the durable Market Archive, recomputing decision/evidence keys, originating decisions, fixed 3-bar exits, entry-bar costs, prices, gross/net returns, non-overlap and expected evidence completeness.',
'Champion-002 Stage A requires a Fresh Replay Audit PASS; stored audit metadata alone is never sufficient for readiness.',
'Champion-002 Promotion Protocol is two-stage: Stage A knowledge-forward-001 is qualification-only, and qualification data cannot be reused as confirmation data.',
'Even a Stage A confirmationReviewReady candidate cannot become Champion-002 directly; at most one human-reviewed nominee must enter a separately frozen future knowledge-confirm-001 epoch.',
'Prospective past-decision Lag Null95 is a screening diagnostic, not a formal p-value, and all promotion/nomination/champion mutation remains manual and explicit.',
'Existing Prospective Forward Demo forward-001 remains separate and unchanged.',
'No same-series, holdout, qualification, confirmation, or prospective screen automatically promotes a Champion; negative-control review, execution review and human approval remain required.',
'Null Market / Negative Control results are screening diagnostics only; Null95 and exceedance rates are not formal p-values.',
'Human Knowledge, Attribution, Playbook, Candidate Tournament, knowledge-forward-001, Evidence Replay Audit, Champion Promotion, Challenger, walk-forward and Null outputs are never inputs to frozen live/demo Champion decisions.',
'Synthetic market data is not research eligible.'
],dataMeta,baselineEvaluation,strategyRegistry,challengerEvaluation,knowledgeEvaluation:resolvedKnowledge,playbookEvaluation:resolvedPlaybook,knowledgeCandidateTournament:resolvedTournament,knowledgeForwardEvaluation:resolvedKnowledgeForward,knowledgeForwardReplayAudit:resolvedKnowledgeForwardReplayAudit,championPromotionEvaluation:resolvedChampionPromotion,walkForwardEvaluation:resolvedWalk,forwardDemoEvaluation:resolvedForward,nullMarketEvaluation,decisionEvents:events},null,2);}
export function downloadResearchText({filename,text,mimeType}){const blob=new Blob([text],{type:mimeType}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
