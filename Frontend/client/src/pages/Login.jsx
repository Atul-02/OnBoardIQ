import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { homePath, useAuth } from '../auth';
import { errorText } from '../api';
import { Alert, Field } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(form.username, form.password);
      navigate(homePath(user), { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>OnboardIQ</h1>
        <div className="sub">Deccan Digital Bank · KYC onboarding</div>
        <Alert>{error}</Alert>
        <form onSubmit={submit}>
          <Field label="Username">
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus required />
          </Field>
          <Field label="Password">
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>
          New customer? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
