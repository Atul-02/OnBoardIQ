// Resets the onboardiq database and loads the data pack as JSON documents:
// config, watchlists, existing customers, occupations, demo users, and the 60 sample
// applications (with their document files), which are then run through the real workflow.
//
// Usage: npm run seed
process.env.CORE_BANKING_DIRECT = '1'; // no HTTP server while seeding

const fs = require('fs');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const config = require('../src/config');
const { connectDb } = require('../src/db');
const { dataPath, readCsv, readJsonl, readJson } = require('../src/utils/dataFiles');
const User = require('../src/models/User');
const Application = require('../src/models/Application');
const Document = require('../src/models/Document');
const { Config, Sanction, Pep, ExistingCustomer, Occupation } = require('../src/models/Reference');
const { saveFile, sha256 } = require('../src/services/storage');
const { processSubmission } = require('../src/services/workflow');
const { fmtScore } = require('../src/engine/rules');

const DEMO_USERS = [
  { user_code: 'U1', username: 'officer1', full_name: 'KYC Officer One', roles: ['KYC_OFFICER'] },
  { user_code: 'U3', username: 'officer2', full_name: 'KYC Officer Two', roles: ['KYC_OFFICER'] },
  { user_code: 'U2', username: 'checker1', full_name: 'Compliance Officer One', roles: ['COMPLIANCE_OFFICER'] },
  { user_code: 'U4', username: 'checker2', full_name: 'Compliance Officer Two', roles: ['COMPLIANCE_OFFICER'] },
  // Holds both roles, to demo the "maker and checker must differ" rule on the same person.
  { user_code: 'U5', username: 'supervisor1', full_name: 'Supervisor (maker + checker roles)', roles: ['KYC_OFFICER', 'COMPLIANCE_OFFICER'] },
  { user_code: 'A1', username: 'applicant1', full_name: 'Demo Applicant (owns seeded samples)', roles: ['APPLICANT'] },
  { user_code: 'A2', username: 'applicant2', full_name: 'Second Applicant', roles: ['APPLICANT'] },
];

async function main() {
  const started = Date.now();
  await connectDb();
  await mongoose.connection.dropDatabase();
  fs.rmSync(config.STORAGE_DIR, { recursive: true, force: true });
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
  console.log('Database reset.');

  // --- configuration and reference data
  await Config.create({ key: 'rules', value: readJson(dataPath('case_02_rules_config_V1.0.json')) });
  await Sanction.insertMany(readCsv(dataPath('case_02_sanctions_list_V1.0.csv')));
  await Pep.insertMany(readCsv(dataPath('case_02_pep_list_V1.0.csv')));
  await ExistingCustomer.insertMany(readCsv(dataPath('case_02_existing_customers_V1.0.csv')));
  await Occupation.insertMany(readCsv(dataPath('case_02_occupations_V1.0.csv')));

  // --- users
  const hash = await bcrypt.hash(config.SEED_PASSWORD, 10);
  const users = {};
  for (const u of DEMO_USERS) users[u.username] = await User.create({ ...u, password_hash: hash });

  // --- sample applications + documents
  const apps = readCsv(dataPath('case_02_applications_sample_V1.0.csv'));
  const docs = readCsv(dataPath('case_02_documents_sample_V1.0.csv'));
  const texts = new Map(readJsonl(dataPath('case_02_document_text_sample_V1.0.jsonl')).map((t) => [t.doc_id, t.text]));
  const docsByApp = {};
  for (const d of docs) (docsByApp[d.application_id] ||= []).push(d);

  let matched = 0;
  const mismatches = [];
  for (const row of apps) {
    const now = new Date();
    let app = await Application.create({
      application_id: row.application_id,
      owner: users.applicant1._id,
      source: 'SEED',
      application_date: row.application_date,
      full_name: row.full_name,
      dob: row.dob,
      gender: row.gender,
      pan_number: row.pan_number,
      aadhaar_last4: row.aadhaar_last4,
      mobile: row.mobile,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      occupation_code: row.occupation_code,
      annual_income: Number(row.annual_income),
      consent: true,
      status: 'SUBMITTED',
      submitted_at: now,
      status_history: [{ from: null, to: 'SUBMITTED', at: now, by: 'SEED', role: 'SYSTEM', note: 'Loaded from sample data pack' }],
    });

    for (const d of docsByApp[row.application_id] || []) {
      const buffer = Buffer.from(texts.get(d.doc_id) || '', 'utf8');
      await Document.create({
        doc_id: d.doc_id,
        application_id: d.application_id,
        declared_doc_type: d.declared_doc_type,
        file_name: d.file_name,
        storage_path: saveFile(buffer, d.application_id),
        sha256: sha256(buffer),
        size_bytes: buffer.length,
        round: 1,
        uploaded_by: users.applicant1._id,
      });
    }

    const out = await processSubmission(app, { trigger: 'SEED' });
    app = out.app;

    const ok =
      app.decision === row.expected_decision &&
      app.reason_codes.join('|') === row.expected_reason_codes &&
      fmtScore(app.name_match_score) === row.expected_name_match_score &&
      (app.risk_category || '') === row.expected_risk_category &&
      (app.rekyc_due_date || '') === row.expected_rekyc_due_date;
    if (ok) matched += 1;
    else mismatches.push(row.application_id);
  }

  const byStatus = await Application.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  console.log(
    `Loaded: ${await Sanction.countDocuments()} sanctions, ${await Pep.countDocuments()} PEPs, ` +
      `${await ExistingCustomer.countDocuments()} customers, ${await Occupation.countDocuments()} occupations, ` +
      `${await Application.countDocuments()} applications, ${await Document.countDocuments()} documents.`
  );
  console.log('Statuses:', byStatus.map((s) => `${s._id}=${s.n}`).join(', '));
  console.log(`Expected-column check: ${matched}/${apps.length} match${mismatches.length ? ' (mismatch: ' + mismatches.join(', ') + ')' : ''}`);
  console.log(`Demo users (password from SEED_PASSWORD): ${DEMO_USERS.map((u) => `${u.username} [${u.user_code}]`).join(', ')}`);
  console.log(`Done in ${Date.now() - started} ms.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
