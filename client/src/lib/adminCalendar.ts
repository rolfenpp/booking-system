import type { EventInput } from "@fullcalendar/core";
import type { Booking, Slot } from "../api/client";

export function timeToMin(s: string): number {
  const [h, mm] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (mm ?? 0);
}

export function buildMergedCalendarEvents(
  slots: Slot[],
  bookings: Booking[],
  slotLabels: { available: string; booked: string }
): EventInput[] {
  const bookingStartMs = new Set(bookings.map((b) => Date.parse(b.startTime)).filter((n) => !Number.isNaN(n)));
  const ev: EventInput[] = [];
  for (const b of bookings) {
    ev.push({
      id: `booking-${b.id}`,
      title: b.serviceName ? `${b.name} · ${b.serviceName}` : b.name,
      start: b.startTime,
      end: b.endTime,
      display: "block",
      extendedProps: { available: false, booking: b },
      classNames: ["fc-booking-detail"],
    });
  }
  for (const s of slots) {
    const slotStartMs = Date.parse(s.start);
    if (!Number.isNaN(slotStartMs) && bookingStartMs.has(slotStartMs)) continue;
    ev.push({
      id: s.start,
      title: s.available ? slotLabels.available : slotLabels.booked,
      start: s.start,
      end: s.end,
      display: "block",
      extendedProps: { available: s.available },
      classNames: s.available ? ["fc-slot-free"] : ["fc-slot-busy"],
    });
  }
  return ev;
}
