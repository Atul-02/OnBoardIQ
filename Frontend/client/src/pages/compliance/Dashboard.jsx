import { useEffect, useState } from 'react';
import { api, errorText } from '../../api';
import { STATUS_LABELS } from '../../labels';
import { Alert, Loading } from '../../components/ui';
import CaseTable from '../../components/CaseTable';

// FR-10. All numbers come straight from GET /dashboard, so they reconcile with the data.
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = (e) => {
    e?.preventDefault();
    setError('');
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    api
      .get(`/dashboard${qs ? `?${qs}` : ''}`)
      .then(setData)
      .catch((err) => setError(errorText(err)));
  };

  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = () => {
    setFrom('');
    setTo('');
    api.get('/dashboard').then(setData).catch((err) => setError(errorText(err)));
  };

  const statusRows = data ? Object.entries(data.by_status).sort((a, b) => b[1] - a[1]) : [];
  const maxStatus = statusRows.length ? Math.max(...statusRows.map(([, n]) => n)) : 1;
  const maxReason = data && data.top_reason_codes.length ? data.top_reason_codes[0].count : 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Onboarding performance. The date filter applies to the application date.</p>
        </div>
        <form className="row" onSubmit={load}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span className="muted">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <button>Apply</button>
          {(from || to) && (
            <button type="button" className="secondary" onClick={clear}>
              Clear
            </button>
          )}
        </form>
      </div>
      <Alert>{error}</Alert>
      {!data ? (
        !error && <Loading />
      ) : (
        <>
          <div className="grid-3">
            <Stat label="Applications" value={data.total_applications} sub={`${data.decided} decided by the rules`} />
            <Stat label="Straight-through rate" value={`${data.straight_through_rate_pct}%`} sub="auto approved ÷ decided" />
            <Stat label="Review rate" value={`${data.review_rate_pct}%`} sub="first decision REVIEW ÷ decided" />
            <Stat label="Reject rate" value={`${data.reject_rate_pct}%`} sub="first decision REJECT ÷ decided" />
            <Stat
              label="Average time in review"
              value={data.avg_time_in_review_hours === null ? '—' : `${data.avg_time_in_review_hours} h`}
              sub={`${data.reviews_completed} completed review(s)`}
            />
            <Stat
              label="Pending checker"
              value={data.pending_checker.count}
              sub={`${data.pending_checker.overdue_count} over the ${data.pending_checker.sla_hours} h SLA`}
            />
          </div>

          <div className="grid-2 mt">
            <div className="card">
              <h2>Applications by status</h2>
              {statusRows.length === 0 && <div className="empty">No data.</div>}
              {statusRows.map(([status, n]) => (
                <Bar key={status} label={STATUS_LABELS[status] || status} value={n} max={maxStatus} />
              ))}
            </div>
            <div className="card">
              <h2>Top 5 reason codes</h2>
              {data.top_reason_codes.length === 0 && <div className="empty">No reason codes.</div>}
              {data.top_reason_codes.map((r) => (
                <Bar key={r.code} label={<span className="mono small">{r.code}</span>} value={r.count} max={maxReason} />
              ))}
              <p className="small muted">
                Rules decisions: APPROVE {data.rules_decisions.APPROVE} · REVIEW {data.rules_decisions.REVIEW} · REJECT {data.rules_decisions.REJECT}
              </p>
            </div>
          </div>

          <div className="card">
            <h2>Pending checker items</h2>
            <CaseTable rows={data.pending_checker.items} columns={['maker', 'pending']} empty="Nothing is waiting for the checker." />
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="lbl">{label}</div>
      <div className="num">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

function Bar({ label, value, max }) {
  return (
    <div className="bar-row">
      <div>{label}</div>
      <div className="bar">
        <span style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <div className="mono" style={{ textAlign: 'right' }}>
        {value}
      </div>
    </div>
  );
}
