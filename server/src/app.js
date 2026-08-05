'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const tz = require('./tz');
const generator = require('./generator');
const attendance = require('./attendance');
const jobs = require('./jobs');
const admin = require('./admin');
const { mergePortalData } = require('./merge');

const DEFAULT_ADMIN_TOKEN = 'dev-admin-token';

function createApp(store, config = {}) {
  const cfg = {
    staticDir: config.staticDir || path.join(__dirname, '..', '..', 'localhost8081'),
    workspaceRoot: config.workspaceRoot || path.join(__dirname, '..', '..'),
    adminToken: config.adminToken || process.env.ADMIN_TOKEN || DEFAULT_ADMIN_TOKEN,
    nodeEnv: config.nodeEnv || process.env.NODE_ENV || 'development',
    loginPassword: config.loginPassword || process.env.LOGIN_PASSWORD || null,
    adminUsername: config.adminUsername || process.env.ADMIN_USERNAME || 'devanshu',
    adminPassword: config.adminPassword || process.env.ADMIN_PASSWORD || 'Thors!1068',
    timetableCron: config.timetableCron || process.env.TIMETABLE_CRON || '0 18 * * 0',
    attendanceCron: config.attendanceCron || process.env.ATTENDANCE_CRON || '0 10 * * 1-5',
    istTimezone: config.istTimezone || process.env.IST_TIMEZONE || 'Asia/Kolkata',
    storePath: config.storePath || '',
    ...config
  };

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.disable('x-powered-by');

  const log = (msg, meta) => {
    const line = `[${tz.istNowIso()} IST] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`;
    if (typeof config.log === 'function') config.log(line);
    else console.log(line);
  };

  // ---- Real-time event bus (Server-Sent Events) ---------------------------
  // Server-authorized: every subscriber must prove a valid student or admin
  // session token before the stream is opened. Events carry a data version;
  // the frontend re-fetches backend data whenever the version advances and
  // fully re-fetches on reconnect so nothing is missed while offline.
  const sseClients = new Set();
  let dataVersion = 0;

  function broadcast(payload) {
    const line = `data: ${JSON.stringify({ ...payload, at: Date.now() })}\n\n`;
    for (const client of sseClients) {
      try {
        client.res.write(line);
      } catch (err) {
        sseClients.delete(client);
        try { client.res.end(); } catch (_) {}
      }
    }
  }

  store.setOnChange(() => {
    dataVersion += 1;
    broadcast({ type: 'update', version: dataVersion });
  });

  const sidFor = (token) => crypto.createHash('sha1').update(String(token)).digest('hex').slice(0, 12);

  function sessionValid(token, role) {
    const d = store.getData();
    if (role === 'admin') {
      if (d.activeAdminSession && d.activeAdminSession.token === token) return true;
      if (cfg.adminToken && token === cfg.adminToken) return true;
      return false;
    }
    if (role === 'student') {
      if (d.activeStudentSession && d.activeStudentSession.token === token) return true;
      return Boolean((d.studentSessions || []).some((s) => s.token === token));
    }
    return false;
  }

  app.get('/api/events', (req, res) => {
    const token = String(req.query.token || '');
    const role = String(req.query.role || '');
    if (!token || !sessionValid(token, role)) {
      return send(res, 401, { ok: false, error: 'invalid session' });
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`retry: 3000\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'ready', version: dataVersion, at: Date.now() })}\n\n`);
    const client = { res, token, role };
    sseClients.add(client);
    const heartbeat = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (err) { clearInterval(heartbeat); sseClients.delete(client); }
    }, 25000);
    req.on('close', () => { clearInterval(heartbeat); sseClients.delete(client); });
  });

  // Remote-logout notification for a specific student token (Part 15).
  function notifyStudentLogout(token) {
    broadcast({ type: 'logout', token });
  }

  // ---- Helpers ------------------------------------------------------------
  const send = (res, status, body) => res.status(status).json(body);

  const deviceLabel = (ua) => {
    const u = String(ua || '');
    let os = 'Desktop';
    if (/iPhone|iPad|iPod/i.test(u)) os = 'iOS';
    else if (/Android/i.test(u)) os = 'Android';
    else if (/Windows/i.test(u)) os = 'Windows';
    else if (/Mac/i.test(u)) os = 'macOS';
    else if (/Linux/i.test(u)) os = 'Linux';
    let browser = '';
    if (/Edg\//i.test(u)) browser = 'Edge';
    else if (/Chrome\//i.test(u)) browser = 'Chrome';
    else if (/Firefox\//i.test(u)) browser = 'Firefox';
    else if (/Safari\//i.test(u)) browser = 'Safari';
    return `${os}${browser ? ' / ' + browser : ''}`;
  };

  // Strip admin-only fields (audit log, session tokens, admin session) from
  // anything served to the Student Portal.
  function sanitizePublic(data) {
    const out = { ...data };
    delete out.auditLog;
    delete out.studentSessions;
    delete out.activeAdminSession;
    if (out.activeStudentSession) {
      out.activeStudentSession = { ...out.activeStudentSession, token: undefined, role: 'student' };
    }
    return out;
  }

  // ---- Health -------------------------------------------------------------
  app.get('/api/health', (req, res) => {
    let storage = { path: cfg.storePath || null };
    try {
      const fs = require('fs');
      const fp = cfg.storePath;
      if (fp) {
        fs.accessSync(fp, fs.constants.W_OK);
        storage.writable = true;
      }
    } catch (err) {
      storage.writable = false;
    }
    send(res, 200, {
      ok: true,
      service: 'ntsc-portal-server',
      version: require('../package.json').version,
      time: { utc: new Date().toISOString(), ist: tz.istNowIso() },
      scheduler: {
        enabled: !cfg.disableScheduler,
        timetableCron: cfg.timetableCron,
        attendanceCron: cfg.attendanceCron,
        timezone: cfg.istTimezone
      },
      storage
    });
  });

  // Server clock for IST-aware frontends (midnight rollover, date tabs).
  app.get('/api/time', (req, res) => {
    const now = tz.nowInstant();
    send(res, 200, {
      ok: true,
      time: tz.istNowIso(now),
      date: tz.istDate(now),
      timeOfDay: tz.istTime(now),
      weekday: tz.istParts(now).weekday,
      version: dataVersion
    });
  });

  // ---- Portal data (existing endpoint, kept compatible) -------------------
  app.get('/api/portal-data', async (req, res) => {
    try {
      await maybeRunSafetyChecks();
      send(res, 200, sanitizePublic(store.getData()));
    } catch (err) {
      send(res, 500, { ok: false, error: err.message });
    }
  });

  app.put('/api/portal-data', async (req, res) => {
    try {
      await maybeRunSafetyChecks();
      const result = await store.replace((data) => mergePortalData(data, req.body));
      send(res, 200, sanitizePublic(result));
    } catch (err) {
      send(res, 500, { ok: false, error: err.message });
    }
  });

  // ---- Timetable ----------------------------------------------------------
  app.get('/api/timetable/current', async (req, res) => {
    await maybeRunSafetyChecks();
    const data = store.getData();
    const weekStart = tz.mondayOf(tz.istDate());
    const meta = (data.timetables || {})[weekStart];
    if (!meta) return send(res, 404, { ok: false, error: 'no timetable for current week' });
    send(res, 200, { ok: true, ...meta });
  });

  app.get('/api/timetable/week/:weekStart', (req, res) => {
    const meta = (store.getData().timetables || {})[req.params.weekStart];
    if (!meta) return send(res, 404, { ok: false, error: 'no timetable for that week' });
    send(res, 200, { ok: true, ...meta });
  });

  app.post('/api/timetable/generate', protect, async (req, res) => {
    const weekStart = (req.body && req.body.weekStart) || tz.addDays(tz.mondayOf(tz.istDate()), 7);
    if (!tz.isValidDateStr(weekStart)) return send(res, 400, { ok: false, error: 'invalid weekStart' });
    const before = store.getData();
    const result = generator.ensureWeek(before, weekStart);
    if (result.created) await store.replace((d) => result.data);
    send(res, result.created ? 201 : 200, { ok: true, created: result.created, ...result.meta });
  });

  // ---- Attendance ---------------------------------------------------------
  app.get('/api/attendance', async (req, res) => {
    await maybeRunSafetyChecks();
    const d = store.getData();
    send(res, 200, {
      ok: true,
      attendance: d.attendance || [],
      attendanceOverrides: d.attendanceOverrides || {},
      attendanceUpdatedFor: d.attendanceUpdatedFor || null,
      lastAttendanceUpdateAt: d.lastAttendanceUpdateAt || null
    });
  });

  // ---- Jobs (development/testing only, token-protected) -------------------
  app.post('/api/jobs/run-timetable', protect, async (req, res) => {
    const weekStart = req.body && req.body.weekStart;
    if (weekStart && !tz.isValidDateStr(weekStart)) return send(res, 400, { ok: false, error: 'invalid weekStart' });
    let generated = [];
    if (weekStart) {
      const before = store.getData();
      const result = generator.ensureWeek(before, weekStart);
      if (result.created) {
        await store.replace((d) => result.data);
        generated = [weekStart];
      }
    } else {
      await store.replace((data) => {
        const r = jobs.ensureTimetables(data);
        generated = r.generated;
        return r.generated.length ? r.data : data;
      });
    }
    send(res, 200, { ok: true, generated, weekStart: weekStart || generated[0] || null });
  });

  app.post('/api/jobs/run-attendance', protect, async (req, res) => {
    const date = req.body && req.body.date;
    if (date && !tz.isValidDateStr(date)) return send(res, 400, { ok: false, error: 'invalid date' });
    let report = null;
    await store.replace((data) => {
      const r = attendance.updateAttendance(data, date ? { date } : {});
      report = r;
      return r.updated ? r.data : data;
    });
    send(res, 200, {
      ok: true,
      updated: !!report.updated,
      processedDates: report.processedDates || [],
      attendanceUpdatedFor: report.attendanceUpdatedFor || store.getData().attendanceUpdatedFor || null,
      reason: report.reason || null
    });
  });

  // ---- Sessions (the existing SPA calls these; keep them working) ---------
  app.post('/api/session/login', async (req, res) => {
    const { mobile, password } = req.body || {};
    const data = store.getData();
    const studentMobile = data.student && data.student.mobile;
    const norm = (s) => String(s || '').replace(/\s+/g, '');

    const isStudent =
      Boolean(studentMobile) &&
      norm(mobile) === norm(studentMobile) &&
      (!cfg.loginPassword || password === cfg.loginPassword);

    const isAdmin =
      norm(mobile) === norm(cfg.adminUsername) && password === cfg.adminPassword;

    if (isAdmin) {
      const session = {
        token: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        user: cfg.adminUsername,
        role: 'admin',
        loggedInAt: new Date().toISOString()
      };
      await store.replace((d) => ({ ...d, activeAdminSession: session }));
      return send(res, 200, { ok: true, token: session.token, role: 'admin', redirect: '/admin/index.html' });
    }

    if (isStudent) {
      const session = {
        token: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        user: String(studentMobile),
        role: 'student',
        loggedInAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
        device: deviceLabel(req.get('user-agent'))
      };
      await store.replace((d) => admin.registerStudentSession({ ...d, activeStudentSession: session }, session));
      return send(res, 200, { ok: true, token: session.token, role: 'student', student: data.student, redirect: '/student/dashboard.html' });
    }

    send(res, 401, { ok: false, error: 'invalid credentials' });
  });

  app.post('/api/session/verify', (req, res) => {
    const { token } = req.body || {};
    if (!token) return send(res, 401, { ok: false, error: 'invalid session' });
    const d = store.getData();
    const studentSession = d.activeStudentSession;
    const adminSession = d.activeAdminSession;
    if (studentSession && studentSession.token && token === studentSession.token) {
      store.replace((data) => admin.touchSession(data, token)).catch(() => {});
      return send(res, 200, { ok: true, role: 'student' });
    }
    if ((d.studentSessions || []).some((s) => s.token === token)) {
      store.replace((data) => admin.touchSession(data, token)).catch(() => {});
      return send(res, 200, { ok: true, role: 'student' });
    }
    if (adminSession && adminSession.token && token === adminSession.token) return send(res, 200, { ok: true, role: 'admin' });
    send(res, 401, { ok: false, error: 'invalid session' });
  });

  app.post('/api/session/logout', async (req, res) => {
    const { token } = req.body || {};
    await store.replace((d) => {
      let next = d;
      if (d.activeAdminSession && (!token || token === d.activeAdminSession.token)) {
        next = { ...next, activeAdminSession: null };
      }
      if (token) {
        next = admin.revokeStudentSession(next, token);
      } else {
        next = { ...next, activeStudentSession: null, studentSessions: [] };
      }
      return next;
    });
    send(res, 200, { ok: true });
  });

  // ---- Admin Portal API (session / ADMIN_TOKEN protected) -----------------
  app.get('/api/admin/status', protect, (req, res) => {
    const d = store.getData();
    send(res, 200, {
      ok: true,
      scheduler: {
        timetableCron: cfg.timetableCron,
        attendanceCron: cfg.attendanceCron,
        timezone: cfg.istTimezone
      },
      summary: {
        student: d.student || null,
        timetableRows: (d.timetable || []).length,
        weeks: Object.keys(d.timetables || {}),
        attendance: d.attendance || [],
        attendanceUpdatedFor: d.attendanceUpdatedFor || null,
        lastAttendanceUpdateAt: d.lastAttendanceUpdateAt || null,
        tests: (d.tests || []).length,
        results: Object.keys(d.results || {}).length,
        examCalendar: (d.examCalendar || []).length,
        activeStudentSessions: (d.studentSessions || []).length
      }
    });
  });

  app.get('/api/admin/timetable', protect, (req, res) => {
    const d = store.getData();
    send(res, 200, {
      ok: true,
      timetable: d.timetable || [],
      timetables: d.timetables || {},
      timetableWeekStart: d.timetableWeekStart || null
    });
  });

  app.put('/api/admin/timetable/:date', protect, async (req, res) => {
    const date = req.params.date;
    if (!tz.isValidDateStr(date)) return send(res, 400, { ok: false, error: 'invalid date' });
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
    const problem = admin.validateDayRows(rows, date);
    if (problem) return send(res, 400, { ok: false, error: problem });
    await store.replace((d) => admin.addAudit(admin.replaceDateRows(d, date, rows), reqAdmin(req), 'timetable.update', date, { count: rows.length }));
    send(res, 200, { ok: true, date, rows: rows.length });
  });

  app.delete('/api/admin/timetable/:date', protect, async (req, res) => {
    const date = req.params.date;
    if (!tz.isValidDateStr(date)) return send(res, 400, { ok: false, error: 'invalid date' });
    await store.replace((d) => admin.addAudit(admin.deleteDate(d, date), reqAdmin(req), 'timetable.delete', date));
    send(res, 200, { ok: true, date });
  });

  // Preview a generated week WITHOUT saving (Part 9).
  app.post('/api/admin/timetable/preview', protect, (req, res) => {
    const weekStart = (req.body && req.body.weekStart) || tz.addDays(tz.mondayOf(tz.istDate()), 7);
    if (!tz.isValidDateStr(weekStart)) return send(res, 400, { ok: false, error: 'invalid weekStart' });
    send(res, 200, { ok: true, preview: true, ...generator.previewWeek(weekStart) });
  });

  app.get('/api/admin/attendance', protect, (req, res) => {
    const d = store.getData();
    send(res, 200, {
      ok: true,
      attendance: d.attendance || [],
      attendanceOverrides: d.attendanceOverrides || {},
      attendanceUpdatedFor: d.attendanceUpdatedFor || null,
      lastAttendanceUpdateAt: d.lastAttendanceUpdateAt || null
    });
  });

  app.put('/api/admin/attendance/overrides', protect, async (req, res) => {
    const overrides = req.body && req.body.overrides;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      return send(res, 400, { ok: false, error: 'overrides object required' });
    }
    try {
      let next;
      await store.replace((d) => {
        next = admin.addAudit(admin.setAttendanceOverrides(d, overrides), reqAdmin(req), 'attendance.override', Object.keys(overrides).join(','), overrides);
        return next;
      });
      send(res, 200, { ok: true, attendanceOverrides: next.attendanceOverrides });
    } catch (err) {
      send(res, 400, { ok: false, error: err.message });
    }
  });

  // Manual full-record edit (Part 11): set present + total for a month.
  app.put('/api/admin/attendance/record', protect, async (req, res) => {
    const { key, present, total } = req.body || {};
    if (!/^\d{4}-\d{2}$/.test(String(key || ''))) return send(res, 400, { ok: false, error: 'valid month key required (YYYY-MM)' });
    try {
      let out;
      await store.replace((d) => {
        const r = admin.setAttendanceRecord(d, key, present, total);
        out = r;
        return admin.addAudit(r.data, reqAdmin(req), 'attendance.edit', key, { present, total });
      });
      send(res, 200, { ok: true, record: out.record });
    } catch (err) {
      send(res, 400, { ok: false, error: err.message });
    }
  });

  // Add a missing month record (Part 11).
  app.post('/api/admin/attendance/record', protect, async (req, res) => {
    const { key, present, total } = req.body || {};
    if (!/^\d{4}-\d{2}$/.test(String(key || ''))) return send(res, 400, { ok: false, error: 'valid month key required (YYYY-MM)' });
    try {
      let out;
      await store.replace((d) => {
        const r = admin.setAttendanceRecord(d, key, present, total);
        out = r;
        return admin.addAudit(r.data, reqAdmin(req), 'attendance.add', key, { present, total });
      });
      send(res, 201, { ok: true, record: out.record });
    } catch (err) {
      send(res, 400, { ok: false, error: err.message });
    }
  });

  app.delete('/api/admin/attendance/:key', protect, async (req, res) => {
    const key = req.params.key;
    if (!/^\d{4}-\d{2}$/.test(String(key))) return send(res, 400, { ok: false, error: 'valid month key required (YYYY-MM)' });
    await store.replace((d) => admin.addAudit(admin.removeAttendanceRecord(d, key), reqAdmin(req), 'attendance.delete', key));
    send(res, 200, { ok: true });
  });

  // ---- Session management (Part 15) ---------------------------------------
  app.get('/api/admin/sessions', protect, (req, res) => {
    const d = store.getData();
    const active = d.activeStudentSession;
    const list = (d.studentSessions || []).map((s) => ({
      sid: sidFor(s.token),
      user: s.user,
      role: s.role || 'student',
      loggedInAt: s.loggedInAt || null,
      lastActivityAt: s.lastActivityAt || null,
      device: s.device || null,
      active: Boolean(active && active.token === s.token)
    }));
    send(res, 200, { ok: true, sessions: list });
  });

  // Revoke one student session (sid = public session id, never the raw token).
  app.delete('/api/admin/sessions/:sid', protect, async (req, res) => {
    const sid = String(req.params.sid || '');
    const d = store.getData();
    const session = (d.studentSessions || []).find((s) => sidFor(s.token) === sid);
    if (!session) return send(res, 404, { ok: false, error: 'session not found' });
    const revokedToken = session.token;
    await store.replace((data) => admin.addAudit(admin.revokeStudentSession(data, revokedToken), reqAdmin(req), 'session.revoke', sid, { user: session.user }));
    notifyStudentLogout(revokedToken);
    send(res, 200, { ok: true });
  });

  // Revoke ALL student sessions.
  app.delete('/api/admin/sessions', protect, async (req, res) => {
    const d = store.getData();
    const tokens = (d.studentSessions || []).map((s) => s.token);
    await store.replace((data) => admin.addAudit(admin.revokeAllStudentSessions(data), reqAdmin(req), 'session.revoke-all', null, { count: tokens.length }));
    for (const t of tokens) notifyStudentLogout(t);
    send(res, 200, { ok: true, revoked: tokens.length });
  });

  // Audit log (Part 11 + Part 15) — admin only, never served to students.
  app.get('/api/admin/audit', protect, (req, res) => {
    send(res, 200, { ok: true, audit: store.getData().auditLog || [] });
  });

  app.get('/api/admin/tests', protect, (req, res) => {
    const d = store.getData();
    send(res, 200, { ok: true, tests: d.tests || [], results: d.results || {} });
  });

  app.post('/api/admin/tests', protect, async (req, res) => {
    const test = req.body && req.body.test;
    if (!test || typeof test !== 'object' || Array.isArray(test)) {
      return send(res, 400, { ok: false, error: 'test object required' });
    }
    try {
      let next;
      await store.replace((d) => {
        next = admin.addAudit(admin.upsertTest(d, test), reqAdmin(req), 'tests.upsert', String(test.id || ''), { name: test.name });
        return next;
      });
      send(res, 201, { ok: true, test: (next.tests || []).find((t) => t.id === test.id) });
    } catch (err) {
      send(res, 400, { ok: false, error: err.message });
    }
  });

  app.put('/api/admin/tests/:id', protect, async (req, res) => {
    const test = { ...(req.body && req.body.test), id: req.params.id };
    try {
      let next;
      await store.replace((d) => {
        next = admin.addAudit(admin.upsertTest(d, test), reqAdmin(req), 'tests.update', req.params.id);
        return next;
      });
      send(res, 200, { ok: true, test: (next.tests || []).find((t) => t.id === req.params.id) });
    } catch (err) {
      send(res, 400, { ok: false, error: err.message });
    }
  });

  app.delete('/api/admin/tests/:id', protect, async (req, res) => {
    await store.replace((d) => admin.addAudit(admin.removeTest(d, req.params.id), reqAdmin(req), 'tests.delete', req.params.id));
    send(res, 200, { ok: true });
  });

  app.get('/api/admin/results/:id', protect, (req, res) => {
    const r = (store.getData().results || {})[req.params.id];
    if (!r) return send(res, 404, { ok: false, error: 'no result for that test' });
    send(res, 200, { ok: true, result: r });
  });

  app.put('/api/admin/results/:id', protect, async (req, res) => {
    const result = req.body && req.body.result;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      return send(res, 400, { ok: false, error: 'result object required' });
    }
    await store.replace((d) => admin.addAudit(admin.saveResult(d, req.params.id, result), reqAdmin(req), 'results.update', req.params.id));
    send(res, 200, { ok: true, result: store.getData().results[req.params.id] });
  });

  app.get('/api/admin/exam-calendar', protect, (req, res) => {
    send(res, 200, { ok: true, examCalendar: store.getData().examCalendar || [] });
  });

  app.post('/api/admin/exam-calendar', protect, async (req, res) => {
    const entry = req.body && req.body.entry;
    if (!Array.isArray(entry)) return send(res, 400, { ok: false, error: 'entry array required' });
    try {
      let next;
      await store.replace((d) => {
        next = admin.addAudit(admin.upsertCalendarEntry(d, entry, -1), reqAdmin(req), 'calendar.upsert', entry[0]);
        return next;
      });
      send(res, 201, { ok: true, examCalendar: next.examCalendar });
    } catch (err) {
      send(res, 400, { ok: false, error: err.message });
    }
  });

  app.put('/api/admin/exam-calendar/:idx', protect, async (req, res) => {
    const idx = Number(req.params.idx);
    const entry = req.body && req.body.entry;
    if (!Number.isInteger(idx) || idx < 0 || !Array.isArray(entry)) {
      return send(res, 400, { ok: false, error: 'invalid entry' });
    }
    try {
      let next;
      await store.replace((d) => {
        next = admin.addAudit(admin.upsertCalendarEntry(d, entry, idx), reqAdmin(req), 'calendar.update', entry[0]);
        return next;
      });
      send(res, 200, { ok: true, examCalendar: next.examCalendar });
    } catch (err) {
      send(res, 400, { ok: false, error: err.message });
    }
  });

  app.delete('/api/admin/exam-calendar/:idx', protect, async (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0) return send(res, 400, { ok: false, error: 'invalid index' });
    await store.replace((d) => admin.addAudit(admin.removeCalendarEntry(d, idx), reqAdmin(req), 'calendar.delete', String(idx)));
    send(res, 200, { ok: true });
  });

  app.get('/api/admin/student', protect, (req, res) => {
    send(res, 200, { ok: true, student: store.getData().student || null });
  });

  app.put('/api/admin/student', protect, async (req, res) => {
    const student = req.body && req.body.student;
    if (!student || typeof student !== 'object' || Array.isArray(student)) {
      return send(res, 400, { ok: false, error: 'student object required' });
    }
    let next;
    await store.replace((d) => {
      next = admin.addAudit(admin.updateStudent(d, student), reqAdmin(req), 'student.update', student.name || null);
      return next;
    });
    send(res, 200, { ok: true, student: next.student });
  });

  // ---- Admin-only guard ---------------------------------------------------
  function protect(req, res, next) {
    if (cfg.nodeEnv === 'production' && !cfg.adminToken) {
      return res.status(403).json({ ok: false, error: 'admin API disabled in production (set ADMIN_TOKEN)' });
    }
    const provided = String(req.get('x-admin-token') || '');
    const session = store.getData().activeAdminSession;
    const sessionOk = Boolean(session && session.token && provided === session.token);
    const tokenOk = Boolean(cfg.adminToken && provided === cfg.adminToken);
    if (!sessionOk && !tokenOk) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    next();
  }

  function reqAdmin(req) {
    const provided = String(req.get('x-admin-token') || '');
    const session = store.getData().activeAdminSession;
    if (session && session.token === provided) return session.user || 'admin';
    return 'ADMIN_TOKEN';
  }

  // ---- Safety checks (single-flight, throttled) ---------------------------
  let lastSafetyCheck = 0;
  let safetyCheckRunning = null;
  async function maybeRunSafetyChecks() {
    const nowMs = Date.now();
    if (nowMs - lastSafetyCheck < 60 * 1000) return;
    lastSafetyCheck = nowMs;
    if (safetyCheckRunning) return safetyCheckRunning;
    safetyCheckRunning = store
      .replace((data) => {
        const result = jobs.runSafetyChecks(data);
        return result.changed ? result.data : data;
      })
      .then((result) => {
        log('safety check completed');
        return result;
      })
      .catch((err) => {
        log('safety check failed', { error: err.message });
      })
      .finally(() => {
        safetyCheckRunning = null;
      });
    return safetyCheckRunning;
  }

  // ---- Static site + minimal landing page ---------------------------------
  app.get('/', (req, res) => {
    const d = store.getData();
    if (d.activeStudentSession && d.activeStudentSession.token) return res.redirect('/student/dashboard.html');
    if (d.activeAdminSession && d.activeAdminSession.token) return res.redirect('/admin/index.html');
    res.send(loginPageHtml());
  });

  app.use(express.static(cfg.staticDir, { index: false }));

  // 404 for unknown API routes (JSON) vs static fall-through.
  app.use('/api', (req, res) => send(res, 404, { ok: false, error: 'not found' }));

  // Global error handler: never leak raw stack traces to users.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log('unhandled error', { error: err && err.message, url: req.originalUrl });
    if (res.headersSent) return next(err);
    send(res, 500, { ok: false, error: 'internal server error' });
  });

  return app;
}

function loginPageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Student Portal - Login</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0789c6;font-family:Arial,Helvetica,sans-serif}
  form{background:#fff;padding:28px 30px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.2);width:300px}
  h2{margin:0 0 18px;color:#0789c6;font-size:18px}
  input{width:100%;box-sizing:border-box;padding:10px;margin-bottom:12px;border:1px solid #c7d6df;border-radius:4px;font-size:13px}
  button{width:100%;padding:11px;background:#0789c6;color:#fff;border:0;border-radius:4px;font-size:14px;cursor:pointer}
  p#msg{color:#c0392b;font-size:12px;min-height:16px;margin:10px 0 0}
  small{color:#7d8b93;font-size:11px}
</style>
</head>
<body>
  <form id="loginForm">
    <h2>Student Portal</h2>
    <input name="mobile" placeholder="Mobile Number" autocomplete="username" required>
    <input name="password" type="password" placeholder="Password" autocomplete="current-password">
    <button type="submit">Login</button>
    <p id="msg"></p>
    <small>Mobile: the number registered in your profile.</small>
  </form>
  <script>
    (function(){
      var saved=null;
      try{ saved=JSON.parse(localStorage.getItem('ntsc_landing_login')||'null'); }catch(e){}
      if(saved && saved.token){ location.href= saved.role==='admin' ? '/admin/index.html' : '/student/dashboard.html'; return; }
      document.getElementById('loginForm').addEventListener('submit', async function(ev){
        ev.preventDefault();
        var msg=document.getElementById('msg');
        msg.textContent='';
        var mobile=this.mobile.value.trim();
        var password=this.password.value;
        try{
          var res=await fetch('/api/session/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mobile:mobile,password:password})});
          var data=await res.json();
          if(!res.ok || !data.ok){ msg.textContent=(data&&data.error)||'Login failed'; return; }
          localStorage.setItem('ntsc_landing_login',JSON.stringify({role:data.role, token:data.token, user:mobile}));
          location.href= data.role==='admin' ? '/admin/index.html' : '/student/dashboard.html';
        }catch(e){ msg.textContent='Server unavailable'; }
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = { createApp, loginPageHtml };
