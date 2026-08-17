import { auditModelExperimentLifecycleDocument, migrateLegacyEmptyModelExperimentLifecycleDocument, MODEL_EXPERIMENT_LIFECYCLE_DATA_BRANCH, MODEL_EXPERIMENT_LIFECYCLE_DATA_PATH, MODEL_EXPERIMENT_LIFECYCLE_VERSION } from './model-experiment-lifecycle.js';

export const MODEL_EXPERIMENT_LIFECYCLE_REMOTE_VERSION='model-experiment-lifecycle-remote-0.2';
export const MODEL_EXPERIMENT_LIFECYCLE_RAW_URL=`https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/${MODEL_EXPERIMENT_LIFECYCLE_DATA_BRANCH}/${MODEL_EXPERIMENT_LIFECYCLE_DATA_PATH}`;

export async function fetchModelExperimentLifecycleDocument({fetchImpl=fetch,url=MODEL_EXPERIMENT_LIFECYCLE_RAW_URL,timeoutMs=5000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`model experiment lifecycle remote HTTP ${response.status}`);
    const persisted=await response.json();const migratedLegacyEmpty=persisted?.schemaVersion!==MODEL_EXPERIMENT_LIFECYCLE_VERSION;const document=migratedLegacyEmpty?migrateLegacyEmptyModelExperimentLifecycleDocument(persisted):persisted;
    const audit=auditModelExperimentLifecycleDocument(document);
    if(!audit.pass)throw new Error(`model experiment lifecycle audit failed: ${audit.errorCodes.join(',')}`);
    if(!migratedLegacyEmpty&&persisted?.audit?.pass!==true)throw new Error(`model experiment lifecycle persisted audit not pass: ${persisted?.audit?.status||'missing'}`);
    return {document:{...document,audit},error:null,migratedLegacyEmpty};
  }catch(error){return {document:null,error:String(error?.message||error),migratedLegacyEmpty:false};}
  finally{clearTimeout(timer);}
}
