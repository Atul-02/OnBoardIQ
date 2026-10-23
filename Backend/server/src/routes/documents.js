const express = require('express');
const Document = require('../models/Document');
const Application = require('../models/Application');
const { authenticate, serviceKeyOrRole } = require('../middleware/auth');
const { loadApplicationFor } = require('./helpers');
const { readText } = require('../services/storage');
const { audit } = require('../services/audit');
const workflow = require('../services/workflow');
const { extractDocument } = require('../extraction');
const { notFound } = require('../utils/httpError');

const router = express.Router();

// Document ids in URLs are the random public_id (not guessable), and every request is authorised.

// View document text. Officers, compliance and the owning applicant only; every view is audited (FR-9).
router.get('/:id/content', authenticate, async (req, res) => {
  const doc = await Document.findOne({ public_id: req.params.id });
  if (!doc) throw notFound('Document not found');
  await loadApplicationFor(req.user, doc.application_id); // 404 if not owner / not staff
  const text = readText(doc.storage_path);
  await audit({ application_id: doc.application_id, action: 'DOCUMENT_VIEWED', user: req.user, doc_id: doc.doc_id, details: { document_id: doc.public_id } });
  res.json({
    id: doc.public_id,
    doc_id: doc.doc_id,
    application_id: doc.application_id,
    file_name: doc.file_name,
    declared_doc_type: doc.declared_doc_type,
    sha256: doc.sha256,
    text,
  });
});

// FR-3 extraction service interface.
// Returns doc_type and fields with confidence in the long format of section 4.
// Callable by the backend with x-service-key, or by an officer / compliance officer.
// The result is stored on the document only while the application has not been decided yet,
// so it never silently overwrites officer corrections.
router.post('/:id/extract', serviceKeyOrRole('KYC_OFFICER', 'COMPLIANCE_OFFICER'), async (req, res) => {
  const doc = await Document.findOne({ public_id: req.params.id });
  if (!doc) throw notFound('Document not found');
  const app = await Application.findOne({ application_id: doc.application_id });

  let out;
  let stored = false;
  if (app && ['DRAFT', 'SUBMITTED', 'EXTRACTING'].includes(app.status)) {
    out = await workflow.runExtraction(doc, req.user || null);
    stored = true;
  } else {
    out = await extractDocument({ doc_id: doc.doc_id, text: readText(doc.storage_path) });
    await audit({
      application_id: doc.application_id,
      action: 'DOCUMENT_EXTRACTION_PREVIEW',
      user: req.user || null,
      doc_id: doc.doc_id,
      details: { provider: out.provider, extractor_version: out.extractor_version, error: out.error },
    });
  }

  const rows = out.rows.map((r) => ({ doc_id: doc.doc_id, field_name: r.field_name, value: r.value, confidence: Number(Number(r.confidence).toFixed(2)) }));
  const docType = rows.find((r) => r.field_name === 'doc_type');
  res.json({
    id: doc.public_id,
    doc_id: doc.doc_id,
    provider: out.provider,
    extractor_version: out.extractor_version,
    error: out.error || null,
    stored,
    doc_type: docType ? docType.value : 'OTHER',
    confidence: docType ? docType.confidence : 0,
    rows,
  });
});

module.exports = router;
