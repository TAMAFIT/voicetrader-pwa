#!/usr/bin/env python3
import argparse
import json
import math
import sys

WIRE_VERSION = 'matrix-conformance-ascii-hex-v1'
CONFORMANCE_VERSION = 'model-feature-matrix-conformance-0.1'
MASK64 = (1 << 64) - 1
FNV_OFFSET = 0xCBF29CE484222325
FNV_PRIME = 0x100000001B3
PARTITIONS = ('train', 'validation', 'internalTest')


def fail(code):
    raise RuntimeError(code)


def utf8_hex(value):
    return str(value if value is not None else '').encode('utf-8').hex()


def fnv1a64_ascii(text):
    try:
        data = text.encode('ascii')
    except UnicodeEncodeError as exc:
        raise RuntimeError('conformance-wire-not-ascii') from exc
    h = FNV_OFFSET
    for byte in data:
        h ^= byte
        h = (h * FNV_PRIME) & MASK64
    return f'fnv1a64:{h:016x}'


def ecma_tofixed_text(value, decimals=12):
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(float(value)):
        fail('conformance-non-finite-number')
    x = float(value)
    negative = math.copysign(1.0, x) < 0.0 and x != 0.0
    numerator, denominator = abs(x).as_integer_ratio()
    scale = 10 ** int(decimals)
    q, r = divmod(numerator * scale, denominator)
    if r * 2 >= denominator:
        q += 1
    digits = str(q)
    if decimals:
        digits = digits.rjust(decimals + 1, '0')
        text = f'{digits[:-decimals]}.{digits[-decimals:]}'
    else:
        text = digits
    if negative:
        text = '-' + text
    return text


def rounded_float(value, decimals=12):
    result = float(ecma_tofixed_text(value, decimals))
    return 0.0 if result == 0.0 else result


def read_path(obj, path):
    current = obj
    for part in str(path).split('.'):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def require_numeric(row, key, path):
    value = read_path(row, path)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        fail(f'matrix-numeric-feature-invalid:{key}:{path}')
    return float(value)


def require_category(row, key, path, categories):
    value = read_path(row, path)
    if not isinstance(value, str) or value not in categories:
        fail(f'matrix-categorical-feature-invalid:{key}:{path}')
    return value


def validate_inputs(manifest, dataset, dataset_commit):
    if dataset.get('schemaVersion') != 'prospective-experience-dataset-0.1' or dataset.get('audit', {}).get('pass') is not True or dataset.get('mergeConflicts', []):
        fail('prospective-dataset-audit-not-pass')
    if str(dataset_commit).lower() != str(manifest.get('source', {}).get('dataset', {}).get('commitSha', '')).lower():
        fail('dataset-commit-manifest-mismatch')
    p = manifest.get('preprocessing', {})
    n = p.get('numeric', {})
    if p.get('id') != 'fixed-tabular-standardize-v3':
        fail('preprocessing-version-mismatch')
    expected_numeric = {
        'transform': 'standard-score',
        'fitPartition': 'train-only',
        'arithmetic': 'ieee754-binary64',
        'accumulationOrder': 'frozen-train-row-order',
        'statisticComputation': 'sequential-two-pass',
        'varianceDefinition': 'population',
        'varianceCenter': 'unrounded-train-mean',
        'ddof': 0,
        'roundingAlgorithm': 'ecmascript-number-tofixed-v1',
        'roundingTieRule': 'nearest-scaled-integer-ties-to-larger-magnitude',
        'statisticRoundDecimals': 12,
        'transformUses': 'rounded-mean-and-std',
        'transformRoundDecimals': 12,
        'zeroVariancePolicy': 'emit-zero',
    }
    for key, value in expected_numeric.items():
        if n.get(key) != value:
            fail(f'numeric-preprocessing-contract-drift:{key}')
    c = p.get('categorical', {})
    if c.get('encoding') != 'fixed-one-hot' or c.get('fitCategories') is not False or c.get('values') != {'off': 0, 'on': 1}:
        fail('categorical-preprocessing-contract-drift')
    if p.get('missingValuePolicy') != 'reject' or p.get('unknownCategoryPolicy') != 'reject':
        fail('preprocessing-fail-closed-contract-drift')


def output_columns(manifest):
    categories = manifest['preprocessing']['categorical'].get('categories', {})
    columns = []
    for path in manifest['featureSet']['paths']:
        if path in categories:
            for category in categories[path]:
                columns.append(f'{path}=={category}')
        else:
            columns.append(path)
    if columns != manifest.get('outputColumns', []):
        fail('manifest-output-columns-drift')
    return columns


def partition_keys(manifest, partition):
    keys = []
    instruments = manifest.get('split', {}).get('instruments', {})
    for instrument in sorted(instruments.keys()):
        split = instruments[instrument]
        items = split.get('partitions', {}).get(partition, {}).get('experienceKeys')
        if not isinstance(items, list):
            fail(f'manifest-partition-missing:{instrument}:{partition}')
        keys.extend(items)
    return keys


def fit_statistics(dataset, manifest):
    rows = {row['experienceKey']: row for row in dataset.get('rows', [])}
    keys = partition_keys(manifest, 'train')
    if not keys:
        fail('matrix-train-partition-empty')
    categories = manifest['preprocessing']['categorical'].get('categories', {})
    numeric_paths = [path for path in manifest['featureSet']['paths'] if path not in categories]
    decimals = manifest['preprocessing']['numeric']['statisticRoundDecimals']
    stats = []
    for path in numeric_paths:
        total = 0.0
        for key in keys:
            row = rows.get(key)
            if row is None:
                fail(f'matrix-row-missing:{key}')
            total += require_numeric(row, key, path)
        mean_raw = total / len(keys)
        squared = 0.0
        for key in keys:
            value = require_numeric(rows[key], key, path)
            delta = value - mean_raw
            squared += delta * delta
        variance_raw = squared / len(keys)
        std_raw = math.sqrt(variance_raw)
        mean = rounded_float(mean_raw, decimals)
        std = rounded_float(std_raw, decimals)
        zero = variance_raw == 0.0 or std == 0.0
        stats.append({'path': path, 'count': len(keys), 'mean': mean, 'std': 0.0 if zero else std, 'zeroVariance': zero})
    return stats


def target_value(row, key, target):
    value = read_path(row, target['labelPath'])
    if target['task'] == 'classification':
        if value not in target['classes']:
            fail(f'matrix-target-class-invalid:{key}')
        return value
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        fail(f'matrix-target-value-invalid:{key}')
    if target.get('numericRoundingAlgorithm') != 'ecmascript-number-tofixed-v1':
        fail('matrix-target-rounding-contract-invalid')
    return rounded_float(float(value), target.get('numericRoundDecimals', 12))


def transform_partitions(dataset, manifest, stats, columns):
    rows = {row['experienceKey']: row for row in dataset.get('rows', [])}
    categories = manifest['preprocessing']['categorical'].get('categories', {})
    values = manifest['preprocessing']['categorical']['values']
    decimals = manifest['preprocessing']['numeric']['transformRoundDecimals']
    stats_by_path = {item['path']: item for item in stats}
    result = {}
    for partition in PARTITIONS:
        keys = partition_keys(manifest, partition)
        x_rows, y_rows = [], []
        for key in keys:
            row = rows.get(key)
            if row is None:
                fail(f'matrix-row-missing:{key}')
            vector = []
            for path in manifest['featureSet']['paths']:
                allowed = categories.get(path)
                if allowed is not None:
                    value = require_category(row, key, path, allowed)
                    vector.extend(values['on'] if value == category else values['off'] for category in allowed)
                else:
                    value = require_numeric(row, key, path)
                    stat = stats_by_path.get(path)
                    if stat is None:
                        fail(f'matrix-statistic-missing:{path}')
                    transformed = 0.0 if stat['zeroVariance'] else rounded_float((value - stat['mean']) / stat['std'], decimals)
                    vector.append(transformed)
            if len(vector) != len(columns):
                fail(f'matrix-column-count-drift:{key}')
            x_rows.append(vector)
            y_rows.append(target_value(row, key, manifest['target']))
        result[partition] = {'rowKeys': keys, 'X': x_rows, 'y': y_rows, 'rowCount': len(keys), 'columnCount': len(columns)}
    return result


def build_wire(manifest, dataset_commit, columns, stats, partitions):
    lines = [
        f'V|{WIRE_VERSION}',
        f'M|{utf8_hex(manifest["manifestFingerprint"])}',
        f'D|{utf8_hex(str(dataset_commit).lower())}',
        f'E|{utf8_hex(manifest["experiment"]["experimentId"])}|{manifest["experiment"]["revision"]}|{utf8_hex(manifest["experiment"]["semanticFingerprint"])}',
    ]
    for index, column in enumerate(columns):
        lines.append(f'C|{index}|{utf8_hex(column)}')
    stat_lines = []
    for index, stat in enumerate(stats):
        line = f'S|{index}|{utf8_hex(stat["path"])}|{stat["count"]}|{ecma_tofixed_text(stat["mean"],12)}|{ecma_tofixed_text(stat["std"],12)}|{"1" if stat["zeroVariance"] else "0"}'
        lines.append(line)
        stat_lines.append(line)
    for partition in PARTITIONS:
        item = partitions[partition]
        lines.append(f'P|{utf8_hex(partition)}|{item["rowCount"]}|{item["columnCount"]}')
        for index, key in enumerate(item['rowKeys']):
            x_wire = '|'.join(ecma_tofixed_text(value, 12) for value in item['X'][index])
            target = item['y'][index]
            if manifest['target']['task'] == 'classification':
                y_wire = f'YS|{utf8_hex(target)}'
            else:
                y_wire = f'YN|{ecma_tofixed_text(target, 12)}'
            lines.append(f'R|{index}|{utf8_hex(key)}|{x_wire}|{y_wire}')
    wire = '\n'.join(lines) + '\n'
    stats_wire = '\n'.join(stat_lines) + '\n'
    return wire, stats_wire


def build_record(manifest, dataset, dataset_commit):
    validate_inputs(manifest, dataset, dataset_commit)
    columns = output_columns(manifest)
    stats = fit_statistics(dataset, manifest)
    partitions = transform_partitions(dataset, manifest, stats, columns)
    wire, stats_wire = build_wire(manifest, dataset_commit, columns, stats, partitions)
    return {
        'version': CONFORMANCE_VERSION,
        'wireVersion': WIRE_VERSION,
        'status': 'PREPROCESSING_ADAPTER_CONFORMANT_MODEL_ADAPTER_BLOCKED',
        'source': {'manifestFingerprint': manifest['manifestFingerprint'], 'datasetCommit': str(dataset_commit).lower()},
        'shape': {'columns': len(columns), 'trainRows': partitions['train']['rowCount'], 'validationRows': partitions['validation']['rowCount'], 'internalTestRows': partitions['internalTest']['rowCount']},
        'statisticsCount': len(stats),
        'statisticsWireFingerprint': fnv1a64_ascii(stats_wire),
        'conformanceFingerprint': fnv1a64_ascii(wire),
        'governance': {'pythonStdlibReference': True, 'preprocessingAdapterConformant': True, 'modelAdapterInstalled': False, 'modelFitImplemented': False, 'modelPredictImplemented': False, 'executionAuthorized': False, 'launchesTrainingJobs': False},
        'wire': wire,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--dataset', required=True)
    parser.add_argument('--dataset-commit', required=True)
    parser.add_argument('--output')
    args = parser.parse_args()
    try:
        with open(args.manifest, 'r', encoding='utf-8') as handle:
            manifest = json.load(handle)
        with open(args.dataset, 'r', encoding='utf-8') as handle:
            dataset = json.load(handle)
        record = build_record(manifest, dataset, args.dataset_commit)
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as handle:
                json.dump(record, handle, ensure_ascii=False, indent=2)
                handle.write('\n')
        summary = {key: record[key] for key in ('version', 'wireVersion', 'status', 'source', 'shape', 'statisticsCount', 'statisticsWireFingerprint', 'conformanceFingerprint', 'governance')}
        print(json.dumps(summary, ensure_ascii=False, separators=(',', ':')))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
