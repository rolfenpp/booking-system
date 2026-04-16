import { DateTime } from "luxon";
import { db, getAvailabilityConfig } from "./db.js";

export type Slot = { start: string; end: string; available: boolean };

export type BookingIntervalRow = {
  id: number;
  start_time: string;
  end_time: string;
};

function parseIso(s: string): DateTime {
  const d = DateTime.fromISO(s, { setZone: true });
  if (!d.isValid) throw new Error("Invalid datetime");
  return d;
}

function dbWeekday(dt: DateTime): number {
  return dt.weekday - 1;
}

function parseHm(s: string): number {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function alignMinutesToHourBoundary(m: number): number {
  if (m % 60 === 0) return m;
  return m + (60 - (m % 60));
}

function mergeBreaks(brs: { s: number; e: number }[]): { s: number; e: number }[] {
  if (brs.length === 0) return [];
  const s = [...brs].sort((a, b) => a.s - b.s);
  const out: { s: number; e: number }[] = [{ ...s[0]! }];
  for (let i = 1; i < s.length; i++) {
    const cur = s[i]!;
    const last = out[out.length - 1]!;
    if (cur.s <= last.e) last.e = Math.max(last.e, cur.e);
    else out.push({ ...cur });
  }
  return out;
}

function daySegments(dayStart: number, dayEnd: number, breaks: { s: number; e: number }[], slotMin: number): [number, number][] {
  const merged = mergeBreaks(
    breaks.map((b) => ({ s: Math.max(b.s, dayStart), e: Math.min(b.e, dayEnd) })).filter((b) => b.e > b.s)
  );
  const out: [number, number][] = [];
  let t = dayStart;
  for (const br of merged) {
    if (br.s > t) {
      const segEnd = Math.min(br.s, dayEnd);
      if (segEnd - t >= slotMin) out.push([t, segEnd]);
    }
    t = Math.max(t, br.e);
    if (t >= dayEnd) break;
  }
  if (t < dayEnd && dayEnd - t >= slotMin) out.push([t, dayEnd]);
  return out.filter(([a, b]) => b - a >= slotMin);
}

function overlapsMs(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/**
 * Bookings block the half-open interval [start, end + bufferMinutes). A candidate slot [s, e) is unavailable
 * if it overlaps that blocked interval. This loader returns only rows that could overlap any slot in
 * [rangeStartIso, rangeEndIso) under that rule (plus optional excludeBookingId).
 */
function loadBookingIntervalsOverlapping(
  rangeStartIso: string,
  rangeEndIso: string,
  bufferMinutes: number,
  excludeBookingId?: number
): BookingIntervalRow[] {
  const expandedStart = parseIso(rangeStartIso).minus({ minutes: bufferMinutes }).toUTC().toISO()!;
  const rangeEnd = parseIso(rangeEndIso).toUTC().toISO()!;

  if (excludeBookingId != null && Number.isFinite(excludeBookingId)) {
    return db
      .prepare(
        `SELECT id, start_time, end_time FROM bookings
         WHERE id != ? AND start_time < ? AND end_time > ?`
      )
      .all(excludeBookingId, rangeEnd, expandedStart) as BookingIntervalRow[];
  }
  return db
    .prepare(`SELECT id, start_time, end_time FROM bookings WHERE start_time < ? AND end_time > ?`)
    .all(rangeEnd, expandedStart) as BookingIntervalRow[];
}

function bookingConflictsWithRows(
  startIso: string,
  endIso: string,
  rows: BookingIntervalRow[],
  bufferMinutes: number
): boolean {
  const a0 = parseIso(startIso).toMillis();
  const a1 = parseIso(endIso).toMillis();
  for (const r of rows) {
    const bs = parseIso(r.start_time).toMillis();
    const be = parseIso(r.end_time).plus({ minutes: bufferMinutes }).toMillis();
    if (overlapsMs(a0, a1, bs, be)) return true;
  }
  return false;
}

export function bookingConflicts(startIso: string, endIso: string, excludeBookingId?: number): boolean {
  const bufferMin = getAvailabilityConfig().bufferMinutes;
  const rows = loadBookingIntervalsOverlapping(startIso, endIso, bufferMin, excludeBookingId);
  return bookingConflictsWithRows(startIso, endIso, rows, bufferMin);
}

export function computeSlots(fromIso: string, toIso: string, excludeBookingId?: number): Slot[] {
  const cfg = getAvailabilityConfig();
  const zone = cfg.timezone;
  const slotMin = cfg.slotDurationMinutes > 0 ? cfg.slotDurationMinutes : 60;
  const dayStartMin = parseHm(cfg.dayStart);
  const dayEndMin = parseHm(cfg.dayEnd);
  const breaksMin = cfg.breaks
    .map((b) => ({ s: parseHm(b.start), e: parseHm(b.end) }))
    .filter((b) => b.e > b.s);

  const bufferMin = cfg.bufferMinutes;
  const bookingRows = loadBookingIntervalsOverlapping(fromIso, toIso, bufferMin, excludeBookingId);

  const from = parseIso(fromIso);
  const to = parseIso(toIso);
  if (to <= from) return [];

  let cursor = from.setZone(zone).startOf("day");
  const end = to.setZone(zone).endOf("day");

  const slots: Slot[] = [];

  while (cursor <= end) {
    const wd = dbWeekday(cursor);
    if (cfg.workingDays[wd]) {
      const segments = daySegments(dayStartMin, dayEndMin, breaksMin, slotMin);
      for (const [segStart, segEnd] of segments) {
        let m = alignMinutesToHourBoundary(segStart);
        while (m + slotMin <= segEnd) {
          const h = Math.floor(m / 60);
          const min = m % 60;
          const localStart = cursor.set({ hour: h, minute: min, second: 0, millisecond: 0 });
          const localEnd = localStart.plus({ minutes: slotMin });
          const startUtc = localStart.toUTC();
          const endUtc = localEnd.toUTC();
          const sIso = startUtc.toISO()!;
          const eIso = endUtc.toISO()!;

          if (endUtc > from && startUtc < to) {
            const available = !bookingConflictsWithRows(sIso, eIso, bookingRows, bufferMin);
            slots.push({ start: sIso, end: eIso, available });
          }
          m += slotMin;
        }
      }
    }
    cursor = cursor.plus({ days: 1 }).startOf("day");
  }

  return slots;
}

export function listAvailableSlots(
  fromIso: string,
  toIso: string,
  excludeBookingId?: number
): { start: string; end: string }[] {
  return computeSlots(fromIso, toIso, excludeBookingId)
    .filter((s) => s.available)
    .map(({ start, end }) => ({ start, end }));
}

const ISO_INSTANT_MATCH_TOLERANCE_MS = 2000;

export function instantsEqual(isoA: string, isoB: string, toleranceMs = ISO_INSTANT_MATCH_TOLERANCE_MS): boolean {
  const ta = Date.parse(isoA);
  const tb = Date.parse(isoB);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) <= toleranceMs;
}

export function resolveAvailableSlot(
  startReq: string,
  endReq: string,
  excludeBookingId?: number
): { start: string; end: string } | null {
  const slots = listAvailableSlots(startReq, endReq, excludeBookingId);
  for (const s of slots) {
    if (instantsEqual(s.start, startReq) && instantsEqual(s.end, endReq)) {
      return { start: s.start, end: s.end };
    }
  }
  return null;
}
