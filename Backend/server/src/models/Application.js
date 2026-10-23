const mongoose = require('mongoose');

const STATUSES = [
  'DRAFT', // created through the API, documents not yet submitted
  'SUBMITTED',
  'EXTRACTING',
  'AUTO_APPROVED',
  'IN_REVIEW',
  'RESUBMISSION_REQUESTED',
  'PENDING_CHECKER',
  'APPROVED',
  'REJECTED',
  'AUTO_REJECTED',
  'CLOSED_EXPIRED',
];

const actionSchema = new mongoose.Schema(
  {
    action: String,
    comment: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    by_username: String,
    at: Date,
    auto: { type: Boolean, default: false }, // true when created by a correction re-run (example 12)
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    application_id: { type: String, required: true, unique: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    source: { type: String, enum: ['SEED', 'API'], default: 'API' },

    // Declared details (section 4). Kept as strings so leading zeros survive.
    application_date: { type: String, required: true },
    full_name: { type: String, required: true },
    dob: { type: String, required: true },
    gender: String,
    pan_number: { type: String, required: true },
    aadhaar_last4: { type: String, required: true }, // only the last 4 digits are ever stored
    mobile: String,
    email: String,
    address: String,
    city: String,
    state: String,
    pincode: String,
    occupation_code: String,
    annual_income: Number,
    consent: { type: Boolean, required: true },

    // Workflow
    status: { type: String, enum: STATUSES, default: 'DRAFT', index: true },
    version: { type: Number, default: 0 }, // optimistic lock (HTTP 409)
    round: { type: Number, default: 1 }, // document round; goes up on each resubmission request
    status_history: [
      { _id: false, from: String, to: String, at: Date, by: String, role: String, note: String },
    ],
    submitted_at: Date,
    resubmission_requested_at: Date,
    pending_checker_at: Date,
    decided_at: Date,

    // Latest rules-engine result
    decision: { type: String, default: null },
    reason_codes: { type: [String], default: [] },
    name_match_score: { type: Number, default: null },
    risk_category: { type: String, default: null },
    rekyc_due_date: { type: String, default: null },
    last_evaluation: { type: mongoose.Schema.Types.ObjectId, ref: 'Evaluation' },
    // First rules result for the case (used by the dashboard rates)
    initial_decision: { type: String, default: null },
    initial_reason_codes: { type: [String], default: [] },

    // Maker-checker
    maker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recommendation: { type: actionSchema, default: null },
    checker_decision: { type: actionSchema, default: null },

    // Core banking
    account: {
      customer_id: String,
      account_number: String,
      opened_at: Date,
      error: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Application', applicationSchema);
module.exports.STATUSES = STATUSES;
