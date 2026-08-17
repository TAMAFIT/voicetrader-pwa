import { evaluateChampionPromotionQualification } from './champion-promotion-evaluator.js';
import { auditKnowledgeForwardRemoteDocument } from './knowledge-forward-replay-audit.js';

export const CHAMPION_PROMOTION_REPLAY_GATE_VERSION='champion-promotion-replay-gate-0.1';

export function evaluateAuditedChampionPromotionQualification(remoteDocument){
  const replayAudit=auditKnowledgeForwardRemoteDocument(remoteDocument);
  const core=evaluateChampionPromotionQualification(remoteDocument);
  if(core.status!=='complete')return {...core,replayAudit,freshReplayAuditRequired:true};
  if(replayAudit.pass)return {...core,replayAudit,freshReplayAuditRequired:true,replayAuditRequiredForReadiness:true};
  const candidates=(core.candidates||[]).map(item=>({
    ...item,
    blockers:[...new Set([...(item.blockers||[]),'evidence-replay-audit-not-pass'])],
    confirmationReviewReady:false,
    promotionEligible:false,
    directPromotionForbidden:true,
  }));
  return {
    ...core,
    candidates,
    replayAudit,
    readyCandidateIds:[],
    anyConfirmationReviewReady:false,
    stageAResult:'not-ready',
    promotionEligible:false,
    selectedCandidateId:null,
    automaticNomination:false,
    automaticPromotion:false,
    championMutation:false,
    freshReplayAuditRequired:true,
    replayAuditRequiredForReadiness:true,
  };
}
