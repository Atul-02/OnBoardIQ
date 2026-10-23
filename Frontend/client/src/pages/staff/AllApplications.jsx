import { useEffect, useState } from 'react';
import { api, errorText } from '../../api';
import { STATUS_LABELS } from '../../labels';
import { Alert, Loading } from '../../components/ui';
import CaseTable from '../../components/CaseTable';

// Staff: search every application by id or name, filter by status.
export default function AllApplications() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const load = (e) => {
    e?.preventDefault();
    setError('');
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    const qs = params.toString();
    api
      .get(`/applications${qs ? `?${qs}` : ''}`)
      .then(setRows)
      .catch((err) => setError(errorText(err)));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => load(), [status]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>All applications</h1>
          <p>Search by application id or name.</p>
        </div>
      </div>
      <form className="card row" onSubmit={load}>
        <input placeholder="e.g. A2000004 or Ravi" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button>Search</button>
      </form>
      <Alert>{error}</Alert>
      <div className="card">
        {rows ? (
          <>
            <div className="muted small" style={{ marginBottom: 8 }}>
              {rows.length} application(s)
            </div>
            <CaseTable rows={rows} columns={['decision']} empty="No applications match." />
          </>
        ) : (
          !error && <Loading />
        )}
      </div>
    </>
  );
}
