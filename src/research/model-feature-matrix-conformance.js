import { fingerprintModelFeatureMatrixBundle, MODEL_FEATURE_MATRIX_BUNDLE_VERSION } from './model-feature-matrix-runtime.js';

export const MODEL_MATRIX_CONFORMANCE_VERSION='model-feature-matrix-conformance-0.1';
export const MODEL_MATRIX_CONFORMANCE_WIRE_VERSION='matrix-conformance-ascii-hex-v1';
export const MODEL_MATRIX_CONFORMANCE_GOVERNANCE=Object.freeze({
  readOnly:true,
  jsReference:true,
  pythonStdlibReference:true,
  preprocessingAdapterConformanceOnly:true,
  modelAdapterInstalled:false,
  modelFitImplemented:false,
  modelPredictImplemented:false,
  executionAuthorized:false,
  launchesTrainingJobs:false,
  browserExecutionAuthority:false,
  writesProspectiveExperience:false,
  writesLifecycle:false,
});

const encoder=new TextEncoder();
const clone=value=>JSON.parse(JSON.stringify(value));
const hex=value=>[...encoder.encode(String(value??''))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const number12=value=>{const n=Number(value);if(!Number.isFinite(n))throw new Error('conformance-non-finite-number');const text=n.toFixed(12);return text==='-0.000000000000'?'0.000000000000':text;};
function fnv1a64Ascii(text){let hash=0xcbf29ce484222325n;const prime=0x100000001b3n;for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);if(code>0x7f)throw new Error('conformance-wire-not-ascii');hash^=BigInt(code);hash=BigInt.asUintN(64,hash*prime);}return hash.toString(16).padStart(16,'0');}
export const fingerprintModelMatrixConformanceWire=wire=>`fnv1a64:${fnv1a64Ascii(String(wire||''))}`;

function verifyBundle(bundle){const errors=[];if(bundle?.version!==MODEL_FEATURE_MATRIX_BUNDLE_VERSION)errors.push('matrix-bundle-version-mismatch');if(bundle?.bundleFingerprint!==fingerprintModelFeatureMatrixBundle(bundle))errors.push('matrix-bundle-fingerprint-mismatch');if(bundle?.status!=='DETERMINISTIC_MATRIX_READY_MODEL_EXECUTION_BLOCKED')errors.push('matrix-bundle-status-invalid');if(bundle?.governance?.modelFitImplemented!==false||bundle?.governance?.modelPredictImplemented!==false||bundle?.governance?.executionAuthorized!==false)errors.push('matrix-bundle-authority-drift');if(!Array.isArray(bundle?.contract?.outputColumns)||!bundle.contract.outputColumns.length)errors.push('matrix-output-columns-missing');for(const partition of ['train','validation','internalTest']){const item=bundle?.partitions?.[partition];if(!item||!Array.isArray(item.rowKeys)||!Array.isArray(item.X)||!Array.isArray(item.y)||item.rowKeys.length!==item.X.length||item.rowKeys.length!==item.y.length)errors.push(`matrix-partition-invalid:${partition}`);}return {pass:errors.length===0,errorCodes:[...new Set(errors)]};}

function buildWireLines(bundle){const lines=[`V|${MODEL_MATRIX_CONFORMANCE_WIRE_VERSION}`,`M|${hex(bundle.source.manifestFingerprint)}`,`D|${hex(bundle.source.datasetCommit)}`,`E|${hex(bundle.source.experimentId)}|${bundle.source.revision}|${hex(bundle.source.semanticFingerprint)}`];bundle.contract.outputColumns.forEach((column,index)=>lines.push(`C|${index}|${hex(column)}`));bundle.trainStatistics.statistics.forEach((stat,index)=>lines.push(`S|${index}|${hex(stat.path)}|${stat.count}|${number12(stat.mean)}|${number12(stat.std)}|${stat.zeroVariance?'1':'0'}`));for(const partition of ['train','validation','internalTest']){const item=bundle.partitions[partition];lines.push(`P|${hex(partition)}|${item.rowCount}|${item.columnCount}`);for(let i=0;i<item.rowKeys.length;i++){const x=item.X[i].map(number12).join('|'),target=item.y[i],targetWire=bundle.contract.target.task==='classification'?`YS|${hex(target)}`:`YN|${number12(target)}`;lines.push(`R|${i}|${hex(item.rowKeys[i])}|${x}|${targetWire}`);}}return lines;}

export function buildModelMatrixConformanceRecord(bundle){const validation=verifyBundle(bundle);if(!validation.pass)throw new Error(`matrix-conformance-bundle-invalid:${validation.errorCodes.join(',')}`);const lines=buildWireLines(bundle),wire=`${lines.join('\n')}\n`,record={version:MODEL_MATRIX_CONFORMANCE_VERSION,wireVersion:MODEL_MATRIX_CONFORMANCE_WIRE_VERSION,status:'PREPROCESSING_ADAPTER_REFERENCE_READY_MODEL_ADAPTER_BLOCKED',source:{bundleFingerprint:bundle.bundleFingerprint,manifestFingerprint:bundle.source.manifestFingerprint,datasetCommit:bundle.source.datasetCommit},shape:{columns:bundle.contract.outputColumns.length,trainRows:bundle.partitions.train.rowCount,validationRows:bundle.partitions.validation.rowCount,internalTestRows:bundle.partitions.internalTest.rowCount},statisticsCount:bundle.trainStatistics.statistics.length,statisticsWireFingerprint:fingerprintModelMatrixConformanceWire(`${lines.filter(line=>line.startsWith('S|')).join('\n')}\n`),conformanceFingerprint:fingerprintModelMatrixConformanceWire(wire),governance:{...MODEL_MATRIX_CONFORMANCE_GOVERNANCE},wire};return Object.freeze(record);}

export function verifyModelMatrixConformanceRecord(record){const errors=[];if(record?.version!==MODEL_MATRIX_CONFORMANCE_VERSION)errors.push('conformance-version-mismatch');if(record?.wireVersion!==MODEL_MATRIX_CONFORMANCE_WIRE_VERSION)errors.push('conformance-wire-version-mismatch');if(record?.conformanceFingerprint!==fingerprintModelMatrixConformanceWire(record?.wire||''))errors.push('conformance-fingerprint-mismatch');if(record?.governance?.modelAdapterInstalled!==false||record?.governance?.modelFitImplemented!==false||record?.governance?.executionAuthorized!==false)errors.push('conformance-authority-drift');return {pass:errors.length===0,errorCount:errors.length,errorCodes:[...new Set(errors)]};}
