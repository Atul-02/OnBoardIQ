// Display labels. Values come from the backend; this only makes them readable.

export const STATUS_LABELS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  EXTRACTING: 'Checking documents',
  AUTO_APPROVED: 'Auto approved',
  IN_REVIEW: 'In review',
  RESUBMISSION_REQUESTED: 'Resubmission requested',
  PENDING_CHECKER: 'Pending checker',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  AUTO_REJECTED: 'Auto rejected',
  CLOSED_EXPIRED: 'Closed (expired)',
};

// Colour group for each status badge.
export const STATUS_TONE = {
  DRAFT: 'grey',
  SUBMITTED: 'blue',
  EXTRACTING: 'blue',
  AUTO_APPROVED: 'green',
  APPROVED: 'green',
  IN_REVIEW: 'amber',
  RESUBMISSION_REQUESTED: 'amber',
  PENDING_CHECKER: 'purple',
  REJECTED: 'red',
  AUTO_REJECTED: 'red',
  CLOSED_EXPIRED: 'grey',
};

export const DOC_TYPES = ['PAN_CARD', 'AADHAAR_CARD', 'ELECTRICITY_BILL', 'BANK_STATEMENT', 'DRIVING_LICENCE'];

export const DOC_TYPE_LABELS = {
  PAN_CARD: 'PAN card',
  AADHAAR_CARD: 'Aadhaar card',
  ELECTRICITY_BILL: 'Electricity bill',
  BANK_STATEMENT: 'Bank statement',
  DRIVING_LICENCE: 'Driving licence',
  OTHER: 'Other',
};

export const FIELD_LABELS = {
  doc_type: 'Document type',
  name: 'Name',
  dob: 'Date of birth',
  gender: 'Gender',
  pan_number: 'PAN',
  aadhaar_last4: 'Aadhaar last 4',
  address: 'Address',
  pincode: 'Pincode',
  document_date: 'Document date',
  valid_until: 'Valid until',
};

// Fields an officer may correct (same list as the backend).
export const CORRECTABLE_FIELDS = Object.keys(FIELD_LABELS);

export const label = (map, v) => (v ? map[v] || v : '—');

export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const fmtMoney = (n) => (n === null || n === undefined || n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);
