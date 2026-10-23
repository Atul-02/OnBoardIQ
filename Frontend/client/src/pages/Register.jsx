import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ApiError, errorText } from '../api';
import { Alert, Field } from '../components/ui';

// Self-registration always creates an Applicant account (staff users come from the seed script).
export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', username: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      await register(form);
      navigate('/my', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) setFieldErrors(err.fieldMap());
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Create account</h1>
        <div className="sub">Open a savings account with Deccan Digital Bank</div>
        <Alert>{error}</Alert>
        <form onSubmit={submit}>
          <Field label="Full name" error={fieldErrors.full_name}>
            <input value={form.full_name} onChange={set('full_name')} required />
          </Field>
          <Field label="Username" hint="letters, digits, . _ @ -" error={fieldErrors.username}>
            <input value={form.username} onChange={set('username')} required />
          </Field>
          <Field label="Password" hint="at least 8 characters" error={fieldErrors.password}>
            <input type="password" value={form.password} onChange={set('password')} required minLength={8} />
          </Field>
          <button disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <p className="muted small" style={{ textAlign: 'center', marginTop: 16 }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
