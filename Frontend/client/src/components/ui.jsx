// Small shared UI pieces.
import { STATUS_LABELS, STATUS_TONE } from '../labels';

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_TONE[status] || 'grey'}`}>{STATUS_LABELS[status] || status}</span>;
}

const RISK_TONE = { HIGH: 'red', MEDIUM: 'amber', LOW: 'green' };
export function RiskBadge({ risk }) {
  if (!risk) return <span className="muted">—</span>;
  return <span className={`badge ${RISK_TONE[risk] || 'grey'}`}>{risk}</span>;
}

const DECISION_TONE = { APPROVE: 'green', REVIEW: 'amber', REJECT: 'red' };
export function DecisionBadge({ decision }) {
  if (!decision) return <span className="muted">—</span>;
  return <span className={`badge ${DECISION_TONE[decision] || 'grey'}`}>{decision}</span>;
}

export function Codes({ codes }) {
  if (!codes || !codes.length) return <span className="muted">—</span>;
  return (
    <span className="codes">
      {codes.map((c) => (
        <span key={c} className="code">
          {c}
        </span>
      ))}
    </span>
  );
}

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return <div className={`alert ${type}`}>{children}</div>;
}

export function Loading() {
  return <div className="empty">Loading…</div>;
}

// Label + input wrapper that shows a field error under the input.
export function Field({ label, hint, error, full, children }) {
  return (
    <label className={`field ${error ? 'has-error' : ''} ${full ? 'full' : ''}`}>
      <span>
        {label} {hint && <span className="hint">({hint})</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export function Modal({ title, onClose, wide, children }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title} style={wide ? { maxWidth: 760 } : undefined}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
