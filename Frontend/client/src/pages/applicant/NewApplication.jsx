import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, errorText } from '../../api';
import { Alert, Field } from '../../components/ui';

const EMPTY = {
  full_name: '',
  dob: '',
  gender: '',
  pan_number: '',
  aadhaar_last4: '',
  mobile: '',
  email: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  occupation_code: '',
  annual_income: '',
  consent: false,
};

// Same checks as the server (section 4), so the user sees mistakes before sending.
// The server validates again and its messages are shown too.
function checkForm(f) {
  const e = {};
  const today = new Date().toISOString().slice(0, 10);
  if (!f.full_name.trim()) e.full_name = 'Full name is required';
  if (!f.dob) e.dob = 'Date of birth is required';
  else if (f.dob > today) e.dob = 'Date of birth cannot be in the future';
  if (!f.gender) e.gender = 'Select a gender';
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(f.pan_number.trim().toUpperCase())) e.pan_number = 'PAN must look like AAAAA9999A';
  const aadhaarDigits = f.aadhaar_last4.replace(/[\s-]/g, '');
  if (/^\d{12}$/.test(aadhaarDigits)) e.aadhaar_last4 = 'Full Aadhaar numbers are not accepted. Enter only the last 4 digits.';
  else if (!/^[0-9]{4}$/.test(f.aadhaar_last4.trim())) e.aadhaar_last4 = 'Enter exactly 4 digits';
  if (!/^[6-9][0-9]{9}$/.test(f.mobile.trim())) e.mobile = 'Mobile must be 10 digits starting with 6-9';
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email';
  if (!f.address.trim()) e.address = 'Address is required';
  if (!f.city.trim()) e.city = 'City is required';
  if (!f.state.trim()) e.state = 'State is required';
  if (!/^[1-9][0-9]{5}$/.test(f.pincode.trim())) e.pincode = 'Pincode must be 6 digits and not start with 0';
  if (!f.occupation_code) e.occupation_code = 'Select an occupation';
  if (f.annual_income === '' || !/^\d+$/.test(String(f.annual_income))) e.annual_income = 'Enter a whole number';
  if (!f.consent) e.consent = 'Consent to KYC checks is mandatory';
  return e;
}

export default function NewApplication() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [occupations, setOccupations] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/occupations').then(setOccupations).catch((e) => setError(errorText(e)));
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const local = checkForm(form);
    setErrors(local);
    if (Object.keys(local).length) {
      setError('Please fix the highlighted fields.');
      return;
    }
    setBusy(true);
    try {
      const body = { ...form, pan_number: form.pan_number.trim().toUpperCase(), annual_income: Number(form.annual_income) };
      const created = await api.post('/applications', body);
      navigate(`/my/${created.application_id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) setErrors(err.fieldMap());
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New savings-account application</h1>
          <p>Enter your details exactly as printed on your PAN and Aadhaar cards. You will upload documents in the next step.</p>
        </div>
      </div>
      <Alert>{error}</Alert>
      <form className="card" onSubmit={submit} noValidate>
        <h2>Personal details</h2>
        <div className="form-grid">
          <Field label="Full name" error={errors.full_name} full>
            <input value={form.full_name} onChange={set('full_name')} />
          </Field>
          <Field label="Date of birth" error={errors.dob}>
            <input type="date" value={form.dob} onChange={set('dob')} />
          </Field>
          <Field label="Gender" error={errors.gender}>
            <select value={form.gender} onChange={set('gender')}>
              <option value="">Select…</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </Field>
          <Field label="PAN" hint="e.g. ZZKPS1234Q" error={errors.pan_number}>
            <input value={form.pan_number} onChange={set('pan_number')} maxLength={10} style={{ textTransform: 'uppercase' }} />
          </Field>
          <Field label="Aadhaar – last 4 digits only" hint="never enter the full number" error={errors.aadhaar_last4}>
            <input value={form.aadhaar_last4} onChange={set('aadhaar_last4')} inputMode="numeric" />
          </Field>
          <Field label="Mobile" error={errors.mobile}>
            <input value={form.mobile} onChange={set('mobile')} maxLength={10} inputMode="numeric" />
          </Field>
          <Field label="Email" error={errors.email}>
            <input type="email" value={form.email} onChange={set('email')} />
          </Field>
        </div>

        <h2 className="mt">Address</h2>
        <div className="form-grid">
          <Field label="Address" error={errors.address} full>
            <input value={form.address} onChange={set('address')} />
          </Field>
          <Field label="City" error={errors.city}>
            <input value={form.city} onChange={set('city')} />
          </Field>
          <Field label="State" error={errors.state}>
            <input value={form.state} onChange={set('state')} />
          </Field>
          <Field label="Pincode" error={errors.pincode}>
            <input value={form.pincode} onChange={set('pincode')} maxLength={6} inputMode="numeric" />
          </Field>
        </div>

        <h2 className="mt">Occupation and income</h2>
        <div className="form-grid">
          <Field label="Occupation" error={errors.occupation_code}>
            <select value={form.occupation_code} onChange={set('occupation_code')}>
              <option value="">Select…</option>
              {occupations.map((o) => (
                <option key={o.occupation_code} value={o.occupation_code}>
                  {o.description || o.occupation_code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Annual income (₹)" error={errors.annual_income}>
            <input value={form.annual_income} onChange={set('annual_income')} inputMode="numeric" />
          </Field>
        </div>

        <div className={`mt ${errors.consent ? 'has-error' : ''}`}>
          <label className="checkbox">
            <input type="checkbox" checked={form.consent} onChange={set('consent')} />
            <span>I consent to Deccan Digital Bank verifying my identity and screening my details as part of KYC checks.</span>
          </label>
          {errors.consent && <div className="field-error">{errors.consent}</div>}
        </div>

        <div className="row mt">
          <button disabled={busy}>{busy ? 'Saving…' : 'Save and continue to documents'}</button>
          <button type="button" className="secondary" onClick={() => navigate('/my')}>
            Cancel
          </button>
        </div>
      </form>
    </>
  );
}
