// Request body schemas (zod). Failures become HTTP 422 with field names (FR-2).
const { z } = require('zod');
const { isIsoDate, todayIST } = require('./utils/dates');

const isoDate = (label) =>
  z.string({ error: `${label} is required` }).trim().refine(isIsoDate, { message: `${label} must be a valid date in YYYY-MM-DD format` });

const trimmed = (label, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max, `${label} is too long`);

const aadhaarLast4 = z
  .string({ error: 'aadhaar_last4 is required' })
  .trim()
  .superRefine((v, ctx) => {
    const digits = v.replace(/[\s-]/g, '');
    if (/^\d{12}$/.test(digits)) {
      ctx.addIssue({ code: 'custom', message: 'Full Aadhaar numbers are not accepted. Enter only the last 4 digits of your Aadhaar.' });
    } else if (!/^[0-9]{4}$/.test(v)) {
      ctx.addIssue({ code: 'custom', message: 'aadhaar_last4 must be exactly 4 digits' });
    }
  });

const registerSchema = z.object({
  username: z.string().trim().toLowerCase().min(3, 'username must be at least 3 characters').max(50).regex(/^[a-z0-9._@-]+$/, 'username may contain letters, digits, . _ @ -'),
  password: z.string().min(8, 'password must be at least 8 characters').max(100),
  full_name: trimmed('full_name', 120),
});

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'username is required'),
  password: z.string().min(1, 'password is required'),
});

const applicationSchema = z.object({
  // As in the applications file. If not sent, today's date in IST is used.
  application_date: isoDate('application_date').optional(),
  full_name: trimmed('full_name', 120),
  dob: isoDate('dob').refine((d) => d <= todayIST(), { message: 'dob cannot be in the future' }),
  gender: z.enum(['M', 'F', 'O'], { error: 'gender must be M, F or O' }),
  pan_number: z.string({ error: 'pan_number is required' }).trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'pan_number must look like AAAAA9999A'),
  aadhaar_last4: aadhaarLast4,
  mobile: z.string({ error: 'mobile is required' }).trim().regex(/^[6-9][0-9]{9}$/, 'mobile must be 10 digits starting with 6-9'),
  email: z.email('email is not valid'),
  address: trimmed('address', 300),
  city: trimmed('city', 80),
  state: trimmed('state', 80),
  pincode: z.string({ error: 'pincode is required' }).trim().regex(/^[1-9][0-9]{5}$/, 'pincode must be 6 digits and not start with 0'),
  occupation_code: trimmed('occupation_code', 60),
  annual_income: z.coerce.number({ error: 'annual_income must be a number' }).int('annual_income must be a whole number').min(0, 'annual_income cannot be negative'),
  consent: z.literal(true, { error: 'consent to KYC checks is mandatory (send consent: true)' }),
});

const versionField = z.coerce.number().int().min(0).optional();

const correctionSchema = z.object({
  document_id: trimmed('document_id', 100), // the document's id (public_id) from the case view
  field: trimmed('field', 40),
  new_value: z.union([z.string(), z.number()]).transform(String),
  reason: z.string({ error: 'reason is required' }).trim().min(5, 'reason must be at least 5 characters').max(500),
  version: versionField,
});

const recommendationSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'REQUEST_RESUBMISSION'], { error: 'action must be APPROVE, REJECT or REQUEST_RESUBMISSION' }),
  comment: z.string({ error: 'comment is required' }).trim().min(10, 'comment must be at least 10 characters').max(1000),
  version: versionField,
});

const checkerSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'SEND_BACK'], { error: 'action must be APPROVE, REJECT or SEND_BACK' }),
  comment: z.string({ error: 'comment is required' }).trim().min(1, 'comment is required').max(1000),
  version: versionField,
});

const sanctionSchema = z.object({
  list_id: trimmed('list_id', 20),
  name: trimmed('name', 120),
  alias: z.string().trim().max(120).optional().default(''),
  dob: z.union([isoDate('dob'), z.literal('')]).optional().default(''),
  nationality: z.string().trim().max(10).optional().default(''),
  program: z.string().trim().max(100).optional().default(''),
});

const pepSchema = z.object({
  pep_id: trimmed('pep_id', 20),
  name: trimmed('name', 120),
  dob: z.union([isoDate('dob'), z.literal('')]).optional().default(''),
  position: z.string().trim().max(200).optional().default(''),
  category: z.enum(['DOMESTIC', 'RCA'], { error: 'category must be DOMESTIC or RCA' }),
});

const dashboardQuery = z.object({
  from: isoDate('from').optional(),
  to: isoDate('to').optional(),
});

module.exports = {
  registerSchema,
  loginSchema,
  applicationSchema,
  correctionSchema,
  recommendationSchema,
  checkerSchema,
  sanctionSchema,
  pepSchema,
  dashboardQuery,
};
