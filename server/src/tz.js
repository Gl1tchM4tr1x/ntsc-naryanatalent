'use strict';

// Asia/Kolkata is fixed at UTC+05:30 (India has no DST), so the offset math
// below is exact and independent of the server machine's local timezone.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// Development/testing hook: FAKE_NOW accepts an ISO-8601 instant (e.g.
// "2026-08-09T19:00:00+05:30"). When set, every IST computation uses it
// instead of the real clock, allowing time simulation without waiting.
function nowInstant() {
  if (process.env.FAKE_NOW) {
    const d = new Date(process.env.FAKE_NOW);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function istParts(instant = nowInstant()) {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay()
  };
}

const pad2 = (n) => String(n).padStart(2, '0');

function istDate(instant = nowInstant()) {
  const p = istParts(instant);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

function istTime(instant = nowInstant()) {
  const p = istParts(instant);
  return `${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
}

function istNowIso(instant = nowInstant()) {
  return `${istDate(instant)}T${istTime(instant)}.000+05:30`;
}

function parseDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateStr) {
  return parseDate(dateStr).getUTCDay();
}

function isWeekday(dateStr) {
  const w = weekdayOf(dateStr);
  return w >= 1 && w <= 5;
}

// Monday (0) .. Sunday (6) of the week containing dateStr.
function mondayOf(dateStr) {
  const w = weekdayOf(dateStr);
  const back = w === 0 ? 6 : w - 1;
  return addDays(dateStr, -back);
}

function isValidDateStr(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return false;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ISO-8601 week number (Monday-based). Used only to vary the generated
// timetable deterministically from week to week.
function weekNumberIso(dateStr) {
  const d = parseDate(dateStr);
  const dayMs = 24 * 60 * 60 * 1000;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNr);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / dayMs) + 1) / 7);
}

module.exports = {
  IST_OFFSET_MS,
  nowInstant,
  istParts,
  istDate,
  istTime,
  istNowIso,
  addDays,
  parseDate,
  weekdayOf,
  isWeekday,
  mondayOf,
  isValidDateStr,
  weekNumberIso
};
