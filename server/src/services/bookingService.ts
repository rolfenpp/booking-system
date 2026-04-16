import { DateTime } from "luxon";
import { db, getTimezone } from "../db.js";
import { resolveAvailableSlot } from "../slotEngine.js";

export type BookingRow = {
  id: number;
  name: string;
  email: string;
  start_time: string;
  end_time: string;
  notes: string;
  service_id: number | null;
  service_name: string | null;
};

export type BookingDto = {
  id: number;
  name: string;
  email: string;
  startTime: string;
  endTime: string;
  notes: string;
  serviceId: number | null;
  serviceName: string | null;
};

const bookingSelect = `
  SELECT b.id, b.name, b.email, b.start_time, b.end_time, b.notes, b.service_id, s.name AS service_name
  FROM bookings b
  LEFT JOIN services s ON s.id = b.service_id
`;

export function rowToBooking(r: BookingRow): BookingDto {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    startTime: r.start_time,
    endTime: r.end_time,
    notes: r.notes,
    serviceId: r.service_id,
    serviceName: r.service_name,
  };
}

export function listBookings(params: {
  date?: string;
  from?: string;
  to?: string;
  serviceId?: number;
}): BookingDto[] | { error: string } {
  const { date, from, to, serviceId } = params;

  if (!date && !(from && to)) {
    return { error: "Provide date=YYYY-MM-DD or both from and to (ISO datetimes) to list bookings." };
  }

  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { error: "date must be YYYY-MM-DD" };
    }
    const zone = getTimezone();
    const s = DateTime.fromISO(`${date}T00:00:00`, { zone }).toUTC().toISO()!;
    const e = DateTime.fromISO(`${date}T23:59:59.999`, { zone }).toUTC().toISO()!;
    let sql = `${bookingSelect} WHERE b.start_time < ? AND b.end_time > ?`;
    const sqlParams: (string | number)[] = [e, s];
    if (serviceId !== undefined && Number.isFinite(serviceId)) {
      sql += " AND b.service_id = ?";
      sqlParams.push(serviceId);
    }
    sql += " ORDER BY b.start_time ASC";
    const rows = db.prepare(sql).all(...sqlParams) as BookingRow[];
    return rows.map(rowToBooking);
  }

  if (from && to) {
    let sql = `${bookingSelect} WHERE b.start_time < ? AND b.end_time > ?`;
    const sqlParams: (string | number)[] = [to, from];
    if (serviceId !== undefined && Number.isFinite(serviceId)) {
      sql += " AND b.service_id = ?";
      sqlParams.push(serviceId);
    }
    sql += " ORDER BY b.start_time ASC";
    const rows = db.prepare(sql).all(...sqlParams) as BookingRow[];
    return rows.map(rowToBooking);
  }

  return { error: "Provide date=YYYY-MM-DD or both from and to (ISO datetimes) to list bookings." };
}


export function serviceExists(serviceId: number): boolean {
  const ex = db.prepare("SELECT id FROM services WHERE id = ?").get(serviceId) as { id: number } | undefined;
  return !!ex;
}

export function createBookingTx(input: {
  name: string;
  email: string;
  startTime: string;
  endTime: string;
  notes: string;
  serviceId: number | null;
}): { id: number; booking: BookingDto } | { conflict: true } {
  const { name, email, startTime, endTime, notes, serviceId } = input;
  db.exec("BEGIN IMMEDIATE");
  try {
    const resolved = resolveAvailableSlot(startTime, endTime);
    if (!resolved) {
      db.exec("ROLLBACK");
      return { conflict: true };
    }
    const { start: st, end: et } = resolved;
    const info = db
      .prepare("INSERT INTO bookings (name, email, start_time, end_time, notes, service_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(name, email, st, et, notes, serviceId);
    const id = Number(info.lastInsertRowid);
    db.exec("COMMIT");
    const row = db.prepare(`${bookingSelect} WHERE b.id = ?`).get(id) as BookingRow | undefined;
    const dto = row ? rowToBooking(row) : { id, name, email, startTime: st, endTime: et, notes, serviceId, serviceName: null };
    return { id, booking: dto };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[server] Rollback after createBooking failed:", rollbackErr);
    }
    throw e;
  }
}

export function updateBookingTx(
  id: number,
  input: {
    name: string;
    email: string;
    startTime: string;
    endTime: string;
    notes: string;
    serviceId: number | null;
  }
): { ok: true; booking: BookingDto } | { notFound: true } | { conflict: true } {
  const { name, email, startTime, endTime, notes, serviceId } = input;
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT id FROM bookings WHERE id = ?").get(id) as { id: number } | undefined;
    if (!existing) {
      db.exec("ROLLBACK");
      return { notFound: true };
    }
    const resolved = resolveAvailableSlot(startTime, endTime, id);
    if (!resolved) {
      db.exec("ROLLBACK");
      return { conflict: true };
    }
    const { start: st, end: et } = resolved;
    db.prepare("UPDATE bookings SET name = ?, email = ?, start_time = ?, end_time = ?, notes = ?, service_id = ? WHERE id = ?").run(
      name,
      email,
      st,
      et,
      notes,
      serviceId,
      id
    );
    db.exec("COMMIT");
    const row = db.prepare(`${bookingSelect} WHERE b.id = ?`).get(id) as BookingRow;
    return { ok: true, booking: rowToBooking(row) };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch (rollbackErr) {
      console.error("[server] Rollback after updateBooking failed:", rollbackErr);
    }
    throw e;
  }
}

export function deleteBookingById(id: number): boolean {
  const info = db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
  return Number(info.changes) > 0;
}

export function getBookingForConfirm(id: number):
  | { id: number; name: string; email: string; start_time: string; end_time: string; notes: string }
  | undefined {
  return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as
    | { id: number; name: string; email: string; start_time: string; end_time: string; notes: string }
    | undefined;
}
