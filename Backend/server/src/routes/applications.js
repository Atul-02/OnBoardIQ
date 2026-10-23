const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { stringify } = require('csv-stringify/sync');

const Application = require('../models/Application');
const Document = require('../models/Document');
const Evaluation = require('../models/Evaluation');
const FieldCorrection = require('../models/FieldCorrection');
const AuditLog = require('../models/AuditLog');
const { Occupation, nextSeq } = require('../models/Reference');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { applicationSchema } = require('../validators');
const { isStaff, loadApplicationFor } = require('./helpers');
const workflow = require('../services/workflow');
const { getRulesConfig } = require('../services/ruleContext');
const { applicantView, staffView, listItem, decisionResponse } = require('../services/views');
const { saveFile, sha256, isValidUtf8 } = require('../services/storage');
const { audit } = require('../services/audit');
const { todayIST } = require('../utils/dates');
const { maskPan } = require('../utils/mask');
const { conflict, notFound, unprocessable, forbidden, HttpError } = require('../utils/httpError');
const gemini = require('../ai/gemini');
const reviewSummary = require('../ai/reviewSummary');
const { STORAGE_DIR } = require('../config');

const router = express.Router();
router.use(authenticate);

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

// ---------------------------------------------------------------------------
// Create / list / view
// ---------------------------------------------------------------------------

router.post('/', requireRole('APPLICANT'), validate(applicationSchema), async (req, res) => {
  const body = req.valid;
  if (!(await Occupation.exists({ occupation_code: body.occupation_code }))) {
    throw unprocessable('Validation failed', [{ field: 'occupation_code', message: 'Unknown occupation_code' }]);
  }
  const seq = await nextSeq('application');
  const application_id = `A5${String(seq).padStart(6, '0')}`;
  const app = await Application.create({
    ...body,
    application_id,
    application_date: body.application_date || todayIST(),
    owner: req.user._id,
    source: 'API',
    status: 'DRAFT',
    status_history: [{ from: null, to: 'DRAFT', at: new Date(), by: req.user.username, role: 'APPLICANT', note: 'Application created' }],
  });
  await audit({ application_id, action: 'APPLICATION_CREATED', user: req.user, details: { application_date: app.application_date, consent: true } });
  res.status(201).json(applicantView(app, [], null));
});

// Applicant: own applications. Staff: all, optional ?status=IN_REVIEW&q=name-or-id
router.get('/', async (req, res) => {
  if (!isStaff(req.user)) {
    const apps = await Application.find({ owner: req.user._id }).sort({ createdAt: -1 });
    return res.json(
      apps.map((a) => ({ application_id: a.application_id, application_date: a.application_date, status: a.status, full_name: a.full_name, pan_masked: maskPan(a.pan_number) }))
    );
  }
  const filter = {};
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
  if (req.query.q) {
    const q = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ application_id: new RegExp(q, 'i') }, { full_name: new RegExp(q, 'i') }];
  }
  const cfg = await getRulesConfig();
  const apps = await Application.find(filter).sort({ application_id: 1 });
  res.json(apps.map((a) => listItem(a, cfg)));
});

router.get('/:id', async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  const cfg = await getRulesConfig();
  const deadline = workflow.resubmissionDeadline(app, cfg);
  const docs = await Document.find({ application_id: app.application_id }).sort({ round: 1, doc_id: 1 });
  if (!isStaff(req.user)) return res.json(applicantView(app, docs, deadline));

  const [evaluation, corrections] = await Promise.all([
    app.last_evaluation ? Evaluation.findById(app.last_evaluation).lean() : null,
    FieldCorrection.find({ application_id: app.application_id }).sort({ created_at: 1 }).lean(),
  ]);
  res.json(staffView({ app, docs, evaluation, corrections, cfg, deadline }));
});

// Decision API response (section 6.3) - staff only, it contains confidences.
router.get('/:id/decision', requireRole('KYC_OFFICER', 'COMPLIANCE_OFFICER'), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  const docs = await Document.find(workflow.activeDocsQuery(app)).sort({ doc_id: 1 });
  res.json(decisionResponse(app, docs));
});

router.get('/:id/evaluations', requireRole('KYC_OFFICER', 'COMPLIANCE_OFFICER'), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  const evals = await Evaluation.find({ application_id: app.application_id }).sort({ run_no: 1 }).lean();
  res.json(evals);
});

// ---------------------------------------------------------------------------
// Documents (applicant)
// ---------------------------------------------------------------------------

function ownerOnly(req, app) {
  if (String(app.owner) !== String(req.user._id)) throw forbidden('Only the applicant can change this application');
}

// multipart/form-data: file=<.txt file>, declared_doc_type=PAN_CARD|AADHAAR_CARD|ELECTRICITY_BILL|BANK_STATEMENT|DRIVING_LICENCE
router.post('/:id/documents', requireRole('APPLICANT'), upload.single('file'), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  ownerOnly(req, app);
  if (!['DRAFT', 'RESUBMISSION_REQUESTED'].includes(app.status)) {
    throw conflict(`Documents can only be uploaded in DRAFT or RESUBMISSION_REQUESTED (current: ${app.status})`);
  }
  await workflow.ensureResubmissionWindow(app);

  // --- checks: type, encoding, size (FR-2, NFR file handling)
  const errors = [];
  const declared = String((req.body && req.body.declared_doc_type) || '').trim().toUpperCase();
  if (!Document.DECLARABLE_TYPES.includes(declared)) {
    errors.push({ field: 'declared_doc_type', message: `declared_doc_type must be one of ${Document.DECLARABLE_TYPES.join(', ')}` });
  }
  const file = req.file;
  if (!file) {
    errors.push({ field: 'file', message: 'file is required (multipart field "file")' });
  } else {
    if (path.extname(file.originalname).toLowerCase() !== '.txt') errors.push({ field: 'file', message: 'Only .txt files are accepted' });
    if (file.mimetype && !['text/plain', 'application/octet-stream'].includes(file.mimetype)) {
      errors.push({ field: 'file', message: `File type ${file.mimetype} is not accepted; upload a plain-text .txt file` });
    }
    if (file.size === 0) errors.push({ field: 'file', message: 'File is empty' });
    if (file.size > MAX_FILE_BYTES) errors.push({ field: 'file', message: 'File is larger than 1 MB' });
    if (!isValidUtf8(file.buffer) || file.buffer.includes(0)) errors.push({ field: 'file', message: 'File must be UTF-8 text' });
  }
  if (errors.length) throw unprocessable('Validation failed', errors);

  const hash = sha256(file.buffer);

  // Idempotency: same file (same hash) for this application -> no duplicate document.
  const existing = await Document.findOne({ application_id: app.application_id, sha256: hash });
  if (existing) {
    if (existing.round !== app.round || existing.superseded) {
      // re-uploaded in a resubmission round: bring the same document into the new round
      existing.round = app.round;
      existing.superseded = false;
      existing.declared_doc_type = declared;
      await existing.save();
    }
    await audit({ application_id: app.application_id, action: 'DOCUMENT_UPLOAD_DUPLICATE', user: req.user, doc_id: existing.doc_id, details: { sha256: hash } });
    return res.status(200).json({ duplicate: true, document: docSummary(existing) });
  }

  // doc_id from the file name (e.g. D3000023.txt -> D3000023), otherwise a generated id.
  const base = path.basename(file.originalname, path.extname(file.originalname)).toUpperCase();
  let docId = /^D\d{4,}$/.test(base) ? base : null;
  if (!docId) docId = `D9${String(await nextSeq('document')).padStart(6, '0')}`;
  if (await Document.exists({ application_id: app.application_id, doc_id: docId })) {
    throw conflict(`A different file with doc_id ${docId} is already in this application`);
  }

  const storagePath = saveFile(file.buffer, app.application_id);
  const doc = await Document.create({
    doc_id: docId,
    application_id: app.application_id,
    declared_doc_type: declared,
    file_name: file.originalname,
    storage_path: storagePath,
    sha256: hash,
    size_bytes: file.size,
    round: app.round,
    uploaded_by: req.user._id,
  });
  await audit({
    application_id: app.application_id,
    action: 'DOCUMENT_UPLOADED',
    user: req.user,
    doc_id: docId,
    details: { declared_doc_type: declared, sha256: hash, size_bytes: file.size, round: app.round },
  });
  res.status(201).json({ duplicate: false, document: docSummary(doc) });
});

function docSummary(d) {
  return { id: d.public_id, doc_id: d.doc_id, file_name: d.file_name, declared_doc_type: d.declared_doc_type, sha256: d.sha256, size_bytes: d.size_bytes, round: d.round };
}

// Remove a wrongly uploaded document before submitting.
router.delete('/:id/documents/:documentId', requireRole('APPLICANT'), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  ownerOnly(req, app);
  if (!['DRAFT', 'RESUBMISSION_REQUESTED'].includes(app.status)) throw conflict('Documents can only be removed before submitting');
  const doc = await Document.findOne({ public_id: req.params.documentId, application_id: app.application_id, round: app.round });
  if (!doc) throw notFound('Document not found');
  try {
    fs.unlinkSync(path.join(STORAGE_DIR, doc.storage_path));
  } catch {
    /* file already gone */
  }
  await doc.deleteOne();
  await audit({ application_id: app.application_id, action: 'DOCUMENT_REMOVED', user: req.user, doc_id: doc.doc_id, details: { sha256: doc.sha256 } });
  res.json({ removed: true });
});

router.post('/:id/submit', requireRole('APPLICANT'), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  ownerOnly(req, app);
  const { app: done } = await workflow.submitApplication(app, req.user);
  const cfg = await getRulesConfig();
  const docs = await Document.find({ application_id: done.application_id }).sort({ round: 1, doc_id: 1 });
  res.json(applicantView(done, docs, workflow.resubmissionDeadline(done, cfg)));
});

// ---------------------------------------------------------------------------
// AI-5 reviewer summary (staff only). Lists the discrepancies of a REVIEW case; never a decision.
// The result is stored for the current rules run, so it is generated once per run.
// ---------------------------------------------------------------------------

router.post('/:id/ai-summary', requireRole('KYC_OFFICER', 'COMPLIANCE_OFFICER'), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  if (app.decision !== 'REVIEW') throw conflict('An AI summary is only written for cases whose rules decision is REVIEW');
  if (!gemini.isConfigured()) throw new HttpError(503, 'AI is not configured (GEMINI_API_KEY is missing)');
  const evaluation = app.last_evaluation ? await Evaluation.findById(app.last_evaluation).lean() : null;
  if (!evaluation) throw conflict('The rules have not run for this case yet');

  if (app.ai_summary && app.ai_summary.evaluation_run === evaluation.run_no && !req.query.refresh) {
    return res.json({ ai_summary: app.ai_summary, cached: true });
  }

  const cfg = await getRulesConfig();
  const docs = await Document.find(workflow.activeDocsQuery(app)).sort({ doc_id: 1 });
  const caseData = reviewSummary.buildCaseData(app, evaluation, docs, Number(cfg.min_field_confidence));
  let out;
  try {
    out = await reviewSummary.writeSummary(caseData);
  } catch (err) {
    await audit({ application_id: app.application_id, action: 'AI_SUMMARY_FAILED', user: req.user, details: { model: gemini.model(), error: err.message } });
    throw new HttpError(502, `AI summary could not be generated: ${err.message}`);
  }

  const summary = {
    text: out.text,
    model: gemini.model(),
    prompt_version: reviewSummary.PROMPT_VERSION,
    evaluation_run: evaluation.run_no,
    generated_at: new Date(),
    by_username: req.user.username,
  };
  // Direct update: the summary is not a workflow change, so it does not bump the case version.
  await Application.updateOne({ _id: app._id }, { $set: { ai_summary: summary } });
  await audit({
    application_id: app.application_id,
    action: 'AI_SUMMARY_GENERATED',
    user: req.user,
    details: { model: summary.model, prompt_version: summary.prompt_version, evaluation_run: summary.evaluation_run, words: out.words },
  });
  res.json({ ai_summary: summary, cached: false });
});

// ---------------------------------------------------------------------------
// Audit trail (FR-9) - read and export only
// ---------------------------------------------------------------------------

router.get('/:id/audit', requireRole('KYC_OFFICER', 'COMPLIANCE_OFFICER'), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  const rows = await AuditLog.find({ application_id: app.application_id }).sort({ at: 1, _id: 1 }).lean();
  await audit({ application_id: app.application_id, action: 'AUDIT_VIEWED', user: req.user });
  res.json(rows);
});

// PAN-like values are masked in exports.
const PAN_LIKE = /\b[A-Z]{3}(?=[A-Z0-9]{7}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{7}\b/g;
const maskText = (s) => String(s).replace(PAN_LIKE, (m) => maskPan(m));

router.get('/:id/audit/export', requireRole('KYC_OFFICER', 'COMPLIANCE_OFFICER'), async (req, res) => {
  const app = await loadApplicationFor(req.user, req.params.id);
  const rows = await AuditLog.find({ application_id: app.application_id }).sort({ at: 1, _id: 1 }).lean();
  await audit({ application_id: app.application_id, action: 'AUDIT_EXPORTED', user: req.user });
  const csv = stringify([
    ['at', 'application_id', 'action', 'actor', 'role', 'doc_id', 'details'],
    ...rows.map((r) => [new Date(r.at).toISOString(), r.application_id, r.action, r.actor_username, r.role, r.doc_id || '', maskText(JSON.stringify(r.details || {}))]),
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit_${app.application_id}.csv"`);
  res.send(csv);
});

module.exports = router;
