const AuditLog = require('../models/AuditLog');
const { roleLabel } = require('../middleware/auth');

// The only way the app writes to the audit trail: insert one row.
async function audit({ application_id = null, action, user = null, doc_id = null, details = {} }) {
  return AuditLog.create({
    application_id,
    action,
    actor_id: user ? user._id : null,
    actor_username: user ? user.username : 'SYSTEM',
    role: roleLabel(user),
    doc_id,
    details,
    at: new Date(),
  });
}

module.exports = { audit };
