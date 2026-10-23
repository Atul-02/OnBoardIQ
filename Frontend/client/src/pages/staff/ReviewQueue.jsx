import { useEffect, useState } from 'react';
import { api, errorText } from '../../api';
import { Alert, Loading } from '../../components/ui';
import CaseTable from '../../components/CaseTable';

// KYC Officer: REVIEW queue, HIGH risk first, then oldest submission (order comes from the server).
export default function ReviewQueue() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api.get('/officer/queue').then(setRows).catch((e) => setError(errorText(e)));
  };
  useEffect(load, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Review queue</h1>
          <p>Cases the rules sent to review. HIGH risk first, then oldest submission.</p>
        </div>
        <button className="secondary" onClick={load}>
          Refresh
        </button>
      </div>
      <Alert>{error}</Alert>
      <div className="card">{rows ? <CaseTable rows={rows} columns={['submitted']} empty="The review queue is empty." /> : !error && <Loading />}</div>
    </>
  );
}
