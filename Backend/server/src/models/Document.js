const mongoose = require('mongoose');
const crypto = require('crypto');

const DOC_TYPES = ['PAN_CARD', 'AADHAAR_CARD', 'ELECTRICITY_BILL', 'BANK_STATEMENT', 'DRIVING_LICENCE', 'OTHER'];
const DECLARABLE_TYPES = DOC_TYPES.filter((t) => t !== 'OTHER');

const fieldSchema = new mongoose.Schema(
  { value: String, confidence: Number, source: { type: String, enum: ['MOCK', 'AI', 'OFFICER'] } },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    // Unguessable id used in every document URL.
    public_id: { type: String, default: () => crypto.randomUUID(), unique: true },
    // Business id (from the file name, e.g. D3000023). Unique inside one application.
    doc_id: { type: String, required: true },
    application_id: { type: String, required: true, index: true },
    declared_doc_type: { type: String, enum: DECLARABLE_TYPES, required: true },
    file_name: String,
    storage_path: { type: String, required: true }, // file on disk, outside the database
    sha256: { type: String, required: true },
    size_bytes: Number,
    round: { type: Number, default: 1 },
    superseded: { type: Boolean, default: false },
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    extraction: {
      provider: String,
      extractor_version: String,
      extracted_at: Date,
      error: String,
      doc_type: { value: String, confidence: Number, source: { type: String } },
      fields: { type: Map, of: fieldSchema, default: {} },
    },
  },
  { timestamps: true }
);

documentSchema.index({ application_id: 1, doc_id: 1 }, { unique: true });
documentSchema.index({ application_id: 1, sha256: 1 }, { unique: true });

module.exports = mongoose.model('Document', documentSchema);
module.exports.DOC_TYPES = DOC_TYPES;
module.exports.DECLARABLE_TYPES = DECLARABLE_TYPES;
