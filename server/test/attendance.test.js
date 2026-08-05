'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const attendance = require('../src/attendance');

test('weekday update creates a month entry with default full attendance', () => {
  const r = attendance.updateAttendance({}, { date: '2026-08-05' });
  assert.equal(r.updated, true);
  assert.equal(r.attendanceUpdatedFor, '2026-08-05');
  const entry = r.data.attendance.find((x) => x.month === 'August 2026');
  assert.equal(entry.value, '3/3');
});

test('running twice on the same date is idempotent', () => {
  const r1 = attendance.updateAttendance({}, { date: '2026-08-05' });
  const r2 = attendance.updateAttendance(r1.data, { date: '2026-08-05' });
  assert.equal(r2.updated, false);
  assert.equal(r2.reason, 'already-updated');
  assert.deepEqual(r2.data.attendance, r1.data.attendance);
});

test('weekend is never updated', () => {
  const r = attendance.updateAttendance({}, { date: '2026-08-08' });
  assert.equal(r.updated, false);
  assert.equal(r.reason, 'weekend');
});

test('multiple missed days are caught up without double counting', () => {
  const step1 = attendance.updateAttendance({}, { date: '2026-08-03' }); // 1/1
  assert.equal(step1.data.attendance[0].value, '1/1');
  const r = attendance.updateAttendance(step1.data, { date: '2026-08-07' });
  assert.equal(r.updated, true);
  assert.deepEqual(r.processedDates, ['2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']);
  const entry = r.data.attendance.find((x) => x.month === 'August 2026');
  assert.equal(entry.value, '5/5'); // full-attendance default, total grows to 5 elapsed weekdays
});

test('a marker without a stored entry still assumes prior days were attended', () => {
  const data = { attendanceUpdatedFor: '2026-08-03' };
  const r = attendance.updateAttendance(data, { date: '2026-08-07' });
  const entry = r.data.attendance.find((x) => x.month === 'August 2026');
  assert.equal(entry.value, '5/5');
});

test('an attendanceOverride pins present across a catch-up batch', () => {
  const data = { attendanceUpdatedFor: '2026-08-03', attendanceOverrides: { '2026-08': 2 } };
  const r = attendance.updateAttendance(data, { date: '2026-08-07' });
  const entry = r.data.attendance.find((x) => x.month === 'August 2026');
  assert.equal(entry.value, '2/5');
});

test('recorded absences are preserved when totals grow', () => {
  const data = {
    attendance: [{ month: 'August 2026', value: '1/3' }],
    attendanceUpdatedFor: '2026-08-05'
  };
  const r = attendance.updateAttendance(data, { date: '2026-08-10' });
  const entry = r.data.attendance.find((x) => x.month === 'August 2026');
  assert.equal(entry.value, '4/6'); // base 1 + 3 newly processed days, total 6
});

test('values never exceed total and never go negative', () => {
  const r = attendance.updateAttendance({}, { date: '2026-08-05' });
  for (const row of r.data.attendance) {
    const m = /^(\d+)\/(\d+)$/.exec(row.value);
    assert.ok(m, `bad value ${row.value}`);
    assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= Number(m[2]));
  }
});

test('attendanceOverrides pin present', () => {
  const r = attendance.updateAttendance({ attendanceOverrides: { '2026-08': 2 } }, { date: '2026-08-05' });
  const entry = r.data.attendance.find((x) => x.month === 'August 2026');
  assert.equal(entry.value, '2/3');
});

test('month boundary creates a new entry and preserves the old one', () => {
  let data = {};
  data = attendance.updateAttendance(data, { date: '2026-08-31' }).data;
  const r = attendance.updateAttendance(data, { date: '2026-09-01' });
  const sep = r.data.attendance.find((x) => x.month === 'September 2026');
  assert.equal(sep.value, '1/1');
  assert.ok(r.data.attendance.some((x) => x.month === 'August 2026'));
});

test('weekdayCountInMonth counts only Mon-Fri', () => {
  assert.equal(attendance.weekdayCountInMonth('2026-08-07'), 5);
  assert.equal(attendance.weekdayCountInMonth('2026-08-08'), 5); // Saturday adds nothing
  assert.equal(attendance.weekdayCountInMonth('2026-08-10'), 6); // next Monday counts
});

test('month helpers', () => {
  assert.equal(attendance.monthKey('2026-08-05'), '2026-08');
  assert.equal(attendance.monthLabel('2026-08-05'), 'August 2026');
  assert.equal(attendance.monthLabelToKey('August 2026'), '2026-08');
  assert.equal(attendance.monthLabelToKey('january 2027'), '2027-01');
  assert.equal(attendance.monthLabelToKey('Not a month'), null);
});
