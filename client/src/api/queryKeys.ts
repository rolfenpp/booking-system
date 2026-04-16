import type { ViewMode } from "../lib/dateRange";

export const queryKeys = {
  availability: () => ["availability"] as const,

  services: () => ["services"] as const,

  slots: {
    range: (from: string, to: string) => ["slots", from, to] as const,
    day: (pickDate: string) => ["slots", "day", pickDate] as const,
    root: ["slots"] as const,
  },

  admin: {
    schedule: (view: ViewMode, anchorMs: number) => ["admin", "schedule", view, anchorMs] as const,
    bookingsList: (date: string, serviceId: number | "") => ["admin", "bookingsList", date, serviceId] as const,
    root: ["admin"] as const,
  },
};
