import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorText } from '../../api';
import { Alert, Loading, StatusBadge } from '../../components/ui';

export default function MyApplications() {
  const navigate = useNavigate();
  const [apps, setApps] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/applications').then(setApps).catch((e) => setError(errorText(e)));
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My applications</h1>
          <p>Track your savings-account applications.</p>
        </div>
        <Link to="/my/new" className="btn">
          + New application
        </Link>
      </div>
      <Alert>{error}</Alert>
      <div className="card">
        {!apps && !error && <Loading />}
        {apps && apps.length === 0 && (
          <div className="empty">
            You have no applications yet. <Link to="/my/new">Start one</Link>.
          </div>
        )}
        {apps && apps.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Name</th>
                  <th>PAN</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.application_id} className="clickable" onClick={() => navigate(`/my/${a.application_id}`)}>
                    <td className="mono">{a.application_id}</td>
                    <td>{a.full_name}</td>
                    <td className="mono">{a.pan_masked}</td>
                    <td>{a.application_date}</td>
                    <td>
                      <StatusBadge status={a.status} />
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
