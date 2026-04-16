import type { Express, Request, Response } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { APP_TIMEZONE } from "./constants.js";
import {
  db,
  getAvailabilityConfig,
  getSlotDurationMinutes,
  getTimezone,
  saveAvailabilityConfig,
  type AvailabilityConfig,
} from "./db.js";
import { computeSlots, listAvailableSlots, resolveAvailableSlot } from "./slotEngine.js";

const hmHour = z.string().regex(/^(?:[01]\d|2[0-3]):00$/, "Use HH:00 (full hours only)");

const availabilityPutSchema = z.object({
  workingDays: z.array(z.boolean()).length(7),
  dayStart: hmHour,
  dayEnd: hmHour,
  breaks: z.array(z.object({ start: hmHour, end: hmHour })),
  slotDurationMinutes: z.union([z.literal(60), z.literal(120)]),
  bufferMinutes: z.number().int().min(0).max(120),
  notificationsEnabled: z.boolean().optional(),
});

const bookingCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  start_time: z.string().min(10),
  end_time: z.string().min(10),
  notes: z.string().max(2000).optional().default(""),
  service_id: z.number().int().positive().optional().nullable(),
});

const bookingUpdateSchema = bookingCreateSchema;

function serializeAvailability(c: AvailabilityConfig) {
  return {
    workingDays: c.workingDays,
    dayStart: c.dayStart,
    dayEnd: c.dayEnd,
    breaks: c.breaks,
    timezone: c.timezone,
    slotDurationMinutes: c.slotDurationMinutes,
    bufferMinutes: c.bufferMinutes,
    notificationsEnabled: c.notificationsEnabled,
  };
}

type BookingRow = {
  id: number;
  name: string;
  email: string;
  start_time: string;
  end_time: string;
  notes: string;
  service_id: number | null;
  service_name: string | null;
};

function rowToBooking(r: BookingRow) {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    start_time: r.start_time,
    end_time: r.end_time,
    notes: r.notes,
    service_id: r.service_id,
    service_name: r.service_name,
  };
}

const serviceSchema = z.object({
  name: z.string().min(1).max(200),
  durationMinutes: z.number().int().min(5).max(480),
  price: z.number().min(0).nullable().optional(),
});

function timeToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function putAvailabilityHandler(req: Request, res: Response) {
  const parsed = availabilityPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const d = parsed.data;
  const startM = timeToMin(d.dayStart);
  const endM = timeToMin(d.dayEnd);
  if (endM <= startM) {
    res.status(400).json({ error: "dayEnd must be after dayStart" });
    return;
  }
  for (const b of d.breaks) {
    const bs = timeToMin(b.start);
    const be = timeToMin(b.end);
    if (be <= bs || bs < startM || be > endM) {
      res.status(400).json({ error: "Each break must fit inside working hours" });
      return;
    }
  }
  saveAvailabilityConfig({
    workingDays: d.workingDays,
    dayStart: d.dayStart,
    dayEnd: d.dayEnd,
    breaks: d.breaks,
    timezone: APP_TIMEZONE,
    slotDurationMinutes: d.slotDurationMinutes,
    bufferMinutes: d.bufferMinutes,
    notificationsEnabled: d.notificationsEnabled ?? getAvailabilityConfig().notificationsEnabled,
  });
  res.json({ ok: true });
}

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  function sendAvailability(_req: Request, res: Response) {
    res.json(serializeAvailability(getAvailabilityConfig()));
  }

  app.get("/api/availability", sendAvailability);
  app.get("/api/settings", sendAvailability);

  app.put("/api/availability", putAvailabilityHandler);
  app.put("/api/settings", putAvailabilityHandler);

  app.get("/api/services", (_req, res) => {
    const rows = db.prepare("SELECT id, name, duration_minutes, price FROM services ORDER BY name ASC").all() as {
      id: number;
      name: string;
      duration_minutes: number;
      price: number | null;
    }[];
    res.json({
      services: rows.map((r) => ({
        id: r.id,
        name: r.name,
        durationMinutes: r.duration_minutes,
        price: r.price,
      })),
    });
  });

  app.post("/api/services", (req, res) => {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { name, durationMinutes, price } = parsed.data;
    const info = db.prepare("INSERT INTO services (name, duration_minutes, price) VALUES (?, ?, ?)").run(
      name,
      durationMinutes,
      price ?? null
    );
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  app.put("/api/services/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { name, durationMinutes, price } = parsed.data;
    const info = db.prepare("UPDATE services SET name = ?, duration_minutes = ?, price = ? WHERE id = ?").run(
      name,
      durationMinutes,
      price ?? null,
      id
    );
    if (Number(info.changes) === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  app.delete("/api/services/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    db.prepare("UPDATE bookings SET service_id = NULL WHERE service_id = ?").run(id);
    const info = db.prepare("DELETE FROM services WHERE id = ?").run(id);
    if (Number(info.changes) === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  app.get("/api/slots", (req, res) => {
    const q = z.object({ from: z.string(), to: z.string() });
    const parsed = q.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Query params from, to (ISO datetimes)" });
      return;
    }
    try {
      const slots = computeSlots(parsed.data.from, parsed.data.to);
      res.json({ slots });
    } catch {
      res.status(400).json({ error: "Invalid date range" });
    }
  });

  app.get("/api/available-slots", (req, res) => {
    const q = z.object({ from: z.string(), to: z.string() });
    const parsed = q.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Query params from, to" });
      return;
    }
    try {
      const slots = listAvailableSlots(parsed.data.from, parsed.data.to);
      res.json({ slots });
    } catch {
      res.status(400).json({ error: "Invalid date range" });
    }
  });

  const bookingSelect = `
    SELECT b.id, b.name, b.email, b.start_time, b.end_time, b.notes, b.service_id, s.name AS service_name
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
  `;

  app.get("/api/bookings", (req, res) => {
    const date =
      typeof req.query.date === "string" && req.query.date.length > 0 ? req.query.date : undefined;
    const from =
      typeof req.query.from === "string" && req.query.from.length > 0 ? req.query.from : undefined;
    const to = typeof req.query.to === "string" && req.query.to.length > 0 ? req.query.to : undefined;
    const serviceId = typeof req.query.serviceId === "string" ? Number(req.query.serviceId) : undefined;

    if (!date && !(from && to)) {
      res.status(400).json({
        error: "Provide date=YYYY-MM-DD or both from and to (ISO datetimes) to list bookings.",
      });
      return;
    }

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ error: "date must be YYYY-MM-DD" });
        return;
      }
      const zone = getTimezone();
      const s = DateTime.fromISO(`${date}T00:00:00`, { zone }).toUTC().toISO()!;
      const e = DateTime.fromISO(`${date}T23:59:59.999`, { zone }).toUTC().toISO()!;
      let sql = `${bookingSelect} WHERE b.start_time < ? AND b.end_time > ?`;
      const params: (string | number)[] = [e, s];
      if (serviceId !== undefined && Number.isFinite(serviceId)) {
        sql += " AND b.service_id = ?";
        params.push(serviceId);
      }
      sql += " ORDER BY b.start_time ASC";
      const rows = db.prepare(sql).all(...params) as BookingRow[];
      res.json({ bookings: rows.map(rowToBooking) });
      return;
    }

    if (from && to) {
      let sql = `${bookingSelect} WHERE b.start_time < ? AND b.end_time > ?`;
      const params: (string | number)[] = [to, from];
      if (serviceId !== undefined && Number.isFinite(serviceId)) {
        sql += " AND b.service_id = ?";
        params.push(serviceId);
      }
      sql += " ORDER BY b.start_time ASC";
      const rows = db.prepare(sql).all(...params) as BookingRow[];
      res.json({ bookings: rows.map(rowToBooking) });
      return;
    }
  });

  app.post("/api/bookings", (req, res) => {
    const parsed = bookingCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { name, email, start_time, end_time, notes, service_id } = parsed.data;
    if (Number.isNaN(Date.parse(start_time)) || Number.isNaN(Date.parse(end_time))) {
      res.status(400).json({ error: "start_time and end_time must be valid ISO datetimes" });
      return;
    }
    if (service_id != null) {
      const ex = db.prepare("SELECT id FROM services WHERE id = ?").get(service_id) as { id: number } | undefined;
      if (!ex) {
        res.status(400).json({ error: "Invalid service" });
        return;
      }
    }
    const slotMin = getSlotDurationMinutes();
    const start = new Date(start_time).getTime();
    const end = new Date(end_time).getTime();
    if (!(end > start) || Math.abs(end - start - slotMin * 60 * 1000) > 2000) {
      res.status(400).json({ error: `Booking must match slot duration (${slotMin} min)` });
      return;
    }
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        const resolved = resolveAvailableSlot(start_time, end_time);
        if (!resolved) {
          db.exec("ROLLBACK");
          res.status(409).json({ error: "That time is no longer available" });
          return;
        }
        const { start: st, end: et } = resolved;
        const info = db
          .prepare("INSERT INTO bookings (name, email, start_time, end_time, notes, service_id) VALUES (?, ?, ?, ?, ?, ?)")
          .run(name, email, st, et, notes, service_id ?? null);
        db.exec("COMMIT");
        const id = Number(info.lastInsertRowid);
        res.status(201).json({ id, booking: { id, name, email, start_time: st, end_time: et, notes, service_id } });
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        throw e;
      }
    } catch {
      res.status(500).json({ error: "Could not create booking" });
    }
  });

  app.put("/api/bookings/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = bookingUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { name, email, start_time, end_time, notes, service_id } = parsed.data;
    if (Number.isNaN(Date.parse(start_time)) || Number.isNaN(Date.parse(end_time))) {
      res.status(400).json({ error: "Invalid datetimes" });
      return;
    }
    if (service_id != null) {
      const ex = db.prepare("SELECT id FROM services WHERE id = ?").get(service_id) as { id: number } | undefined;
      if (!ex) {
        res.status(400).json({ error: "Invalid service" });
        return;
      }
    }
    const slotMin = getSlotDurationMinutes();
    const start = new Date(start_time).getTime();
    const end = new Date(end_time).getTime();
    if (!(end > start) || Math.abs(end - start - slotMin * 60 * 1000) > 2000) {
      res.status(400).json({ error: `Booking must match slot duration (${slotMin} min)` });
      return;
    }
    try {
      db.exec("BEGIN IMMEDIATE");
      try {
        const existing = db.prepare("SELECT id FROM bookings WHERE id = ?").get(id) as { id: number } | undefined;
        if (!existing) {
          db.exec("ROLLBACK");
          res.status(404).json({ error: "Not found" });
          return;
        }
        const resolved = resolveAvailableSlot(start_time, end_time, id);
        if (!resolved) {
          db.exec("ROLLBACK");
          res.status(409).json({ error: "Slot not available or conflicts with another booking" });
          return;
        }
        const { start: st, end: et } = resolved;
        db.prepare("UPDATE bookings SET name = ?, email = ?, start_time = ?, end_time = ?, notes = ?, service_id = ? WHERE id = ?").run(
          name,
          email,
          st,
          et,
          notes,
          service_id ?? null,
          id
        );
        db.exec("COMMIT");
        res.json({ ok: true, booking: { id, name, email, start_time: st, end_time: et, notes, service_id } });
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        throw e;
      }
    } catch {
      res.status(500).json({ error: "Could not update booking" });
    }
  });

  app.delete("/api/bookings/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const info = db.prepare("DELETE FROM bookings WHERE id = ?").run(id);
    if (Number(info.changes) === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/api/bookings/:id/confirm", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as
      | { id: number; name: string; email: string; start_time: string; end_time: string; notes: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!getAvailabilityConfig().notificationsEnabled) {
      res.json({ ok: true, message: "Notifications disabled; no confirmation sent." });
      return;
    }
    console.log(`[mock email] To: ${row.email} — Hi ${row.name}, your booking is confirmed for ${row.start_time}.`);
    res.json({ ok: true, message: "Mock confirmation sent (see server logs)" });
  });
}
