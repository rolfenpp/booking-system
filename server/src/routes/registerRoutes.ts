import type { Express } from "express";
import { availabilityRouter } from "./availability.js";
import { bookingsRouter } from "./bookings.js";
import { servicesRouter } from "./services.js";
import { slotsRouter } from "./slots.js";

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/availability", availabilityRouter);
  app.use("/api/services", servicesRouter);
  app.use("/api", slotsRouter);
  app.use("/api/bookings", bookingsRouter);
}
