// Small fetch wrapper for the OnboardIQ API.
// Every error is thrown as ApiError with the HTTP status, the server message and field errors (422).

const BASE = import.meta.env.VITE_API_BASE || '/api/v1';
const TOKEN_KEY = 'onboardiq_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message, fields = [], extra = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
    this.extra = extra;
  }

  // { field_name: message } for showing errors under form inputs
  fieldMap() {
    const out = {};
    for (const f of this.fields || []) if (!out[f.field]) out[f.field] = f.message;
    return out;
  }
}

// Called when the token is missing or expired; set by the auth provider.
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, path, { body, form, raw } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }

  if (raw && res.ok) return res;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const { error, fields, ...extra } = data || {};
    throw new ApiError(res.status, error || `Request failed (${res.status})`, fields || [], extra);
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, { body }),
  put: (path, body) => request('PUT', path, { body }),
  del: (path) => request('DELETE', path),
  upload: (path, form) => request('POST', path, { form }),
  // Downloads a file (e.g. audit CSV) with the auth header and saves it in the browser.
  download: async (path, fileName) => {
    const res = await request('GET', path, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// Turns any error into a short message for the user.
export function errorText(err) {
  if (!(err instanceof ApiError)) return err?.message || 'Something went wrong';
  if (err.status === 409) return `${err.message}`;
  if (err.status === 403) return `Not allowed: ${err.message}`;
  return err.message;
}
