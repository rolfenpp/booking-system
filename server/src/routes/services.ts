import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db.js";

const serviceSchema = z.object({
  name: z.string().min(1).max(200),
  durationMinutes: z.number().int().min(5).max(480),
  price: z.number().min(0).nullable().optional(),
});

export const servicesRouter = Router();

servicesRouter.get("/", (_req: Request, res: Response) => {
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

servicesRouter.post("/", (req: Request, res: Response) => {
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

servicesRouter.put("/:id", (req: Request, res: Response) => {
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

servicesRouter.delete("/:id", (req: Request, res: Response) => {
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
