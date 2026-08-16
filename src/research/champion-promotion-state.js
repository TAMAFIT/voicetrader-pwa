let latestChampionPromotionEvaluation=null;

export function setLatestChampionPromotionEvaluation(value){
  latestChampionPromotionEvaluation=value||null;
  return latestChampionPromotionEvaluation;
}

export function getLatestChampionPromotionEvaluation(){
  return latestChampionPromotionEvaluation;
}
