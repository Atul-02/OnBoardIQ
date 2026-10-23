const mongoose = require('mongoose');

// Officer corrections. Also used as labelled feedback for the AI extractor (AI-4).
const fieldCorrectionSchema = new mongoose.Schema(
  {
    application_id: { type: String, required: true, index: true },
    doc_id: String,
    document_public_id: String,
    field: String,
    old_value: String,
    old_confidence: Number,
    old_source: String,
    new_value: String,
    reason: String,
    officer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    officer_username: String,
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

module.exports = mongoose.model('FieldCorrection', fieldCorrectionSchema);
