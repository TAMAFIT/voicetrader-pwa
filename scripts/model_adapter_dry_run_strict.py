#!/usr/bin/env python3
import argparse
import json
import sys
from model_adapter_dry_run import scan_forbidden, validate_request, build_response


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--request',required=True)
    parser.add_argument('--output')
    args=parser.parse_args()
    try:
        with open(args.request,'r',encoding='utf-8') as handle:
            request=json.load(handle)
        scan_forbidden(request)
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
