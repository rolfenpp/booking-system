import { DateTime } from "luxon";

export type ViewMode = "month" | "week" | "day";

export function rangeForView(mode: ViewMode, anchor: Date, zone: string): { from: string; to: string } {
  const z = zone || "UTC";
  const dt = DateTime.fromJSDate(anchor, { zone: z });

  if (mode === "day") {
    const start = dt.startOf("day");
    const end = dt.endOf("day");
    return { from: start.toUTC().toISO()!, to: end.toUTC().toISO()! };
  }

  if (mode === "week") {
    const start = dt.startOf("week");
    const end = dt.endOf("week");
    return { from: start.toUTC().toISO()!, to: end.toUTC().toISO()! };
  }

  const first = dt.startOf("month");
  const last = dt.endOf("month");
  const gridStart = first.startOf("week");
  const gridEnd = last.endOf("week");
  return { from: gridStart.toUTC().toISO()!, to: gridEnd.toUTC().toISO()! };
}

export function navigateAnchor(mode: ViewMode, anchor: Date, delta: number, zone: string): Date {
  const z = zone || "UTC";
  let dt = DateTime.fromJSDate(anchor, { zone: z });
  if (mode === "day") dt = dt.plus({ days: delta });
  else if (mode === "week") dt = dt.plus({ weeks: delta });
  else dt = dt.plus({ months: delta });
  return dt.toJSDate();
}

export function goToToday(mode: ViewMode, zone: string): Date {
  const z = zone || "UTC";
  const now = DateTime.now().setZone(z);
  if (mode === "day") return now.startOf("day").toJSDate();
  if (mode === "week") return now.startOf("week").toJSDate();
  return now.startOf("month").toJSDate();
}

export function formatInZone(iso: string, zone: string, opts: Intl.DateTimeFormatOptions): string {
  return DateTime.fromISO(iso, { setZone: true }).setZone(zone).toLocaleString(opts);
}
