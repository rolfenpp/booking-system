import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./httpError.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    if (err.details != null) {
      res.status(err.statusCode).json({ error: err.message, details: err.details });
      return;
    }
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong" });
}
