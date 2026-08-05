'use strict';

const jobs = require('./jobs');

// Shared job-runner implementations used by the scheduler and the startup
// catch-up. Each mutator returns `r.data` (or the unchanged data reference)
// so the store document shape is always preserved.
function createJobRunners(store) {
  async function runTimetableJob() {
    let generated = [];
    await store.replace((data) => {
      const r = jobs.ensureTimetables(data);
      generated = r.generated;
      return r.generated.length ? r.data : data;
    });
    return { summary: { generated } };
  }

  async function runAttendanceJob() {
    let report = null;
    await store.replace((data) => {
      const r = jobs.ensureAttendanceCatchUp(data);
      report = {
        updated: !!r.updated,
        reason: r.reason || null,
        attendanceUpdatedFor: r.attendanceUpdatedFor || null
      };
      return r.updated ? r.data : data;
    });
    return { summary: report };
  }

  async function runStartupCatchUp() {
    let changed = false;
    await store.replace((data) => {
      const r = jobs.runSafetyChecks(data);
      changed = r.changed;
      return r.changed ? r.data : data;
    });
    return { summary: { changed } };
  }

  return { runTimetableJob, runAttendanceJob, runStartupCatchUp };
}

module.exports = { createJobRunners };
