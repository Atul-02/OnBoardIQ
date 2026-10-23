// Compliance dashboard - FR-10. All figures are computed from the applications collection,
// so they reconcile with the underlying data.
const express = require('express');
const Application = require('../models/Application');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { dashboardQuery } = require('../validators');
const { getRulesConfig } = require('../services/ruleContext');
const { listItem } = require('../services/views');

const router = express.Router();
router.use(authenticate, requireRole('COMPLIANCE_OFFICER'));

const pct = (n, d) => (d ? Number(((n / d) * 100).toFixed(2)) : 0);

// Time spent in IN_REVIEW, summed over every visit, using the status history.
function reviewHours(app) {
  const h = app.status_history || [];
  let total = 0;
  let completed = false;
  for (let i = 0; i < h.length; i += 1) {
    if (h[i].to !== 'IN_REVIEW') continue;
    const exit = h.slice(i + 1).find((x) => x.from === 'IN_REVIEW');
    if (exit) {
      total += new Date(exit.at) - new Date(h[i].at);
      completed = true;
    }
  }
  return completed ? total / 3600000 : null;
}

// GET /api/v1/dashboard?from=2026-03-01&to=2026-03-31   (filters on application_date)
router.get('/', validate(dashboardQuery, 'query'), async (req, res) => {
  const { from, to } = req.valid;
  const filter = { status: { $ne: 'DRAFT' } };
  if (from || to) {
    filter.application_date = {};
    if (from) filter.application_date.$gte = from;
    if (to) filter.application_date.$lte = to;
  }
  const cfg = await getRulesConfig();
  const apps = await Application.find(filter).lean();

  const byStatus = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  // "Decided" = the rules engine has produced a decision (APPROVE / REVIEW / REJECT).
  const decided = apps.filter((a) => a.initial_decision);
  const autoApproved = byStatus.AUTO_APPROVED || 0;
  const reviewCount = decided.filter((a) => a.initial_decision === 'REVIEW').length;
  const rejectCount = decided.filter((a) => a.initial_decision === 'REJECT').length;
  const approveCount = decided.filter((a) => a.initial_decision === 'APPROVE').length;

  const reasonCounts = {};
  for (const a of decided) for (const code of a.initial_reason_codes || []) reasonCounts[code] = (reasonCounts[code] || 0) + 1;
  const topReasons = Object.entries(reasonCounts)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));

  const reviewTimes = apps.map(reviewHours).filter((h) => h !== null);
  const avgReviewHours = reviewTimes.length ? Number((reviewTimes.reduce((s, h) => s + h, 0) / reviewTimes.length).toFixed(2)) : null;

  const pending = apps.filter((a) => a.status === 'PENDING_CHECKER').map((a) => listItem(a, cfg));

  res.json({
    filter: { from: from || null, to: to || null, on: 'application_date' },
    total_applications: apps.length,
    by_status: byStatus,
    decided: decided.length,
    rules_decisions: { APPROVE: approveCount, REVIEW: reviewCount, REJECT: rejectCount },
    straight_through_rate_pct: pct(autoApproved, decided.length),
    review_rate_pct: pct(reviewCount, decided.length),
    reject_rate_pct: pct(rejectCount, decided.length),
    top_reason_codes: topReasons,
    avg_time_in_review_hours: avgReviewHours,
    reviews_completed: reviewTimes.length,
    pending_checker: {
      count: pending.length,
      overdue_count: pending.filter((p) => p.checker_sla_overdue).length,
      sla_hours: Number(cfg.checker_sla_hours || 24),
      items: pending,
    },
    definitions: {
      decided: 'applications that received a rules-engine decision',
      straight_through_rate: 'AUTO_APPROVED / decided',
      review_rate: 'first rules decision REVIEW / decided',
      reject_rate: 'first rules decision REJECT / decided',
      top_reason_codes: 'reason codes of the first rules decision',
    },
  });
});

module.exports = router;
