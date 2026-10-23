const { distance } = require('fastest-levenshtein');

// Name normalisation from section 6.1:
// upper case -> "." and "-" become spaces -> keep only A-Z and space ->
// drop title tokens -> collapse spaces -> sort tokens -> join with one space.
function normalizeName(name, titleTokens = []) {
  const titles = new Set(titleTokens.map((t) => t.toUpperCase()));
  return String(name || '')
    .toUpperCase()
    .replace(/[.\-]/g, ' ')
    .replace(/[^A-Z ]/g, '')
    .split(' ')
    .filter((t) => t && !titles.has(t))
    .sort()
    .join(' ');
}

// 1 - Levenshtein distance / length of the longer normalised string (1.0 when both empty).
function similarity(a, b, titleTokens = []) {
  const na = normalizeName(a, titleTokens);
  const nb = normalizeName(b, titleTokens);
  const longer = Math.max(na.length, nb.length);
  if (longer === 0) return 1;
  return 1 - distance(na, nb) / longer;
}

module.exports = { normalizeName, similarity };
