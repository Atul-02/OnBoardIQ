import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, errorText } from '../../api';
import { useAuth } from '../../auth';
import { CORRECTABLE_FIELDS, DOC_TYPE_LABELS, FIELD_LABELS, fmtDateTime, fmtMoney, label } from '../../labels';
import { Alert, Codes, DecisionBadge, Field, Loading, Modal, RiskBadge, StatusBadge } from '../../components/ui';
import DocumentText from '../../components/DocumentText';
import { describeRule } from '../../components/ruleDetail';

// Declared value that an extracted field is compared with.
const DECLARED_KEY = { name: 'full_name', dob: 'dob', gender: 'gender', pan_number: 'pan_number', aadhaar_last4: 'aadhaar_last4', pincode: 'pincode', address: 'address' };

// Review workbench (KYC Officer) and case view (Compliance Officer).
export default function CaseView() {
  const { id } = useParams();
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const [c, setC] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState('');
  const [docId, setDocId] = useState(null);
  const [correcting, setCorrecting] = useState(null); // { field, value }

  const load = useCallback(() => {
    setStale(false);
    return api
      .get(`/applications/${id}`)
      .then((data) => {
        setC(data);
        setDocId((cur) => cur || data.documents.find((d) => !d.superseded)?.id || data.documents[0]?.id || null);
      })
      .catch((e) => setError(errorText(e)));
  }, [id]);

  useEffect(() => {
    load();
    api.get('/config').then(setCfg).catch(() => setCfg(null));
  }, [load]);

  // Shows an action error; a 409 means someone else changed the case, so offer a reload.
  const fail = (e) => {
    setError(errorText(e));
    if (e instanceof ApiError && e.status === 409) setStale(true);
  };

  if (!c) return error ? <Alert>{error}</Alert> : <Loading />;

  const d = c.declared;
  const doc = c.documents.find((x) => x.id === docId);
  const selected = c.evaluation?.selected_documents || {};
  const usedAs = (docIdBiz) => Object.entries(selected).filter(([, v]) => v === docIdBiz).map(([k]) => k);

  const canCorrect = hasRole('KYC_OFFICER') && c.status === 'IN_REVIEW';
  const canRecommend = hasRole('KYC_OFFICER') && c.status === 'IN_REVIEW';
  const canCheck = hasRole('COMPLIANCE_OFFICER') && c.status === 'PENDING_CHECKER';

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">
            <button className="link" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </p>
          <h1>
            {d.full_name} <span className="mono muted">· {c.application_id}</span>
          </h1>
          <p>
            Applied {d.application_date} · Round {c.round}
            {c.submitted_at && ` · Submitted ${fmtDateTime(c.submitted_at)}`}
          </p>
        </div>
        <div className="row">
          <StatusBadge status={c.status} />
          <Link className="btn secondary small" to={`/applications/${c.application_id}/audit`}>
            Audit trail
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert error row">
          <span>{error}</span>
          <span className="spacer" />
          {stale && (
            <button className="small" onClick={() => { setError(''); load(); }}>
              Reload case
            </button>
          )}
        </div>
      )}
      <Alert type="success">{notice}</Alert>

      {c.account?.account_number && (
        <div className="alert success">
          Account opened. Customer ID <b className="mono">{c.account.customer_id}</b>, account number <b className="mono">{c.account.account_number}</b>.
        </div>
      )}
      {c.account?.error && <Alert>Core banking error: {c.account.error}</Alert>}
      {c.status === 'RESUBMISSION_REQUESTED' && c.resubmission_deadline && (
        <Alert type="warn">Waiting for the applicant to resubmit by {fmtDateTime(c.resubmission_deadline)}.</Alert>
      )}

      {/* ---- Decision summary ---- */}
      <div className="grid-3">
        <div className="stat">
          <div className="lbl">Rules decision</div>
          <div className="num">
            <DecisionBadge decision={c.decision} />
          </div>
          <div className="small mt">
            <Codes codes={c.reason_codes} />
          </div>
        </div>
        <div className="stat">
          <div className="lbl">Name match score</div>
          <div className="num mono">{c.name_match_score_display || '—'}</div>
          {cfg && (
            <div className="small muted">
              pass ≥ {cfg.name_match_threshold} · reject below {cfg.name_reject_below}
            </div>
          )}
        </div>
        <div className="stat">
          <div className="lbl">Risk / re-KYC due</div>
          <div className="num">
            <RiskBadge risk={c.risk_category} />
          </div>
          <div className="small muted">{c.rekyc_due_date || '—'}</div>
        </div>
      </div>

      {/* ---- AI-5 reviewer summary (REVIEW cases only) ---- */}
      {c.decision === 'REVIEW' && <AiSummary c={c} />}

      {/* ---- Declared details + screening ---- */}
      <div className="grid-2 mt">
        <div className="card">
          <h2>Declared details</h2>
          <dl className="kv">
            <dt>Name</dt>
            <dd>{d.full_name}</dd>
            <dt>Date of birth</dt>
            <dd>{d.dob}</dd>
            <dt>Gender</dt>
            <dd>{d.gender}</dd>
            <dt>PAN</dt>
            <dd className="mono">{d.pan_number}</dd>
            <dt>Aadhaar last 4</dt>
            <dd className="mono">{d.aadhaar_last4}</dd>
            <dt>Address</dt>
            <dd>
              {d.address}, {d.city}, {d.state} <b>{d.pincode}</b>
            </dd>
            <dt>Mobile / email</dt>
            <dd>
              {d.mobile} · {d.email}
            </dd>
            <dt>Occupation</dt>
            <dd>{d.occupation_code}</dd>
            <dt>Annual income</dt>
            <dd>{fmtMoney(d.annual_income)}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>Watchlist screening</h2>
          <Screening title="Sanctions" hit={c.evaluation?.screening?.sanctions} declaredDob={d.dob} />
          <Screening title="PEP" hit={c.evaluation?.screening?.pep} declaredDob={d.dob} />
        </div>
      </div>

      {/* ---- Workbench: document text next to extracted fields ---- */}
      <div className="card">
        <div className="card-head">
          <h2>Documents</h2>
          {canCorrect && (
            <button className="secondary small" onClick={() => setCorrecting({ field: '', value: '' })} disabled={!doc || doc.superseded}>
              Correct a field
            </button>
          )}
        </div>
        <div className="doc-tabs">
          {c.documents.map((x) => (
            <button key={x.id} className={x.id === docId ? 'active' : ''} onClick={() => setDocId(x.id)}>
              {x.doc_id} · {label(DOC_TYPE_LABELS, x.declared_doc_type)}
              {x.superseded ? ' (replaced)' : ''}
            </button>
          ))}
        </div>
        {doc ? (
          <div className="workbench">
            <div>
              <h3>Document text</h3>
              <DocumentText documentId={doc.id} />
            </div>
            <div>
              <h3>Extracted fields</h3>
              <ExtractedFields
                doc={doc}
                declared={d}
                usedAs={usedAs(doc.doc_id)}
                onCorrect={canCorrect && !doc.superseded ? (field, value) => setCorrecting({ field, value }) : null}
              />
            </div>
          </div>
        ) : (
          <div className="empty">No documents.</div>
        )}
      </div>

      {/* ---- Rules ---- */}
      <div className="card">
        <div className="card-head">
          <h2>Rule results</h2>
          {c.evaluation && (
            <span className="muted small">
              Run #{c.evaluation.run_no} ({c.evaluation.trigger}) · {fmtDateTime(c.evaluation.at)} · config v{c.evaluation.config_version}
            </span>
          )}
        </div>
        {c.evaluation ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Code</th>
                  <th>Outcome</th>
                  <th>Result</th>
                  <th>Values compared</th>
                </tr>
              </thead>
              <tbody>
                {c.evaluation.rules.map((r) => (
                  <tr key={r.rule} className={r.status === 'TRIGGERED' ? 'triggered' : ''}>
                    <td className="mono">{r.rule}</td>
                    <td className="mono small">{r.code}</td>
                    <td className="small">{r.outcome}</td>
                    <td>
                      <span className={`rule-status ${r.status}`}>{r.status}</span>
                    </td>
                    <td className="small">{describeRule(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">The rules have not run yet.</div>
        )}
      </div>

      {/* ---- Corrections ---- */}
      {c.corrections.length > 0 && (
        <div className="card">
          <h2>Field corrections</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Officer</th>
                  <th>Document</th>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {c.corrections.map((x, i) => (
                  <tr key={i}>
                    <td className="small">{fmtDateTime(x.at)}</td>
                    <td>{x.officer}</td>
                    <td className="mono">{x.doc_id}</td>
                    <td>{label(FIELD_LABELS, x.field)}</td>
                    <td className="mono">
                      {x.old_value ?? '—'} {x.old_confidence !== null && x.old_confidence !== undefined && <span className="muted">({Number(x.old_confidence).toFixed(2)})</span>}
                    </td>
                    <td className="mono">{x.new_value}</td>
                    <td>{x.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- Maker-checker ---- */}
      <div className="grid-2">
        <div className="card">
          <h2>Maker recommendation</h2>
          {c.recommendation ? (
            <ActionBox a={c.recommendation} />
          ) : (
            <p className="muted">{c.status === 'PENDING_CHECKER' ? 'None – HIGH-risk approval from the rules.' : 'No recommendation yet.'}</p>
          )}
          {canRecommend && (
            <RecommendForm
              c={c}
              onDone={(msg) => {
                setNotice(msg);
                setError('');
                load();
              }}
              onError={fail}
            />
          )}
        </div>
        <div className="card">
          <h2>Checker decision</h2>
          {c.checker_decision ? <ActionBox a={c.checker_decision} /> : <p className="muted">No checker decision yet.</p>}
          {canCheck && (
            <CheckerForm
              c={c}
              isMaker={c.maker && c.maker === user.username}
              onDone={(msg) => {
                setNotice(msg);
                setError('');
                load();
              }}
              onError={fail}
            />
          )}
        </div>
      </div>

      {correcting && doc && (
        <CorrectionModal
          c={c}
          doc={doc}
          initial={correcting}
          onClose={() => setCorrecting(null)}
          onDone={(res) => {
            setCorrecting(null);
            setError('');
            setNotice(`Field corrected. Rules re-run: ${res.decision}${res.reason_codes.length ? ` (${res.reason_codes.join(', ')})` : ''}. Status: ${res.status}.`);
            load();
          }}
          onError={fail}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function Screening({ title, hit, declaredDob }) {
  if (!hit) return <p className="muted">{title}: not screened yet.</p>;
  const tone = hit.result === 'MATCH' ? 'red' : hit.result === 'POSSIBLE' ? 'amber' : 'green';
  return (
    <div style={{ marginBottom: 14 }}>
      <h3>
        {title} <span className={`badge ${tone}`}>{hit.result}</span>
      </h3>
      {hit.result !== 'NONE' && (
        <dl className="kv">
          <dt>List entry</dt>
          <dd>
            <b className="mono">{hit.entry_id}</b> {hit.entry_name}
          </dd>
          <dt>Matched on</dt>
          <dd>{hit.matched_on}</dd>
          <dt>Similarity</dt>
          <dd className="mono">{Number(hit.similarity).toFixed(4)}</dd>
          <dt>Date of birth</dt>
          <dd>
            declared {declaredDob} · list {hit.list_dob || 'empty'} <span className="muted">({hit.dob_comparison})</span>
          </dd>
        </dl>
      )}
    </div>
  );
}

// Who produced a value: the officer (corrected) or the AI extractor. Mock values get no badge.
function SourceBadge({ source }) {
  if (source === 'OFFICER') return <span className="badge purple">OFFICER</span>;
  if (source === 'AI') return <span className="badge blue">AI</span>;
  return null;
}

// AI-5: short AI-generated list of the case's discrepancies. Generated on request, once per rules run.
function AiSummary({ c }) {
  const [summary, setSummary] = useState(c.ai_summary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setSummary(c.ai_summary), [c.ai_summary]);

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post(`/applications/${c.application_id}/ai-summary`, {});
      setSummary(res.ai_summary);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mt">
      <div className="card-head">
        <h2>
          Reviewer summary <span className="badge blue">AI-generated</span>
        </h2>
        {!summary && (
          <button className="secondary small" onClick={generate} disabled={busy}>
            {busy ? 'Generating…' : 'Generate AI summary'}
          </button>
        )}
      </div>
      <Alert>{error}</Alert>
      {summary ? (
        <>
          <p style={{ margin: 0 }}>{summary.text}</p>
          <p className="small muted" style={{ marginBottom: 0 }}>
            {summary.model} · {summary.prompt_version} · rules run #{summary.evaluation_run} · {fmtDateTime(summary.generated_at)}. Lists discrepancies
            only, not a recommendation. Check the rule results below before deciding.
          </p>
        </>
      ) : (
        !error && <p className="muted" style={{ margin: 0 }}>A short AI-written list of this case's discrepancies, made only from the rule results and extracted values.</p>
      )}
    </div>
  );
}

function ExtractedFields({ doc, declared, usedAs, onCorrect }) {
  const ex = doc.extraction;
  if (!ex) return <div className="empty">Not extracted yet.</div>;
  const dt = ex.doc_type || {};
  return (
    <>
      <p className="small muted" style={{ marginTop: 0 }}>
        {ex.provider === 'ai' ? <span className="badge blue">AI extraction</span> : <span className="badge grey">Mock extraction</span>}{' '}
        {ex.extractor_version} · {fmtDateTime(ex.extracted_at)}
        {usedAs.length > 0 && <> · used as <b>{usedAs.join(', ')}</b></>}
      </p>
      {ex.error && <Alert>Extraction failed: {ex.error}</Alert>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Extracted</th>
              <th>Conf.</th>
              <th>Declared</th>
              {onCorrect && <th />}
            </tr>
          </thead>
          <tbody>
            <tr className={dt.low_confidence ? 'low' : ''}>
              <td>Document type</td>
              <td>
                {label(DOC_TYPE_LABELS, dt.value)} <SourceBadge source={dt.source} />
              </td>
              <td className="mono">{dt.confidence !== undefined ? Number(dt.confidence).toFixed(2) : '—'}</td>
              <td>
                {label(DOC_TYPE_LABELS, doc.declared_doc_type)}
                {dt.value && dt.value !== doc.declared_doc_type && <span className="badge red"> differs</span>}
              </td>
              {onCorrect && (
                <td>
                  <button className="link small" onClick={() => onCorrect('doc_type', dt.value || '')}>
                    Correct
                  </button>
                </td>
              )}
            </tr>
            {ex.fields.map((f) => {
              const declaredVal = DECLARED_KEY[f.field_name] ? declared[DECLARED_KEY[f.field_name]] : null;
              const differs = declaredVal && String(declaredVal).trim().toUpperCase() !== String(f.value || '').trim().toUpperCase();
              return (
                <tr key={f.field_name} className={f.low_confidence ? 'low' : ''}>
                  <td>{label(FIELD_LABELS, f.field_name)}</td>
                  <td className="mono">
                    {f.value || <span className="muted">empty</span>} <SourceBadge source={f.source} />
                  </td>
                  <td className="mono">{Number(f.confidence).toFixed(2)}</td>
                  <td className="mono">
                    {declaredVal ?? <span className="muted">—</span>}
                    {differs && f.field_name !== 'address' && <span className="badge red"> differs</span>}
                  </td>
                  {onCorrect && (
                    <td>
                      <button className="link small" onClick={() => onCorrect(f.field_name, f.value || '')}>
                        Correct
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted">Rows highlighted in yellow are below the minimum confidence and are not used by the identity rules.</p>
    </>
  );
}

function ActionBox({ a }) {
  return (
    <dl className="kv">
      <dt>Action</dt>
      <dd>
        {['APPROVE', 'REJECT'].includes(a.action) ? <DecisionBadge decision={a.action} /> : <span className="badge amber">{a.action}</span>}
        {a.auto && <span className="muted small"> (after correction re-run)</span>}
      </dd>
      <dt>By</dt>
      <dd>{a.by_username}</dd>
      <dt>When</dt>
      <dd>{fmtDateTime(a.at)}</dd>
      <dt>Comment</dt>
      <dd>{a.comment}</dd>
    </dl>
  );
}

function RecommendForm({ c, onDone, onError }) {
  const [action, setAction] = useState('');
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const local = {};
    if (!action) local.action = 'Choose a recommendation';
    if (comment.trim().length < 10) local.comment = 'Comment must be at least 10 characters';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const res = await api.post(`/officer/applications/${c.application_id}/recommendation`, { action, comment, version: c.version });
      onDone(`Recommendation recorded. Status: ${res.status}.`);
      setAction('');
      setComment('');
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) setErrors(err.fieldMap());
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3>Your recommendation</h3>
      <Field label="Recommendation" error={errors.action}>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Select…</option>
          <option value="APPROVE">Approve</option>
          <option value="REJECT">Reject</option>
          <option value="REQUEST_RESUBMISSION">Request resubmission</option>
        </select>
      </Field>
      <Field label="Comment" hint="at least 10 characters" error={errors.comment}>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <div>
        <button disabled={busy}>{busy ? 'Saving…' : 'Submit recommendation'}</button>
      </div>
    </form>
  );
}

function CheckerForm({ c, isMaker, onDone, onError }) {
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const decide = async (action) => {
    if (!comment.trim()) {
      setErrors({ comment: 'Comment is required' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api.post(`/checker/applications/${c.application_id}/decision`, { action, comment, version: c.version });
      let msg = `Decision recorded. Status: ${res.status}.`;
      if (res.account) msg += ` Account opened: customer ${res.account.customer_id}, account ${res.account.account_number}.`;
      if (res.account_error) msg += ` Core banking error: ${res.account_error}`;
      onDone(msg);
      setComment('');
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) setErrors(err.fieldMap());
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3>Your decision</h3>
      {isMaker && <Alert type="warn">You made the recommendation on this case. Maker and checker must be different users.</Alert>}
      <Field label="Comment" error={errors.comment}>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
      <div className="row">
        <button className="success" disabled={busy} onClick={() => decide('APPROVE')}>
          Approve
        </button>
        <button className="danger" disabled={busy} onClick={() => decide('REJECT')}>
          Reject
        </button>
        <button className="secondary" disabled={busy} onClick={() => decide('SEND_BACK')}>
          Send back to review
        </button>
      </div>
    </div>
  );
}

function CorrectionModal({ c, doc, initial, onClose, onDone, onError }) {
  const [field, setField] = useState(initial.field);
  const [value, setValue] = useState(initial.value);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const local = {};
    if (!field) local.field = 'Choose a field';
    if (!String(value).trim()) local.new_value = 'Enter the correct value';
    if (reason.trim().length < 5) local.reason = 'Reason must be at least 5 characters';
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    try {
      const res = await api.post(`/officer/applications/${c.application_id}/corrections`, {
        document_id: doc.id,
        field,
        new_value: value,
        reason,
        version: c.version,
      });
      onDone(res);
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) setErrors(err.fieldMap());
      else {
        onClose();
        onError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Correct a field on ${doc.doc_id}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Field" error={errors.field}>
          <select value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">Select…</option>
            {CORRECTABLE_FIELDS.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Correct value" hint={field.includes('date') || field === 'dob' || field === 'valid_until' ? 'YYYY-MM-DD' : null} error={errors.new_value}>
          <input value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Reason" hint="at least 5 characters" error={errors.reason}>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <p className="small muted" style={{ margin: 0 }}>
          The corrected value gets confidence 1.00 and source OFFICER, and the rules run again.
        </p>
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? 'Saving…' : 'Save correction'}</button>
        </div>
      </form>
    </Modal>
  );
}
