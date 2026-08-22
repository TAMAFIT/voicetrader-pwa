export const LOCAL_EDGE_LAB_V084_HEALTH_SCHEMA='voicetrader-local-edge-lab-v084-health-gate-v1';

const finite=(v)=>Number.isFinite(Number(v));
const number=(v)=>finite(v)?Number(v):null;
const fresh=(obj,nowMs,maxAgeMs)=>{const t=number(obj?.updatedAtMs??obj?.generatedAtMs??obj?.timestampMs??Date.parse(String(obj?.timestampIso||'')));return t!=null&&nowMs>=t&&nowMs-t<=maxAgeMs;};
const cloudSafe=(obj)=>obj?.runtimePolicy?.googleCloudEnabled!==true&&obj?.runtimePolicy?.cloudUploadEnabled!==true;
const push=(checks,name,pass,detail)=>checks.push({name,pass:pass===true,detail:detail??null});

export function evaluateLocalEdgeLabV084Health({
  nowMs=Date.now(),
  maxAgeMs=90_000,
  krakenRaw,
  krakenWindows,
  coinbaseRaw,
  coinbaseWindows,
  crossVenueWorker,
  preregisteredWorker,
  learningScorecard,
}={}){
  const checks=[];
  push(checks,'KRAKEN_RAW_STATUS',krakenRaw?.status==='RUNNING',krakenRaw?.status);
  push(checks,'KRAKEN_RAW_FRESH',fresh(krakenRaw,nowMs,maxAgeMs),krakenRaw?.updatedAtMs);
  push(checks,'KRAKEN_RAW_MESSAGES',Number(krakenRaw?.counts?.messages||0)>0,krakenRaw?.counts?.messages);
  push(checks,'KRAKEN_L2_CHECKSUM',krakenRaw?.integrity?.bookChecksumVerified===true,krakenRaw?.integrity?.bookChecksumVerified);
  push(checks,'KRAKEN_BOOK_SYNC',krakenRaw?.integrity?.bookSynchronizationVerified===true,krakenRaw?.integrity?.bookSynchronizationVerified);
  push(checks,'KRAKEN_MICROSTRUCTURE',krakenRaw?.semantics?.micropriceAvailable===true,krakenRaw?.semantics?.micropriceAvailable);
  push(checks,'KRAKEN_CLOUD_SAFE',cloudSafe(krakenRaw),krakenRaw?.runtimePolicy);

  push(checks,'KRAKEN_WINDOWS_STATUS',krakenWindows?.status==='RUNNING',krakenWindows?.status);
  push(checks,'KRAKEN_WINDOWS_FRESH',fresh(krakenWindows,nowMs,maxAgeMs),krakenWindows?.updatedAtMs);
  push(checks,'KRAKEN_WINDOWS_WRITTEN',Number(krakenWindows?.counts?.windowsWritten||0)>0,krakenWindows?.counts?.windowsWritten);
  push(checks,'KRAKEN_WINDOWS_PROVIDER_TIME',krakenWindows?.semantics?.windowTimeBasis==='PROVIDER_TIMESTAMP',krakenWindows?.semantics?.windowTimeBasis);
  push(checks,'KRAKEN_WINDOWS_CLOUD_SAFE',cloudSafe(krakenWindows),krakenWindows?.runtimePolicy);

  push(checks,'COINBASE_RAW_STATUS',coinbaseRaw?.status==='RUNNING',coinbaseRaw?.status);
  push(checks,'COINBASE_RAW_FRESH',fresh(coinbaseRaw,nowMs,maxAgeMs),coinbaseRaw?.updatedAtMs);
  push(checks,'COINBASE_RAW_MESSAGES',Number(coinbaseRaw?.counts?.messages||0)>0,coinbaseRaw?.counts?.messages);
  push(checks,'COINBASE_TWO_SNAPSHOTS',Number(coinbaseRaw?.counts?.trustedSnapshots||0)>=2,coinbaseRaw?.counts?.trustedSnapshots);
  push(checks,'COINBASE_BOOK_SYNC',coinbaseRaw?.integrity?.orderBookSynchronizationVerified===true,coinbaseRaw?.integrity?.orderBookSynchronizationVerified);
  push(checks,'COINBASE_MICROSTRUCTURE',coinbaseRaw?.semantics?.derivedFeaturesAvailable===true,coinbaseRaw?.semantics?.derivedFeaturesAvailable);
  push(checks,'COINBASE_PREDICTION_OFF',coinbaseRaw?.semantics?.predictionInputAuthorized===false,coinbaseRaw?.semantics?.predictionInputAuthorized);
  push(checks,'COINBASE_CLOUD_SAFE',cloudSafe(coinbaseRaw),coinbaseRaw?.runtimePolicy);

  push(checks,'COINBASE_WINDOWS_STATUS',coinbaseWindows?.status==='RUNNING',coinbaseWindows?.status);
  push(checks,'COINBASE_WINDOWS_FRESH',fresh(coinbaseWindows,nowMs,maxAgeMs),coinbaseWindows?.updatedAtMs);
  push(checks,'COINBASE_WINDOWS_WRITTEN',Number(coinbaseWindows?.counts?.windowsWritten||0)>0,coinbaseWindows?.counts?.windowsWritten);
  push(checks,'COINBASE_WINDOWS_PROVIDER_TIME',coinbaseWindows?.semantics?.windowTimeBasis==='PROVIDER_TIMESTAMP',coinbaseWindows?.semantics?.windowTimeBasis);
  push(checks,'COINBASE_WINDOWS_PREDICTION_OFF',coinbaseWindows?.semantics?.predictionInputAuthorized===false,coinbaseWindows?.semantics?.predictionInputAuthorized);
  push(checks,'COINBASE_WINDOWS_CLOUD_SAFE',cloudSafe(coinbaseWindows),coinbaseWindows?.runtimePolicy);

  push(checks,'CROSS_VENUE_WORKER_FRESH',fresh(crossVenueWorker,nowMs,maxAgeMs),crossVenueWorker?.updatedAtMs);
  push(checks,'CROSS_VENUE_KRAKEN_READ',Number(crossVenueWorker?.counts?.krakenWindowsRead||0)>0,crossVenueWorker?.counts?.krakenWindowsRead);
  push(checks,'CROSS_VENUE_COINBASE_READ',Number(crossVenueWorker?.counts?.coinbaseWindowsRead||0)>0,crossVenueWorker?.counts?.coinbaseWindowsRead);
  push(checks,'CROSS_VENUE_CLOUD_SAFE',cloudSafe(crossVenueWorker),crossVenueWorker?.runtimePolicy);

  push(checks,'PREREG_WORKER_FRESH',fresh(preregisteredWorker,nowMs,maxAgeMs),preregisteredWorker?.updatedAtMs);
  push(checks,'PREREG_PREDICTION_OFF',preregisteredWorker?.governance?.predictionInputAuthorized===false,preregisteredWorker?.governance?.predictionInputAuthorized);
  push(checks,'PREREG_ADAPTIVE_OFF',preregisteredWorker?.governance?.adaptiveLearningAuthorized===false,preregisteredWorker?.governance?.adaptiveLearningAuthorized);
  push(checks,'PREREG_CLOUD_SAFE',cloudSafe(preregisteredWorker),preregisteredWorker?.runtimePolicy);

  push(checks,'LEARNING_SCORECARD_FRESH',fresh(learningScorecard,nowMs,maxAgeMs),learningScorecard?.generatedAtMs);
  push(checks,'LEARNING_BLIND_NOT_READ',learningScorecard?.worker?.blindDirectoryRead===false,learningScorecard?.worker?.blindDirectoryRead);
  push(checks,'LEARNING_BLIND_NOT_CONSUMED',learningScorecard?.governance?.blindResultsConsumed===false,learningScorecard?.governance?.blindResultsConsumed);
  push(checks,'LEARNING_PREDICTION_OFF',learningScorecard?.governance?.predictionInputAuthorized===false,learningScorecard?.governance?.predictionInputAuthorized);
  push(checks,'LEARNING_CLOUD_SAFE',cloudSafe(learningScorecard),learningScorecard?.runtimePolicy);

  const failed=checks.filter((x)=>!x.pass);
  return {schemaVersion:LOCAL_EDGE_LAB_V084_HEALTH_SCHEMA,status:failed.length?'BLOCKED':'PASS',evaluatedAtMs:Number(nowMs),maxAgeMs:Number(maxAgeMs),checks,failedChecks:failed.map((x)=>x.name),governance:{installationHealthOnly:true,predictionInputAuthorized:false,executionAuthorized:false,realMoneyRouting:false,orderSubmission:false,automaticPromotion:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}
