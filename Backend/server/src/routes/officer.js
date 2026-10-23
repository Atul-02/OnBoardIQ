// KYC Officer (maker) workbench - FR-6.
const express = require('express');
const Application = require('../models/Application');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { correctionSchema, recommendationSchema } = require('../validators');
const { loadApplicationFor } = require('./helpers');
const workflow = require('../services/workflow');
const { getRulesConfig } = require('../services/ruleContext');
const { listItem } = require('../services/views');

const router = express.Router();
router.use(authenticate, requireRole('KYC_OFFICER'));

const RISK_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// REVIEW queue: HIGH risk first, then oldest submission first.
router.get('/queue', async (req, res) => {
  const cfg = await getRulesConfig();
  const apps = await Application.find({ status: 'IN_REVIEW' });
  apps.sort((a, b) => {
    const r = (RISK_ORDER[a.risk_category] ?? 3) - (RISK_ORDER[b.risk_category] ?? 3);
    if (r !== 0) return r;
    return new Date(a.submitted_at || 0) - new Date(b.submitted_at || 0) || a.application_id.localeCompare(b.application_id);
  });
  res.json(apps.map((a) => listItem(a, cfg)));
});

// Correct an extracted field with a reason -> confidence 1.00, source OFFICER, rules re-run.
router.post('/applications/:id/corrections', validate(correctionSchema), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  const out = await workflow.correctField(app, req.valid, req.user);
  res.json({
    application_id: out.app.application_id,
    status: out.app.status,
    version: out.app.version,
    correction: out.correction,
    decision: out.result.decision,
    reason_codes: out.result.reason_codes,
    name_match_score: out.result.name_match_score,
    risk_category: out.result.risk_category,
    rekyc_due_date: out.result.rekyc_due_date,
    rules: out.result.rules,
  });
});

// Recommend APPROVE / REJECT / REQUEST_RESUBMISSION with a comment (>= 10 characters).
router.post('/applications/:id/recommendation', validate(recommendationSchema), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  const updated = await workflow.recommend(app, req.valid, req.user);
  res.json({ application_id: updated.application_id, status: updated.status, version: updated.version, recommendation: updated.recommendation });
});

module.exports = router;
