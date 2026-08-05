'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createStore } = require('../src/store');
const { createJobRunners } = require('../src/jobRunners');

process.env.FAKE_NOW = '2026-08-10T11:00:00+05:30'; // Monday after 10:00 IST

function makeStore(seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntsc-jobs-'));
  const seedPath = path.join(dir, 'seed.json');
  const storePath = path.join(dir, 'store.json');
  fs.writeFileSync(seedPath, JSON.stringify(seed));
  const store = createStore({ filePath: storePath, seedPath });
  return store.init().then(() => store);
}

const SEED = {
  student: { name: 'S', mobile: '1' },
  attendance: [{ month: 'August 2026', value: '3/3' }],
  timetable: [['2026-08-10', '08:30 to 10:00', 'Regular Class', 'Physics Track-1']],
  timetableWeekStart: '2026-08-10',
  tests: [],
  results: {}
};

test('startup catch-up preserves the document shape (regression for wrapped store)', async () => {
  const store = await makeStore(SEED);
  const runners = createJobRunners(store);
  const result = await runners.runStartupCatchUp();
  const d = store.getData();

  assert.equal(result.summary.changed, true);
  assert.ok(d.student && d.student.name === 'S');
  assert.ok(Array.isArray(d.timetable));
  // seed row for 2026-08-10 preserved + generated rows appended (no loss)
  assert.equal(d.timetable.filter((r) => r[0] === '2026-08-10').length, 5);
  assert.ok(d.timetable.some((r) => r[0] === '2026-08-10' && r[3] === 'Physics Track-1'));
  assert.equal(d.attendanceUpdatedFor, '2026-08-10');
  assert.ok(d.timetables['2026-08-10']);
  assert.equal(typeof d, 'object');
  assert.ok(!('data' in d), 'document must not be wrapped under a data key');
});

test('running the job runners twice is idempotent', async () => {
  const store = await makeStore(SEED);
  const runners = createJobRunners(store);
  await runners.runStartupCatchUp();
  const before = store.getData();
  await runners.runTimetableJob();
  await runners.runAttendanceJob();
  const after = store.getData();
  assert.deepEqual(after.timetable, before.timetable);
  assert.equal(after.attendanceUpdatedFor, before.attendanceUpdatedFor);
});

test('timetable job generates the next week on Sunday after 18:00', async () => {
  process.env.FAKE_NOW = '2026-08-09T18:30:00+05:30'; // Sunday evening
  try {
    const store = await makeStore({ ...SEED, timetable: [], timetableWeekStart: undefined });
    const runners = createJobRunners(store);
    await runners.runStartupCatchUp();
    const d = store.getData();
    assert.deepEqual(Object.keys(d.timetables).sort(), ['2026-08-03', '2026-08-10']);
    assert.equal(d.timetables['2026-08-10'].rows.length, 20);
  } finally {
    process.env.FAKE_NOW = '2026-08-10T11:00:00+05:30';
  }
});
