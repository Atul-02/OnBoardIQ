import { Navigate, Route, Routes } from 'react-router-dom';
import { homePath, useAuth } from './auth';
import Layout from './components/Layout';
import { Loading } from './components/ui';

import Login from './pages/Login';
import Register from './pages/Register';
import MyApplications from './pages/applicant/MyApplications';
import NewApplication from './pages/applicant/NewApplication';
import ApplicantDetail from './pages/applicant/ApplicantDetail';
import ReviewQueue from './pages/staff/ReviewQueue';
import CheckerQueue from './pages/staff/CheckerQueue';
import AllApplications from './pages/staff/AllApplications';
import CaseView from './pages/staff/CaseView';
import AuditTrail from './pages/staff/AuditTrail';
import Dashboard from './pages/compliance/Dashboard';
import Admin from './pages/compliance/Admin';

// Shows the page only to users with one of the roles. The server enforces the same rules (403).
function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !user.roles.some((r) => roles.includes(r))) {
    return (
      <div className="card">
        <h2>Not allowed</h2>
        <p className="muted">Your role cannot open this page.</p>
      </div>
    );
  }
  return children;
}

const STAFF = ['KYC_OFFICER', 'COMPLIANCE_OFFICER'];

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homePath(user)} replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to={homePath(user)} replace /> : <Register />} />

      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Navigate to={homePath(user)} replace />} />

        {/* Applicant */}
        <Route path="/my" element={<RequireRole roles={['APPLICANT']}><MyApplications /></RequireRole>} />
        <Route path="/my/new" element={<RequireRole roles={['APPLICANT']}><NewApplication /></RequireRole>} />
        <Route path="/my/:id" element={<RequireRole roles={['APPLICANT']}><ApplicantDetail /></RequireRole>} />

        {/* KYC Officer / Compliance Officer */}
        <Route path="/officer/queue" element={<RequireRole roles={['KYC_OFFICER']}><ReviewQueue /></RequireRole>} />
        <Route path="/checker/queue" element={<RequireRole roles={['COMPLIANCE_OFFICER']}><CheckerQueue /></RequireRole>} />
        <Route path="/applications" element={<RequireRole roles={STAFF}><AllApplications /></RequireRole>} />
        <Route path="/applications/:id" element={<RequireRole roles={STAFF}><CaseView /></RequireRole>} />
        <Route path="/applications/:id/audit" element={<RequireRole roles={STAFF}><AuditTrail /></RequireRole>} />

        {/* Compliance Officer */}
        <Route path="/dashboard" element={<RequireRole roles={['COMPLIANCE_OFFICER']}><Dashboard /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['COMPLIANCE_OFFICER']}><Admin /></RequireRole>} />

        <Route path="*" element={<div className="card"><h2>Page not found</h2></div>} />
      </Route>
    </Routes>
  );
}
