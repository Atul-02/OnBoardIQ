// Writes every document text from the .jsonl files to data/documents/<set>/<file_name>,
// so they can be uploaded through Postman or the UI (section 4: "Write each text to <file_name>").
// Usage: node scripts/writeDocFiles.js
const fs = require('fs');
const path = require('path');
const { DATA_DIR, dataPath, readJsonl } = require('../src/utils/dataFiles');

for (const set of ['sample', 'eval']) {
  const file = dataPath(`case_02_document_text_${set}_V1.0.jsonl`);
  if (!fs.existsSync(file)) continue;
  const outDir = path.join(DATA_DIR, 'documents', set);
  fs.mkdirSync(outDir, { recursive: true });
  const rows = readJsonl(file);
  for (const r of rows) {
    const name = path.basename(r.file_name || `${r.doc_id}.txt`); // never write outside outDir
    fs.writeFileSync(path.join(outDir, name), r.text, 'utf8');
  }
  console.log(`${set}: wrote ${rows.length} files to ${outDir}`);
}
