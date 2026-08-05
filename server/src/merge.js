'use strict';

const { monthLabelToKey, parsePresent } = require('./attendance');

const SERVER_OWNED = [
  'timetables',
  'attendanceUpdatedFor',
  'lastAttendanceUpdateAt',
  'activeStudentSession',
  'activeAdminSession',
  'studentSessions',
  'auditLog',
  'dataVersion',
  'updated_at',
  'attendanceOverrides'
];

// Fields handled explicitly before the passthrough loop below.
const HANDLED_BEFORE_PASSTHROUGH = new Set([...SERVER_OWNED, 'timetable', 'attendance']);

// PUT /api/portal-data handler. Backward-compatible with the original
// endpoint (the frontend PUTs its merged document), but server-generated or
// server-tracked fields are never overwritten by stale frontend data:
//   - timetable rows whose dates belong to a stored generated week are kept;
//     client rows for other dates are accepted (e.g. admin additions).
//   - attendance entries for the current (protected) period come from the
//     server; client entries for older months are merged in if absent.
//   - timetables / attendance markers / session / overrides are server-owned.
function mergePortalData(serverData, incoming) {
  const src = incoming && typeof incoming === 'object' ? incoming : {};
  const out = { ...serverData };

  const managedDates = new Set(
    Object.values(out.timetables || {}).flatMap((w) => (w.rows || []).map((r) => r[0]))
  );
  if (Array.isArray(src.timetable)) {
    const merged = (out.timetable || []).slice();
    const seen = new Set(merged.map((r) => r.join('|')));
    for (const row of src.timetable) {
      if (!Array.isArray(row) || managedDates.has(row[0])) continue;
      const key = row.join('|');
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(row);
      }
    }
    out.timetable = merged;
  }

  if (Array.isArray(src.attendance)) {
    out.attendance = mergeAttendance(out, src.attendance);
  }

  for (const key of Object.keys(src)) {
    if (HANDLED_BEFORE_PASSTHROUGH.has(key)) continue;
    out[key] = src[key];
  }
  out.updated_at = new Date().toISOString();
  return out;
}

function mergeAttendance(serverData, clientList) {
  const serverList = serverData.attendance || [];
  const protectedKey = String(serverData.attendanceUpdatedFor || '').slice(0, 7);
  const out = serverList.slice();
  const seen = new Set(out.map((r) => r.month));
  for (const c of clientList) {
    if (!c || typeof c.month !== 'string') continue;
    const key = monthLabelToKey(c.month);
    if (key && protectedKey && key >= protectedKey) continue; // server wins for the current period
    if (!seen.has(c.month)) {
      seen.add(c.month);
      const parsed = parsePresent(c.value);
      out.push({ month: c.month, value: parsed ? `${parsed.present}/${parsed.total}` : String(c.value ?? '') });
    }
  }
  return out;
}

module.exports = { mergePortalData, mergeAttendance };
