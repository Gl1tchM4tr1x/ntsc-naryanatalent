'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createStore } = require('../src/store');
const { createApp } = require('../src/app');

// Deterministic clock for the whole API test process.
process.env.FAKE_NOW = '2026-08-10T11:00:00+05:30'; // Monday after 10:00 IST

const ADMIN_HEADERS = { 'Content-Type': 'application/json', 'x-admin-token': 'test-token' };

function makeSeed() {
  return {
    student: {
      name: 'TEST STUDENT',
      mobile: '9530135914',
      email: 't@example.com',
      currentClass: '12 Passed',
      studentId: '123',
      batch: 'B',
      registration: 'R'
    },
    attendance: [{ month: 'August 2026', value: '3/3' }],
    dashboardDate: '2026-08-10',
    timetable: [['2026-08-10', '08:30 to 10:00', 'Regular Class', 'Physics Track-1']],
    timetableWeekStart: '2026-08-10',
    attendanceOverrides: {},
    tests: [],
    results: {}
  };
}

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntsc-test-'));
  const seedPath = path.join(dir, 'seed.json');
  const storePath = path.join(dir, 'store.json');
  fs.writeFileSync(seedPath, JSON.stringify(makeSeed()));
  const store = createStore({ filePath: storePath, seedPath });
  return store.init().then(() => {
    const app = createApp(store, { adminToken: 'test-token', nodeEnv: 'test' });
    const server = http.createServer(app);
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () =>
        resolve({ server, store, base: `http://127.0.0.1:${server.address().port}` })
      );
    });
  });
}

test('GET /api/health reports IST time', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/api/health');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.time.ist.slice(0, 10), '2026-08-10');
  } finally {
    ctx.server.close();
  }
});

test('GET /api/portal-data returns seeded data and runs catch-up', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/api/portal-data');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.student.mobile, '9530135914');
    assert.equal(body.attendanceUpdatedFor, '2026-08-10'); // catch-up ran
  } finally {
    ctx.server.close();
  }
});

test('POST /api/timetable/generate persists a week and is idempotent', async () => {
  const ctx = await startServer();
  try {
    const r1 = await fetch(ctx.base + '/api/timetable/generate', {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ weekStart: '2026-08-17' })
    });
    assert.equal(r1.status, 201);
    const b1 = await r1.json();
    assert.equal(b1.created, true);
    assert.equal(b1.weekStart, '2026-08-17');
    assert.equal(b1.rows.length, 20);

    const r2 = await fetch(ctx.base + '/api/timetable/generate', {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ weekStart: '2026-08-17' })
    });
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).created, false);

    assert.ok(ctx.store.getData().timetables['2026-08-17']);
    const flat = ctx.store.getData().timetable.filter((r) => r[0] >= '2026-08-17' && r[0] <= '2026-08-21');
    assert.equal(flat.length, 20);
  } finally {
    ctx.server.close();
  }
});

test('PUT /api/portal-data does not clobber generated timetable or current attendance', async () => {
  const ctx = await startServer();
  try {
    await fetch(ctx.base + '/api/timetable/generate', {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ weekStart: '2026-08-17' })
    });
    const put = await fetch(ctx.base + '/api/portal-data', {
      method: 'PUT',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({
        timetable: [['2026-08-17', '99:99 to 00:00', 'Regular Class', 'Hacked']],
        attendance: [
          { month: 'August 2026', value: '1/99' },
          { month: 'January 2020', value: '1/1' }
        ],
        student: { name: 'UPDATED' }
      })
    });
    assert.equal(put.status, 200);
    const body = await put.json();

    assert.ok(!body.timetable.some((r) => r[0] === '2026-08-17' && r[3] === 'Hacked'));
    const aug = body.attendance.find((x) => x.month === 'August 2026');
    assert.notEqual(aug.value, '1/99'); // server keeps authority for current period
    assert.ok(body.attendance.some((x) => x.month === 'January 2020')); // older months accepted
    assert.equal(body.student.name, 'UPDATED');
  } finally {
    ctx.server.close();
  }
});

test('GET /api/timetable/current returns the current week', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/api/timetable/current');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.weekStart, '2026-08-10');
    assert.equal(body.rows.length, 20);
  } finally {
    ctx.server.close();
  }
});

test('GET /api/timetable/week/:weekStart 404s for unknown weeks', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/api/timetable/week/2025-01-01');
    assert.equal(res.status, 404);
  } finally {
    ctx.server.close();
  }
});

test('GET /api/attendance returns permanent data', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/api/attendance');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.attendance));
    assert.equal(body.attendanceUpdatedFor, '2026-08-10');
  } finally {
    ctx.server.close();
  }
});

test('job endpoints require the admin token', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/api/jobs/run-timetable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    assert.equal(res.status, 401);
  } finally {
    ctx.server.close();
  }
});

test('POST /api/jobs/run-attendance is idempotent for the same date', async () => {
  const ctx = await startServer();
  try {
    const r1 = await fetch(ctx.base + '/api/jobs/run-attendance', {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ date: '2026-08-05' })
    });
    const b1 = await r1.json();
    assert.equal(b1.updated, true);
    assert.equal(b1.attendanceUpdatedFor, '2026-08-05');

    const r2 = await fetch(ctx.base + '/api/jobs/run-attendance', {
      method: 'POST',
      headers: ADMIN_HEADERS,
      body: JSON.stringify({ date: '2026-08-05' })
    });
    assert.equal((await r2.json()).updated, false);

    const aug = ctx.store.getData().attendance.find((x) => x.month === 'August 2026');
    assert.equal(aug.value, '3/3'); // unchanged by the duplicate run
  } finally {
    ctx.server.close();
  }
});

test('static dashboard is served', async () => {
  const ctx = await startServer();
  try {
    const res = await fetch(ctx.base + '/student/dashboard.html');
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /app-shell/);
  } finally {
    ctx.server.close();
  }
});

test('login -> verify -> root redirect flow', async () => {
  const ctx = await startServer();
  try {
    const login = await fetch(ctx.base + '/api/session/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '9530135914' })
    });
    assert.equal(login.status, 200);
    const { token } = await login.json();

    const verify = await fetch(ctx.base + '/api/session/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    assert.equal(verify.status, 200);

    const root = await fetch(ctx.base + '/', { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/student/dashboard.html');
  } finally {
    ctx.server.close();
  }
});
