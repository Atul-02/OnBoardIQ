// Calendar-date helpers. All dates are plain 'YYYY-MM-DD' strings (IST calendar dates),
// so there are no time-zone surprises.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function parts(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function toUtcMs(s) {
  const { y, m, d } = parts(s);
  return Date.UTC(y, m - 1, d);
}

// Whole days from a to b (b - a).
function daysBetween(a, b) {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86400000);
}

// Completed years on the given date.
function ageOn(dob, onDate) {
  const b = parts(dob);
  const o = parts(onDate);
  let age = o.y - b.y;
  if (o.m < b.m || (o.m === b.m && o.d < b.d)) age -= 1;
  return age;
}

// date + n years; 29 February moves to 28 February.
function addYears(s, n) {
  const { y, m, d } = parts(s);
  const day = m === 2 && d === 29 ? 28 : d;
  return `${String(y + n).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Today's calendar date in India (UTC+5:30).
function todayIST() {
  const now = new Date(Date.now() + 330 * 60000);
  return now.toISOString().slice(0, 10);
}

module.exports = { isIsoDate, daysBetween, ageOn, addYears, todayIST };
