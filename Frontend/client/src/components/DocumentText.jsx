import { useEffect, useState } from 'react';
import { api, errorText } from '../api';

// Loads a document's text. Each load is recorded in the audit trail by the server (FR-9).
export default function DocumentText({ documentId }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!documentId) return;
    let active = true;
    setDoc(null);
    setError('');
    api
      .get(`/documents/${documentId}/content`)
      .then((d) => active && setDoc(d))
      .catch((e) => active && setError(errorText(e)));
    return () => {
      active = false;
    };
  }, [documentId]);

  if (error) return <div className="alert error">{error}</div>;
  if (!doc) return <div className="doc-text muted">Loading document…</div>;
  return <div className="doc-text">{doc.text}</div>;
}
