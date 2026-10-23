// FR-11 batch command. Reads an applications file, its documents file and an extraction file
// straight from disk (no database needed) and writes decisions_output.csv.
//
// Usage:
//   node scripts/batch.js                 -> sample files  -> output/decisions_output_sample.csv
//   node scripts/batch.js --set eval      -> eval files    -> output/decisions_output.csv
//   node scripts/batch.js --apps a.csv --docs d.csv --extraction e.csv --out out.csv
const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');
const { evaluate, fmtScore } = require('../src/engine/rules');
const { dataPath, readCsv, readJson, groupExtractions } = require('../src/utils/dataFiles');

const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'output');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

function buildFileContext() {
  const cfg = readJson(dataPath('case_02_rules_config_V1.0.json'));
  const sanctions = readCsv(dataPath('case_02_sanctions_list_V1.0.csv')).map((r) => ({ ...r, id: r.list_id }));
  const peps = readCsv(dataPath('case_02_pep_list_V1.0.csv')).map((r) => ({ ...r, id: r.pep_id }));
  const existingPans = new Set(readCsv(dataPath('case_02_existing_customers_V1.0.csv')).map((r) => r.pan_number.trim().toUpperCase()));
  const occupations = new Map(readCsv(dataPath('case_02_occupations_V1.0.csv')).map((r) => [r.occupation_code, r.risk_level]));
  return { cfg, sanctions, peps, existingPans, occupations };
}

function run({ appsFile, docsFile, extractionFile, outFile, ctx }) {
  const started = Date.now();
  const apps = readCsv(appsFile);
  const docs = readCsv(docsFile);
  const extractions = groupExtractions(readCsv(extractionFile));

  const docsByApp = {};
  for (const d of docs) (docsByApp[d.application_id] ||= []).push(d);

  const rows = [['application_id', 'decision', 'reason_codes', 'name_match_score', 'risk_category', 'rekyc_due_date']];
  const results = [];
  for (const app of apps) {
    const appDocs = (docsByApp[app.application_id] || []).map((d) => ({
      doc_id: d.doc_id,
      declared_doc_type: d.declared_doc_type,
      extraction: extractions[d.doc_id] || { doc_type: { value: 'OTHER', confidence: 0 }, fields: {} },
    }));
    const r = evaluate(app, appDocs, ctx);
    results.push(r);
    rows.push([r.application_id, r.decision, r.reason_codes.join('|'), fmtScore(r.name_match_score), r.risk_category || '', r.rekyc_due_date || '']);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, stringify(rows));
  return { count: apps.length, ms: Date.now() - started, outFile, results };
}

if (require.main === module) {
  const set = arg('set', 'sample');
  const appsFile = arg('apps', dataPath(`case_02_applications_${set}_V1.0.csv`));
  const docsFile = arg('docs', dataPath(`case_02_documents_${set}_V1.0.csv`));
  const extractionFile = arg('extraction', dataPath(`case_02_extraction_mock_${set}_V1.0.csv`));
  const defaultOut = set === 'eval' ? 'decisions_output.csv' : `decisions_output_${set}.csv`;
  const outFile = arg('out', path.join(OUTPUT_DIR, defaultOut));

  const res = run({ appsFile, docsFile, extractionFile, outFile, ctx: buildFileContext() });
  console.log(`Evaluated ${res.count} applications in ${res.ms} ms -> ${res.outFile}`);
}

module.exports = { run, buildFileContext };
