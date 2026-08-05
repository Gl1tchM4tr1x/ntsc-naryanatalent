'use strict';

const tz = require('./tz');

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function monthKey(dateStr) {
  return String(dateStr).slice(0, 7);
}

function monthLabel(dateStr) {
  const [y, m] = String(dateStr).split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${y}`;
}

function monthLabelToKey(label) {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(String(label || '').trim());
  if (!m) return null;
  const idx = MONTH_LABELS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
  if (idx === -1) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
}

// Number of Mon-Fri days from the 1st of the month through `dateStr`.
function weekdayCountInMonth(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  let count = 0;
  for (let day = 1; day <= d; day++) {
    const weekday = new Date(Date.UTC(y, m - 1, day)).getUTCDay();
    if (weekday >= 1 && weekday <= 5) count++;
  }
  return count;
}

function parsePresent(value) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(value || ''));
  return m ? { present: Number(m[1]), total: Number(m[2]) } : null;
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return max;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function upsertAttendance(list, label, value) {
  const out = (list || []).filter((r) => r.month !== label);
  out.push({ month: label, value });
  return out;
}

// Compute the new cumulative value for a single working date. The monthly
// record is `present/total`: total grows with each elapsed working day, and
// present grows alongside it (default = every class attended) unless an
// attendanceOverride pins the present count (and optionally the total).
// Present never decreases and can never exceed total, so percentages stay
// within 0-100.
function applyDate(data, dateStr, state) {
  const key = monthKey(dateStr);
  const label = monthLabel(dateStr);
  let total = Math.max(1, weekdayCountInMonth(dateStr));
  const overrideRaw = data.attendanceOverrides ? data.attendanceOverrides[key] : undefined;
  const override =
    overrideRaw !== undefined && overrideRaw !== null
      ? typeof overrideRaw === 'object'
        ? { present: overrideRaw.present, total: overrideRaw.total }
        : { present: Number(overrideRaw), total: null }
      : null;
  if (override && Number.isFinite(Number(override.total)) && Number(override.total) >= 1) {
    total = Math.trunc(Number(override.total));
  }
  let present;
  if (override && Number.isFinite(Number(override.present))) {
    present = clamp(Number(override.present), 0, total);
  } else {
    if (!state.has(key)) {
      const existing = (data.attendance || []).find((r) => r.month === label);
      const parsed = existing ? parsePresent(existing.value) : null;
      // Base present for a month without a record = weekdays elapsed before
      // this batch started (the student is assumed present for all of them).
      const base = parsed ? parsed.present : weekdayCountInMonth(tz.addDays(dateStr, -1));
      state.set(key, { base, processed: 0 });
    }
    const s = state.get(key);
    present = clamp(s.base + s.processed + 1, 0, total);
    s.processed += 1;
  }
  return { key, label, value: `${present}/${total}` };
}

function listWeekdaysBetween(fromDateStr, toDateStr) {
  const out = [];
  let d = fromDateStr;
  let guard = 0;
  while (d <= toDateStr && guard < 5000) {
    if (tz.isWeekday(d)) out.push(d);
    d = tz.addDays(d, 1);
    guard++;
  }
  return out;
}

// Idempotent cumulative attendance update. Only processes weekdays strictly
// after attendanceUpdatedFor (inclusive of `date` itself when it is the first
// run for that date), so a date is never double-counted and a long downtime
// is caught up without corruption.
function updateAttendance(data, opts = {}) {
  const nowIso = opts.nowIso || tz.istNowIso();
  const today = opts.date || nowIso.slice(0, 10);
  if (!tz.isWeekday(today)) {
    return { updated: false, reason: 'weekend', attendanceUpdatedFor: data.attendanceUpdatedFor, data };
  }
  const marker = data.attendanceUpdatedFor || null;
  if (marker && marker >= today) {
    return { updated: false, reason: 'already-updated', attendanceUpdatedFor: marker, data };
  }

  const datesToProcess = marker ? listWeekdaysBetween(tz.addDays(marker, 1), today) : [today];
  let next = { ...data, attendance: (data.attendance || []).slice() };
  const state = new Map();
  for (const d of datesToProcess) {
    const result = applyDate(next, d, state);
    next = { ...next, attendance: upsertAttendance(next.attendance, result.label, result.value) };
  }

  next = { ...next, attendanceUpdatedFor: today, lastAttendanceUpdateAt: nowIso };
  return { updated: true, processedDates: datesToProcess, attendanceUpdatedFor: today, data: next };
}

module.exports = {
  MONTH_LABELS,
  monthKey,
  monthLabel,
  monthLabelToKey,
  weekdayCountInMonth,
  parsePresent,
  applyDate,
  listWeekdaysBetween,
  updateAttendance
};
