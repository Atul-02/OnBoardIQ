// AI extraction provider (AI track, AI-1/AI-2). Placeholder for now.
// It deliberately fails, so the workflow falls back to "confidence 0 -> REVIEW" (section 6.2.1 Fallback).
const VERSION = 'ai-0.0-not-implemented';

async function extract() {
  throw new Error('AI extraction provider is not implemented yet');
}

module.exports = { name: 'ai', extract, VERSION };
