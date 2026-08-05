'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createStore } = require('../src/store');
const { createApp } = require('../src/app');

process.env.FAKE_NOW = '2026-08-10T11:00:00+05:30'; // Monday after 10:00 IST

const ADMIN_HEADERS = { 'Content-Type': 'application/json', 'x-admin-token': 'test-token' };
const APP_CFG = { adminToken: 'test-token', nodeEnv: 'test', adminUsername: 'devanshu', adminPassword: 'Thors!1068' };

function makeSeed() {
  return {
    student: {
      name: 'TEST STUDENT',
      email: 't@example.com',
      mobile: '9530135914',
      goal: 'JEE',
      currentClass: '12 Passed',
      studentId: '123',
      batch: 'B',
      registration: 'R'
    },
    attendance: [{ month: 'August 2026', value: '3/3' }],
    dashboardDate: '2026-08-10',
    timetable: [
      ['2026-08-10', '08:30 to 10:00', 'Regular Class', 'Physics Track-1'],
      ['2026-08-11', '10:15 to 11:45', 'Regular Class', 'Chemistry Track-2']
    ],
    timetableWeekStart: '2026-08-10',
    timetables: {
      '2026-08-10': {
        weekStart: '2026-08-10',
        weekEnd: '2026-08-14',
        generatedAt: '2026-08-02T12:30:00.000+05:30',
        generationVersion: 1,
        rows: [['2026-08-10', '08:30 to 10:00', 'Regular Class', 'Physics Track-1']]
      }
    },
    attendanceOverrides: {},
    tests: [
      { id: 'it1', name: 'JEE INTERNAL TEST-1', date: '31/05/2026<br>09:00 am', type: 'Non live', duration: '180 min', status: 'Closed' }
    ],
    results: {
      it1: {
        name: 'JEE INTERNAL TEST-1',
        attemptDate: '31/05/2026',
        marks: 95,
        maxMarks: 300,
        rank: 16,
        percentile: '48.28',
        avgMarks: '106.03',
        percentage: '31.67%',
        correct: 27,
        incorrect: 13,
        attempted: 40,
        unattempted: 35,
        showLeaderBoard: true,
        rows: [['Maths', '100', '30', '40.93', '91', '30.00%', '41.38', '18']]
      }
    },
    examCalendar: [['Internal Test-05', '23-Aug-2026 09:00 AM', 'JEE', 'Narayana Gopalpura']]
  };
}

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntsc-admin-test-'));
  const seedPath = path.join(dir, 'seed.json');
  const storePath = path.join(dir, 'store.json');
  fs.writeFileSync(seedPath, JSON.stringify(makeSeed()));
  const store = createStore({ filePath: storePath, seedPath });
  return store.init().then(() => {
    const app = createApp(store, APP_CFG);
    const server = http.createServer(app);
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () =>
        resolve({ server, store, base: `http://127.0.0.1:${server.address().port}` })
      );
    });
  });
}

test('admin endpoints reject requests without a token', async () => {
  const ctx = await startServer();
  try {
    for (const [method, path] of [
      ['GET', '/api/admin/status'],
      ['GET', '/api/admin/timetable'],
      ['PUT', '/api/admin/timetable/2026-08-10'],
      ['GET', '/api/admin/attendance'],
      ['PUT', '/api/admin/attendance/overrides'],
      ['GET', '/api/admin/tests'],
      ['POST', '/api/admin/tests'],
      ['GET', '/api/admin/results/it1'],
      ['PUT', '/api/admin/results/it1'],
      ['GET', '/api/admin/exam-calendar'],
      ['POST', '/api/admin/exam-calendar'],
      ['GET', '/api/admin/student'],
      ['PUT', '/api/admin/student']
    ]) {
      const res = await fetch(ctx.base + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : '{}'
      });
      assert.equal(res.status, 401, `${method} ${path} should be unauthorized`);
    }
  } finally {
    ctx.server.close();
  }
});

test('PUT /api/admin/timetable/:date replaces that date and syncs the week meta', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/api/admin/timetable/2026-08-10', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        rows: [
          ['2026-08-10', '09:00 to 10:30', 'Regular Class', 'Maths Track-1'],
          ['2026-08-10', '11:00 to 12:30', 'Regular Class', 'Physics Track-2'],
          ['2026-08-10', '13:40 to 14:10', 'Doubt Class', 'Physics, Chemistry, Mathematics'],
          ['2026-08-10', '14:30 to 16:00', 'Regular Class', 'Chemistry Track-3']
        ]
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rows, 4);

    const data = ctx.store.getData();
    const dateRows = data.timetable.filter((r) => r[0] === '2026-08-10');
    assert.equal(dateRows.length, 4);
    assert.equal(dateRows[0][3], 'Maths Track-1');
    // other dates untouched
    assert.ok(data.timetable.some((r) => r[0] === '2026-08-11'));
    // generated week meta kept in sync (5 rows: the edited 08-10 quartet +
    // the seed 08-11 row which also falls inside this week)
    assert.equal(data.timetables['2026-08-10'].rows.length, 5);
    assert.equal(data.timetables['2026-08-10'].rows[0][3], 'Maths Track-1');
    assert.equal(data.timetables['2026-08-10'].rows[0][0], '2026-08-10');
  } finally {
    ctx.server.close();
  }
});

test('PUT /api/admin/timetable/:date rejects invalid rows', async () => {
  const ctx = await startServer();
  try {
    const bad = await fetch(ctx.base + '/api/admin/timetable/2026-08-10', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ rows: [['2026-08-10', 'not a time', 'Regular Class', 'X']] })
    });
    assert.equal(bad.status, 400);

    const wrongDate = await fetch(ctx.base + '/api/admin/timetable/2026-08-10', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ rows: [['2026-08-11', '09:00 to 10:30', 'Regular Class', 'X']] })
    });
    assert.equal(wrongDate.status, 400);
  } finally {
    ctx.server.close();
  }
});

test('DELETE /api/admin/timetable/:date removes the date', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/api/admin/timetable/2026-08-11', {
      method: 'DELETE',
      headers: ADMIN_HEADERS
    });
    assert.equal(res.status, 200);
    assert.ok(!ctx.store.getData().timetable.some((r) => r[0] === '2026-08-11'));
  } finally {
    ctx.server.close();
  }
});

test('attendance overrides are saved, validated, and clearable', async () => {
  const ctx = await startServer();
  try {
    const set = await fetch(ctx.base + '/api/admin/attendance/overrides', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ overrides: { '2026-08': 2, '2026-07': 21 } })
    });
    assert.equal(set.status, 200);
    const stored = ctx.store.getData().attendanceOverrides;
    assert.deepEqual(stored['2026-08'], { present: 2, total: null });
    assert.deepEqual(stored['2026-07'], { present: 21, total: null });

    const get = await fetch(ctx.base + '/api/admin/attendance', { headers: ADMIN_HEADERS });
    const body = await get.json();
    assert.deepEqual(body.attendanceOverrides['2026-08'], { present: 2, total: null });

    const bad = await fetch(ctx.base + '/api/admin/attendance/overrides', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ overrides: { '2026-08': -5 } })
    });
    assert.equal(bad.status, 400);

    const clear = await fetch(ctx.base + '/api/admin/attendance/overrides', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ overrides: { '2026-08': null } })
    });
    assert.equal(clear.status, 200);
    assert.ok(!('2026-08' in ctx.store.getData().attendanceOverrides));
  } finally {
    ctx.server.close();
  }
});

test('tests CRUD via admin API', async () => {
  const ctx = await startServer();
  try {
    const post = await fetch(ctx.base + '/api/admin/tests', {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ test: { id: 'it9', name: 'NEW TEST', status: 'Upcoming' } })
    });
    assert.equal(post.status, 201);
    assert.ok(ctx.store.getData().tests.some((t) => t.id === 'it9'));

    const put = await fetch(ctx.base + '/api/admin/tests/it9', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ test: { name: 'RENAMED TEST', duration: '120 min' } })
    });
    assert.equal(put.status, 200);
    const updated = ctx.store.getData().tests.find((t) => t.id === 'it9');
    assert.equal(updated.name, 'RENAMED TEST');
    assert.equal(updated.duration, '120 min');
    assert.equal(updated.status, 'Upcoming'); // untouched fields preserved

    const invalid = await fetch(ctx.base + '/api/admin/tests', {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ test: { name: 'no id' } })
    });
    assert.equal(invalid.status, 400);

    const del = await fetch(ctx.base + '/api/admin/tests/it9', { method: 'DELETE', headers: ADMIN_HEADERS });
    assert.equal(del.status, 200);
    assert.ok(!ctx.store.getData().tests.some((t) => t.id === 'it9'));
  } finally {
    ctx.server.close();
  }
});

test('results GET/PUT via admin API', async () => {
  const ctx = await startServer();
  try {
    const miss = await fetch(ctx.base + '/api/admin/results/nope', { headers: ADMIN_HEADERS });
    assert.equal(miss.status, 404);

    const put = await fetch(ctx.base + '/api/admin/results/it1', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        result: {
          marks: 120,
          rank: 4,
          rows: [['Maths', '100', '45', '40.00', '91', '45.00%', '50.00', '4']]
        }
      })
    });
    assert.equal(put.status, 200);
    const r = ctx.store.getData().results.it1;
    assert.equal(r.marks, 120);
    assert.equal(r.rank, 4);
    assert.equal(r.name, 'JEE INTERNAL TEST-1'); // preserved
    assert.equal(r.rows[0][2], '45');

    const get = await fetch(ctx.base + '/api/admin/results/it1', { headers: ADMIN_HEADERS });
    assert.equal((await get.json()).result.marks, 120);
  } finally {
    ctx.server.close();
  }
});

test('exam calendar CRUD via admin API', async () => {
  const ctx = await startServer();
  try {
    const post = await fetch(ctx.base + '/api/admin/exam-calendar', {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ entry: ['New Exam', '10-Sep-2026 09:00 AM', 'JEE', 'Campus'] })
    });
    assert.equal(post.status, 201);
    assert.equal(ctx.store.getData().examCalendar.length, 2);

    const put = await fetch(ctx.base + '/api/admin/exam-calendar/0', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ entry: ['Renamed Exam', '11-Sep-2026 09:00 AM', 'NEET', 'Other'] })
    });
    assert.equal(put.status, 200);
    assert.equal(ctx.store.getData().examCalendar[0][0], 'Renamed Exam');
    assert.equal(ctx.store.getData().examCalendar[0][2], 'NEET');

    const del = await fetch(ctx.base + '/api/admin/exam-calendar/0', { method: 'DELETE', headers: ADMIN_HEADERS });
    assert.equal(del.status, 200);
    assert.equal(ctx.store.getData().examCalendar.length, 1);
  } finally {
    ctx.server.close();
  }
});

test('student profile GET/PUT preserves other fields', async () => {
  const ctx = await startServer();
  try {
    const put = await fetch(ctx.base + '/api/admin/student', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ student: { name: 'UPDATED NAME' } })
    });
    assert.equal(put.status, 200);
    const s = ctx.store.getData().student;
    assert.equal(s.name, 'UPDATED NAME');
    assert.equal(s.mobile, '9530135914');
    assert.equal(s.email, 't@example.com');

    const get = await fetch(ctx.base + '/api/admin/student', { headers: ADMIN_HEADERS });
    assert.equal((await get.json()).student.name, 'UPDATED NAME');
  } finally {
    ctx.server.close();
  }
});
