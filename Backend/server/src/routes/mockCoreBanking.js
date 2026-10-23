// Simulated core-banking API. Only the backend may call it (x-service-key from .env).
const express = require('express');
const { requireServiceKey } = require('../middleware/auth');
const { openAccountMock } = require('../services/coreBanking');
const { badRequest } = require('../utils/httpError');

const router = express.Router();
router.use(requireServiceKey);

// POST /mock/core-banking/accounts { application_id, full_name } -> { customer_id, account_number }
router.post('/accounts', async (req, res) => {
  const { application_id, full_name } = req.body || {};
  if (!application_id) throw badRequest('application_id is required');
  const acc = await openAccountMock({ application_id, full_name });
  res.status(acc.existing ? 200 : 201).json(acc);
});

module.exports = router;
