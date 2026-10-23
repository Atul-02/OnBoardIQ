// ZZKPS1234Q -> ZZKXXXXX4Q (first 3 and last 2 characters visible)
function maskPan(pan) {
  const p = String(pan || '');
  if (p.length < 6) return 'X'.repeat(p.length);
  return p.slice(0, 3) + 'X'.repeat(p.length - 5) + p.slice(-2);
}

module.exports = { maskPan };
