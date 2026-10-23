// OnboardIQ rules engine (section 6.1).
// Pure function: no database, no HTTP. Used by the API, the batch script and the tests.
//
// evaluate(app, docs, ctx)
//   app:  { application_id, application_date, full_name, dob, pan_number, aadhaar_last4,
//           pincode, occupation_code, annual_income }
//   docs: [{ doc_id, declared_doc_type,
//            extraction: { doc_type: { value, confidence }, fields: { <name>: { value, confidence, source } } } }]
//   ctx:  { cfg, sanctions, peps, existingPans (Set), occupations (Map code -> risk_level) }

const { similarity } = require('./normalize');
const { screen } = require('./screening');
const { riskCategory, rekycDueDate } = require('./risk');
const { ageOn, daysBetween, isIsoDate } = require('../utils/dates');

// Required fields per document type (section 6.1). Can be overridden from config.
const DEFAULT_REQUIRED_FIELDS = {
  PAN_CARD: ['name', 'dob', 'pan_number'],
  AADHAAR_CARD: ['name', 'dob', 'aadhaar_last4'],
  ELECTRICITY_BILL: ['pincode', 'document_date'],
  BANK_STATEMENT: ['pincode', 'document_date'],
  DRIVING_LICENCE: ['pincode', 'valid_until'],
};

const RULES = [
  { rule: 'R1', code: 'DOCUMENT_MISSING', outcome: 'REVIEW' },
  { rule: 'R2', code: 'DOCUMENT_TYPE_MISMATCH', outcome: 'REVIEW' },
  { rule: 'R3', code: 'LOW_EXTRACTION_CONFIDENCE', outcome: 'REVIEW' },
  { rule: 'R4', code: 'AGE_BELOW_18', outcome: 'REJECT' },
  { rule: 'R5', code: 'PAN_INVALID', outcome: 'REJECT' },
  { rule: 'R6', code: 'PAN_MISMATCH', outcome: 'REJECT' },
  { rule: 'R7', code: 'DOB_MISMATCH', outcome: 'REJECT' },
  { rule: 'R8', code: 'AADHAAR_MISMATCH', outcome: 'REJECT' },
  { rule: 'R9', code: 'NAME_MISMATCH', outcome: 'REJECT' },
  { rule: 'R10', code: 'SANCTIONS_MATCH', outcome: 'REJECT' },
  { rule: 'R11', code: 'NAME_MISMATCH_MINOR', outcome: 'REVIEW' },
  { rule: 'R12', code: 'DOCUMENT_EXPIRED', outcome: 'REVIEW' },
  { rule: 'R13', code: 'ADDRESS_PROOF_STALE', outcome: 'REVIEW' },
  { rule: 'R14', code: 'ADDRESS_MISMATCH', outcome: 'REVIEW' },
  { rule: 'R15', code: 'SANCTIONS_POSSIBLE_MATCH', outcome: 'REVIEW' },
  { rule: 'R16', code: 'PEP_MATCH', outcome: 'REVIEW' },
  { rule: 'R17', code: 'DUPLICATE_CUSTOMER', outcome: 'REVIEW' },
];

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

function compareIds(a, b) {
  // doc_ids like D3000001: compare numerically when both have digits, else as text.
  const na = Number(String(a).replace(/\D/g, ''));
  const nb = Number(String(b).replace(/\D/g, ''));
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}

function evaluate(app, docs, ctx) {
  const { cfg } = ctx;
  const minConf = Number(cfg.min_field_confidence);
  const requiredFields = cfg.required_fields || DEFAULT_REQUIRED_FIELDS;
  const addressTypes = cfg.address_proof_types || ['ELECTRICITY_BILL', 'BANK_STATEMENT', 'DRIVING_LICENCE'];

  // ---- Document selection -------------------------------------------------
  const sortedDocs = [...docs].sort((a, b) => compareIds(a.doc_id, b.doc_id));
  const classified = sortedDocs.map((d) => {
    const ex = d.extraction || {};
    const dt = ex.doc_type || { value: 'OTHER', confidence: 0 };
    return {
      doc_id: d.doc_id,
      declared_doc_type: d.declared_doc_type,
      doc_type: str(dt.value) || 'OTHER',
      doc_type_confidence: Number(dt.confidence) || 0,
      fields: ex.fields || {},
    };
  });

  const firstOfType = (types) => classified.find((d) => types.includes(d.doc_type)) || null;
  const panDoc = firstOfType(['PAN_CARD']);
  const aadhaarDoc = firstOfType(['AADHAAR_CARD']);
  const addressDoc = firstOfType(addressTypes);

  const usable = (doc, field) => {
    if (!doc) return null;
    const f = doc.fields[field];
    if (!f) return null;
    const v = str(f.value);
    if (!v) return null;
    if (Number(f.confidence) < minConf) return null;
    return v;
  };

  // ---- Name match score ---------------------------------------------------
  const panName = usable(panDoc, 'name');
  const aadhaarName = usable(aadhaarDoc, 'name');
  const nameComparisons = [];
  if (panName !== null) {
    nameComparisons.push({ source: 'PAN_CARD', doc_id: panDoc.doc_id, value: panName, similarity: similarity(app.full_name, panName, cfg.name_title_tokens) });
  }
  if (aadhaarName !== null) {
    nameComparisons.push({ source: 'AADHAAR_CARD', doc_id: aadhaarDoc.doc_id, value: aadhaarName, similarity: similarity(app.full_name, aadhaarName, cfg.name_title_tokens) });
  }
  const nameScore = nameComparisons.length ? Math.min(...nameComparisons.map((c) => c.similarity)) : null;

  // ---- Screening ----------------------------------------------------------
  const sanctionsHit = screen(app.full_name, app.dob, ctx.sanctions, cfg);
  const pepHit = screen(app.full_name, app.dob, ctx.peps, cfg);

  // ---- Rule evaluation (no short-circuit) ---------------------------------
  const results = {}; // rule -> { status: TRIGGERED|PASSED|SKIPPED, detail }
  const set = (rule, triggered, detail) => {
    results[rule] = { status: triggered ? 'TRIGGERED' : 'PASSED', detail };
  };
  const skip = (rule, why) => {
    results[rule] = { status: 'SKIPPED', detail: { reason: why } };
  };

  // R1 document missing
  {
    const missing = [];
    if (!panDoc) missing.push('PAN_CARD');
    if (!aadhaarDoc) missing.push('AADHAAR_CARD');
    if (!addressDoc) missing.push('ADDRESS_PROOF');
    set('R1', missing.length > 0, { missing });
  }

  // R2 declared vs classified type
  {
    const mismatches = classified
      .filter((d) => d.doc_type !== d.declared_doc_type)
      .map((d) => ({ doc_id: d.doc_id, declared: d.declared_doc_type, classified: d.doc_type }));
    set('R2', mismatches.length > 0, { mismatches });
  }

  // R3 low extraction confidence
  {
    const lowDocType = classified
      .filter((d) => d.doc_type_confidence < minConf)
      .map((d) => ({ doc_id: d.doc_id, field: 'doc_type', value: d.doc_type, confidence: d.doc_type_confidence }));
    const lowFields = [];
    for (const doc of [panDoc, aadhaarDoc, addressDoc]) {
      if (!doc) continue;
      for (const field of requiredFields[doc.doc_type] || []) {
        const f = doc.fields[field];
        if (!f || !str(f.value) || Number(f.confidence) < minConf) {
          lowFields.push({ doc_id: doc.doc_id, field, value: f ? str(f.value) : null, confidence: f ? Number(f.confidence) : null });
        }
      }
    }
    set('R3', lowDocType.length + lowFields.length > 0, { low_doc_type: lowDocType, low_fields: lowFields });
  }

  // R4 age
  if (isIsoDate(app.dob) && isIsoDate(app.application_date)) {
    const age = ageOn(app.dob, app.application_date);
    set('R4', age < Number(cfg.min_age), { age, min_age: Number(cfg.min_age) });
  } else {
    skip('R4', 'dob or application_date not a valid date');
  }

  // R5 PAN format / holder type
  {
    const pan = str(app.pan_number);
    const formatOk = new RegExp(cfg.pan_pattern).test(pan);
    const holderOk = pan.charAt(3) === cfg.pan_holder_type_char;
    set('R5', !formatOk || !holderOk, { declared: pan, format_ok: formatOk, holder_type_ok: holderOk });
  }

  // R6 PAN mismatch
  {
    const read = usable(panDoc, 'pan_number');
    if (read === null) skip('R6', 'pan_number on PAN card not usable');
    else set('R6', read.toUpperCase() !== str(app.pan_number).toUpperCase(), { declared: str(app.pan_number), on_document: read, doc_id: panDoc.doc_id });
  }

  // R7 DOB mismatch
  {
    const compared = [];
    const p = usable(panDoc, 'dob');
    const a = usable(aadhaarDoc, 'dob');
    if (p !== null) compared.push({ source: 'PAN_CARD', doc_id: panDoc.doc_id, value: p });
    if (a !== null) compared.push({ source: 'AADHAAR_CARD', doc_id: aadhaarDoc.doc_id, value: a });
    if (!compared.length) skip('R7', 'dob not usable on PAN or Aadhaar');
    else set('R7', compared.some((c) => c.value !== str(app.dob)), { declared: str(app.dob), compared });
  }

  // R8 Aadhaar last 4 mismatch
  {
    const read = usable(aadhaarDoc, 'aadhaar_last4');
    if (read === null) skip('R8', 'aadhaar_last4 not usable');
    else set('R8', read !== str(app.aadhaar_last4), { declared: str(app.aadhaar_last4), on_document: read, doc_id: aadhaarDoc.doc_id });
  }

  // R9 / R11 name match
  if (nameScore === null) {
    skip('R9', 'no usable name on PAN or Aadhaar');
    skip('R11', 'no usable name on PAN or Aadhaar');
  } else {
    const detail = { declared: app.full_name, name_match_score: nameScore, comparisons: nameComparisons };
    set('R9', nameScore < Number(cfg.name_reject_below), detail);
    set('R11', nameScore >= Number(cfg.name_reject_below) && nameScore < Number(cfg.name_match_threshold), detail);
  }

  // R10 / R15 sanctions
  const sanctionsDetail = describeHit(sanctionsHit, 'list_id');
  set('R10', sanctionsHit.result === 'MATCH', sanctionsDetail);
  set('R15', sanctionsHit.result === 'POSSIBLE', sanctionsDetail);

  // R12 / R13 / R14 address proof
  if (!addressDoc) {
    skip('R12', 'no address proof');
    skip('R13', 'no address proof');
    skip('R14', 'no address proof');
  } else {
    if (addressDoc.doc_type === 'DRIVING_LICENCE') {
      const validUntil = usable(addressDoc, 'valid_until');
      if (validUntil === null || !isIsoDate(validUntil)) skip('R12', 'valid_until not usable');
      else set('R12', validUntil < app.application_date, { doc_id: addressDoc.doc_id, valid_until: validUntil, application_date: app.application_date });
      skip('R13', 'address proof is a driving licence');
    } else {
      skip('R12', 'address proof is not a driving licence');
      const docDate = usable(addressDoc, 'document_date');
      if (docDate === null || !isIsoDate(docDate)) skip('R13', 'document_date not usable');
      else {
        const ageDays = daysBetween(docDate, app.application_date);
        set('R13', ageDays > Number(cfg.address_proof_max_age_days) || ageDays < 0, {
          doc_id: addressDoc.doc_id, document_date: docDate, application_date: app.application_date,
          age_days: ageDays, max_age_days: Number(cfg.address_proof_max_age_days),
        });
      }
    }
    const pin = usable(addressDoc, 'pincode');
    if (pin === null) skip('R14', 'pincode not usable');
    else set('R14', pin !== str(app.pincode), { declared: str(app.pincode), on_document: pin, doc_id: addressDoc.doc_id });
  }

  // R16 PEP
  set('R16', pepHit.result === 'MATCH', describeHit(pepHit, 'pep_id'));

  // R17 duplicate customer (exact PAN)
  {
    const pan = str(app.pan_number).toUpperCase();
    set('R17', ctx.existingPans.has(pan), { declared: pan });
  }

  // ---- Decision -------------------------------------------------------------
  const triggered = RULES.filter((r) => results[r.rule].status === 'TRIGGERED');
  const reasonCodes = triggered.map((r) => r.code);
  let decision = 'APPROVE';
  if (triggered.some((r) => r.outcome === 'REJECT')) decision = 'REJECT';
  else if (triggered.length) decision = 'REVIEW';

  let risk = null;
  let rekyc = null;
  if (decision !== 'REJECT') {
    risk = riskCategory({
      triggeredCodes: reasonCodes,
      occupationRisk: ctx.occupations.get(app.occupation_code),
      annualIncome: app.annual_income,
      cfg,
    });
    rekyc = rekycDueDate(app.application_date, risk, cfg);
  }

  return {
    application_id: app.application_id,
    decision,
    reason_codes: reasonCodes,
    name_match_score: nameScore,
    risk_category: risk,
    rekyc_due_date: rekyc,
    rules: RULES.map((r) => ({ ...r, ...results[r.rule] })),
    screening: { sanctions: sanctionsDetail, pep: describeHit(pepHit, 'pep_id') },
    selected_documents: {
      PAN_CARD: panDoc ? panDoc.doc_id : null,
      AADHAAR_CARD: aadhaarDoc ? aadhaarDoc.doc_id : null,
      ADDRESS_PROOF: addressDoc ? addressDoc.doc_id : null,
    },
    documents: classified.map((d) => ({
      doc_id: d.doc_id, declared_doc_type: d.declared_doc_type, doc_type: d.doc_type, confidence: d.doc_type_confidence,
    })),
    config_version: cfg.version || null,
  };
}

function describeHit(hit, idKey) {
  if (hit.result === 'NONE') return { result: 'NONE' };
  return {
    result: hit.result,
    entry_id: hit.entry[idKey] || hit.entry.id,
    entry_name: hit.entry.name,
    matched_on: hit.matched_on,
    similarity: hit.similarity,
    list_dob: hit.entry.dob || null,
    dob_comparison: hit.dob_comparison,
  };
}

const fmtScore = (s) => (s === null || s === undefined ? '' : Number(s).toFixed(4));

module.exports = { evaluate, RULES, DEFAULT_REQUIRED_FIELDS, fmtScore };
