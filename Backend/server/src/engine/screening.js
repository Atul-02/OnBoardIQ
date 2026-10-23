const { similarity } = require('./normalize');

const STRENGTH = { NONE: 0, POSSIBLE: 1, MATCH: 2 };

// Screens the declared name/dob against one watchlist.
// entries: [{ id, name, alias?, dob? }]
// Returns the strongest hit: { result: MATCH|POSSIBLE|NONE, entry, matched_on, similarity, dob_comparison }
function screen(fullName, dob, entries, cfg) {
  const matchT = cfg.watchlist_match_threshold;
  const possibleT = cfg.watchlist_possible_threshold;
  let best = { result: 'NONE', entry: null, matched_on: null, similarity: 0, dob_comparison: null };

  for (const entry of entries) {
    const candidates = [entry.name, entry.alias].filter((n) => n && String(n).trim());
    for (const candidate of candidates) {
      const sim = similarity(fullName, candidate, cfg.name_title_tokens);
      let result = 'NONE';
      let dobComparison = null;
      if (sim >= matchT) {
        if (!entry.dob) {
          result = 'MATCH';
          dobComparison = 'LIST_DOB_EMPTY';
        } else if (entry.dob === dob) {
          result = 'MATCH';
          dobComparison = 'EQUAL';
        } else {
          result = 'POSSIBLE';
          dobComparison = 'DIFFERENT';
        }
      } else if (sim >= possibleT) {
        result = 'POSSIBLE';
        dobComparison = !entry.dob ? 'LIST_DOB_EMPTY' : entry.dob === dob ? 'EQUAL' : 'DIFFERENT';
      }
      if (result === 'NONE') continue;
      const stronger =
        STRENGTH[result] > STRENGTH[best.result] ||
        (STRENGTH[result] === STRENGTH[best.result] && sim > best.similarity);
      if (stronger) {
        best = { result, entry, matched_on: candidate, similarity: sim, dob_comparison: dobComparison };
      }
    }
  }
  return best;
}

module.exports = { screen };
