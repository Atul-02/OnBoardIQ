// Extraction service interface (FR-3). The provider is picked by EXTRACTION_PROVIDER (mock | ai),
// so switching needs no code change.
const config = require('../config');
const mockProvider = require('./mockProvider');
const aiProvider = require('./aiProvider');

const PROVIDERS = { mock: mockProvider, ai: aiProvider };

function getProvider(name = config.EXTRACTION_PROVIDER) {
  const p = PROVIDERS[name];
  if (!p) throw new Error(`Unknown EXTRACTION_PROVIDER "${name}" (use mock or ai)`);
  return p;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Extraction timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Runs the configured provider on one document.
// Never throws: on failure/timeout the document gets doc_type OTHER with confidence 0 (-> REVIEW via R2/R3).
async function extractDocument({ doc_id, text }) {
  const provider = getProvider();
  try {
    const out = await withTimeout(provider.extract({ doc_id, text }), config.EXTRACTION_TIMEOUT_MS);
    return { ...out, error: null };
  } catch (err) {
    return {
      rows: [{ field_name: 'doc_type', value: 'OTHER', confidence: 0 }],
      provider: provider.name,
      extractor_version: provider.VERSION,
      error: err.message,
    };
  }
}

// Long rows -> the shape stored on the Document and used by the rules engine.
function rowsToExtraction(rows, source) {
  const out = { doc_type: { value: 'OTHER', confidence: 0, source }, fields: {} };
  for (const r of rows) {
    const entry = { value: r.value === null || r.value === undefined ? '' : String(r.value), confidence: Number(r.confidence) || 0, source };
    if (r.field_name === 'doc_type') out.doc_type = entry;
    else out.fields[r.field_name] = entry;
  }
  return out;
}

module.exports = { extractDocument, rowsToExtraction, getProvider };
