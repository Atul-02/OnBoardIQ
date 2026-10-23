// Compliance Officer (checker) - FR-7.
const express = require('express');
const Application = require('../models/Application');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { checkerSchema } = require('../validators');
const { loadApplicationFor } = require('./helpers');
const workflow = require('../services/workflow');
const { getRulesConfig } = require('../services/ruleContext');
const { listItem } = require('../services/views');

const router = express.Router();
router.use(authenticate, requireRole('COMPLIANCE_OFFICER'));

const RISK_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// PENDING_CHECKER items, HIGH risk first, then oldest first. Each row shows whether the 24h SLA is overdue.
router.get('/queue', async (req, res) => {
  const cfg = await getRulesConfig();
  const apps = await Application.find({ status: 'PENDING_CHECKER' });
  apps.sort((a, b) => {
    const r = (RISK_ORDER[a.risk_category] ?? 3) - (RISK_ORDER[b.risk_category] ?? 3);
    if (r !== 0) return r;
    return new Date(a.pending_checker_at || 0) - new Date(b.pending_checker_at || 0) || a.application_id.localeCompare(b.application_id);
  });
  res.json(apps.map((a) => listItem(a, cfg)));
});

// APPROVE / REJECT / SEND_BACK. Maker and checker must differ (403).
router.post('/applications/:id/decision', validate(checkerSchema), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  const updated = await workflow.checkerDecide(app, req.valid, req.user);
  res.json({
    application_id: updated.application_id,
    status: updated.status,
    version: updated.version,
    checker_decision: updated.checker_decision,
    account: updated.account && updated.account.account_number ? { customer_id: updated.account.customer_id, account_number: updated.account.account_number } : null,
    account_error: updated.account ? updated.account.error || null : null,
  });
});

module.exports = router;
