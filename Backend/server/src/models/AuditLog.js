const mongoose = require('mongoose');

// Append-only audit trail (FR-9). Updates and deletes are blocked at model level,
// and no route exposes them.
const auditLogSchema = new mongoose.Schema(
  {
    application_id: { type: String, default: null, index: true },
    action: { type: String, required: true },
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actor_username: { type: String, default: 'SYSTEM' },
    role: { type: String, default: 'SYSTEM' },
    doc_id: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

const blocked = function () {
  throw new Error('Audit log is append-only: update/delete is not allowed');
};
for (const op of [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
]) {
  auditLogSchema.pre(op, blocked);
}
auditLogSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Audit log is append-only: update is not allowed');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
