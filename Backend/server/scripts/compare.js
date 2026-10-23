// Compares a decisions CSV with the expected_* columns of the sample applications file.
// Usage: node scripts/compare.js [decisions.csv] [applications_sample.csv]
const path = require('path');
const { dataPath, readCsv } = require('../src/utils/dataFiles');

const outFile = process.argv[2] || path.resolve(__dirname, '..', '..', 'output', 'decisions_output_sample.csv');
const expectedFile = process.argv[3] || dataPath('case_02_applications_sample_V1.0.csv');

const actual = new Map(readCsv(outFile).map((r) => [r.application_id, r]));
const expected = readCsv(expectedFile);

const pairs = [
  ['decision', 'expected_decision'],
  ['reason_codes', 'expected_reason_codes'],
  ['name_match_score', 'expected_name_match_score'],
  ['risk_category', 'expected_risk_category'],
  ['rekyc_due_date', 'expected_rekyc_due_date'],
];

let ok = 0;
const problems = [];
for (const e of expected) {
  const a = actual.get(e.application_id);
  if (!a) {
    problems.push(`${e.application_id}: missing from output`);
    continue;
  }
  const diffs = pairs
    .filter(([col, exp]) => (a[col] || '') !== (e[exp] || ''))
    .map(([col, exp]) => `${col}: got "${a[col]}" expected "${e[exp]}"`);
  if (diffs.length) problems.push(`${e.application_id}: ${diffs.join('; ')}`);
  else ok += 1;
}

console.log(`${ok}/${expected.length} applications match the expected columns.`);
problems.forEach((p) => console.log('  ' + p));
process.exit(problems.length ? 1 : 0);
