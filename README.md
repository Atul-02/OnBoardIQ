# OnboardIQ

OnboardIQ is a **KYC (Know Your Customer) onboarding system** for opening bank accounts. It shows how a bank can take a customer's application and identity documents, check them automatically, send unclear cases to human reviewers, and open the account. Every step is recorded in an audit trail.

The project has two parts:

| Part | Tech | Folder |
|---|---|---|
| Backend API | Node.js, Express 5, MongoDB (Mongoose), JWT, Zod, Multer, node-cron, Swagger | [Backend/server](Backend/server) |
| Frontend web app | React 19, React Router, Vite, plain CSS | [Frontend/client](Frontend/client) |

---

## What the project does

1. **An applicant** signs up, fills in an application (name, date of birth, PAN, last 4 digits of Aadhaar, address pincode, occupation, income, consent) and uploads at least 3 documents: a **PAN card**, an **Aadhaar card** and an **address proof** (electricity bill, bank statement or driving licence).
2. **Extraction**: each document is read and classified, and fields such as name, DOB, PAN, Aadhaar last 4, pincode and dates are pulled out, each with a confidence score. This uses either a **mock provider** (pre-computed results from the data pack) or an **AI provider** (Google Gemini).
3. **Rules engine (R1–R17)** compares what the applicant typed with what was found on the documents, and screens the applicant against **sanctions** and **PEP** (politically exposed person) lists and existing customers.
4. **Decision and routing**: the result is `APPROVE`, `REVIEW` or `REJECT`, plus a **risk category** (LOW / MEDIUM / HIGH) and a **re-KYC due date**.
5. **Human review (maker-checker)**: a KYC officer (maker) reviews flagged cases, can correct extracted fields, and recommends an outcome. A compliance officer (checker) makes the final decision. The same person can never be both maker and checker on one case.
6. **Account opening**: approved cases call a **mock core banking** service, which opens the account.
7. **Audit trail**: every action is written to an insert-only log, which can be exported to CSV.

---

## Application lifecycle

```
DRAFT ──submit──▶ SUBMITTED ──▶ EXTRACTING ──▶ rules engine
                                                 │
     ┌───────────────────────────┬───────────────┼──────────────────────┐
     ▼                           ▼               ▼                      ▼
 APPROVE + LOW/MEDIUM       APPROVE + HIGH     REVIEW                 REJECT
 AUTO_APPROVED              PENDING_CHECKER    IN_REVIEW              AUTO_REJECTED
 (account opened)                ▲               │ KYC officer
                                 │               ├─ recommend APPROVE ─▶ PENDING_CHECKER
                                 │               ├─ recommend REJECT ──▶ PENDING_CHECKER
                                 │               └─ request resubmission ─▶ RESUBMISSION_REQUESTED
                                 │                                           │ applicant re-uploads (7 days)
                                 │                                           │ or CLOSED_EXPIRED
                       Compliance officer:
                       APPROVE (account opened) / REJECT / SEND_BACK
```

- A resubmission must happen within **7 days**. An hourly background job closes expired cases (`CLOSED_EXPIRED`).
- The checker queue has a **24-hour SLA**.
- Every officer/checker action checks the case's status and `version`, so two people acting on the same case at once get a `409 Conflict`.

---

## The rules (R1–R17)

Any `REJECT` rule triggered → **REJECT**. Otherwise any `REVIEW` rule triggered → **REVIEW**. Nothing triggered → **APPROVE**.

| Rule | Reason code | Outcome | What it checks |
|---|---|---|---|
| R1 | DOCUMENT_MISSING | REVIEW | PAN card, Aadhaar card and an address proof are all present |
| R2 | DOCUMENT_TYPE_MISMATCH | REVIEW | Declared document type matches the classified type |
| R3 | LOW_EXTRACTION_CONFIDENCE | REVIEW | Document type and field confidence ≥ 0.80 |
| R4 | AGE_BELOW_18 | REJECT | Applicant is at least 18 on the application date |
| R5 | PAN_INVALID | REJECT | PAN format `AAAAA9999A` and 4th letter `P` (individual) |
| R6 | PAN_MISMATCH | REJECT | Entered PAN = PAN on the PAN card |
| R7 | DOB_MISMATCH | REJECT | Entered DOB = DOB on PAN / Aadhaar |
| R8 | AADHAAR_MISMATCH | REJECT | Entered Aadhaar last 4 = Aadhaar card |
| R9 | NAME_MISMATCH | REJECT | Name similarity below 0.75 |
| R10 | SANCTIONS_MATCH | REJECT | Strong match on the sanctions list |
| R11 | NAME_MISMATCH_MINOR | REVIEW | Name similarity between 0.75 and 0.90 |
| R12 | DOCUMENT_EXPIRED | REVIEW | Driving licence (address proof) expired |
| R13 | ADDRESS_PROOF_STALE | REVIEW | Address proof older than 90 days or dated in the future |
| R14 | ADDRESS_MISMATCH | REVIEW | Entered pincode = pincode on address proof |
| R15 | SANCTIONS_POSSIBLE_MATCH | REVIEW | Possible sanctions match (similarity 0.80–0.90) |
| R16 | PEP_MATCH | REVIEW | Applicant is on the PEP list |
| R17 | DUPLICATE_CUSTOMER | REVIEW | PAN already belongs to an existing customer |

Name matching ignores titles (MR, MRS, DR, SHRI, SMT …) and uses Levenshtein similarity.

**Risk category** (only when not rejected):
- **HIGH**: PEP match, possible sanctions match, or a high-risk occupation. Re-KYC in 2 years.
- **MEDIUM**: medium-risk occupation or annual income ≥ ₹25,00,000. Re-KYC in 8 years.
- **LOW**: everything else. Re-KYC in 10 years.

All thresholds live in [case_02_rules_config_V1.0.json](Backend/data/case_02_rules_config_V1.0.json) and can be changed at runtime by a compliance officer (`PUT /api/v1/config`).

Applicants only see **plain-language reasons** (for example "The PAN you entered does not match the PAN on your PAN card"). Watchlist names and confidence scores are never shown to them.

---

## AI features (Google Gemini)

Optional. Set `GEMINI_API_KEY` in `Backend/server/.env`.

- **AI extraction**: with `EXTRACTION_PROVIDER=ai`, uploaded documents are classified and their fields extracted by Gemini. These values show an **AI** badge in the case view.
- **Reviewer summary**: on a REVIEW case, staff can click **Generate AI summary** to get a short (≤ 80 words) summary of the case.

Guardrails:
- The AI never makes the decision. It only supplies document type, fields and confidence; the rules engine decides.
- Text that tries to instruct the AI (prompt injection) is classified as `OTHER` without calling the model. Output must match a JSON schema.
- All AI values are validated and normalised by code (dates, PAN, pincode, Aadhaar last 4). Confidence is set by the code, not the model.
- On error or timeout (10 s) the document becomes `OTHER` / 0.00 and the case goes to REVIEW.
- Summaries are labelled AI-generated and rejected if they mention a decision. Prompts are not logged.

---

## User roles

| Role | Can do |
|---|---|
| APPLICANT | Create applications, upload/remove documents, submit/resubmit, see status and reasons |
| KYC_OFFICER (maker) | Work the REVIEW queue, correct extracted fields, recommend an outcome |
| COMPLIANCE_OFFICER (checker) | Final approve/reject/send back, dashboard, rules config, sanctions/PEP lists, re-screening |

**Demo users** (password `Password@123`):

| Username | Role |
|---|---|
| applicant1, applicant2 | APPLICANT (applicant1 owns the 60 seeded sample applications) |
| officer1, officer2 | KYC_OFFICER |
| checker1, checker2 | COMPLIANCE_OFFICER |
| supervisor1 | Both staff roles (to show the maker ≠ checker rule) |

---

## Frontend pages

| Role | Route | Page |
|---|---|---|
| All | `/login`, `/register` | Sign in / create applicant account |
| Applicant | `/my`, `/my/new`, `/my/:id` | My applications, new application form, status + upload + submit |
| KYC Officer | `/officer/queue` | REVIEW queue (HIGH risk first) |
| Staff | `/applications` | Search all applications |
| Staff | `/applications/:id` | Case workbench: document text vs extracted fields, rule results, screening, corrections, decisions |
| Staff | `/applications/:id/audit` | Audit trail + CSV export |
| Compliance | `/checker/queue` | Pending checker queue with SLA |
| Compliance | `/dashboard` | Straight-through, review and reject rates with date filter |
| Compliance | `/admin` | Rules config, sanctions/PEP lists, re-screen, expiry job |

---

## API overview

Base URL `http://localhost:4000/api/v1`. Full docs (Swagger) at `http://localhost:4000/api-docs`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Applications | `POST /applications`, `GET /applications`, `GET /applications/:id`, `GET /:id/decision`, `GET /:id/evaluations`, `POST /:id/documents`, `DELETE /:id/documents/:documentId`, `POST /:id/submit`, `POST /:id/ai-summary`, `GET /:id/audit`, `GET /:id/audit/export` |
| Documents | `GET /documents/:id/content`, `POST /documents/:id/extract` |
| KYC officer | `GET /officer/queue`, `POST /officer/applications/:id/corrections`, `POST /officer/applications/:id/recommendation` |
| Checker | `GET /checker/queue`, `POST /checker/applications/:id/decision` |
| Dashboard | `GET /dashboard` |
| Admin | `GET/PUT /config`, `GET /occupations`, `GET /ai/status`, sanctions & PEP list CRUD under `/watchlists/...`, `POST /watchlists/rescreen` |
| Mock core banking | `POST /mock/core-banking/accounts` |

Errors: `401` not logged in, `403` wrong role or maker = checker, `404` not found, `409` stale or conflicting action, `422` validation failed.

---

## Security and privacy

- JWT login with role-based access on every route; passwords hashed with bcrypt.
- Only the **last 4 digits of Aadhaar** are accepted (sending 12 digits returns `422`).
- PAN is masked (e.g. `ZZKXXXXX4Q`) in lists, queues and the audit export.
- Uploaded files are stored on disk outside the database with random names; URLs use random UUIDs, not document IDs.
- The audit log is insert-only: the model throws on any update or delete.
- Secrets (JWT secret, service key, Gemini key) come only from `.env`.

---

## Data pack

[Backend/data](Backend/data) holds the case data used for seeding and testing:

| File | Contents |
|---|---|
| `case_02_applications_sample/eval_V1.0.csv` | Applications (60 sample, plus an eval set) |
| `case_02_documents_*.csv`, `case_02_document_text_*.jsonl` | Document metadata and raw text |
| `case_02_extraction_mock_*.csv` | Pre-computed extraction results for the mock provider |
| `case_02_document_truth_sample_V1.0.csv` | Ground truth for checking extraction |
| `case_02_sanctions_list_V1.0.csv`, `case_02_pep_list_V1.0.csv` | Watchlists |
| `case_02_existing_customers_V1.0.csv` | Existing customers (for duplicate check) |
| `case_02_occupations_V1.0.csv` | Occupation codes and risk levels |
| `case_02_rules_config_V1.0.json` | Rule thresholds and settings |
| `documents/<set>/Dxxxxxxx.txt` | One text file per document, ready to upload |

[Backend/output](Backend/output) holds the batch results: `decisions_output_sample.csv` and `decisions_output.csv` (the eval deliverable).

---

## How to run

**Needs:** Node.js 18+ and MongoDB running at `mongodb://127.0.0.1:27017`.

### 1. Backend

```bash
cd Backend/server
npm install
copy .env.example .env      # then set JWT_SECRET and SERVICE_KEY (and GEMINI_API_KEY if using AI)
npm run seed                # resets the "onboardiq" DB, loads data, runs the 60 sample applications
npm run dev                 # API on http://localhost:4000
```

### 2. Frontend

```bash
cd Frontend/client
npm install
npm run dev                 # http://localhost:5173 (/api is proxied to :4000)
```

### Backend scripts

| Script | What it does |
|---|---|
| `npm run dev` / `npm start` | Start the API (nodemon / node) |
| `npm run seed` | Reset DB and load config, watchlists, customers, occupations, demo users, 60 sample applications |
| `npm run batch` | Run the rules on the sample files → `output/decisions_output_sample.csv` |
| `npm run compare` | Compare that output with the expected results (should print 60/60) |
| `npm run batch:eval` | Run the rules on the eval files → `output/decisions_output.csv` |
| `npm run docs:files` | Write each document's text to its own `.txt` file |

The batch scripts read straight from `data/` and do not need MongoDB.

### Main environment variables (`Backend/server/.env`)

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 4000) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Login token settings |
| `EXTRACTION_PROVIDER` | `mock` or `ai` |
| `EXTRACTION_TIMEOUT_MS` | Per-document extraction timeout (default 10000) |
| `SERVICE_KEY`, `CORE_BANKING_URL` | Calls to the simulated services |
| `STORAGE_DIR` | Where uploaded files are stored |
| `SEED_PASSWORD` | Password for demo users |
| `EXPIRY_CRON` | Schedule for the resubmission expiry job |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini AI settings |

Gemini free-tier keys allow about 5 requests per minute, and each application uses 3 extraction calls, so keep seeding and batch runs on the mock provider.

### Testing with Postman

Import [OnboardIQ.postman_collection.json](Backend/postman/OnboardIQ.postman_collection.json), run `npm run seed`, then run the whole collection in order. It covers the worked examples, error cases (403/404/409/422), uploads, resubmission, dashboard and config. From the terminal:

```bash
npx newman run Backend/postman/OnboardIQ.postman_collection.json
```

---

## Project structure

```
onboardIq/
├── Backend/
│   ├── data/                 data pack (CSV, JSONL, rules config, document .txt files)
│   ├── output/               batch decision outputs
│   ├── postman/              Postman collection
│   └── server/
│       ├── openapi.json      Swagger docs
│       ├── scripts/          seed.js, batch.js, compare.js, writeDocFiles.js
│       └── src/
│           ├── ai/           gemini.js, reviewSummary.js
│           ├── engine/       rules.js (R1–R17), normalize.js, screening.js, risk.js
│           ├── extraction/   provider picker, mockProvider.js, aiProvider.js
│           ├── jobs/         expireResubmissions.js (hourly cron)
│           ├── middleware/   auth (JWT + roles), validate (Zod → 422), errorHandler
│           ├── models/       Application, Document, Evaluation, AuditLog, FieldCorrection, Reference, User
│           ├── routes/       auth, applications, documents, officer, checker, dashboard, admin, mockCoreBanking
│           ├── services/     workflow, audit, coreBanking, ruleContext, storage, views
│           └── utils/        dates, masking, reason messages, data file loading
└── Frontend/
    └── client/
        └── src/
            ├── pages/        Login, Register, applicant/*, staff/*, compliance/*
            ├── components/   CaseTable, DocumentText, DocumentUploader, Layout, ui
            ├── api.js        API client
            └── auth.jsx      login state and role guard
```

More detail: [Backend/server/README.md](Backend/server/README.md) and [Frontend/client/README.md](Frontend/client/README.md).
