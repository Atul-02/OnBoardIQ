const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const openapi = require('../openapi.json');

const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { requireRole, authenticate } = require('./middleware/auth');
const { expireResubmissions } = require('./services/workflow');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi));
  app.get('/openapi.json', (req, res) => res.json(openapi));

  app.use('/api/v1/auth', require('./routes/auth'));
  app.use('/api/v1/applications', require('./routes/applications'));
  app.use('/api/v1/documents', require('./routes/documents'));
  app.use('/api/v1/officer', require('./routes/officer'));
  app.use('/api/v1/checker', require('./routes/checker'));
  app.use('/api/v1/dashboard', require('./routes/dashboard'));
  app.use('/api/v1', require('./routes/admin'));

  // Run the expiry job on demand (handy for demos instead of waiting for cron).
  app.post('/api/v1/jobs/expire-resubmissions', authenticate, requireRole('COMPLIANCE_OFFICER'), async (req, res) => {
    res.json({ closed: await expireResubmissions() });
  });

  app.use('/mock/core-banking', require('./routes/mockCoreBanking'));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
