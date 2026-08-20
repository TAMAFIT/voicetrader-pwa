import fs from 'node:fs';
import path from 'node:path';
import { validateShortHorizonSignalRecord } from '../../src/short-horizon/signal-contract.js';

function walkFiles(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, output);
    else if (entry.isFile() && entry.name.endsWith('.ndjson')) output.push(full);
  }
  return output;
}

export function readProspectiveSignalArchive(rootDir) {
  if (!rootDir) throw new Error('signal-reader-root-required');
  const base = path.join(rootDir, 'data', 'short-horizon-signals');
  const files = walkFiles(base).sort();
  const records = [];
  const seen = new Set();

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').trim();
    if (!text) continue;
    for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
      let record;
      try {
        record = JSON.parse(line);
        validateShortHorizonSignalRecord(record);
      } catch (error) {
        throw new Error(`signal-reader-invalid-line:${file}:${index + 1}:${error?.message || error}`);
      }
      if (record.observationMode !== 'prospective' || record.observedProspectively !== true) {
        throw new Error(`signal-reader-nonprospective:${record.signalId}`);
      }
      if (seen.has(record.signalId)) throw new Error(`signal-reader-duplicate-id:${record.signalId}`);
      seen.add(record.signalId);
      records.push(record);
    }
  }

  records.sort((a, b) =>
    Number(a.market?.sourceTimestampMs || 0) - Number(b.market?.sourceTimestampMs || 0) ||
    String(a.signalId).localeCompare(String(b.signalId)),
  );
  return { files, records };
}
