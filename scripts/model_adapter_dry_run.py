#!/usr/bin/env python3
import argparse
import json
import math
import platform
import sys

REQUEST_VERSION='model-adapter-dry-run-request-0.1'
RESPONSE_VERSION='model-adapter-dry-run-response-0.1'
WIRE_VERSION='model-adapter-dry-run-ascii-hex-v1'
MASK64=(1<<64)-1
FNV_OFFSET=0xCBF29CE484222325
FNV_PRIME=0x100000001B3
FORBIDDEN_KEYS={'x','y','rows','row','labels','label','features','featurevalues','targets','targetvalues','predictions','prediction','metrics','results','result','trades','ohlcv','marketatdecision'}


def fail(code):
    raise RuntimeError(code)


def hex_text(value):
    return str(value if value is not None else '').encode('utf-8').hex()


def fnv_ascii(text):
    try:
        data=text.encode('ascii')
    except UnicodeEncodeError as exc:
        raise RuntimeError('adapter-dry-run-wire-not-ascii') from exc
    h=FNV_OFFSET
    for byte in data:
        h^=byte
        h=(h*FNV_PRIME)&MASK64
    return f'fnv1a64:{h:016x}'


def scalar_wire(value):
    if value is None:
        return 'null',''
    if isinstance(value,bool):
        return 'bool','true' if value else 'false'
    if isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(float(value)):
        if isinstance(value,int) or float(value).is_integer():
            return 'number',str(int(value))
        return 'number',repr(float(value))
    if isinstance(value,str):
        return 'string',hex_text(value)
    fail('adapter-dry-run-hyperparameter-type-unsupported')


def scan_forbidden(value,path='request'):
    if isinstance(value,list):
        for index,item in enumerate(value):
            scan_forbidden(item,f'{path}[{index}]')
        return
    if not isinstance(value,dict):
        return
    for key,item in value.items():
        if str(key).lower() in FORBIDDEN_KEYS:
            fail(f'adapter-dry-run-forbidden-payload-key:{path}.{key}')
        scan_forbidden(item,f'{path}.{key}')


def build_request_wire(request):
    source=request['source'];adapter=request['adapter'];runtime=request['runtimeProbe']['runtime']
    lines=[
        f'V|{WIRE_VERSION}',
        f'E|{source["envelopeFingerprint"]}',
        f'P|{source["preparationFingerprint"]}',
        f'A|{hex_text(adapter["adapterId"])}|{hex_text(adapter["interfaceVersion"])}|{hex_text(adapter["algorithmId"])}|{hex_text(adapter["provider"])}',
    ]
    for key in sorted(adapter['hyperparameters'].keys()):
        kind,value=scalar_wire(adapter['hyperparameters'][key])
        lines.append(f'H|{hex_text(key)}|{kind}|{value}')
    lines.append(f'D|{request["dependencyRequirement"]["requirementFingerprint"]}')
    lines.append(f'R|{hex_text(runtime["implementation"])}|{hex_text(runtime["pythonVersion"])}|{hex_text(runtime["platformSystem"])}|{hex_text(runtime["platformMachine"])}')
    lines.append('C|0|0|0|0|0|0|0')
    lines.append('X|0')
    return '\n'.join(lines)+'\n'


def validate_request(request):
    if request.get('version')!=REQUEST_VERSION or request.get('status')!='DRY_RUN_METADATA_ONLY_EXECUTION_BLOCKED':
        fail('adapter-dry-run-request-version-status-invalid')
    if request.get('expectedResponse')!='ADAPTER_NOT_INSTALLED':
        fail('adapter-dry-run-expected-response-drift')
    if request.get('authority',{}).get('executionAuthorized') is not False:
        fail('adapter-dry-run-authority-drift')
    policy=request.get('payloadPolicy',{})
    if not policy or any(value is not False for value in policy.values()):
        fail('adapter-dry-run-payload-policy-drift')
    scan_forbidden({'adapter':request.get('adapter'),'dependencyRequirement':request.get('dependencyRequirement'),'runtimeProbe':request.get('runtimeProbe')})
    wire=build_request_wire(request)
    if request.get('requestWire')!=wire:
        fail('adapter-dry-run-request-wire-drift')
    if request.get('requestFingerprint')!=fnv_ascii(wire):
        fail('adapter-dry-run-request-fingerprint-mismatch')
    runtime=request['runtimeProbe']['runtime']
    current={'implementation':platform.python_implementation(),'pythonVersion':platform.python_version(),'platformSystem':platform.system(),'platformMachine':platform.machine()}
    for key,value in current.items():
        if runtime.get(key)!=value:
            fail(f'runtime-probe-current-process-drift:{key}')
    return current


def build_response(request,current_runtime):
    actions={'dependencyResolutionAttempted':False,'dependencyInstallationAttempted':False,'modelImportsAttempted':False,'modelFitAttempted':False,'modelPredictAttempted':False,'modelEvaluationAttempted':False,'evidenceWriteAttempted':False,'executionAuthorized':False}
    adapter=request['adapter']
    lines=[
        f'V|{RESPONSE_VERSION}',
        f'Q|{request["requestFingerprint"]}',
        f'A|{hex_text(adapter["adapterId"])}|{hex_text(adapter["interfaceVersion"])}',
        'S|ADAPTER_NOT_INSTALLED',
        'F|0|0|0|0|0|0|0|0',
        f'R|{hex_text(current_runtime["implementation"])}|{hex_text(current_runtime["pythonVersion"])}|{hex_text(current_runtime["platformSystem"])}|{hex_text(current_runtime["platformMachine"])}',
    ]
    wire='\n'.join(lines)+'\n'
    return {'version':RESPONSE_VERSION,'status':'ADAPTER_NOT_INSTALLED','requestFingerprint':request['requestFingerprint'],'adapterId':adapter['adapterId'],'interfaceVersion':adapter['interfaceVersion'],'observedRuntime':current_runtime,'actions':actions,'responseWire':wire,'responseFingerprint':fnv_ascii(wire)}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--request',required=True)
    parser.add_argument('--output')
    args=parser.parse_args()
    try:
        with open(args.request,'r',encoding='utf-8') as handle:
            request=json.load(handle)
        current=validate_request(request)
        response=build_response(request,current)
        if args.output:
            with open(args.output,'w',encoding='utf-8') as handle:
                json.dump(response,handle,ensure_ascii=False,indent=2)
                handle.write('\n')
        print(json.dumps({k:response[k] for k in ['version','status','requestFingerprint','adapterId','interfaceVersion','observedRuntime','actions','responseFingerprint']},ensure_ascii=False,separators=(',',':')))
        return 0
    except Exception as exc:
        print(str(exc),file=sys.stderr)
        return 1


if __name__=='__main__':
    raise SystemExit(main())
