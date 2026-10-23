const { Config, Sanction, Pep, ExistingCustomer, Occupation } = require('../models/Reference');
const { HttpError } = require('../utils/httpError');

async function getRulesConfig() {
  const doc = await Config.findOne({ key: 'rules' }).lean();
  if (!doc) throw new HttpError(500, 'Rules configuration not loaded. Run: npm run seed');
  return doc.value;
}

// Everything the rules engine needs, read fresh from MongoDB (config + watchlists are data, not code).
async function loadRuleContext() {
  const [cfg, sanctions, peps, customers, occupations] = await Promise.all([
    getRulesConfig(),
    Sanction.find().lean(),
    Pep.find().lean(),
    ExistingCustomer.find({}, { pan_number: 1 }).lean(),
    Occupation.find().lean(),
  ]);
  return {
    cfg,
    sanctions: sanctions.map((s) => ({ ...s, id: s.list_id })),
    peps: peps.map((p) => ({ ...p, id: p.pep_id })),
    existingPans: new Set(customers.map((c) => String(c.pan_number).trim().toUpperCase())),
    occupations: new Map(occupations.map((o) => [o.occupation_code, o.risk_level])),
  };
}

module.exports = { getRulesConfig, loadRuleContext };
