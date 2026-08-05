'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const generator = require('../src/generator');

test('buildWeekRows produces 20 rows covering Mon-Fri', () => {
  const rows = generator.buildWeekRows('2026-08-10');
  assert.equal(rows.length, 20);
  const dates = [...new Set(rows.map((r) => r[0]))];
  assert.deepEqual(dates, ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14']);
  for (const r of rows) {
    assert.ok(Array.isArray(r) && r.length === 6);
    assert.match(r[1], /^\d{2}:\d{2} to \d{2}:\d{2}$/);
    assert.ok(r[2] === 'Regular Class' || r[2] === 'Doubt Class');
    assert.ok(typeof r[4] === 'string' && r[4].length > 0);
    assert.ok(typeof r[5] === 'string' && r[5].length > 0);
  }
});

test('buildWeekRows is deterministic', () => {
  assert.deepEqual(generator.buildWeekRows('2026-08-10'), generator.buildWeekRows('2026-08-10'));
});

test('different weeks produce different schedules', () => {
  const a = generator.buildWeekRows('2026-08-10');
  const b = generator.buildWeekRows('2026-08-17');
  assert.notDeepEqual(a.map((r) => r[3]), b.map((r) => r[3]));
});

test('every day has all three subjects exactly once in regular slots', () => {
  const rows = generator.buildWeekRows('2026-08-10');
  for (let day = 0; day < 5; day++) {
    const subjects = rows.slice(day * 4, day * 4 + 3).map((r) => r[3].split(' ')[0]);
    assert.deepEqual([...new Set(subjects)].sort(), ['Chemistry', 'Maths', 'Physics']);
  }
});

test('ensureWeek stores metadata and is idempotent', () => {
  const data = {};
  const r1 = generator.ensureWeek(data, '2026-08-10', generator.DEFAULT_CONFIG, '2026-08-09T18:00:00.000+05:30');
  assert.equal(r1.created, true);
  assert.equal(r1.meta.weekStart, '2026-08-10');
  assert.equal(r1.meta.weekEnd, '2026-08-14');
  assert.equal(r1.meta.generationVersion, 2);
  assert.equal(r1.meta.generatedAt, '2026-08-09T18:00:00.000+05:30');
  assert.equal(r1.meta.rows.length, 20);
  assert.equal(r1.data.timetable.length, 20);
  assert.equal(r1.data.timetableWeekStart, '2026-08-10');

  const r2 = generator.ensureWeek(r1.data, '2026-08-10', generator.DEFAULT_CONFIG, '2026-08-09T18:05:00.000+05:30');
  assert.equal(r2.created, false);
  assert.equal(r2.meta.generatedAt, '2026-08-09T18:00:00.000+05:30'); // original kept
  assert.equal(r2.data.timetable.length, 20); // no duplicate rows added
  assert.ok(r2.data.timetables['2026-08-10']);
});

test('generating two weeks merges flat rows without duplicates', () => {
  let data = {};
  data = generator.ensureWeek(data, '2026-08-10').data;
  data = generator.ensureWeek(data, '2026-08-17').data;
  assert.equal(data.timetable.length, 40);
  assert.equal(new Set(data.timetable.map((r) => r.join('|'))).size, 40);
  assert.equal(data.timetableWeekStart, '2026-08-17');
});

test('upsertFlatRows never duplicates', () => {
  const rows = generator.buildWeekRows('2026-08-10');
  const merged = generator.upsertFlatRows(rows, rows);
  assert.equal(merged.length, rows.length);
});
