let latestKnowledgeCandidateTournament = null;

export function setLatestKnowledgeCandidateTournament(value) {
  latestKnowledgeCandidateTournament = value ? JSON.parse(JSON.stringify(value)) : null;
}

export function getLatestKnowledgeCandidateTournament() {
  return latestKnowledgeCandidateTournament ? JSON.parse(JSON.stringify(latestKnowledgeCandidateTournament)) : null;
}
