# OnboardIQ – Frontend (React + Vite)

Plain React (JavaScript), React Router and one CSS file. No UI library.

## Run

```bash
# 1. backend first (see Backend/server/README.md): MongoDB running, npm run seed, npm run dev  -> :4000
# 2. frontend
cd Frontend/client
npm install
npm run dev        # http://localhost:5173  (/api is proxied to http://localhost:4000)
```

To point at another API, set `VITE_API_BASE` (default `/api/v1`).

Demo users (password `Password@123`): `applicant1`, `officer1` (U1), `officer2`, `checker1` (U2), `checker2`, `supervisor1` (both staff roles).

## Pages

| Role | Route | Page |
|---|---|---|
| All | `/login`, `/register` | Sign in / create applicant account |
| Applicant | `/my` | My applications |
| Applicant | `/my/new` | Application form (Aadhaar last 4 only, consent required) |
| Applicant | `/my/:id` | Status, plain-language reasons, upload/remove documents, submit/resubmit |
| KYC Officer | `/officer/queue` | REVIEW queue (HIGH risk first) |
| Staff | `/applications` | Search all applications |
| Staff | `/applications/:id` | Case workbench: document text vs extracted fields, rule results, screening, corrections, recommendation / checker decision |
| Staff | `/applications/:id/audit` | Audit trail + CSV export |
| Compliance | `/checker/queue` | PENDING_CHECKER queue with SLA |
| Compliance | `/dashboard` | FR-10 dashboard with date filter |
| Compliance | `/admin` | Rules config, sanctions/PEP lists, re-screen, expiry job |

## Structure

```
src/
  api.js           fetch wrapper (token, ApiError with status + field errors)
  auth.jsx         login state, role helpers
  labels.js        display labels for statuses, document types, fields
  styles.css       all styling
  components/      Layout, CaseTable, DocumentUploader, DocumentText, ui (badges, Field, Modal), ruleDetail
  pages/           applicant/, staff/, compliance/, Login, Register
```

Notes
- Access rules are enforced by the server; the frontend only hides pages a role cannot use.
- Officer and checker actions send the case `version`; a 409 shows a "Reload case" button.
- React StrictMode is off so document views are not logged twice in the audit trail during development.
