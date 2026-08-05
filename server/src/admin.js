'use strict';

// Validated, atomic mutations for the Admin Portal API. Each function is a
// pure store mutator: given `data` it returns the next document (or the same
// reference when nothing changed), throwing a descriptive Error on bad input.
// The routes wrap them in store.replace(), which persists atomically.

const tz = require('./tz');
const { monthLabelToKey, monthLabel, parsePresent } = require('./attendance');

const CLASS_TYPES = ['Regular Class', 'Doubt Class'];
const STUDENT_FIELDS = ['name', 'email', 'mobile', 'goal', 'currentClass', 'studentId', 'batch', 'registration'];

function validTime(t) {
  const m = /^(\d{1,2}):(\d{2})\s+to\s+(\d{1,2}):(\d{2})$/i.exec(String(t).trim());
  if (!m) return false;
  const [h1, n1, h2, n2] = m.slice(1).map(Number);
  return h1 <= 23 && n1 <= 59 && h2 <= 23 && n2 <= 59;
}

// Minutes since midnight for a valid "HH:mm to HH:mm" range, or null.
function timeRangeMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})\s+to\s+(\d{1,2}):(\d{2})$/i.exec(String(t).trim());
  if (!m) return null;
  const [h1, n1, h2, n2] = m.slice(1).map(Number);
  if (h1 > 23 || n1 > 59 || h2 > 23 || n2 > 59) return null;
  const start = h1 * 60 + n1;
  const end = h2 * 60 + n2;
  if (end <= start) return null;
  return { start, end };
}

// A flat timetable row: [date, "HH:mm to HH:mm", "Class Type", "Subject Track"]
// with optional teacher (index 4) and room (index 5). Legacy rows without a
// teacher/room are still accepted so existing data keeps working.
function isRow(row) {
  return (
    Array.isArray(row) &&
    (row.length === 4 || row.length === 6) &&
    tz.isValidDateStr(row[0]) &&
    typeof row[1] === 'string' &&
    validTime(row[1]) &&
    typeof row[2] === 'string' &&
    typeof row[3] === 'string' &&
    row[2].trim() &&
    row[3].trim()
  );
}

// Normalize to the 6-column shape [date, time, type, subject, teacher, room].
function normalizeRow(row) {
  return [row[0], row[1].trim().replace(/\s+/g, ' '), row[2].trim(), row[3].trim(), row[4] ? String(row[4]).trim() : '', row[5] ? String(row[5]).trim() : ''];
}

// Strict per-day validation (Part 7). Every active weekday must have exactly:
//   3 Regular Class + 1 Doubt Class = 4 sessions.
// No overlaps, no duplicates, no invalid times, no weekend dates.
// Returns null when valid, otherwise a human-readable error message.
function validateDayRows(rows, date) {
  if (!tz.isValidDateStr(date)) return 'invalid date';
  if (!tz.isWeekday(date)) return 'classes are only scheduled on weekdays (Mon-Fri)';
  if (!Array.isArray(rows) || rows.length !== 4) return 'exactly 4 sessions required (3 regular classes + 1 doubt session)';
  const byType = { 'Regular Class': 0, 'Doubt Class': 0, Other: 0 };
  const seen = new Set();
  const ranges = [];
  for (const row of rows) {
    if (!isRow(row)) return 'invalid row';
    if (row[0] !== date) return 'all sessions must be on the same date';
    const key = row.join('|');
    if (seen.has(key)) return 'duplicate session';
    seen.add(key);
    const type = String(row[2] || '').trim();
    if (!(type in byType)) return 'invalid class type';
    byType[type] += 1;
    const range = timeRangeMinutes(row[1]);
    if (!range) return 'invalid time range';
    ranges.push(range);
  }
  if (byType['Regular Class'] !== 3) return 'exactly 3 regular classes required';
  if (byType['Doubt Class'] !== 1) return 'exactly 1 doubt session required';
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) return 'sessions must not overlap';
  }
  return null;
}

// Keep a stored generated week's meta.rows in sync with the flat timetable:
// admin edits to a generated date must be reflected when the week is served.
// Week rows are sorted by date then by class start time for stable output.
function syncWeekMeta(data, date) {
  const timetables = data.timetables || {};
  let changed = false;
  const nextTt = {};
  for (const [weekStart, meta] of Object.entries(timetables)) {
    if (weekStart <= date && date <= (meta.weekEnd || weekStart)) {
      const weekRows = (data.timetable || [])
        .filter((r) => r[0] >= weekStart && r[0] <= (meta.weekEnd || weekStart))
        .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0) : a[0] < b[0] ? -1 : 1));
      nextTt[weekStart] = { ...meta, rows: weekRows };
      changed = true;
    } else {
      nextTt[weekStart] = meta;
    }
  }
  return changed ? { ...data, timetables: nextTt } : data;
}

function replaceDateRows(data, date, rows) {
  const clean = rows.map(normalizeRow);
  const kept = (data.timetable || []).filter((r) => r[0] !== date);
  return syncWeekMeta({ ...data, timetable: kept.concat(clean) }, date);
}

function deleteDate(data, date) {
  return syncWeekMeta({ ...data, timetable: (data.timetable || []).filter((r) => r[0] !== date) }, date);
}

function upsertTest(data, test) {
  const id = String(test.id ?? '').trim();
  const existing = (data.tests || []).find((t) => t.id === id);
  const clean = {
    id,
    name: String(test.name ?? '').trim(),
    date: String(test.date ?? existing?.date ?? '').trim(),
    type: String(test.type ?? existing?.type ?? '').trim(),
    duration: String(test.duration ?? existing?.duration ?? '').trim(),
    status: String(test.status ?? existing?.status ?? '').trim()
  };
  if (!clean.id || !clean.name) throw new Error('test id and name are required');
  const tests = (data.tests || []).slice();
  const idx = tests.findIndex((t) => t.id === clean.id);
  if (idx === -1) tests.push(clean);
  else tests[idx] = clean;
  return { ...data, tests };
}

function removeTest(data, id) {
  return { ...data, tests: (data.tests || []).filter((t) => t.id !== id) };
}

function toNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function saveResult(data, id, result) {
  const base = (data.results && data.results[id]) || {};
  const clean = {
    name: String(result.name ?? base.name ?? ''),
    attemptDate: String(result.attemptDate ?? base.attemptDate ?? ''),
    marks: toNum(result.marks, base.marks ?? 0),
    maxMarks: toNum(result.maxMarks, base.maxMarks ?? 0),
    rank: toNum(result.rank, base.rank ?? 0),
    percentile: String(result.percentile ?? base.percentile ?? ''),
    avgMarks: String(result.avgMarks ?? base.avgMarks ?? ''),
    percentage: String(result.percentage ?? base.percentage ?? ''),
    correct: toNum(result.correct, base.correct ?? 0),
    incorrect: toNum(result.incorrect, base.incorrect ?? 0),
    attempted: toNum(result.attempted, base.attempted ?? 0),
    unattempted: toNum(result.unattempted, base.unattempted ?? 0),
    showLeaderBoard: Boolean(result.showLeaderBoard ?? base.showLeaderBoard ?? false),
    rows: Array.isArray(result.rows)
      ? result.rows.map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '')) : row))
      : (base.rows || []).map((row) => (Array.isArray(row) ? row.slice() : row))
  };
  const results = { ...(data.results || {}), [id]: clean };
  return { ...data, results };
}

function upsertCalendarEntry(data, entry, idx) {
  const clean = [0, 1, 2, 3].map((i) => String(entry[i] ?? '').trim());
  if (!clean[0]) throw new Error('exam name is required');
  const list = (data.examCalendar || []).slice();
  if (Number.isInteger(idx) && idx >= 0 && idx < list.length) list[idx] = clean;
  else list.push(clean);
  return { ...data, examCalendar: list };
}

function removeCalendarEntry(data, idx) {
  const list = (data.examCalendar || []).slice();
  if (Number.isInteger(idx) && idx >= 0 && idx < list.length) list.splice(idx, 1);
  return { ...data, examCalendar: list };
}

function updateStudent(data, student) {
  const next = { ...(data.student || {}) };
  for (const key of STUDENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(student, key)) {
      next[key] = String(student[key] ?? '').trim();
    }
  }
  return { ...data, student: next };
}

// ---- Attendance overrides -------------------------------------------------
// Values may be:
//   - a number (present pin, backward compatible)  e.g. { "2026-08": 15 }
//   - an object { present, total }                 e.g. { "2026-08": { present: 12, total: 20 } }
//   - null / '' deletes the pin for that month.
function parseOverrideValue(value) {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const present = value.present === null || value.present === '' || value.present === undefined ? null : Number(value.present);
    const total = value.total === null || value.total === '' || value.total === undefined ? null : Number(value.total);
    const ok = (present === null || Number.isFinite(present)) && (total === null || Number.isFinite(total));
    if (!ok) return { error: 'present and total must be numbers' };
    if (present !== null && present < 0) return { error: 'present must be >= 0' };
    if (total !== null && total < 1) return { error: 'total must be >= 1' };
    if (present !== null && total !== null && present > total) return { error: 'present cannot exceed total' };
    return { present: present === null ? null : Math.trunc(present), total: total === null ? null : Math.trunc(total) };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10000) return { error: 'invalid override value' };
  return { present: Math.trunc(n), total: null };
}

function setAttendanceOverrides(data, overrides) {
  const existing = { ...(data.attendanceOverrides || {}) };
  for (const [key, value] of Object.entries(overrides)) {
    const parsed = parseOverrideValue(value);
    if (parsed && parsed.error) throw new Error(parsed.error);
    if (parsed === null) {
      delete existing[key];
      continue;
    }
    existing[key] = parsed;
  }
  return { ...data, attendanceOverrides: existing };
}

// Manual full-record edit (Part 11). `key` is a month key like "2026-08".
// Sets both the display record and a pin so the automatic job never
// overwrites the admin's manual value. Returns the normalized record.
function setAttendanceRecord(data, key, present, total) {
  const parsed = parseOverrideValue({ present: present ?? null, total: total ?? null });
  if (parsed.error) throw new Error(parsed.error);
  const [y, m] = String(key).split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) throw new Error('invalid month key');
  const label = monthLabel(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`);
  const finalTotal = parsed.total ?? Math.max(1, parsed.present ?? 0);
  const finalPresent = Math.min(parsed.present ?? finalTotal, finalTotal);
  const value = `${finalPresent}/${finalTotal}`;
  const next = {
    ...data,
    attendance: upsertRecord(data.attendance || [], label, value),
    attendanceOverrides: { ...(data.attendanceOverrides || {}), [key]: { present: finalPresent, total: finalTotal } }
  };
  return { data: next, record: { month: label, value, key, present: finalPresent, total: finalTotal } };
}

function upsertRecord(list, label, value) {
  const out = (list || []).filter((r) => r.month !== label);
  out.push({ month: label, value });
  return out;
}

function removeAttendanceRecord(data, key) {
  const [y, m] = String(key).split('-').map(Number);
  const label = y && m ? monthLabel(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`) : null;
  const overrides = { ...(data.attendanceOverrides || {}) };
  delete overrides[key];
  const next = { ...data, attendanceOverrides: overrides };
  if (label) next.attendance = (next.attendance || []).filter((r) => r.month !== label);
  return next;
}

// ---- Audit log ------------------------------------------------------------
// Internal, admin-only trail: who changed what and when. Never sent to the
// Student Portal. Entries are capped to keep the document small.
function addAudit(data, actor, action, target, detail) {
  const entry = { at: new Date().toISOString(), actor: String(actor || 'admin'), action, target: target ?? null, detail: detail ?? null };
  return { ...data, auditLog: [...((data.auditLog || []).slice(-499)), entry] };
}

// ---- Student session management ------------------------------------------
function registerStudentSession(data, session) {
  const list = (data.studentSessions || []).filter((s) => s && s.token !== session.token);
  list.push(session);
  return { ...data, studentSessions: list.slice(-20) };
}

function touchSession(data, token) {
  if (!token) return data;
  const list = (data.studentSessions || []).map((s) =>
    s.token === token ? { ...s, lastActivityAt: new Date().toISOString() } : s
  );
  return { ...data, studentSessions: list };
}

function revokeStudentSession(data, token) {
  return {
    ...data,
    studentSessions: (data.studentSessions || []).filter((s) => s.token !== token),
    activeStudentSession: data.activeStudentSession && data.activeStudentSession.token === token ? null : data.activeStudentSession
  };
}

function revokeAllStudentSessions(data) {
  return { ...data, studentSessions: [], activeStudentSession: null };
}

module.exports = {
  CLASS_TYPES,
  STUDENT_FIELDS,
  validTime,
  timeRangeMinutes,
  isRow,
  normalizeRow,
  validateDayRows,
  syncWeekMeta,
  replaceDateRows,
  deleteDate,
  upsertTest,
  removeTest,
  saveResult,
  upsertCalendarEntry,
  removeCalendarEntry,
  updateStudent,
  setAttendanceOverrides,
  parseOverrideValue,
  setAttendanceRecord,
  removeAttendanceRecord,
  addAudit,
  registerStudentSession,
  touchSession,
  revokeStudentSession,
  revokeAllStudentSessions
};
