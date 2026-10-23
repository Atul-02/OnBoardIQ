// Mock core-banking service.
//  - openAccountMock(): the "bank side" logic, exposed over HTTP at POST /mock/core-banking/accounts
//  - openAccount():     the client the backend uses; calls that HTTP endpoint with the service key.
const { CoreAccount, nextSeq } = require('../models/Reference');
const config = require('../config');

// Idempotent: the same application always gets the same customer id / account number.
async function openAccountMock({ application_id, full_name }) {
  const existing = await CoreAccount.findOne({ application_id }).lean();
  if (existing) return { customer_id: existing.customer_id, account_number: existing.account_number, existing: true };
  const seq = await nextSeq('core_account');
  const customer_id = `DDB${String(seq).padStart(7, '0')}`;
  const account_number = `5010${String(seq).padStart(8, '0')}`;
  await CoreAccount.create({ application_id, customer_id, account_number, full_name });
  return { customer_id, account_number, existing: false };
}

async function openAccount(app) {
  // Seed script runs without the HTTP server, so it calls the mock directly.
  if (process.env.CORE_BANKING_DIRECT === '1') {
    return openAccountMock({ application_id: app.application_id, full_name: app.full_name });
  }
  const res = await fetch(`${config.CORE_BANKING_URL}/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-service-key': config.SERVICE_KEY },
    body: JSON.stringify({ application_id: app.application_id, full_name: app.full_name }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Core banking returned HTTP ${res.status}`);
  return res.json();
}

module.exports = { openAccount, openAccountMock };
