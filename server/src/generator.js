'use strict';

const tz = require('./tz');

// No generation rules existed in the original project, so this is the
// configurable default generator. It mirrors the existing timetable shape:
//   [date, "HH:mm to HH:mm", "Class Type", "Subject Track", teacher?, room?]
// Three regular classes per day plus one doubt class, Monday to Friday.
const DEFAULT_CONFIG = {
  version: 2,
  weekdays: [1, 2, 3, 4, 5], // Mon..Fri
  slots: [
    { time: '08:30 to 10:00', type: 'Regular Class' },
    { time: '10:15 to 11:45', type: 'Regular Class' },
    { time: '12:00 to 13:30', type: 'Regular Class' },
    { time: '13:40 to 14:10', type: 'Doubt Class' }
  ],
  subjects: ['Physics', 'Chemistry', 'Maths'],
  tracks: ['Track-1', 'Track-2'],
  doubtSubject: 'Physics, Chemistry, Mathematics',
  teachers: ['Priya Sharma', 'Rajesh Verma', 'Anita Rao', 'Vikram Singh'],
  rooms: ['Room 101', 'Room 102', 'Room 203', 'Lab 1']
};

// Deterministic per-week variation: the ISO week number shifts which subject
// lands in which slot, so different weeks differ but identical inputs always
// produce identical output (important for idempotency checks).
function buildWeekRows(weekStart, config = DEFAULT_CONFIG) {
  const weekNo = tz.weekNumberIso(weekStart);
  const rows = [];
  config.weekdays.forEach((offset, dayIndex) => {
    const date = tz.addDays(weekStart, offset - 1);
    config.slots.forEach((slot, slotIndex) => {
      const key = weekNo + dayIndex + slotIndex;
      if (slot.type === 'Doubt Class') {
        rows.push([
          date,
          slot.time,
          slot.type,
          config.doubtSubject,
          config.teachers[key % config.teachers.length],
          config.rooms[(weekNo + dayIndex) % config.rooms.length]
        ]);
        return;
      }
      const subject = config.subjects[key % config.subjects.length];
      const track = config.tracks[key % config.tracks.length];
      rows.push([
        date,
        slot.time,
        slot.type,
        `${subject} ${track}`,
        config.teachers[key % config.teachers.length],
        config.rooms[(weekNo + dayIndex * 3 + slotIndex) % config.rooms.length]
      ]);
    });
  });
  return rows;
}

function weekMeta(weekStart, config = DEFAULT_CONFIG, generatedAt = tz.istNowIso()) {
  return {
    weekStart,
    weekEnd: tz.addDays(weekStart, config.weekdays.length - 1),
    generatedAt,
    generationVersion: config.version || 1,
    rows: buildWeekRows(weekStart, config)
  };
}

// Preview the rows a week would get WITHOUT mutating any store data. Used by
// the admin "Preview" button before generating.
function previewWeek(weekStart, config = DEFAULT_CONFIG) {
  return weekMeta(weekStart, config);
}

// Merge new rows into the flat `timetable` array used by the existing UI,
// without ever duplicating a row that is already present.
function upsertFlatRows(flatRows, newRows) {
  const out = (flatRows || []).slice();
  const seen = new Set(out.map((r) => r.join('|')));
  for (const row of newRows) {
    const key = row.join('|');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

// Idempotent: if the week is already stored, nothing changes.
function ensureWeek(data, weekStart, config = DEFAULT_CONFIG, nowIso = tz.istNowIso()) {
  const timetables = data.timetables || {};
  const existing = timetables[weekStart];
  if (existing) return { created: false, meta: existing, data };

  const meta = weekMeta(weekStart, config, nowIso);
  const next = {
    ...data,
    timetables: { ...timetables, [weekStart]: meta }
  };
  next.timetable = upsertFlatRows(next.timetable, meta.rows);
  if (!next.timetableWeekStart || next.timetableWeekStart < weekStart) {
    next.timetableWeekStart = weekStart;
  }
  return { created: true, meta, data: next };
}

module.exports = { DEFAULT_CONFIG, buildWeekRows, weekMeta, previewWeek, upsertFlatRows, ensureWeek };
