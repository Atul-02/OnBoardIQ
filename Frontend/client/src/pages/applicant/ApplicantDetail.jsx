import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorText } from '../../api';
import { DOC_TYPE_LABELS, fmtDateTime, fmtMoney, label, STATUS_LABELS } from '../../labels';
import { Alert, Loading, Modal, StatusBadge } from '../../components/ui';
import DocumentUploader from '../../components/DocumentUploader';
import DocumentText from '../../components/DocumentText';

const UPLOAD_STATUSES = ['DRAFT', 'RESUBMISSION_REQUESTED'];

// Applicant view of one application: status, plain-language reasons, documents and (re)upload.
export default function ApplicantDetail() {
  const { id } = useParams();
  const [app, setApp] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(() => {
    api.get(`/applications/${id}`).then(setApp).catch((e) => setError(errorText(e)));
  }, [id]);

  useEffect(load, [load]);

  if (!app) return error ? <Alert>{error}</Alert> : <Loading />;

  const canUpload = UPLOAD_STATUSES.includes(app.status);
  // The document round goes up by one each time an officer requests resubmission.
  const round = 1 + app.timeline.filter((t) => t.status === 'RESUBMISSION_REQUESTED').length;
  const currentDocs = app.documents.filter((d) => d.round === round && !d.superseded);
  const olderDocs = app.documents.filter((d) => !(d.round === round && !d.superseded));

  const removeDoc = async (docId) => {
    setError('');
    try {
      await api.del(`/applications/${id}/documents/${docId}`);
      load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.post(`/applications/${id}/submit`, {});
      setApp(updated);
      setNotice('Your application was submitted and checked.');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const d = app.declared;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">
            <Link to="/my">← My applications</Link>
          </p>
          <h1>
            Application <span className="mono">{app.application_id}</span>
          </h1>
          <p>{app.status_message}</p>
        </div>
        <StatusBadge status={app.status} />
      </div>

      <Alert>{error}</Alert>
      <Alert type="success">{notice}</Alert>

      {app.account && (
        <div className="alert success">
          Your account is open. Customer ID <b className="mono">{app.account.customer_id}</b>, account number{' '}
          <b className="mono">{app.account.account_number}</b>.
        </div>
      )}

      {app.resubmission && (
        <div className="alert warn">
          <b>New documents needed.</b> Please upload a new set and submit again by <b>{fmtDateTime(app.resubmission.deadline)}</b>.
          {app.resubmission.officer_comment && (
            <div className="mt">
              Officer's note: <i>{app.resubmission.officer_comment}</i>
            </div>
          )}
        </div>
      )}

      {app.reasons.length > 0 && (
        <div className="card">
          <h2>Why</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {app.reasons.map((r) => (
              <li key={r.code}>{r.message}</li>
            ))}
          </ul>
        </div>
      )}

      {canUpload && (
        <div className="card">
          <div className="card-head">
            <h2>{app.status === 'DRAFT' ? 'Upload your documents' : 'Upload new documents'}</h2>
            <span className="muted small">{currentDocs.length} uploaded · at least 3 needed</span>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Upload your PAN card, Aadhaar card and one address proof (electricity bill, bank statement or driving licence).
          </p>

          {currentDocs.length > 0 && (
            <div className="table-wrap" style={{ marginBottom: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Declared type</th>
                    <th>Uploaded</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {currentDocs.map((doc) => (
                    <tr key={doc.id}>
                      <td className="mono">{doc.file_name}</td>
                      <td>{label(DOC_TYPE_LABELS, doc.declared_doc_type)}</td>
                      <td>{fmtDateTime(doc.uploaded_at)}</td>
                      <td className="row">
                        <button className="link small" onClick={() => setViewing(doc)}>
                          View
                        </button>
                        <button className="link small" onClick={() => removeDoc(doc.id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DocumentUploader applicationId={app.application_id} onUploaded={load} />

          <div className="row mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button onClick={submit} disabled={busy || currentDocs.length < 3}>
              {busy ? 'Submitting…' : app.status === 'DRAFT' ? 'Submit application' : 'Resubmit application'}
            </button>
            {currentDocs.length < 3 && <span className="muted small">Upload at least 3 documents to submit.</span>}
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>Your details</h2>
          <dl className="kv">
            <dt>Name</dt>
            <dd>{d.full_name}</dd>
            <dt>Date of birth</dt>
            <dd>{d.dob}</dd>
            <dt>PAN</dt>
            <dd className="mono">{d.pan_number}</dd>
            <dt>Aadhaar</dt>
            <dd className="mono">XXXX XXXX {d.aadhaar_last4}</dd>
            <dt>Mobile</dt>
            <dd>{d.mobile}</dd>
            <dt>Email</dt>
            <dd>{d.email}</dd>
            <dt>Address</dt>
            <dd>
              {d.address}, {d.city}, {d.state} {d.pincode}
            </dd>
            <dt>Occupation</dt>
            <dd>{d.occupation_code}</dd>
            <dt>Annual income</dt>
            <dd>{fmtMoney(d.annual_income)}</dd>
            <dt>Application date</dt>
            <dd>{d.application_date}</dd>
          </dl>
        </div>

        <div className="card">
          <h2>Status history</h2>
          <ul className="timeline">
            {app.timeline.map((t, i) => (
              <li key={i}>
                <div>{STATUS_LABELS[t.status] || t.status}</div>
                <div className="when">{fmtDateTime(t.at)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(!canUpload ? app.documents : olderDocs).length > 0 && (
        <div className="card">
          <h2>{canUpload ? 'Earlier documents' : 'Documents'}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Declared type</th>
                  <th>Uploaded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(!canUpload ? app.documents : olderDocs).map((doc) => (
                  <tr key={doc.id}>
                    <td className="mono">
                      {doc.file_name} {doc.superseded && <span className="badge grey">replaced</span>}
                    </td>
                    <td>{label(DOC_TYPE_LABELS, doc.declared_doc_type)}</td>
                    <td>{fmtDateTime(doc.uploaded_at)}</td>
                    <td>
                      <button className="link small" onClick={() => setViewing(doc)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewing && (
        <Modal title={viewing.file_name} onClose={() => setViewing(null)} wide>
          <DocumentText documentId={viewing.id} />
          <div className="actions mt">
            <button className="secondary" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
