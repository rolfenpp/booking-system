import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { computeSlots, listAvailableSlots } from "../slotEngine.js";

export const slotsRouter = Router();

slotsRouter.get("/slots", (req: Request, res: Response) => {
  const q = z.object({ from: z.string(), to: z.string() });
  const parsed = q.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Query params from, to (ISO datetimes)" });
    return;
  }
  try {
    const slots = computeSlots(parsed.data.from, parsed.data.to);
    res.json({ slots });
  } catch (e) {
    console.error("[api] /slots:", e);
    res.status(400).json({ error: "Invalid date range" });
  }
});

slotsRouter.get("/available-slots", (req: Request, res: Response) => {
  const q = z.object({ from: z.string(), to: z.string() });
  const parsed = q.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Query params from, to" });
    return;
  }
  try {
    const slots = listAvailableSlots(parsed.data.from, parsed.data.to);
    res.json({ slots });
  } catch (e) {
    console.error("[api] /available-slots:", e);
    res.status(400).json({ error: "Invalid date range" });
  }
});
