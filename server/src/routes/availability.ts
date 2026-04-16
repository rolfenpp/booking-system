import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { getSerializedAvailability, validateAndSaveAvailability } from "../services/availabilityService.js";

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

export const availabilityRouter = Router();

availabilityRouter.get("/", (_req: Request, res: Response) => {
  res.json(getSerializedAvailability());
});

availabilityRouter.put("/", (req: Request, res: Response) => {
  const parsed = availabilityPutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = validateAndSaveAvailability(parsed.data);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});
