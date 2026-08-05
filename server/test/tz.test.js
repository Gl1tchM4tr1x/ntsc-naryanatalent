'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const tz = require('../src/tz');

test('IST parts shift a UTC instant by +5:30', () => {
  const parts = tz.istParts(new Date('2026-08-09T12:30:00Z')); // +5:30 => 18:00 IST
  assert.equal(parts.hours, 18);
  assert.equal(parts.minutes, 0);
  assert.equal(parts.weekday, 0);
});

test('FAKE_NOW overrides the clock', () => {
  process.env.FAKE_NOW = '2026-08-09T19:00:00+05:30';
  try {
    assert.equal(tz.istDate(), '2026-08-09');
    assert.equal(tz.istTime(), '19:00:00');
    assert.equal(tz.istNowIso().slice(0, 19), '2026-08-09T19:00:00');
  } finally {
    delete process.env.FAKE_NOW;
  }
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(tz.addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(tz.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(tz.addDays('2026-12-31', 1), '2027-01-01');
});

test('weekday helpers', () => {
  assert.equal(tz.weekdayOf('2026-08-03'), 1); // Monday
  assert.equal(tz.weekdayOf('2026-08-08'), 6); // Saturday
  assert.equal(tz.weekdayOf('2026-08-09'), 0); // Sunday
  assert.ok(tz.isWeekday('2026-08-03'));
  assert.ok(!tz.isWeekday('2026-08-08'));
  assert.ok(!tz.isWeekday('2026-08-09'));
});

test('mondayOf returns the Monday of the containing week', () => {
  assert.equal(tz.mondayOf('2026-08-03'), '2026-08-03'); // Monday itself
  assert.equal(tz.mondayOf('2026-08-07'), '2026-08-03'); // Friday
  assert.equal(tz.mondayOf('2026-08-09'), '2026-08-03'); // Sunday
});

test('isValidDateStr rejects bad values', () => {
  assert.ok(tz.isValidDateStr('2026-08-03'));
  assert.ok(!tz.isValidDateStr('2026-13-45'));
  assert.ok(!tz.isValidDateStr('foo'));
  assert.ok(!tz.isValidDateStr(''));
});

test('weekNumberIso for 2026-08-03 is 32', () => {
  assert.equal(tz.weekNumberIso('2026-08-03'), 32);
});
