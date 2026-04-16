import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { APP_TIMEZONE } from "./constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_PATH ?? path.join(__dirname, "..", "data", "app.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode = WAL;`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings(start_time);
  CREATE INDEX IF NOT EXISTS idx_bookings_range ON bookings(start_time, end_time);

  CREATE TABLE IF NOT EXISTS weekday_availability (
    weekday INTEGER PRIMARY KEY CHECK (weekday >= 0 AND weekday <= 6),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    start_minutes INTEGER NOT NULL DEFAULT 540,
    end_minutes INTEGER NOT NULL DEFAULT 1020
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    price REAL
  );

  CREATE TABLE IF NOT EXISTS availability_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    working_days TEXT NOT NULL DEFAULT '[true,true,true,true,true,false,false]',
    day_start TEXT NOT NULL DEFAULT '07:00',
    day_end TEXT NOT NULL DEFAULT '16:00',
    breaks TEXT NOT NULL DEFAULT '[]',
    timezone TEXT NOT NULL DEFAULT 'Europe/Stockholm',
    slot_duration_minutes INTEGER NOT NULL DEFAULT 60,
    buffer_minutes INTEGER NOT NULL DEFAULT 0,
    notifications_enabled INTEGER NOT NULL DEFAULT 0 CHECK (notifications_enabled IN (0, 1))
  );
`);

function tableHasColumn(table: string, col: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === col);
}

if (!tableHasColumn("bookings", "service_id")) {
  db.exec(`ALTER TABLE bookings ADD COLUMN service_id INTEGER REFERENCES services(id)`);
}

const countAvail = db.prepare("SELECT COUNT(*) as c FROM availability_config").get() as { c: number };
if (countAvail.c === 0) {
  const wd = JSON.stringify([true, true, true, true, true, false, false]);
  const tz = getSetting("timezone") ?? APP_TIMEZONE;
  const sd = getSetting("slot_duration_minutes") ?? "60";
  const bf = getSetting("buffer_minutes") ?? "0";
  let ds = "07:00";
  let de = "16:00";
  const n = db.prepare("SELECT COUNT(*) as c FROM weekday_availability").get() as { c: number };
  if (n.c > 0) {
    const row = db
      .prepare("SELECT start_minutes, end_minutes FROM weekday_availability WHERE enabled = 1 LIMIT 1")
      .get() as { start_minutes: number; end_minutes: number } | undefined;
    if (row) {
      ds = `${String(Math.floor(row.start_minutes / 60)).padStart(2, "0")}:${String(row.start_minutes % 60).padStart(2, "0")}`;
      de = `${String(Math.floor(row.end_minutes / 60)).padStart(2, "0")}:${String(row.end_minutes % 60).padStart(2, "0")}`;
    }
  }
  const slotM = parseInt(sd, 10) || 60;
  db.prepare(
    `INSERT INTO availability_config (id, working_days, day_start, day_end, breaks, timezone, slot_duration_minutes, buffer_minutes, notifications_enabled)
     VALUES (1, ?, ?, ?, '[]', ?, ?, ?, 0)`
  ).run(wd, ds, de, tz, slotM, parseInt(bf, 10) || 0);
}

try {
  db.prepare(`UPDATE availability_config SET timezone = ? WHERE 1 = 1`).run(APP_TIMEZONE);
} catch {}

try {
  db.prepare(
    `UPDATE availability_config SET slot_duration_minutes = 60 WHERE id = 1 AND slot_duration_minutes NOT IN (60, 120)`
  ).run();
} catch {}

try {
  db.prepare(
    `UPDATE availability_config SET
      day_start = '07:00',
      day_end = '16:00',
      slot_duration_minutes = 60
    WHERE id = 1 AND day_start = '09:00' AND day_end = '17:00'`
  ).run();
} catch {}

try {
  const row = db.prepare("SELECT day_start, day_end, breaks FROM availability_config WHERE id = 1").get() as
    | { day_start: string; day_end: string; breaks: string }
    | undefined;
  if (row) {
    const toHour = (t: string) => {
      const m = t.match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return t;
      let h = parseInt(m[1]!, 10);
      if (!Number.isFinite(h) || h < 0 || h > 23) return t;
      return `${String(h).padStart(2, "0")}:00`;
    };
    let breaksJson = row.breaks;
    try {
      const br = JSON.parse(row.breaks) as { start: string; end: string }[];
      if (Array.isArray(br)) {
        breaksJson = JSON.stringify(br.map((b) => ({ start: toHour(b.start), end: toHour(b.end) })));
      }
    } catch {}
    db.prepare("UPDATE availability_config SET day_start = ?, day_end = ?, breaks = ? WHERE id = 1").run(
      toHour(row.day_start),
      toHour(row.day_end),
      breaksJson
    );
  }
} catch {}

const svcCount = db.prepare("SELECT COUNT(*) as c FROM services").get() as { c: number };
if (svcCount.c === 0) {
  db.prepare("INSERT INTO services (name, duration_minutes, price) VALUES (?, ?, ?)").run("Standard appointment", 60, null);
}

const wn = db.prepare("SELECT COUNT(*) as c FROM weekday_availability").get() as { c: number };
if (wn.c === 0) {
  const ins = db.prepare(
    "INSERT INTO weekday_availability (weekday, enabled, start_minutes, end_minutes) VALUES (?, ?, ?, ?)"
  );
  for (let d = 0; d < 7; d++) {
    const weekend = d === 5 || d === 6;
    ins.run(d, weekend ? 0 : 1, 7 * 60, 16 * 60);
  }
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  db.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    value
  );
}

if (!getSetting("availability_morning_slots_v1")) {
  const parseHhMm = (s: string): number | null => {
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1]!, 10);
    const min = parseInt(m[2]!, 10);
    if (!Number.isFinite(h) || h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  };
  try {
    const row = db.prepare("SELECT day_start, breaks FROM availability_config WHERE id = 1").get() as
      | { day_start: string; breaks: string }
      | undefined;
    if (row) {
      let nextStart = row.day_start;
      if (row.day_start === "11:00") nextStart = "07:00";

      let nextBreaks = row.breaks;
      try {
        const br = JSON.parse(row.breaks) as { start: string; end: string }[];
        if (Array.isArray(br)) {
          const filtered = br.filter((b) => {
            if (!b || typeof b.start !== "string" || typeof b.end !== "string") return true;
            const startM = parseHhMm(b.start);
            const endM = parseHhMm(b.end);
            if (startM == null || endM == null) return true;
            if (endM === 11 * 60 && endM - startM >= 180) return false;
            return true;
          });
          if (filtered.length !== br.length) nextBreaks = JSON.stringify(filtered);
        }
      } catch {}

      if (nextStart !== row.day_start || nextBreaks !== row.breaks) {
        db.prepare("UPDATE availability_config SET day_start = ?, breaks = ? WHERE id = 1").run(nextStart, nextBreaks);
      }
    }
  } catch {}
  setSetting("availability_morning_slots_v1", "1");
}

export type BreakPeriod = { start: string; end: string };

export type AvailabilityConfig = {
  workingDays: boolean[];
  dayStart: string;
  dayEnd: string;
  breaks: BreakPeriod[];
  timezone: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  notificationsEnabled: boolean;
};

export function getAvailabilityConfig(): AvailabilityConfig {
  const row = db.prepare("SELECT * FROM availability_config WHERE id = 1").get() as {
    working_days: string;
    day_start: string;
    day_end: string;
    breaks: string;
    timezone: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    notifications_enabled: number;
  };
  if (!row) {
    return {
      workingDays: [true, true, true, true, true, false, false],
      dayStart: "07:00",
      dayEnd: "16:00",
      breaks: [],
      timezone: APP_TIMEZONE,
      slotDurationMinutes: 60,
      bufferMinutes: 10,
      notificationsEnabled: false,
    };
  }
  let workingDays: boolean[] = [true, true, true, true, true, false, false];
  try {
    const parsed = JSON.parse(row.working_days) as boolean[];
    if (Array.isArray(parsed) && parsed.length === 7) workingDays = parsed.map(Boolean);
  } catch {}
  let breaks: BreakPeriod[] = [];
  try {
    const parsed = JSON.parse(row.breaks) as BreakPeriod[];
    if (Array.isArray(parsed)) breaks = parsed.filter((b) => b && typeof b.start === "string" && typeof b.end === "string");
  } catch {}
  return {
    workingDays,
    dayStart: row.day_start,
    dayEnd: row.day_end,
    breaks,
    timezone: row.timezone,
    slotDurationMinutes: row.slot_duration_minutes === 120 ? 120 : 60,
    bufferMinutes: row.buffer_minutes,
    notificationsEnabled: Boolean(row.notifications_enabled),
  };
}

export function saveAvailabilityConfig(c: AvailabilityConfig) {
  db.prepare(
    `UPDATE availability_config SET
      working_days = ?,
      day_start = ?,
      day_end = ?,
      breaks = ?,
      timezone = ?,
      slot_duration_minutes = ?,
      buffer_minutes = ?,
      notifications_enabled = ?
    WHERE id = 1`
  ).run(
    JSON.stringify(c.workingDays),
    c.dayStart,
    c.dayEnd,
    JSON.stringify(c.breaks),
    c.timezone,
    c.slotDurationMinutes,
    c.bufferMinutes,
    c.notificationsEnabled ? 1 : 0
  );
}

export function getSlotDurationMinutes(): number {
  return getAvailabilityConfig().slotDurationMinutes;
}

export function getBufferMinutes(): number {
  return getAvailabilityConfig().bufferMinutes;
}

export function getTimezone(): string {
  return getAvailabilityConfig().timezone;
}

export type WeekdayRow = {
  weekday: number;
  enabled: number;
  start_minutes: number;
  end_minutes: number;
};

export function getWeekdayRows(): WeekdayRow[] {
  return db.prepare("SELECT weekday, enabled, start_minutes, end_minutes FROM weekday_availability ORDER BY weekday").all() as WeekdayRow[];
}
