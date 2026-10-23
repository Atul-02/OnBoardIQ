import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorText } from '../../api';
import { Alert, Codes, DecisionBadge, Field, Loading, StatusBadge } from '../../components/ui';

// Compliance Officer maintenance: rules configuration, watchlists and re-screening.
export default function Admin() {
  const [tab, setTab] = useState('config');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p>Rules configuration and watchlists are data, not code. Changes are recorded in the audit trail.</p>
        </div>
      </div>
      <div className="tabs">
        {[
          ['config', 'Rules configuration'],
          ['sanctions', 'Sanctions list'],
          ['peps', 'PEP list'],
          ['jobs', 'Re-screen & jobs'],
        ].map(([k, v]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {v}
          </button>
        ))}
      </div>
      {tab === 'config' && <ConfigEditor />}
      {tab === 'sanctions' && <Watchlist kind="sanctions" />}
      {tab === 'peps' && <Watchlist kind="peps" />}
      {tab === 'jobs' && <Jobs />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rules configuration: simple values as inputs, lists/objects as JSON.

function ConfigEditor() {
  const [cfg, setCfg] = useState(null);
  const [draft, setDraft] = useState({});
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get('/config')
      .then((c) => {
        setCfg(c);
        const d = {};
        for (const [k, v] of Object.entries(c)) d[k] = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 1) : String(v);
        setDraft(d);
      })
      .catch((e) => setError(errorText(e)));

  useEffect(() => {
    load();
  }, []);

  if (!cfg) return error ? <Alert>{error}</Alert> : <Loading />;

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const updates = {};
    const local = {};
    for (const [k, orig] of Object.entries(cfg)) {
      const raw = draft[k];
      let val;
      if (typeof orig === 'number') {
        val = Number(raw);
        if (raw.trim() === '' || Number.isNaN(val)) local[k] = 'Must be a number';
      } else if (typeof orig === 'boolean') {
        val = raw === 'true';
      } else if (typeof orig === 'object' && orig !== null) {
        try {
          val = JSON.parse(raw);
        } catch {
          local[k] = 'Not valid JSON';
        }
      } else {
        val = raw;
      }
      if (!local[k] && JSON.stringify(val) !== JSON.stringify(orig)) updates[k] = val;
    }
    setErrors(local);
    if (Object.keys(local).length) return;
    if (!Object.keys(updates).length) {
      setNotice('Nothing changed.');
      return;
    }
    setBusy(true);
    try {
      await api.put('/config', updates);
      setNotice(`Saved: ${Object.keys(updates).join(', ')}. Use "Re-screen open cases" to apply the change to open cases.`);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) setErrors(err.fieldMap());
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={save}>
      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>
      <div className="form-grid">
        {Object.entries(cfg).map(([k, v]) => {
          const isObj = typeof v === 'object' && v !== null;
          return (
            <Field key={k} label={k} error={errors[k]} full={isObj}>
              {isObj ? (
                <textarea className="mono" rows={Math.min(8, draft[k].split('\n').length)} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              ) : (
                <input className={typeof v === 'string' ? 'mono' : ''} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
              )}
            </Field>
          );
        })}
      </div>
      <div className="row mt">
        <button disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <button type="button" className="secondary" onClick={load} disabled={busy}>
          Discard
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sanctions / PEP lists

const LISTS = {
  sanctions: {
    idKey: 'list_id',
    columns: ['list_id', 'name', 'alias', 'dob', 'nationality', 'program'],
    empty: { list_id: '', name: '', alias: '', dob: '', nationality: '', program: '' },
  },
  peps: {
    idKey: 'pep_id',
    columns: ['pep_id', 'name', 'dob', 'position', 'category'],
    empty: { pep_id: '', name: '', dob: '', position: '', category: 'DOMESTIC' },
  },
};

function Watchlist({ kind }) {
  const spec = LISTS[kind];
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(spec.empty);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [q, setQ] = useState('');

  const load = () => api.get(`/watchlists/${kind}`).then(setRows).catch((e) => setError(errorText(e)));
  useEffect(() => {
    load();
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setErrors({});
    try {
      await api.post(`/watchlists/${kind}`, form);
      setNotice(`Added ${form[spec.idKey]}. Re-screen open cases to apply it.`);
      setForm(spec.empty);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) setErrors(err.fieldMap());
      setError(errorText(err));
    }
  };

  const remove = async (id) => {
    if (!window.confirm(`Remove ${id} from the list?`)) return;
    setError('');
    try {
      await api.del(`/watchlists/${kind}/${id}`);
      setNotice(`Removed ${id}. Re-screen open cases to apply it.`);
      load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const shown = rows ? rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase())) : [];

  return (
    <>
      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>
      <form className="card" onSubmit={add}>
        <h2>Add entry</h2>
        <div className="form-grid">
          {spec.columns.map((col) => (
            <Field key={col} label={col} hint={col === 'dob' ? 'YYYY-MM-DD, may be empty' : null} error={errors[col]}>
              {col === 'category' ? (
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="DOMESTIC">DOMESTIC</option>
                  <option value="RCA">RCA</option>
                </select>
              ) : (
                <input value={form[col]} onChange={(e) => setForm({ ...form, [col]: e.target.value })} />
              )}
            </Field>
          ))}
        </div>
        <div className="row mt">
          <button>Add</button>
        </div>
      </form>
      <div className="card">
        <div className="card-head">
          <h2>{kind === 'sanctions' ? 'Sanctions entries' : 'PEP entries'}</h2>
          <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!rows ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {spec.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r[spec.idKey]}>
                    {spec.columns.map((c) => (
                      <td key={c} className={c === spec.idKey ? 'mono' : ''}>
                        {r[c] || <span className="muted">—</span>}
                      </td>
                    ))}
                    <td>
                      <button className="link small" onClick={() => remove(r[spec.idKey])}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Which extraction provider is active. It is switched with EXTRACTION_PROVIDER in the backend .env.

function AiStatus() {
  const [s, setS] = useState(null);
  useEffect(() => {
    api.get('/ai/status').then(setS).catch(() => setS(null));
  }, []);
  if (!s) return null;
  return (
    <div className="card">
      <h2>AI status</h2>
      <dl className="kv">
        <dt>Extraction provider</dt>
        <dd>
          <span className={`badge ${s.extraction_provider === 'ai' ? 'blue' : 'grey'}`}>{s.extraction_provider}</span>{' '}
          <span className="mono small">{s.extractor_version}</span>
        </dd>
        <dt>Gemini model</dt>
        <dd>
          {s.gemini_model} {s.gemini_configured ? <span className="badge green">key set</span> : <span className="badge red">no key</span>}
        </dd>
      </dl>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Change <span className="mono">EXTRACTION_PROVIDER</span> (mock / ai) in the backend .env and restart the API. The AI reviewer summary works with either provider.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-screen open cases and run the resubmission expiry job on demand.

function Jobs() {
  const [result, setResult] = useState(null);
  const [expired, setExpired] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const rescreen = async () => {
    setBusy('rescreen');
    setError('');
    try {
      setResult(await api.post('/watchlists/rescreen', {}));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  const expire = async () => {
    setBusy('expire');
    setError('');
    try {
      const r = await api.post('/jobs/expire-resubmissions', {});
      setExpired(r.closed);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <Alert>{error}</Alert>
      <AiStatus />
      <div className="grid-2">
        <div className="card">
          <h2>Re-screen open cases</h2>
          <p className="muted">Runs the rules again on every case in review, pending checker or waiting for resubmission. Statuses do not change; the new result is shown to officers.</p>
          <button onClick={rescreen} disabled={!!busy}>
            {busy === 'rescreen' ? 'Running…' : 'Re-screen open cases'}
          </button>
        </div>
        <div className="card">
          <h2>Close expired resubmissions</h2>
          <p className="muted">Closes cases where the applicant did not resubmit within the resubmission window. This also runs automatically every hour.</p>
          <button className="secondary" onClick={expire} disabled={!!busy}>
            {busy === 'expire' ? 'Running…' : 'Run now'}
          </button>
          {expired !== null && <p className="mt">Closed {expired} case(s).</p>}
        </div>
      </div>
      {result && (
        <div className="card">
          <h2>
            Re-screened {result.rescreened} case(s), {result.changed} changed
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Status</th>
                  <th>Before</th>
                  <th>After</th>
                  <th>Changed</th>
                </tr>
              </thead>
              <tbody>
                {result.cases.map((c) => (
                  <tr key={c.application_id}>
                    <td className="mono">
                      <Link to={`/applications/${c.application_id}`}>{c.application_id}</Link>
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td>
                      <DecisionBadge decision={c.before.decision} /> <Codes codes={c.before.reason_codes} />
                    </td>
                    <td>
                      <DecisionBadge decision={c.after.decision} /> <Codes codes={c.after.reason_codes} />
                    </td>
                    <td>{c.changed ? <span className="badge amber">yes</span> : <span className="muted">no</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
