import crypto from 'node:crypto';

export const LOCAL_EDGE_LAB_REBOOT_RECOVERY_SCHEMA='voicetrader-local-edge-lab-reboot-recovery-v1';
const round=(v)=>Math.round(Number(v));
export function deriveBootEpochMs({nowMs=Date.now(),uptimeSec}={}){const n=Number(nowMs),u=Number(uptimeSec);if(!Number.isFinite(n)||!Number.isFinite(u)||u<0)throw new Error('reboot-recovery-time-invalid');return round(n-u*1000);}
export function bootIdFromEpoch(bootEpochMs){const t=Number(bootEpochMs);if(!Number.isFinite(t)||t<0)throw new Error('reboot-recovery-boot-time-invalid');return crypto.createHash('sha256').update(`voicetrader-boot-v1|${Math.floor(t/10_000)*10_000}`).digest('hex');}
export function buildBootWitness({nowMs=Date.now(),uptimeSec,exactRuntimeRef=null,installBootId=null,healthStatus=null,healthEvaluatedAtMs=null}={}){
  const bootEpochMs=deriveBootEpochMs({nowMs,uptimeSec}),bootId=bootIdFromEpoch(bootEpochMs),runtime=String(exactRuntimeRef||'');
  const runtimePinned=/^[0-9a-f]{40}$/.test(runtime),differentFromInstall=typeof installBootId==='string'&&installBootId.length>0?bootId!==installBootId:false,healthPass=healthStatus==='PASS';
  return {schemaVersion:LOCAL_EDGE_LAB_REBOOT_RECOVERY_SCHEMA,witnessedAtMs:Number(nowMs),bootEpochMs,bootId,exactRuntimeRef:runtimePinned?runtime:null,installBootId:installBootId||null,recovery:{runtimePinned,currentBootDiffersFromInstallBoot:differentFromInstall,healthPass,rebootRecoveryProven:runtimePinned&&differentFromInstall&&healthPass,healthStatus:healthStatus??null,healthEvaluatedAtMs:Number.isFinite(Number(healthEvaluatedAtMs))?Number(healthEvaluatedAtMs):null},governance:{observationOnly:true,predictionInputAuthorized:false,executionAuthorized:false,orderSubmission:false,realMoneyRouting:false},runtimePolicy:{googleCloudEnabled:false,cloudUploadEnabled:false}};
}
