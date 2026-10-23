import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText } from '../../api';
import { fmtDateTime } from '../../labels';
import { Alert, Loading } from '../../components/ui';

// Short readable summary of an audit row's details.
function summary(r) {
  const d = r.details || {};
  switch (r.action) {
    case 'STATUS_CHANGED':
      return `${d.from || '—'} → ${d.to}${d.note ? ` (${d.note})` : ''}`;
    case 'FIELD_CORRECTED':
      return `${d.field}: ${d.before ? d.before.value : '—'} → ${d.after ? d.after.value : '—'}. Reason: ${d.reason}`;
    case 'RECOMMENDATION_RECORDED':
    case 'CHECKER_DECISION':
      return `${d.action}: ${d.comment || ''}`;
    case 'DOCUMENT_VIEWED':
      return `Viewed ${r.doc_id}`;
    default:
      return Object.keys(d).length ? JSON.stringify(d) : '';
  }
}

// FR-9: full history of one application, oldest first. Read-only; export as CSV.
export default function AuditTrail() {
  const { id } = useParams();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.get(`/applications/${id}/audit`).then(setRows).catch((e) => setError(errorText(e)));
  }, [id]);

  const exportCsv = () => api.download(`/applications/${id}/audit/export`, `audit_${id}.csv`).catch((e) => setError(errorText(e)));

  const actions = rows ? [...new Set(rows.map((r) => r.action))].sort() : [];
  const shown = rows ? rows.filter((r) => !filter || r.action === filter) : [];

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">
            <Link to={`/applications/${id}`}>← Back to case</Link>
          </p>
          <h1>
            Audit trail <span className="mono muted">· {id}</span>
          </h1>
          <p>Append-only record of every status change, decision, correction and document view.</p>
        </div>
        <button className="secondary" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <Alert>{error}</Alert>
      <div className="card">
        {!rows ? (
          !error && <Loading />
        ) : (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All actions ({rows.length})</option>
                {actions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Doc</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r._id}>
                      <td className="small" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDateTime(r.at)}
                      </td>
                      <td className="mono small">{r.action}</td>
                      <td>{r.actor_username}</td>
                      <td className="small">{r.role}</td>
                      <td className="mono small">{r.doc_id || ''}</td>
                      <td className="small">
                        {open === r._id ? (
                          <pre className="doc-text" style={{ maxHeight: 240 }}>
                            {JSON.stringify(r.details, null, 2)}
                          </pre>
                        ) : (
                          <span>{summary(r)}</span>
                        )}{' '}
                        {r.details && Object.keys(r.details).length > 0 && (
                          <button className="link small" onClick={() => setOpen(open === r._id ? null : r._id)}>
                            {open === r._id ? 'less' : 'more'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
