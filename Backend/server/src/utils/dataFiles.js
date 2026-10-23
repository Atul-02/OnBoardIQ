// Readers for the hackathon data pack (CSV / JSONL / JSON). Every value is kept as a string
// so things like aadhaar_last4 "0037" or a PAN ending in "O" are never changed.
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const DATA_DIR = path.resolve(__dirname, '..', '..', '..', 'data');

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, trim: false });
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

// Long-format extraction rows -> { doc_id: { doc_type: {value, confidence}, fields: {...} } }
function groupExtractions(rows, source = 'MOCK') {
  const out = {};
  for (const r of rows) {
    const id = r.doc_id;
    if (!out[id]) out[id] = { doc_type: { value: 'OTHER', confidence: 0 }, fields: {} };
    const entry = { value: r.value, confidence: Number(r.confidence) };
    if (r.field_name === 'doc_type') out[id].doc_type = entry;
    else out[id].fields[r.field_name] = { ...entry, source };
  }
  return out;
}

const dataPath = (name) => path.join(DATA_DIR, name);

module.exports = { DATA_DIR, dataPath, readCsv, readJsonl, readJson, groupExtractions };
