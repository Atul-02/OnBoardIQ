import { useEffect, useState } from 'react';
import { api, errorText } from '../../api';
import { Alert, Loading } from '../../components/ui';
import CaseTable from '../../components/CaseTable';

// Compliance Officer: cases waiting for the checker (maker recommendations and HIGH-risk approvals).
export default function CheckerQueue() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.get('/checker/queue').then(setRows).catch((e) => setError(errorText(e)));
  };
  useEffect(load, []);

  const overdue = rows ? rows.filter((r) => r.checker_sla_overdue).length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Checker queue</h1>
          <p>Cases waiting for a final decision. HIGH risk first, then oldest.</p>
        </div>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <Alert>{error}</Alert>
      {overdue > 0 && <Alert type="warn">{overdue} case(s) have waited longer than the checker SLA.</Alert>}
      <div className="card">
        {rows ? <CaseTable rows={rows} columns={['maker', 'pending']} empty="Nothing is waiting for the checker." /> : !error && <Loading />}
      </div>
    </>
  );
}
