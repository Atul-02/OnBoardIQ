import { useState } from 'react';
import { api, errorText } from '../api';
import { DOC_TYPES, DOC_TYPE_LABELS } from '../labels';

const MAX_BYTES = 1024 * 1024;

// Pick one or more .txt files, choose a declared type for each, then upload them one by one
// (the API takes one file per request).
export default function DocumentUploader({ applicationId, onUploaded }) {
  const [rows, setRows] = useState([]); // { file, type, state, message }
  const [busy, setBusy] = useState(false);

  const pick = (e) => {
    const files = Array.from(e.target.files || []);
    setRows((prev) => [
      ...prev,
      ...files.map((file) => {
        let message = '';
        if (!file.name.toLowerCase().endsWith('.txt')) message = 'Only .txt files are accepted';
        else if (file.size > MAX_BYTES) message = 'File is larger than 1 MB';
        else if (file.size === 0) message = 'File is empty';
        return { file, type: '', state: message ? 'invalid' : 'ready', message };
      }),
    ]);
    e.target.value = '';
  };

  const setType = (i, type) => setRows((r) => r.map((row, j) => (j === i ? { ...row, type } : row)));
  const remove = (i) => setRows((r) => r.filter((_, j) => j !== i));

  const uploadAll = async () => {
    setBusy(true);
    const next = [...rows];
    for (let i = 0; i < next.length; i += 1) {
      const row = next[i];
      if (row.state !== 'ready') continue;
      if (!row.type) {
        next[i] = { ...row, message: 'Choose a document type' };
        continue;
      }
      const form = new FormData();
      form.append('declared_doc_type', row.type);
      form.append('file', row.file);
      try {
        const res = await api.upload(`/applications/${applicationId}/documents`, form);
        next[i] = { ...row, state: 'done', message: res.duplicate ? 'Same file was already uploaded – kept once' : 'Uploaded' };
      } catch (err) {
        const fieldMsg = err.fields?.map((f) => f.message).join('; ');
        next[i] = { ...row, state: 'error', message: fieldMsg || errorText(err) };
      }
      setRows([...next]);
    }
    setRows(next.filter((r) => r.state !== 'done'));
    setBusy(false);
    onUploaded?.(next.filter((r) => r.state === 'done').length);
  };

  const pending = rows.filter((r) => r.state === 'ready' || r.state === 'error');

  return (
    <div>
      <div className="row">
        <label className="btn secondary">
          Choose .txt files
          <input type="file" accept=".txt,text/plain" multiple onChange={pick} style={{ display: 'none' }} />
        </label>
        <span className="muted small">UTF-8 text, at most 1 MB each. Select the document type for every file.</span>
      </div>

      {rows.length > 0 && (
        <div className="table-wrap mt">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Document type</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.file.name}-${i}`}>
                  <td className="mono">{row.file.name}</td>
                  <td>
                    <select value={row.type} onChange={(e) => setType(i, e.target.value)} disabled={row.state === 'invalid' || busy}>
                      <option value="">Select…</option>
                      {DOC_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {DOC_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={row.state === 'invalid' || row.state === 'error' ? 'field-error' : 'muted'}>{row.message || 'Ready'}</td>
                  <td>
                    <button type="button" className="link small" onClick={() => remove(i)} disabled={busy}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row mt">
            <button type="button" onClick={uploadAll} disabled={busy || pending.length === 0}>
              {busy ? 'Uploading…' : `Upload ${pending.length} file(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
