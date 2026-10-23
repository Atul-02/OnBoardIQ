const mongoose = require('mongoose');

// Reference data loaded from the data pack (watchlists, customers, occupations, config).

const Sanction = mongoose.model(
  'Sanction',
  new mongoose.Schema({
    list_id: { type: String, unique: true }, name: String, alias: String, dob: String, nationality: String, program: String,
  })
);

const Pep = mongoose.model(
  'Pep',
  new mongoose.Schema({ pep_id: { type: String, unique: true }, name: String, dob: String, position: String, category: String })
);

const ExistingCustomer = mongoose.model(
  'ExistingCustomer',
  new mongoose.Schema({ customer_id: { type: String, unique: true }, full_name: String, pan_number: { type: String, index: true }, dob: String })
);

const Occupation = mongoose.model(
  'Occupation',
  new mongoose.Schema({ occupation_code: { type: String, unique: true }, description: String, risk_level: String })
);

// The rules configuration is stored as one JSON document (key "rules").
const Config = mongoose.model(
  'Config',
  new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed }, { timestamps: true })
);

// Simple sequence generator for ids (application ids, account numbers ...).
const Counter = mongoose.model('Counter', new mongoose.Schema({ _id: String, seq: Number }, { versionKey: false }));

async function nextSeq(name) {
  const c = await Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { returnDocument: 'after', upsert: true });
  return c.seq;
}

// Accounts opened by the mock core-banking service.
const CoreAccount = mongoose.model(
  'CoreAccount',
  new mongoose.Schema(
    { application_id: { type: String, unique: true }, customer_id: String, account_number: String, full_name: String },
    { timestamps: true }
  )
);

module.exports = { Sanction, Pep, ExistingCustomer, Occupation, Config, Counter, nextSeq, CoreAccount };
