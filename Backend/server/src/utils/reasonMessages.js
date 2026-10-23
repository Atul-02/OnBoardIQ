// Plain-language messages shown to the applicant (FR-8).
// They never reveal watchlist names, confidence scores or other internal details.
const REASON_MESSAGES = {
  DOCUMENT_MISSING: 'One or more required documents (PAN card, Aadhaar card or an address proof) could not be found in your upload.',
  DOCUMENT_TYPE_MISMATCH: 'A document you uploaded does not look like the document type you selected for it.',
  LOW_EXTRACTION_CONFIDENCE: 'Some details on your documents could not be read clearly. An officer will check them.',
  AGE_BELOW_18: 'You must be at least 18 years old to open this account.',
  PAN_INVALID: 'The PAN you entered is not a valid individual PAN.',
  PAN_MISMATCH: 'The PAN you entered does not match the PAN on your PAN card.',
  DOB_MISMATCH: 'The date of birth you entered does not match the date of birth on your documents.',
  AADHAAR_MISMATCH: 'The Aadhaar last 4 digits you entered do not match your Aadhaar card.',
  NAME_MISMATCH: 'The name you entered does not match the name on your documents.',
  SANCTIONS_MATCH: 'We are unable to open an account based on our regulatory compliance checks.',
  NAME_MISMATCH_MINOR: 'The name you entered differs slightly from the name on your documents. An officer will check it.',
  DOCUMENT_EXPIRED: 'Your driving licence used as address proof has expired.',
  ADDRESS_PROOF_STALE: 'Your address proof is older than allowed (or dated in the future). A recent document is needed.',
  ADDRESS_MISMATCH: 'The pincode you entered does not match the pincode on your address proof.',
  SANCTIONS_POSSIBLE_MATCH: 'Your application needs additional compliance checks.',
  PEP_MATCH: 'Your application needs additional compliance checks.',
  DUPLICATE_CUSTOMER: 'It looks like you may already be a customer of the bank. An officer will check this.',
};

const STATUS_MESSAGES = {
  DRAFT: 'Your application is saved. Upload at least 3 documents and submit it.',
  SUBMITTED: 'We have received your application and documents.',
  EXTRACTING: 'We are checking your documents.',
  AUTO_APPROVED: 'Your account has been opened.',
  IN_REVIEW: 'Your application is being reviewed by a KYC officer.',
  RESUBMISSION_REQUESTED: 'Please upload new documents within 7 days.',
  PENDING_CHECKER: 'Your application is waiting for a final compliance check.',
  APPROVED: 'Your account has been opened.',
  REJECTED: 'Your application was not approved.',
  AUTO_REJECTED: 'Your application was not approved.',
  CLOSED_EXPIRED: 'Your application was closed because new documents were not received within 7 days.',
};

const reasonMessage = (code) => REASON_MESSAGES[code] || 'Your application needs further checks.';

module.exports = { REASON_MESSAGES, STATUS_MESSAGES, reasonMessage };
