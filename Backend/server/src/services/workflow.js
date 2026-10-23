// Application workflow: status lifecycle (6.1.1), extraction, rules evaluation, routing (6.1.2)
// and maker-checker (FR-7). Routes stay thin and call these functions.
const Application = require('../models/Application');
const Document = require('../models/Document');
const Evaluation = require('../models/Evaluation');
const FieldCorrection = require('../models/FieldCorrection');
const { evaluate } = require('../engine/rules');
const { loadRuleContext, getRulesConfig } = require('./ruleContext');
const { extractDocument, rowsToExtraction } = require('../extraction');
const { readText } = require('./storage');
const { openAccount } = require('./coreBanking');
const { audit } = require('./audit');
const { roleLabel } = require('../middleware/auth');
const { conflict, forbidden, notFound, unprocessable } = require('../utils/httpError');
const { isIsoDate } = require('../utils/dates');

// Allowed status moves (6.1.1). DRAFT is our extra starting state for API-created applications.
const TRANSITIONS = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['EXTRACTING'],
  EXTRACTING: ['AUTO_APPROVED', 'PENDING_CHECKER', 'IN_REVIEW', 'AUTO_REJECTED'],
  IN_REVIEW: ['PENDING_CHECKER', 'RESUBMISSION_REQUESTED'],
  RESUBMISSION_REQUESTED: ['SUBMITTED', 'CLOSED_EXPIRED'],
  PENDING_CHECKER: ['APPROVED', 'REJECTED', 'IN_REVIEW'],
  AUTO_APPROVED: [],
  APPROVED: [],
  REJECTED: [],
  AUTO_REJECTED: [],
  CLOSED_EXPIRED: [],
};
const FINAL = ['AUTO_APPROVED', 'APPROVED', 'REJECTED', 'AUTO_REJECTED', 'CLOSED_EXPIRED'];
const OPEN_STATUSES = ['IN_REVIEW', 'PENDING_CHECKER', 'RESUBMISSION_REQUESTED'];

// ---------------------------------------------------------------------------
// Concurrency helpers (NFR: second concurrent action -> HTTP 409)
// ---------------------------------------------------------------------------

// Atomically "claims" the case: succeeds only if status and version are still what we expect.
// If the client sent the version it was looking at, a stale version also gives 409.
async function claim(app, allowedStatuses, clientVersion) {
  if (!allowedStatuses.includes(app.status)) {
    throw conflict(`Application is in status ${app.status}; this action needs ${allowedStatuses.join(' or ')}`, { status: app.status });
  }
  const expected = clientVersion === undefined || clientVersion === null ? app.version : Number(clientVersion);
  const updated = await Application.findOneAndUpdate(
    { _id: app._id, status: { $in: allowedStatuses }, version: expected },
    { $inc: { version: 1 } },
    { returnDocument: 'after' }
  );
  if (!updated) {
    throw conflict('This case was changed by someone else. Reload it and try again.', { current_version: app.version });
  }
  return updated;
}

async function transition(app, to, { user = null, note = null, set = {} } = {}) {
  const from = app.status;
  if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) {
    throw conflict(`Status cannot move from ${from} to ${to}`);
  }
  const updated = await Application.findOneAndUpdate(
    { _id: app._id, status: from, version: app.version },
    {
      $set: { status: to, ...set },
      $inc: { version: 1 },
      $push: { status_history: { from, to, at: new Date(), by: user ? user.username : 'SYSTEM', role: roleLabel(user), note } },
    },
    { returnDocument: 'after' }
  );
  if (!updated) throw conflict('This case was changed by someone else. Reload it and try again.');
  await audit({ application_id: app.application_id, action: 'STATUS_CHANGED', user, details: { from, to, note } });
  return updated;
}

// ---------------------------------------------------------------------------
// Extraction + evaluation
// ---------------------------------------------------------------------------

const activeDocsQuery = (app) => ({ application_id: app.application_id, round: app.round, superseded: false });

async function runExtraction(doc, user = null) {
  let text = '';
  try {
    text = readText(doc.storage_path);
  } catch (e) {
    text = '';
  }
  const out = await extractDocument({ doc_id: doc.doc_id, text });
  const source = out.provider === 'mock' ? 'MOCK' : 'AI';
  const ex = rowsToExtraction(out.rows, source);
  doc.extraction = {
    provider: out.provider,
    extractor_version: out.extractor_version,
    extracted_at: new Date(),
    error: out.error,
    doc_type: ex.doc_type,
    fields: ex.fields,
  };
  await doc.save();
  await audit({
    application_id: doc.application_id,
    action: 'DOCUMENT_EXTRACTED',
    user,
    doc_id: doc.doc_id,
    details: {
      provider: out.provider,
      extractor_version: out.extractor_version,
      doc_type: ex.doc_type.value,
      doc_type_confidence: ex.doc_type.confidence,
      fields: Object.keys(ex.fields),
      error: out.error,
    },
  });
  return { doc, rows: out.rows, provider: out.provider, extractor_version: out.extractor_version, error: out.error };
}

function toEngineDoc(doc) {
  const ex = doc.extraction || {};
  const fields = ex.fields instanceof Map ? Object.fromEntries(ex.fields) : ex.fields || {};
  const plainFields = {};
  for (const [k, v] of Object.entries(fields)) {
    plainFields[k] = { value: v.value, confidence: v.confidence, source: v.source };
  }
  return {
    doc_id: doc.doc_id,
    declared_doc_type: doc.declared_doc_type,
    extraction: {
      doc_type: ex.doc_type && ex.doc_type.value ? { value: ex.doc_type.value, confidence: ex.doc_type.confidence } : { value: 'OTHER', confidence: 0 },
      fields: plainFields,
    },
  };
}

function toEngineApp(app) {
  return {
    application_id: app.application_id,
    application_date: app.application_date,
    full_name: app.full_name,
    dob: app.dob,
    pan_number: app.pan_number,
    aadhaar_last4: app.aadhaar_last4,
    pincode: app.pincode,
    occupation_code: app.occupation_code,
    annual_income: app.annual_income,
  };
}

// Runs the rules engine on the current documents, stores the result and audits it.
async function evaluateApplication(app, { trigger, user = null }) {
  const docs = await Document.find(activeDocsQuery(app));
  const ctx = await loadRuleContext();
  const result = evaluate(toEngineApp(app), docs.map(toEngineDoc), ctx);

  const runNo = (await Evaluation.countDocuments({ application_id: app.application_id })) + 1;
  const ev = await Evaluation.create({
    application_id: app.application_id,
    run_no: runNo,
    trigger,
    by_username: user ? user.username : 'SYSTEM',
    decision: result.decision,
    reason_codes: result.reason_codes,
    name_match_score: result.name_match_score,
    risk_category: result.risk_category,
    rekyc_due_date: result.rekyc_due_date,
    result,
  });

  const set = {
    decision: result.decision,
    reason_codes: result.reason_codes,
    name_match_score: result.name_match_score,
    risk_category: result.risk_category,
    rekyc_due_date: result.rekyc_due_date,
    last_evaluation: ev._id,
  };
  if (!app.initial_decision) {
    set.initial_decision = result.decision;
    set.initial_reason_codes = result.reason_codes;
  }
  const updated = await Application.findByIdAndUpdate(app._id, { $set: set }, { returnDocument: 'after' });

  await audit({
    application_id: app.application_id,
    action: 'RULES_EVALUATED',
    user,
    details: {
      trigger,
      run_no: runNo,
      decision: result.decision,
      reason_codes: result.reason_codes,
      name_match_score: result.name_match_score,
      risk_category: result.risk_category,
      rekyc_due_date: result.rekyc_due_date,
      config_version: result.config_version,
    },
  });
  for (const [list, hit] of Object.entries(result.screening)) {
    if (hit.result !== 'NONE') {
      await audit({ application_id: app.application_id, action: 'WATCHLIST_HIT', user, details: { list, ...hit } });
    }
  }
  return { app: updated, result, evaluation: ev };
}

async function openAccountFor(app, user = null) {
  try {
    const acc = await openAccount(app);
    const updated = await Application.findByIdAndUpdate(
      app._id,
      { $set: { account: { customer_id: acc.customer_id, account_number: acc.account_number, opened_at: new Date(), error: null } } },
      { returnDocument: 'after' }
    );
    await audit({ application_id: app.application_id, action: 'ACCOUNT_OPENED', user, details: { customer_id: acc.customer_id, account_number: acc.account_number } });
    return updated;
  } catch (err) {
    await Application.findByIdAndUpdate(app._id, { $set: { 'account.error': err.message } });
    await audit({ application_id: app.application_id, action: 'ACCOUNT_OPEN_FAILED', user, details: { error: err.message } });
    return Application.findById(app._id);
  }
}

// Routing (6.1.2) after the rules engine ran in EXTRACTING.
async function routeAfterDecision(app, result, user = null) {
  const now = new Date();
  if (result.decision === 'APPROVE' && result.risk_category === 'HIGH') {
    return transition(app, 'PENDING_CHECKER', { user, note: 'HIGH-risk APPROVE needs checker', set: { pending_checker_at: now } });
  }
  if (result.decision === 'APPROVE') {
    const approved = await transition(app, 'AUTO_APPROVED', { user, note: 'Straight-through approval', set: { decided_at: now } });
    return openAccountFor(approved, user);
  }
  if (result.decision === 'REVIEW') {
    return transition(app, 'IN_REVIEW', { user, note: result.reason_codes.join('|') });
  }
  return transition(app, 'AUTO_REJECTED', { user, note: result.reason_codes.join('|'), set: { decided_at: now } });
}

// SUBMITTED -> EXTRACTING -> extraction of every active document -> rules -> route.
async function processSubmission(app, { user = null, trigger = 'SUBMIT' } = {}) {
  let current = await transition(app, 'EXTRACTING', { user, note: `Extraction provider: ${require('../config').EXTRACTION_PROVIDER}` });
  const docs = await Document.find(activeDocsQuery(current)).sort({ doc_id: 1 });
  for (const doc of docs) {
    await runExtraction(doc, user);
  }
  const { app: evaluated, result } = await evaluateApplication(current, { trigger, user });
  current = await routeAfterDecision(evaluated, result, user);
  return { app: current, result };
}

// ---------------------------------------------------------------------------
// Applicant actions
// ---------------------------------------------------------------------------

function resubmissionDeadline(app, cfg) {
  if (!app.resubmission_requested_at) return null;
  const days = Number(cfg.resubmission_sla_days || 7);
  return new Date(app.resubmission_requested_at.getTime() + days * 86400000);
}

// If the resubmission window has passed, close the case and refuse the action.
async function ensureResubmissionWindow(app) {
  if (app.status !== 'RESUBMISSION_REQUESTED') return;
  const cfg = await getRulesConfig();
  const deadline = resubmissionDeadline(app, cfg);
  if (deadline && Date.now() > deadline.getTime()) {
    await transition(app, 'CLOSED_EXPIRED', { note: 'Resubmission window expired' });
    throw conflict('The resubmission window has expired and the application was closed.');
  }
}

async function submitApplication(app, user) {
  if (!['DRAFT', 'RESUBMISSION_REQUESTED'].includes(app.status)) {
    throw conflict(`Application cannot be submitted in status ${app.status}`);
  }
  await ensureResubmissionWindow(app);
  const cfg = await getRulesConfig();
  const minDocs = Number(cfg.min_documents || 3);
  const count = await Document.countDocuments(activeDocsQuery(app));
  if (count < minDocs) {
    throw unprocessable(`Upload at least ${minDocs} documents before submitting (currently ${count})`, [
      { field: 'documents', message: `At least ${minDocs} documents are required` },
    ]);
  }

  const isResubmission = app.status === 'RESUBMISSION_REQUESTED';
  if (isResubmission) {
    // New documents replace the old ones; old rounds are kept (superseded) for the audit trail.
    await Document.updateMany({ application_id: app.application_id, round: { $lt: app.round } }, { $set: { superseded: true } });
  }
  const set = { submitted_at: new Date() };
  if (isResubmission) Object.assign(set, { maker: null, recommendation: null, checker_decision: null });

  const submitted = await transition(app, 'SUBMITTED', { user, note: isResubmission ? 'Resubmitted with new documents' : 'Submitted', set });
  return processSubmission(submitted, { user, trigger: isResubmission ? 'RESUBMIT' : 'SUBMIT' });
}

// ---------------------------------------------------------------------------
// KYC Officer (maker) actions
// ---------------------------------------------------------------------------

const CORRECTABLE_FIELDS = ['doc_type', 'name', 'dob', 'gender', 'pan_number', 'aadhaar_last4', 'address', 'pincode', 'document_date', 'valid_until'];

// Normalises an officer-entered value the same way extraction output is normalised.
function normaliseFieldValue(field, raw) {
  const v = String(raw ?? '').trim();
  const fail = (message) => {
    throw unprocessable('Validation failed', [{ field: 'new_value', message }]);
  };
  if (!v) fail('new_value must not be empty');
  switch (field) {
    case 'doc_type': {
      const t = v.toUpperCase();
      if (!Document.DOC_TYPES.includes(t)) fail(`doc_type must be one of ${Document.DOC_TYPES.join(', ')}`);
      return t;
    }
    case 'pan_number': {
      const p = v.toUpperCase();
      if (!/^[A-Z0-9]{10}$/.test(p)) fail('pan_number must be 10 letters/digits');
      return p;
    }
    case 'aadhaar_last4':
      if (/^\d{12}$/.test(v.replace(/\s/g, ''))) fail('Enter only the last 4 digits of Aadhaar, never the full 12-digit number');
      if (!/^\d{4}$/.test(v)) fail('aadhaar_last4 must be exactly 4 digits');
      return v;
    case 'pincode':
      if (!/^\d{6}$/.test(v)) fail('pincode must be 6 digits');
      return v;
    case 'dob':
    case 'document_date':
    case 'valid_until':
      if (!isIsoDate(v)) fail(`${field} must be a date in YYYY-MM-DD format`);
      return v;
    case 'gender': {
      const g = v.toUpperCase();
      if (!['M', 'F', 'O', 'T'].includes(g)) fail('gender must be M, F, O or T');
      return g;
    }
    default:
      return v.replace(/\s+/g, ' ');
  }
}

async function correctField(app, { document_id, field, new_value, reason, version }, user) {
  if (!CORRECTABLE_FIELDS.includes(field)) {
    throw unprocessable('Validation failed', [{ field: 'field', message: `field must be one of ${CORRECTABLE_FIELDS.join(', ')}` }]);
  }
  const value = normaliseFieldValue(field, new_value);
  const doc = await Document.findOne({ public_id: document_id, application_id: app.application_id });
  if (!doc) throw notFound('Document not found in this application');
  if (doc.superseded || doc.round !== app.round) throw conflict('This document has been replaced by a newer upload');

  let claimed = await claim(app, ['IN_REVIEW'], version);

  // before / after
  let before;
  if (field === 'doc_type') {
    before = doc.extraction && doc.extraction.doc_type ? { ...doc.extraction.doc_type } : null;
    doc.set('extraction.doc_type', { value, confidence: 1, source: 'OFFICER' });
  } else {
    const existing = doc.extraction && doc.extraction.fields ? doc.extraction.fields.get(field) : null;
    before = existing ? { value: existing.value, confidence: existing.confidence, source: existing.source } : null;
    if (!doc.extraction || !doc.extraction.fields) doc.set('extraction.fields', {});
    doc.extraction.fields.set(field, { value, confidence: 1, source: 'OFFICER' });
  }
  await doc.save();
  const after = { value, confidence: 1, source: 'OFFICER' };

  await FieldCorrection.create({
    application_id: app.application_id,
    doc_id: doc.doc_id,
    document_public_id: doc.public_id,
    field,
    old_value: before ? before.value : null,
    old_confidence: before ? before.confidence : null,
    old_source: before ? before.source : null,
    new_value: value,
    reason,
    officer: user._id,
    officer_username: user.username,
  });
  await audit({ application_id: app.application_id, action: 'FIELD_CORRECTED', user, doc_id: doc.doc_id, details: { field, before, after, reason } });

  // Re-run the rules (6.1.2). The case still goes to the checker.
  const { app: evaluated, result } = await evaluateApplication(claimed, { trigger: 'CORRECTION', user });
  claimed = evaluated;

  if (result.decision === 'APPROVE') {
    // Example 12: re-run gives APPROVE -> straight to PENDING_CHECKER, the correcting officer is the maker.
    const recommendation = {
      action: 'APPROVE',
      comment: `Rules re-run after field correction gave APPROVE. Correction reason: ${reason}`,
      by: user._id,
      by_username: user.username,
      at: new Date(),
      auto: true,
    };
    claimed = await transition(claimed, 'PENDING_CHECKER', {
      user,
      note: 'Correction re-run gave APPROVE',
      set: { maker: user._id, recommendation, pending_checker_at: new Date() },
    });
    await audit({ application_id: app.application_id, action: 'RECOMMENDATION_RECORDED', user, details: recommendation });
  }
  return { app: claimed, result, correction: { field, before, after, reason } };
}

async function recommend(app, { action, comment, version }, user) {
  let claimed = await claim(app, ['IN_REVIEW'], version);
  const recommendation = { action, comment, by: user._id, by_username: user.username, at: new Date(), auto: false };
  await audit({ application_id: app.application_id, action: 'RECOMMENDATION_RECORDED', user, details: { action, comment } });

  if (action === 'REQUEST_RESUBMISSION') {
    claimed = await transition(claimed, 'RESUBMISSION_REQUESTED', {
      user,
      note: comment,
      set: { recommendation, maker: user._id, resubmission_requested_at: new Date(), round: claimed.round + 1 },
    });
    // No real SMS/e-mail: a log entry is enough (6.7).
    await audit({
      application_id: app.application_id,
      action: 'NOTIFICATION_LOGGED',
      user,
      details: { channel: 'EMAIL+SMS', to: 'applicant', message: 'Please upload new documents within 7 days.' },
    });
    return claimed;
  }
  return transition(claimed, 'PENDING_CHECKER', {
    user,
    note: `Maker recommends ${action}`,
    set: { recommendation, maker: user._id, pending_checker_at: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Compliance Officer (checker) actions
// ---------------------------------------------------------------------------

async function checkerDecide(app, { action, comment, version }, user) {
  if (app.status === 'PENDING_CHECKER' && app.maker && String(app.maker) === String(user._id)) {
    await audit({ application_id: app.application_id, action: 'CHECKER_BLOCKED_SAME_USER', user, details: { attempted: action } });
    throw forbidden('Maker and checker must be different users: you made the recommendation on this case');
  }
  let claimed = await claim(app, ['PENDING_CHECKER'], version);
  const decision = { action, comment, by: user._id, by_username: user.username, at: new Date() };
  await audit({ application_id: app.application_id, action: 'CHECKER_DECISION', user, details: { action, comment } });

  if (action === 'APPROVE') {
    claimed = await transition(claimed, 'APPROVED', { user, note: comment, set: { checker_decision: decision, decided_at: new Date() } });
    return openAccountFor(claimed, user);
  }
  if (action === 'REJECT') {
    return transition(claimed, 'REJECTED', { user, note: comment, set: { checker_decision: decision, decided_at: new Date() } });
  }
  // SEND_BACK -> IN_REVIEW; a new maker recommendation is needed.
  return transition(claimed, 'IN_REVIEW', { user, note: comment, set: { checker_decision: decision, maker: null, recommendation: null } });
}

// ---------------------------------------------------------------------------
// System jobs
// ---------------------------------------------------------------------------

async function expireResubmissions() {
  const cfg = await getRulesConfig();
  const days = Number(cfg.resubmission_sla_days || 7);
  const cutoff = new Date(Date.now() - days * 86400000);
  const due = await Application.find({ status: 'RESUBMISSION_REQUESTED', resubmission_requested_at: { $lt: cutoff } });
  let closed = 0;
  for (const app of due) {
    try {
      await transition(app, 'CLOSED_EXPIRED', { note: `No resubmission within ${days} days` });
      await audit({ application_id: app.application_id, action: 'NOTIFICATION_LOGGED', details: { channel: 'EMAIL+SMS', to: 'applicant', message: 'Your application was closed.' } });
      closed += 1;
    } catch (e) {
      // someone else changed it meanwhile; skip
    }
  }
  return closed;
}

// Re-screen open cases after a watchlist or config update (NFR configurability). Status is not changed;
// the new result is stored and shown to the officer/checker.
async function rescreenOpenCases(user) {
  const apps = await Application.find({ status: { $in: OPEN_STATUSES } });
  const changes = [];
  for (const app of apps) {
    const before = { decision: app.decision, reason_codes: app.reason_codes };
    const { result } = await evaluateApplication(app, { trigger: 'RESCREEN', user });
    const changed = before.decision !== result.decision || before.reason_codes.join('|') !== result.reason_codes.join('|');
    changes.push({
      application_id: app.application_id,
      status: app.status,
      changed,
      before,
      after: { decision: result.decision, reason_codes: result.reason_codes },
    });
  }
  return { rescreened: apps.length, changed: changes.filter((c) => c.changed).length, cases: changes };
}

module.exports = {
  TRANSITIONS,
  FINAL,
  OPEN_STATUSES,
  CORRECTABLE_FIELDS,
  transition,
  claim,
  runExtraction,
  evaluateApplication,
  processSubmission,
  routeAfterDecision,
  submitApplication,
  ensureResubmissionWindow,
  resubmissionDeadline,
  correctField,
  recommend,
  checkerDecide,
  expireResubmissions,
  rescreenOpenCases,
  activeDocsQuery,
};
