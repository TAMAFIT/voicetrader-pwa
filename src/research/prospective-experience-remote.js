import { PROSPECTIVE_EXPERIENCE_DATASET_VERSION } from './prospective-experience-dataset.js';

export const PROSPECTIVE_EXPERIENCE_REMOTE_VERSION='prospective-experience-remote-0.1';
export const PROSPECTIVE_EXPERIENCE_DATA_BRANCH='prospective-experience-data';
export const PROSPECTIVE_EXPERIENCE_DATA_PATH='data/prospective-experience-v1.json';
export const PROSPECTIVE_EXPERIENCE_RAW_URL='https://raw.githubusercontent.com/TAMAFIT/voicetrader-pwa/prospective-experience-data/data/prospective-experience-v1.json';

export async function fetchProspectiveExperienceDocument({fetchImpl=fetch,url=PROSPECTIVE_EXPERIENCE_RAW_URL,timeoutMs=5000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`experience remote HTTP ${response.status}`);
    const document=await response.json();
    if(document?.schemaVersion!==PROSPECTIVE_EXPERIENCE_DATASET_VERSION)throw new Error(`experience schema mismatch: ${document?.schemaVersion||'missing'}`);
    if(document?.audit?.pass!==true)throw new Error(`experience audit not pass: ${document?.audit?.status||'missing'}`);
    if((document?.mergeConflicts||[]).length)throw new Error(`experience merge conflicts: ${document.mergeConflicts.length}`);
    return {document,error:null};
  }catch(error){return {document:null,error:String(error?.message||error)};}
  finally{clearTimeout(timer);}
}
