// Shapes API responses per role. Applicants never see confidence scores, watchlist details
// or other internal data; lists always show a masked PAN.
const { maskPan } = require('../utils/mask');
const { reasonMessage, STATUS_MESSAGES } = require('../utils/reasonMessages');
const { fmtScore } = require('../engine/rules');

const STATUSES_WITH_REASONS = ['IN_REVIEW', 'RESUBMISSION_REQUESTED', 'PENDING_CHECKER', 'AUTO_REJECTED', 'REJECTED'];

function declared(app) {
  return {
    application_date: app.application_date,
    full_name: app.full_name,
    dob: app.dob,
    gender: app.gender,
    pan_number: app.pan_number,
    aadhaar_last4: app.aadhaar_last4,
    mobile: app.mobile,
    email: app.email,
    address: app.address,
    city: app.city,
    state: app.state,
    pincode: app.pincode,
    occupation_code: app.occupation_code,
    annual_income: app.annual_income,
  };
}

// --- Applicant -----------------------------------------------------------------

function applicantView(app, docs, deadline) {
  const showReasons = STATUSES_WITH_REASONS.includes(app.status);
  return {
    application_id: app.application_id,
    status: app.status,
    status_message: STATUS_MESSAGES[app.status],
    version: app.version,
    declared: declared(app),
    timeline: (app.status_history || []).map((h) => ({ status: h.to, at: h.at })),
    reasons: showReasons ? (app.reason_codes || []).map((code) => ({ code, message: reasonMessage(code) })) : [],
    resubmission: app.status === 'RESUBMISSION_REQUESTED' ? { deadline, officer_comment: app.recommendation ? app.recommendation.comment : null } : null,
    account: app.account && app.account.account_number ? { customer_id: app.account.customer_id, account_number: app.account.account_number } : null,
    documents: docs.map((d) => ({
      id: d.public_id,
      doc_id: d.doc_id,
      file_name: d.file_name,
      declared_doc_type: d.declared_doc_type,
      uploaded_at: d.createdAt,
      round: d.round,
      superseded: d.superseded,
    })),
  };
}

// --- Staff (KYC Officer / Compliance Officer) -------------------------------------------

function staffDocument(d, minConf) {
  const ex = d.extraction || {};
  const fields = ex.fields instanceof Map ? Object.fromEntries(ex.fields) : ex.fields || {};
  return {
    id: d.public_id,
    doc_id: d.doc_id,
    file_name: d.file_name,
    declared_doc_type: d.declared_doc_type,
    sha256: d.sha256,
    size_bytes: d.size_bytes,
    round: d.round,
    superseded: d.superseded,
    uploaded_at: d.createdAt,
    extraction: ex.extracted_at
      ? {
          provider: ex.provider,
          extractor_version: ex.extractor_version,
          extracted_at: ex.extracted_at,
          error: ex.error || null,
          doc_type: { ...(ex.doc_type || {}), low_confidence: !ex.doc_type || Number(ex.doc_type.confidence) < minConf },
          fields: Object.entries(fields).map(([name, f]) => ({
            field_name: name,
            value: f.value,
            confidence: f.confidence,
            source: f.source,
            low_confidence: Number(f.confidence) < minConf, // highlighted for the officer (FR-6)
          })),
        }
      : null,
  };
}

function staffView({ app, docs, evaluation, corrections, cfg, deadline }) {
  const minConf = Number(cfg.min_field_confidence);
  const r = evaluation ? evaluation.result : null;
  return {
    application_id: app.application_id,
    source: app.source,
    status: app.status,
    version: app.version, // send this back with actions to detect concurrent edits (409)
    round: app.round,
    declared: declared(app),
    consent: app.consent,
    decision: app.decision,
    reason_codes: app.reason_codes,
    name_match_score: app.name_match_score,
    name_match_score_display: fmtScore(app.name_match_score),
    risk_category: app.risk_category,
    rekyc_due_date: app.rekyc_due_date,
    evaluation: r
      ? {
          run_no: evaluation.run_no,
          trigger: evaluation.trigger,
          at: evaluation.created_at,
          rules: r.rules, // each rule with status TRIGGERED / PASSED / SKIPPED and the values compared
          screening: r.screening, // matched list entry, similarity, dob comparison (FR-5)
          selected_documents: r.selected_documents,
          config_version: r.config_version,
        }
      : null,
    documents: docs.map((d) => staffDocument(d, minConf)),
    corrections: (corrections || []).map((c) => ({
      doc_id: c.doc_id,
      field: c.field,
      old_value: c.old_value,
      old_confidence: c.old_confidence,
      new_value: c.new_value,
      reason: c.reason,
      officer: c.officer_username,
      at: c.created_at,
    })),
    maker: app.recommendation ? app.recommendation.by_username : null,
    recommendation: app.recommendation,
    checker_decision: app.checker_decision,
    account: app.account && (app.account.account_number || app.account.error) ? app.account : null,
    status_history: app.status_history,
    submitted_at: app.submitted_at,
    pending_checker_at: app.pending_checker_at,
    resubmission_deadline: deadline,
  };
}

// Row used in queues and lists (PAN masked).
function listItem(app, cfg) {
  const slaHours = Number((cfg && cfg.checker_sla_hours) || 24);
  const overdue =
    app.status === 'PENDING_CHECKER' && app.pending_checker_at
      ? Date.now() - new Date(app.pending_checker_at).getTime() > slaHours * 3600000
      : false;
  return {
    application_id: app.application_id,
    full_name: app.full_name,
    pan_masked: maskPan(app.pan_number),
    application_date: app.application_date,
    status: app.status,
    decision: app.decision,
    reason_codes: app.reason_codes,
    risk_category: app.risk_category,
    name_match_score: fmtScore(app.name_match_score),
    submitted_at: app.submitted_at,
    pending_checker_at: app.pending_checker_at,
    checker_sla_overdue: overdue,
    maker: app.recommendation ? app.recommendation.by_username : null,
    recommendation: app.recommendation ? app.recommendation.action : null,
    version: app.version,
  };
}

// Decision API response (section 6.3).
function decisionResponse(app, docs) {
  return {
    application_id: app.application_id,
    decision: app.decision,
    reason_codes: app.reason_codes,
    name_match_score: app.name_match_score === null ? null : Number(fmtScore(app.name_match_score)),
    risk_category: app.risk_category,
    rekyc_due_date: app.rekyc_due_date,
    status: app.status,
    documents: docs.map((d) => ({
      doc_id: d.doc_id,
      declared_doc_type: d.declared_doc_type,
      doc_type: d.extraction && d.extraction.doc_type ? d.extraction.doc_type.value : null,
      confidence: d.extraction && d.extraction.doc_type ? d.extraction.doc_type.confidence : null,
    })),
  };
}

module.exports = { applicantView, staffView, listItem, decisionResponse };
