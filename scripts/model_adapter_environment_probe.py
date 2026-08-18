#!/usr/bin/env python3
import json
import platform
import sys


def main():
    record = {
        'version': 'model-runtime-environment-probe-0.1',
        'status': 'RUNTIME_METADATA_ONLY',
        'runtime': {
            'implementation': platform.python_implementation(),
            'pythonVersion': platform.python_version(),
            'platformSystem': platform.system(),
            'platformRelease': platform.release(),
            'platformMachine': platform.machine(),
        },
        'probe': {
            'sideEffectFree': True,
            'dependencyResolutionAttempted': False,
            'dependencyInstallationAttempted': False,
            'modelImportsAttempted': False,
            'modelFitAttempted': False,
            'modelPredictAttempted': False,
        },
        'authority': {
            'modelAdapterInstalled': False,
            'executionAuthorized': False,
            'resultProductionAuthorized': False,
        },
    }
    print(json.dumps(record, ensure_ascii=False, separators=(',', ':')))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
