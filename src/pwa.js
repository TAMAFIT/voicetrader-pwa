import { setupResearchEvaluationUI } from './research/research-evaluation-ui.js';
import { setupHumanKnowledgeUI } from './research/knowledge-ui.js';
import { setupKnowledgeAttributionUI } from './research/knowledge-attribution-ui.js';
import { setupHumanPlaybookUI } from './research/playbook-ui.js';
import { setupHigherTimeframeUI } from './research/higher-timeframe-ui.js';
import { setupHigherTimeframeForwardUI } from './research/higher-timeframe-forward-ui.js';
import { setupKnowledgeCandidateTournamentUI } from './research/knowledge-candidate-ui.js';
import { setupKnowledgeForwardUI } from './research/knowledge-forward-ui.js';
import { setupKnowledgeForwardReplayAuditUI } from './research/knowledge-forward-replay-audit-ui.js';
import { setupChampionPromotionUI } from './research/champion-promotion-ui.js';
import { setupProspectiveObservatoryUI } from './research/prospective-observatory-ui.js';
import { setupEthForwardUI } from './research/eth-forward-ui.js';
import { setupProspectiveExperienceUI } from './research/prospective-experience-ui.js';
import { setupLearningReadinessUI } from './research/learning-readiness-ui.js';
import { setupModelExperimentUI } from './research/model-experiment-ui.js';
import { setupWalkForwardUI } from './research/walk-forward-ui.js';
import { setupForwardDemoUI } from './research/forward-demo-ui.js';
import { setupLiveForwardTradingUI } from './live/live-forward-ui.js';

let deferredInstallPrompt = null;

export function setupPWA() {
  const installBtn = document.getElementById('installBtn');
  const status = document.getElementById('connectionStatus');
  const updateBar = document.getElementById('updateBar');
  const updateBtn = document.getElementById('updateBtn');

  setupResearchEvaluationUI();
  setupHumanKnowledgeUI();
  setupKnowledgeAttributionUI();
  setupHumanPlaybookUI();
  setupHigherTimeframeUI();
  setupHigherTimeframeForwardUI();
  setupKnowledgeCandidateTournamentUI();
  setupKnowledgeForwardUI();
  setupKnowledgeForwardReplayAuditUI();
  setupChampionPromotionUI();
  setupProspectiveObservatoryUI();
  setupEthForwardUI();
  setupProspectiveExperienceUI();
  setupLearningReadinessUI();
  setupModelExperimentUI();
  setupWalkForwardUI();
  setupForwardDemoUI();
  setupLiveForwardTradingUI();

  const updateOnlineStatus = () => {
    const online = navigator.onLine;
    status.textContent = online ? 'オンライン' : 'オフライン';
    status.classList.toggle('offline', !online);
  };
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.hidden = false;
  });

  installBtn?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });

  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    const showUpdate = (worker) => {
      updateBar.hidden = false;
      updateBtn.onclick = () => worker.postMessage({ type: 'SKIP_WAITING' });
    };
    if (registration.waiting) showUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
      });
    });
  }).catch((error) => console.warn('Service worker registration failed:', error));

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
