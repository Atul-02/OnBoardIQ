import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const ROLE_SHORT = { APPLICANT: 'Applicant', KYC_OFFICER: 'KYC Officer', COMPLIANCE_OFFICER: 'Compliance Officer' };

export default function Layout() {
  const { user, hasRole, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = () => {
    logout();
    navigate('/login');
  };

  // A user with several roles (e.g. supervisor1) sees the menus of every role.
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          OnboardIQ
        </Link>
        <nav className="nav">
          {hasRole('APPLICANT') && <NavLink to="/my">My applications</NavLink>}
          {hasRole('KYC_OFFICER') && <NavLink to="/officer/queue">Review queue</NavLink>}
          {hasRole('COMPLIANCE_OFFICER') && <NavLink to="/checker/queue">Checker queue</NavLink>}
          {hasRole('COMPLIANCE_OFFICER') && <NavLink to="/dashboard">Dashboard</NavLink>}
          {(hasRole('KYC_OFFICER') || hasRole('COMPLIANCE_OFFICER')) && <NavLink to="/applications">All applications</NavLink>}
          {hasRole('COMPLIANCE_OFFICER') && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="userbox">
          <span>
            {user.full_name}
            {user.user_code ? ` (${user.user_code})` : ''} · <span className="roles">{user.roles.map((r) => ROLE_SHORT[r] || r).join(', ')}</span>
          </span>
          <button className="secondary small" onClick={doLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
