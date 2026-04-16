import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getAvailabilityConfig, getSlotDurationMinutes } from "../db.js";
import {
  createBookingTx,
  deleteBookingById,
  getBookingForConfirm,
  listBookings,
  serviceExists,
  updateBookingTx,
} from "../services/bookingService.js";

const bookingCreateSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().max(320),
  startTime: z.string().min(10),
  endTime: z.string().min(10),
  notes: z.string().max(2000).optional().default(""),
  serviceId: z.number().int().positive().optional().nullable(),
});

const bookingUpdateSchema = bookingCreateSchema;

export const bookingsRouter = Router();

bookingsRouter.get("/", (req: Request, res: Response, next) => {
  try {
    const date =
      typeof req.query.date === "string" && req.query.date.length > 0 ? req.query.date : undefined;
    const from =
      typeof req.query.from === "string" && req.query.from.length > 0 ? req.query.from : undefined;
    const to = typeof req.query.to === "string" && req.query.to.length > 0 ? req.query.to : undefined;
    const serviceId = typeof req.query.serviceId === "string" ? Number(req.query.serviceId) : undefined;

    const result = listBookings({
      date,
      from,
      to,
      serviceId: serviceId !== undefined && Number.isFinite(serviceId) ? serviceId : undefined,
    });
    if (!Array.isArray(result)) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ bookings: result });
  } catch (e) {
    next(e);
  }
});

bookingsRouter.post("/", (req: Request, res: Response, next) => {
  try {
    const parsed = bookingCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { name, email, startTime, endTime, notes, serviceId } = parsed.data;
    if (Number.isNaN(Date.parse(startTime)) || Number.isNaN(Date.parse(endTime))) {
      res.status(400).json({ error: "startTime and endTime must be valid ISO datetimes" });
      return;
    }
    if (serviceId != null && !serviceExists(serviceId)) {
      res.status(400).json({ error: "Invalid service" });
      return;
    }
    const slotMin = getSlotDurationMinutes();
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!(end > start) || Math.abs(end - start - slotMin * 60 * 1000) > 2000) {
      res.status(400).json({ error: `Booking must match slot duration (${slotMin} min)` });
      return;
    }
    const out = createBookingTx({
      name,
      email,
      startTime,
      endTime,
      notes,
      serviceId: serviceId ?? null,
    });
    if ("conflict" in out) {
      res.status(409).json({ error: "That time is no longer available" });
      return;
    }
    res.status(201).json({ id: out.id, booking: out.booking });
  } catch (e) {
    next(e);
  }
});

bookingsRouter.put("/:id", (req: Request, res: Response, next) => {
  try {
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
    const { name, email, startTime, endTime, notes, serviceId } = parsed.data;
    if (Number.isNaN(Date.parse(startTime)) || Number.isNaN(Date.parse(endTime))) {
      res.status(400).json({ error: "Invalid datetimes" });
      return;
    }
    if (serviceId != null && !serviceExists(serviceId)) {
      res.status(400).json({ error: "Invalid service" });
      return;
    }
    const slotMin = getSlotDurationMinutes();
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!(end > start) || Math.abs(end - start - slotMin * 60 * 1000) > 2000) {
      res.status(400).json({ error: `Booking must match slot duration (${slotMin} min)` });
      return;
    }
    const out = updateBookingTx(id, {
      name,
      email,
      startTime,
      endTime,
      notes,
      serviceId: serviceId ?? null,
    });
    if ("notFound" in out) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if ("conflict" in out) {
      res.status(409).json({ error: "Slot not available or conflicts with another booking" });
      return;
    }
    res.json({ ok: true, booking: out.booking });
  } catch (e) {
    next(e);
  }
});

bookingsRouter.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  if (!deleteBookingById(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

bookingsRouter.post("/:id/confirm", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const row = getBookingForConfirm(id);
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
