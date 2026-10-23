// Turns a rule's "detail" object from the engine into one readable line, showing the values compared.

const n4 = (x) => (x === null || x === undefined ? '—' : Number(x).toFixed(4));
const conf = (x) => (x === null || x === undefined ? 'missing' : Number(x).toFixed(2));

function hit(d) {
  if (!d || d.result === 'NONE') return 'No match on the list';
  const dob = d.list_dob ? `list DOB ${d.list_dob} (${d.dob_comparison})` : 'list DOB empty';
  return `${d.result}: ${d.entry_id} "${d.entry_name}" matched on "${d.matched_on}", similarity ${n4(d.similarity)}, ${dob}`;
}

export function describeRule(r) {
  const d = r.detail || {};
  if (r.status === 'SKIPPED') return `Not evaluated: ${d.reason || 'field not usable'}`;

  switch (r.rule) {
    case 'R1':
      return d.missing?.length ? `Missing: ${d.missing.join(', ')}` : 'PAN, Aadhaar and address proof present';
    case 'R2':
      return d.mismatches?.length
        ? d.mismatches.map((m) => `${m.doc_id}: declared ${m.declared}, classified ${m.classified}`).join('; ')
        : 'All documents match their declared type';
    case 'R3': {
      const items = [...(d.low_doc_type || []), ...(d.low_fields || [])];
      return items.length
        ? items.map((i) => `${i.doc_id} ${i.field}${i.value ? ` "${i.value}"` : ''} (confidence ${conf(i.confidence)})`).join('; ')
        : 'All required fields read with enough confidence';
    }
    case 'R4':
      return `Age ${d.age} on application date (minimum ${d.min_age})`;
    case 'R5':
      return `Declared ${d.declared}: format ${d.format_ok ? 'OK' : 'invalid'}, holder type ${d.holder_type_ok ? 'P (individual)' : 'not P'}`;
    case 'R6':
    case 'R8':
    case 'R14':
      return `Declared ${d.declared} vs document ${d.on_document} (${d.doc_id})`;
    case 'R7':
      return `Declared ${d.declared} vs ${(d.compared || []).map((c) => `${c.source} ${c.value}`).join(', ')}`;
    case 'R9':
    case 'R11':
      return `Score ${n4(d.name_match_score)}: declared "${d.declared}" vs ${(d.comparisons || [])
        .map((c) => `${c.source} "${c.value}" (${n4(c.similarity)})`)
        .join(', ')}`;
    case 'R10':
    case 'R15':
    case 'R16':
      return hit(d);
    case 'R12':
      return `Valid until ${d.valid_until}, application date ${d.application_date} (${d.doc_id})`;
    case 'R13':
      return `Dated ${d.document_date}, ${d.age_days} days before application (max ${d.max_age_days}) (${d.doc_id})`;
    case 'R17':
      return `Declared PAN ${d.declared} ${r.status === 'TRIGGERED' ? 'already exists' : 'not found'} in existing customers`;
    default:
      return JSON.stringify(d);
  }
}
