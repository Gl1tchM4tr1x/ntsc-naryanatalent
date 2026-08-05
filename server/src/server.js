'use strict';

const http = require('http');
const cron = require('node-cron');
const config = require('./config');
const { createStore } = require('./store');
const { createApp } = require('./app');
const { createJobRunners } = require('./jobRunners');
const tz = require('./tz');

const log = (msg, meta) => {
  const line = `[${tz.istNowIso()} IST] ${msg}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  console.log(line);
};

async function runJob(runFn, name) {
  try {
    const result = await runFn();
    log(`${name} job done`, result && result.summary);
  } catch (err) {
    log(`${name} job failed`, { error: err.message, stack: err.stack });
  }
}

async function main() {
  const store = createStore({ filePath: config.storePath, seedPath: config.seedPath });
  await store.init();
  log('store ready', { file: config.storePath });

  const runners = createJobRunners(store);
  const app = createApp(store, config);
  const server = http.createServer(app);

  if (config.disableScheduler) {
    log('scheduler disabled (DISABLE_SCHEDULER=1)');
  } else {
    cron.schedule(config.timetableCron, () => runJob(runners.runTimetableJob, 'timetable'), {
      timezone: config.istTimezone
    });
    cron.schedule(config.attendanceCron, () => runJob(runners.runAttendanceJob, 'attendance'), {
      timezone: config.istTimezone
    });
    log('scheduler registered', {
      timetable: config.timetableCron,
      attendance: config.attendanceCron,
      timezone: config.istTimezone
    });

    // Catch-up on startup: generate any due timetable / attendance that was
    // missed while the server was down. Idempotent, so re-running is safe.
    await runJob(runners.runStartupCatchUp, 'startup-catch-up');
  }

  server.listen(config.port, config.host, () => {
    log('server listening', { url: `http://localhost:${config.port}`, env: config.nodeEnv });
  });

  const shutdown = (signal) => {
    log(`shutting down (${signal})`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[ntsc] fatal startup error:', err);
  process.exit(1);
});
