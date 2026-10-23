const Application = require('../models/Application');
const { hasRole } = require('../middleware/auth');
const { notFound } = require('../utils/httpError');

const isStaff = (user) => hasRole(user, 'KYC_OFFICER') || hasRole(user, 'COMPLIANCE_OFFICER');

// Loads an application the current user may see.
// Applicants only see their own; for anyone else's id we answer 404 so nothing leaks (FR-1).
async function loadApplicationFor(user, applicationId) {
  const app = await Application.findOne({ application_id: applicationId });
  if (!app) throw notFound('Application not found');
  if (!isStaff(user) && String(app.owner) !== String(user._id)) throw notFound('Application not found');
  return app;
}

module.exports = { isStaff, loadApplicationFor };
