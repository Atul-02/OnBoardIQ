// Minimal Gemini client (REST, no SDK). Used by the AI extractor and the reviewer summary.
// Privacy: prompts and responses are never logged; errors never include document text.
const { GEMINI_API_KEY, GEMINI_MODEL } = require('../config');

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const isConfigured = () => !!GEMINI_API_KEY;

// Calls generateContent. Returns the model's text output.
// `schema` (optional) forces JSON output that follows the given response schema.
async function generate({ system, prompt, schema = null, timeoutMs = 10000, temperature = 0 }) {
  if (!isConfigured()) throw new Error('GEMINI_API_KEY is not set');

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature },
  };
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = schema;
  }

  // One overall time budget. Busy / rate-limited answers (429, 500, 503) are retried while time is left.
  const deadline = Date.now() + timeoutMs;
  let data;
  for (let attempt = 1; ; attempt += 1) {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(`Gemini timed out after ${timeoutMs} ms`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), left);
    let res;
    try {
      res = await fetch(`${BASE}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error(`Gemini timed out after ${timeoutMs} ms`);
      throw new Error(`Gemini request failed: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
    data = await res.json().catch(() => ({}));
    if (res.ok) break;

    const msg = data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
    const retryable = [429, 500, 503].includes(res.status);
    const wait = 400 * attempt;
    if (!retryable || deadline - Date.now() < wait + 2500) throw new Error(`Gemini error (${res.status}): ${msg}`);
    await new Promise((r) => setTimeout(r, wait));
  }
  const candidate = data.candidates && data.candidates[0];
  const parts = (candidate && candidate.content && candidate.content.parts) || [];
  const text = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text) throw new Error(`Gemini returned no text (finish reason: ${candidate ? candidate.finishReason : 'none'})`);
  return text;
}

async function generateJson(opts) {
  const text = await generate(opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Gemini returned invalid JSON');
  }
}

module.exports = { generate, generateJson, isConfigured, model: () => GEMINI_MODEL };
