'use strict';

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '..');
const WORKSPACE_ROOT = path.join(SERVER_ROOT, '..');
const SITE_ROOT = path.join(WORKSPACE_ROOT, 'localhost8081');

// Tiny .env loader (no external dependency). Loads server/.env if present,
// without overriding variables that are already set in the environment.
function loadDotEnv() {
  const file = path.join(SERVER_ROOT, '.env');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return; // no .env file — rely on process env
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const nodeEnv = process.env.NODE_ENV || 'development';
const dataDirectory = process.env.DATA_DIRECTORY || path.join(SERVER_ROOT, 'data');
// In production the admin API must be explicitly enabled with a secret.
const adminToken =
  process.env.ADMIN_TOKEN ||
  process.env.ADMIN_SECRET ||
  (nodeEnv === 'production' ? null : 'dev-admin-token');

const config = {
  port: Number(process.env.PORT) || 8081,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv,
  // SESSION_SECRET strengthens session tokens; a dev fallback keeps local runs working.
  sessionSecret: process.env.SESSION_SECRET || 'ntsc-dev-session-secret',
  sessionTtlMs: (Number(process.env.SESSION_TTL_HOURS) || 24) * 60 * 60 * 1000,
  adminToken,
  // Admin Portal sign-in (same login page as the student portal). Credentials
  // are never logged and can be overridden via environment variables.
  adminUsername: process.env.ADMIN_USERNAME || 'devanshu',
  adminPassword: process.env.ADMIN_PASSWORD || 'Thors!1068',
  loginPassword: process.env.LOGIN_PASSWORD || null,
  istTimezone: 'Asia/Kolkata',
  timetableCron: process.env.TIMETABLE_CRON || '0 18 * * 0',
  attendanceCron: process.env.ATTENDANCE_CRON || '0 10 * * 1-5',
  disableScheduler: ['1', 'true'].includes(String(process.env.DISABLE_SCHEDULER || '').toLowerCase()),
  dataDirectory,
  storePath: process.env.STORE_PATH || path.join(dataDirectory, 'portal-data.json'),
  seedPath: path.join(SITE_ROOT, 'api', 'portal-data.json'),
  staticDir: SITE_ROOT,
  workspaceRoot: WORKSPACE_ROOT,
  publicBaseUrl: process.env.PUBLIC_BASE_URL || null
};

// Startup configuration validation. Returns a list of problems; callers decide
// whether a problem is fatal (production) or just a warning (development).
function validate() {
  const problems = [];
  if (config.nodeEnv === 'production' && !config.adminToken) {
    problems.push({
      critical: true,
      message: 'ADMIN_TOKEN or ADMIN_SECRET must be set when NODE_ENV=production (admin API would be disabled otherwise).'
    });
  }
  if (config.nodeEnv === 'production' && config.adminUsername === 'devanshu' && config.adminPassword === 'Thors!1068') {
    problems.push({
      critical: false,
      message: 'Using default admin credentials in production. Set ADMIN_USERNAME and ADMIN_PASSWORD.'
    });
  }
  if (config.nodeEnv === 'production' && config.sessionSecret === 'ntsc-dev-session-secret') {
    problems.push({
      critical: false,
      message: 'Using the default SESSION_SECRET in production. Set a strong SESSION_SECRET.'
    });
  }
  return problems;
}

module.exports = { ...config, validate };
