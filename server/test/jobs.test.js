'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const jobs = require('../src/jobs');

test('Sunday before 18:00: only the current week is required', () => {
  const instant = new Date('2026-08-09T17:00:00+05:30');
  const r = jobs.ensureTimetables({}, { instant });
  assert.deepEqual(r.generated, ['2026-08-03']);
  assert.equal(r.data.timetables['2026-08-10'], undefined);
});

test('Sunday at/after 18:00: the next week is also generated', () => {
  const instant = new Date('2026-08-09T18:00:00+05:30');
  const r = jobs.ensureTimetables({}, { instant });
  assert.deepEqual(r.generated.sort(), ['2026-08-03', '2026-08-10'].sort());
  assert.ok(r.data.timetables['2026-08-10']);
});

test('server offline during Sunday 18:00 and restarted Monday: current week generated', () => {
  const instant = new Date('2026-08-10T09:00:00+05:30');
  const r = jobs.ensureTimetables({}, { instant });
  assert.deepEqual(r.generated, ['2026-08-10']);
});

test('an already existing timetable is never regenerated', () => {
  const data = { timetables: { '2026-08-10': { weekStart: '2026-08-10', rows: [] } } };
  const r = jobs.ensureTimetables(data, { instant: new Date('2026-08-10T09:00:00+05:30') });
  assert.deepEqual(r.generated, []);
});

test('weekday before 10:00: attendance is not updated', () => {
  const r = jobs.ensureAttendanceCatchUp({}, { instant: new Date('2026-08-05T09:59:00+05:30') });
  assert.equal(r.updated, false);
  assert.equal(r.reason, 'before-10am');
});

test('weekday at 10:00: attendance updated once, later runs no-op', () => {
  const r1 = jobs.ensureAttendanceCatchUp({}, { instant: new Date('2026-08-05T10:00:00+05:30') });
  assert.equal(r1.updated, true);
  assert.equal(r1.data.attendanceUpdatedFor, '2026-08-05');
  const r2 = jobs.ensureAttendanceCatchUp(r1.data, { instant: new Date('2026-08-05T11:30:00+05:30') });
  assert.equal(r2.updated, false);
});

test('Saturday and Sunday are never updated', () => {
  assert.equal(jobs.ensureAttendanceCatchUp({}, { instant: new Date('2026-08-08T12:00:00+05:30') }).updated, false);
  assert.equal(jobs.ensureAttendanceCatchUp({}, { instant: new Date('2026-08-09T12:00:00+05:30') }).updated, false);
});

test('offline for several working days: caught up in one go, no double count', () => {
  const data = { attendanceUpdatedFor: '2026-08-03' };
  const r = jobs.ensureAttendanceCatchUp(data, { instant: new Date('2026-08-07T10:00:00+05:30') });
  assert.equal(r.updated, true);
  assert.equal(r.data.attendanceUpdatedFor, '2026-08-07');
  const entry = r.data.attendance.find((x) => x.month === 'August 2026');
  assert.equal(entry.value, '5/5');
});

test('runSafetyChecks reports changed=false when everything is current', () => {
  const data = {
    timetables: { '2026-08-10': { weekStart: '2026-08-10', rows: [] } },
    attendanceUpdatedFor: '2026-08-10'
  };
  const r = jobs.runSafetyChecks(data, { instant: new Date('2026-08-10T11:00:00+05:30') });
  assert.equal(r.changed, false);
});

test('runSafetyChecks catches up both timetable and attendance', () => {
  const r = jobs.runSafetyChecks({}, { instant: new Date('2026-08-10T11:00:00+05:30') });
  assert.equal(r.changed, true);
  assert.equal(r.data.timetables['2026-08-10'].weekStart, '2026-08-10');
  assert.equal(r.data.attendanceUpdatedFor, '2026-08-10');
});
