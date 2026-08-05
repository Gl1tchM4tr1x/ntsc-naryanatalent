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

const APP_CFG = {
  adminToken: 'test-token',
  nodeEnv: 'test',
  adminUsername: 'devanshu',
  adminPassword: 'Thors!1068'
};

function makeSeed() {
  return {
    student: { name: 'TEST STUDENT', mobile: '9530135914', email: 't@example.com' },
    attendance: [{ month: 'August 2026', value: '3/3' }],
    dashboardDate: '2026-08-10',
    timetable: [['2026-08-10', '08:30 to 10:00', 'Regular Class', 'Physics Track-1']],
    timetableWeekStart: '2026-08-10',
    attendanceOverrides: {}
  };
}

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ntsc-auth-test-'));
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

async function login(base, mobile, password) {
  const res = await fetch(base + '/api/session/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile, password })
  });
  return { status: res.status, body: await res.json() };
}

test('admin login with devanshu / Thors!1068 returns role admin', async () => {
  const ctx = await startServer();
  try {
    const { status, body } = await login(ctx.base, 'devanshu', 'Thors!1068');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.role, 'admin');
    assert.ok(body.token);
    assert.equal(body.redirect, '/admin/index.html');
    assert.ok(ctx.store.getData().activeAdminSession);
    assert.ok(!ctx.store.getData().activeStudentSession);
  } finally {
    ctx.server.close();
  }
});

test('admin login rejects wrong password and wrong username', async () => {
  const ctx = await startServer();
  try {
    const wrongPass = await login(ctx.base, 'devanshu', 'wrong-pass');
    assert.equal(wrongPass.status, 401);
    const wrongUser = await login(ctx.base, 'someone-else', 'Thors!1068');
    assert.equal(wrongUser.status, 401);
    assert.ok(!ctx.store.getData().activeAdminSession);
  } finally {
    ctx.server.close();
  }
});

test('student login still works via the same page and gets role student', async () => {
  const ctx = await startServer();
  try {
    const { status, body } = await login(ctx.base, '9530135914', '');
    assert.equal(status, 200);
    assert.equal(body.role, 'student');
    assert.equal(body.redirect, '/student/dashboard.html');
    assert.ok(!ctx.store.getData().activeAdminSession);
    assert.ok(ctx.store.getData().activeStudentSession);
  } finally {
    ctx.server.close();
  }
});

test('verify accepts the admin token and reports role', async () => {
  const ctx = await startServer();
  try {
    const { body: loginBody } = await login(ctx.base, 'devanshu', 'Thors!1068');
    const res = await fetch(ctx.base + '/api/session/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: loginBody.token })
    });
    assert.equal(res.status, 200);
    const v = await res.json();
    assert.equal(v.ok, true);
    assert.equal(v.role, 'admin');
  } finally {
    ctx.server.close();
  }
});

test('root redirects to /admin/index.html while an admin session is active', async () => {
  const ctx = await startServer();
  try {
    await login(ctx.base, 'devanshu', 'Thors!1068');
    const root = await fetch(ctx.base + '/', { redirect: 'manual' });
    assert.equal(root.status, 302);
    assert.equal(root.headers.get('location'), '/admin/index.html');
  } finally {
    ctx.server.close();
  }
});

test('logout clears only the admin session; verify then fails', async () => {
  const ctx = await startServer();
  try {
    const { body } = await login(ctx.base, 'devanshu', 'Thors!1068');
    const out = await fetch(ctx.base + '/api/session/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: body.token })
    });
    assert.equal(out.status, 200);
    assert.ok(!ctx.store.getData().activeAdminSession);

    const verify = await fetch(ctx.base + '/api/session/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: body.token })
    });
    assert.equal(verify.status, 401);

    const root = await fetch(ctx.base + '/', { redirect: 'manual' });
    assert.equal(root.status, 200); // login page again
  } finally {
    ctx.server.close();
  }
});

test('protected endpoints accept the admin session token (no ADMIN_TOKEN needed)', async () => {
  const ctx = await startServer();
  try {
    const { body } = await login(ctx.base, 'devanshu', 'Thors!1068');
    const res = await fetch(ctx.base + '/api/jobs/run-attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': body.token },
      body: '{}'
    });
    assert.equal(res.status, 200);
    const r = await res.json();
    assert.equal(r.ok, true);
  } finally {
    ctx.server.close();
  }
});
