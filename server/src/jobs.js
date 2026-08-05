'use strict';

const tz = require('./tz');
const generator = require('./generator');
const attendance = require('./attendance');

// Catch-up rule for timetables: the current week must exist (it should have
// been generated the previous Sunday). The next week is only required once
// Sunday 18:00 IST has passed (the weekly generation time).
function ensureTimetables(data, opts = {}) {
  const now = opts.instant || tz.nowInstant();
  const nowIso = opts.nowIso || tz.istNowIso(now);
  const today = nowIso.slice(0, 10);
  const currentWeekStart = tz.mondayOf(today);
  const nextWeekStart = tz.addDays(currentWeekStart, 7);
  const parts = tz.istParts(now);

  const required = [currentWeekStart];
  if (parts.weekday === 0 && parts.hours >= 18) {
    required.push(nextWeekStart);
  }

  const generated = [];
  let dataOut = data;
  for (const weekStart of required) {
    const result = generator.ensureWeek(dataOut, weekStart);
    dataOut = result.data;
    if (result.created) generated.push(weekStart);
  }
  return { generated, data: dataOut };
}

// Catch-up rule for attendance: on a weekday at/after 10:00 IST, make sure
// the update for today (and any missed weekdays since the last marker) has
// run once. Weekends and pre-10:00 are never touched.
function ensureAttendanceCatchUp(data, opts = {}) {
  const now = opts.instant || tz.nowInstant();
  const nowIso = opts.nowIso || tz.istNowIso(now);
  const today = nowIso.slice(0, 10);
  const parts = tz.istParts(now);
  if (!(parts.weekday >= 1 && parts.weekday <= 5)) {
    return { updated: false, reason: 'weekend', data };
  }
  if (parts.hours < 10) {
    return { updated: false, reason: 'before-10am', data };
  }
  return attendance.updateAttendance(data, { date: today, nowIso });
}

// Combined startup/on-demand safety check. Returns changed=false when there
// is nothing to do, so callers can skip persisting.
function runSafetyChecks(data, opts = {}) {
  const tt = ensureTimetables(data, opts);
  const att = ensureAttendanceCatchUp(tt.data, opts);
  return { data: att.data, changed: tt.generated.length > 0 || att.updated };
}

module.exports = { ensureTimetables, ensureAttendanceCatchUp, runSafetyChecks };
