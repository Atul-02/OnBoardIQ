import { useNavigate } from 'react-router-dom';
import { fmtDateTime } from '../labels';
import { Codes, DecisionBadge, RiskBadge, StatusBadge } from './ui';

// Table of cases for staff (rows from the backend "listItem" shape; PAN is already masked).
// `columns` picks optional columns: 'decision', 'submitted', 'pending', 'maker'.
export default function CaseTable({ rows, columns = [], empty = 'No cases.' }) {
  const navigate = useNavigate();
  if (!rows.length) return <div className="empty">{empty}</div>;
  const has = (c) => columns.includes(c);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Application</th>
            <th>Name</th>
            <th>PAN</th>
            <th>Risk</th>
            {has('decision') && <th>Decision</th>}
            <th>Reason codes</th>
            <th>Name score</th>
            {has('maker') && <th>Recommendation</th>}
            {has('submitted') && <th>Submitted</th>}
            {has('pending') && <th>Waiting since</th>}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.application_id} className="clickable" onClick={() => navigate(`/applications/${a.application_id}`)}>
              <td className="mono">{a.application_id}</td>
              <td>{a.full_name}</td>
              <td className="mono">{a.pan_masked}</td>
              <td>
                <RiskBadge risk={a.risk_category} />
              </td>
              {has('decision') && (
                <td>
                  <DecisionBadge decision={a.decision} />
                </td>
              )}
              <td>
                <Codes codes={a.reason_codes} />
              </td>
              <td className="mono">{a.name_match_score || '—'}</td>
              {has('maker') && (
                <td>
                  {a.recommendation ? (
                    <>
                      <DecisionBadge decision={a.recommendation} /> <span className="muted small">by {a.maker}</span>
                    </>
                  ) : (
                    <span className="muted small">Rules (HIGH-risk approve)</span>
                  )}
                </td>
              )}
              {has('submitted') && <td className="small">{fmtDateTime(a.submitted_at)}</td>}
              {has('pending') && (
                <td className="small">
                  {fmtDateTime(a.pending_checker_at)}
                  {a.checker_sla_overdue && (
                    <>
                      {' '}
                      <span className="badge red">SLA overdue</span>
                    </>
                  )}
                </td>
              )}
              <td>
                <StatusBadge status={a.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
