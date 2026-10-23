# OnboardIQ – Backend (Node.js + Express + MongoDB)

KYC onboarding API: upload documents → extraction (mock provider) → rules R1–R17 → routing → maker-checker → mock core banking, with a complete audit trail.

## Run it

Needs Node 18+ and MongoDB running locally (`mongodb://127.0.0.1:27017`).

```bash
cd server
npm install
copy .env.example .env      # then change JWT_SECRET and SERVICE_KEY
npm run seed                # resets the "onboardiq" DB, loads data pack, runs the 60 sample applications
npm run docs:files          # writes data/documents/<set>/Dxxxxxxx.txt (files to upload in Postman/UI)
npm run dev                 # API on http://localhost:4000, Swagger at http://localhost:4000/api-docs
```

| Script | What it does |
|---|---|
| `npm run dev` / `npm start` | Start the API (nodemon / node) |
| `npm run seed` | Reset DB + load config, watchlists, customers, occupations, demo users, 60 sample applications |
| `npm run batch` | FR-11 on the **sample** files → `output/decisions_output_sample.csv` |
| `npm run compare` | Compare that file with the expected columns (should print 60/60) |
| `npm run batch:eval` | FR-11 on the **eval** files → `output/decisions_output.csv` (the deliverable) |
| `npm run docs:files` | Write each document text from the .jsonl files to its own .txt file |

The batch script works straight from the files in `data/` and does not need MongoDB.
It reads the rules config from `data/case_02_rules_config_V1.0.json`; the running API reads it from MongoDB (`PUT /api/v1/config`).

## Demo users (password: `SEED_PASSWORD`, default `Password@123`)

| Username | Code | Role |
|---|---|---|
| officer1 | U1 | KYC_OFFICER (maker) |
| officer2 | U3 | KYC_OFFICER |
| checker1 | U2 | COMPLIANCE_OFFICER (checker) |
| checker2 | U4 | COMPLIANCE_OFFICER |
| supervisor1 | U5 | both roles – shows the "maker ≠ checker" rule on one person |
| applicant1 | A1 | APPLICANT – owns the 60 seeded sample applications |
| applicant2 | A2 | APPLICANT |

## Testing with Postman

Import `postman/OnboardIQ.postman_collection.json`. Run `npm run seed` first, then run the whole collection in order
(Collection Runner). It covers worked examples 1–12, the 403/404/409/422 cases, uploads, resubmission, dashboard and config.
From the terminal: `npx newman run ../postman/OnboardIQ.postman_collection.json`.

## Folder structure

```
server/
  src/
    engine/        rules.js (R1–R17, pure function), normalize.js, screening.js, risk.js
    extraction/    index.js (picks provider from EXTRACTION_PROVIDER), mockProvider.js, aiProvider.js (stub)
    services/      workflow.js (status lifecycle, routing, maker-checker), audit.js, coreBanking.js, views.js ...
    routes/        auth, applications, documents, officer, checker, dashboard, admin, mockCoreBanking
    models/        Mongoose schemas (Application, Document, Evaluation, AuditLog, User, reference data)
    middleware/    auth (JWT + roles), validate (zod -> 422), errorHandler
    jobs/          expireResubmissions.js (node-cron, hourly)
  scripts/         seed.js, batch.js, compare.js, writeDocFiles.js
  openapi.json     API documentation served at /api-docs
  storage/         uploaded document files (outside the DB, random names)
```

## How a submission flows

1. Applicant: `POST /applications` (DRAFT) → `POST /applications/:id/documents` ×3+ → `POST /applications/:id/submit`.
2. SUBMITTED → EXTRACTING: each document goes through the extraction provider (10 s timeout; failure = OTHER / 0.00).
3. Rules engine runs; result stored in `evaluations` with every rule's values compared.
4. Routing: APPROVE + LOW/MEDIUM → AUTO_APPROVED (account opened via mock core banking) · APPROVE + HIGH → PENDING_CHECKER · REVIEW → IN_REVIEW · REJECT → AUTO_REJECTED.
5. KYC officer: correct fields (re-runs rules; if the result is APPROVE the case moves to PENDING_CHECKER with that officer as maker) or recommend APPROVE / REJECT / REQUEST_RESUBMISSION.
6. Compliance officer: APPROVE (account opened) / REJECT / SEND_BACK. Same user as maker → 403.
7. RESUBMISSION_REQUESTED: applicant uploads a new set (old documents are kept but superseded) and resubmits within 7 days, otherwise the hourly job closes the case (CLOSED_EXPIRED).

## Design choices worth knowing

- **DRAFT status**: API-created applications start as DRAFT so documents can be uploaded one by one before `submit`. Seeded ones start at SUBMITTED.
- **Document ids**: `doc_id` comes from the file name (D3000023.txt → D3000023) so the mock lookup works; other names get `D9xxxxxx` and the mock returns OTHER/0.00. URLs use a random `id` (UUID), never the doc_id.
- **409 handling**: every officer/checker action atomically checks status + `version`. Send the `version` you were looking at (from the case view) to also catch stale screens.
- **Audit trail**: insert-only; the Mongoose model throws on any update or delete, and no route exposes them.
- **Masking**: PAN masked (ZZKXXXXX4Q) in lists, queues and the audit CSV export; only the last 4 Aadhaar digits are accepted (12 digits → 422).
- **Dashboard rates** use the first rules decision: straight-through = AUTO_APPROVED ÷ decided, review/reject = first decision REVIEW/REJECT ÷ decided.
- **AI provider**: see "AI (Gemini)" below.

## AI (Gemini)

Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`) in `.env`. The key is read only from `.env`, never from code.

| Feature | How to use | Code |
|---|---|---|
| AI extraction (AI-1/2/3) | `EXTRACTION_PROVIDER=ai`, restart the API. New uploads are classified and extracted by Gemini; values show with an **AI** badge on the case page. | `src/extraction/aiProvider.js`, `src/ai/gemini.js` |
| Reviewer summary (AI-5) | Case page of a REVIEW case → **Generate AI summary** (`POST /api/v1/applications/:id/ai-summary`). Works with either provider. | `src/ai/reviewSummary.js` |

Guardrails
- The AI never decides: it only supplies doc_type and fields with confidence; the rules engine decides.
- Prompt injection: text that tries to instruct an AI is classified OTHER without calling the LLM; document text is passed inside `<document>` delimiters and the output must match a JSON schema.
- Our code validates and normalises every value (dates, PAN, pincode, Aadhaar last 4 only), fixes OCR confusions, and sets the confidence itself (lower when a correction was needed or the value is not in the text).
- On failure or timeout (10 s per document) the document gets OTHER / 0.00 → REVIEW (`LOW_EXTRACTION_CONFIDENCE`).
- The summary is ≤ 80 words, labelled AI-generated, and rejected if it mentions a decision. Prompts are never logged; the model and prompt version are stored with every extraction and summary.

Free-tier keys allow about 5 requests per minute. One application = 3 extraction calls, so keep `npm run seed` and the batch on the mock provider.
