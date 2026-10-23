const mongoose = require('mongoose');

// One row per rules-engine run, so the history of results is kept.
const evaluationSchema = new mongoose.Schema(
  {
    application_id: { type: String, required: true, index: true },
    run_no: Number,
    trigger: { type: String, enum: ['SUBMIT', 'RESUBMIT', 'CORRECTION', 'RESCREEN', 'SEED'] },
    by_username: String,
    decision: String,
    reason_codes: [String],
    name_match_score: Number,
    risk_category: String,
    rekyc_due_date: String,
    result: mongoose.Schema.Types.Mixed, // full engine output incl. per-rule details
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

module.exports = mongoose.model('Evaluation', evaluationSchema);
