// Mock extraction provider (FR-3): looks up the supplied extraction_mock files by doc_id.
// An unknown document returns doc_type OTHER with confidence 0.00.
const fs = require('fs');
const { dataPath, readCsv } = require('../utils/dataFiles');

const VERSION = 'mock-1.0';
const MOCK_FILES = ['case_02_extraction_mock_sample_V1.0.csv', 'case_02_extraction_mock_eval_V1.0.csv'];

let cache = null;

function load() {
  if (cache) return cache;
  cache = new Map();
  for (const file of MOCK_FILES) {
    const full = dataPath(file);
    if (!fs.existsSync(full)) continue;
    for (const r of readCsv(full)) {
      if (!cache.has(r.doc_id)) cache.set(r.doc_id, []);
      cache.get(r.doc_id).push({ field_name: r.field_name, value: r.value, confidence: Number(r.confidence) });
    }
  }
  return cache;
}

// Returns rows in the long format: [{ field_name, value, confidence }], first row is doc_type.
async function extract({ doc_id }) {
  const rows = load().get(doc_id);
  if (!rows) return { rows: [{ field_name: 'doc_type', value: 'OTHER', confidence: 0 }], provider: 'mock', extractor_version: VERSION };
  const docType = rows.find((r) => r.field_name === 'doc_type') || { field_name: 'doc_type', value: 'OTHER', confidence: 0 };
  return {
    rows: [docType, ...rows.filter((r) => r.field_name !== 'doc_type')],
    provider: 'mock',
    extractor_version: VERSION,
  };
}

module.exports = { name: 'mock', extract, VERSION };
