// Compliance Officer maintenance: rule configuration and watchlists.
const express = require('express');
const { Config, Sanction, Pep, Occupation } = require('../models/Reference');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { sanctionSchema, pepSchema } = require('../validators');
const { audit } = require('../services/audit');
const workflow = require('../services/workflow');
const { conflict, notFound, unprocessable } = require('../utils/httpError');

const router = express.Router();
router.use(authenticate);

// --- Reference data any logged-in user may read (e.g. occupation dropdown) ---
router.get('/occupations', async (req, res) => {
  res.json(await Occupation.find({}, { _id: 0, __v: 0 }).sort({ occupation_code: 1 }).lean());
});

// --- Which extraction provider / AI model is active (no secrets) ---
router.get('/ai/status', requireRole('KYC_OFFICER', 'COMPLIANCE_OFFICER'), (req, res) => {
  const { EXTRACTION_PROVIDER, GEMINI_MODEL, GEMINI_API_KEY } = require('../config');
  const { getProvider } = require('../extraction');
  res.json({
    extraction_provider: EXTRACTION_PROVIDER,
    extractor_version: getProvider().VERSION,
    gemini_model: GEMINI_MODEL,
    gemini_configured: !!GEMINI_API_KEY,
  });
});

// --- Rules configuration ---
router.get('/config', requireRole('KYC_OFFICER', 'COMPLIANCE_OFFICER'), async (req, res) => {
  const cfg = await Config.findOne({ key: 'rules' }).lean();
  res.json(cfg ? cfg.value : {});
});

// Partial update, e.g. { "name_match_threshold": 0.95 }. Each value must keep the type of the existing key.
router.put('/config', requireRole('COMPLIANCE_OFFICER'), async (req, res) => {
  const doc = await Config.findOne({ key: 'rules' });
  if (!doc) throw notFound('Rules configuration not loaded');
  const current = doc.value;
  const updates = req.body || {};
  const errors = [];
  const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

  for (const [key, value] of Object.entries(updates)) {
    if (!(key in current)) {
      errors.push({ field: key, message: 'Unknown configuration key' });
      continue;
    }
    if (typeOf(value) !== typeOf(current[key])) {
      errors.push({ field: key, message: `Must be of type ${typeOf(current[key])}` });
      continue;
    }
    if (key === 'pan_pattern') {
      try {
        new RegExp(value);
      } catch {
        errors.push({ field: key, message: 'Not a valid regular expression' });
      }
    }
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) errors.push({ field: key, message: 'Must be a non-negative number' });
  }
  if (!Object.keys(updates).length) errors.push({ field: '(body)', message: 'Send at least one key to update' });
  if (errors.length) throw unprocessable('Validation failed', errors);

  const before = {};
  for (const key of Object.keys(updates)) before[key] = current[key];
  doc.value = { ...current, ...updates };
  doc.markModified('value');
  await doc.save();
  await audit({ action: 'CONFIG_UPDATED', user: req.user, details: { before, after: updates } });
  res.json(doc.value);
});

// --- Watchlists ---
router.get('/watchlists/sanctions', requireRole('COMPLIANCE_OFFICER'), async (req, res) => {
  res.json(await Sanction.find({}, { _id: 0, __v: 0 }).sort({ list_id: 1 }).lean());
});

router.post('/watchlists/sanctions', requireRole('COMPLIANCE_OFFICER'), validate(sanctionSchema), async (req, res) => {
  if (await Sanction.exists({ list_id: req.valid.list_id })) throw conflict('list_id already exists');
  const entry = await Sanction.create(req.valid);
  await audit({ action: 'WATCHLIST_ENTRY_ADDED', user: req.user, details: { list: 'sanctions', entry: req.valid } });
  res.status(201).json(entry);
});

router.delete('/watchlists/sanctions/:listId', requireRole('COMPLIANCE_OFFICER'), async (req, res) => {
  const entry = await Sanction.findOneAndDelete({ list_id: req.params.listId }).lean();
  if (!entry) throw notFound('Sanctions entry not found');
  await audit({ action: 'WATCHLIST_ENTRY_REMOVED', user: req.user, details: { list: 'sanctions', list_id: req.params.listId, name: entry.name } });
  res.json({ removed: true });
});

router.get('/watchlists/peps', requireRole('COMPLIANCE_OFFICER'), async (req, res) => {
  res.json(await Pep.find({}, { _id: 0, __v: 0 }).sort({ pep_id: 1 }).lean());
});

router.post('/watchlists/peps', requireRole('COMPLIANCE_OFFICER'), validate(pepSchema), async (req, res) => {
  if (await Pep.exists({ pep_id: req.valid.pep_id })) throw conflict('pep_id already exists');
  const entry = await Pep.create(req.valid);
  await audit({ action: 'WATCHLIST_ENTRY_ADDED', user: req.user, details: { list: 'pep', entry: req.valid } });
  res.status(201).json(entry);
});

router.delete('/watchlists/peps/:pepId', requireRole('COMPLIANCE_OFFICER'), async (req, res) => {
  const entry = await Pep.findOneAndDelete({ pep_id: req.params.pepId }).lean();
  if (!entry) throw notFound('PEP entry not found');
  await audit({ action: 'WATCHLIST_ENTRY_REMOVED', user: req.user, details: { list: 'pep', pep_id: req.params.pepId, name: entry.name } });
  res.json({ removed: true });
});

// Re-screen open cases on request after a watchlist / config change.
router.post('/watchlists/rescreen', requireRole('COMPLIANCE_OFFICER'), async (req, res) => {
  const out = await workflow.rescreenOpenCases(req.user);
  await audit({ action: 'RESCREEN_RUN', user: req.user, details: { rescreened: out.rescreened, changed: out.changed } });
  res.json(out);
});

module.exports = router;
