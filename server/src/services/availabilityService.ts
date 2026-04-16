import { APP_TIMEZONE } from "../constants.js";
import { getAvailabilityConfig, saveAvailabilityConfig, type AvailabilityConfig } from "../db.js";

export function serializeAvailability(c: AvailabilityConfig) {
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

export function getSerializedAvailability() {
  return serializeAvailability(getAvailabilityConfig());
}

export type AvailabilityPutInput = {
  workingDays: boolean[];
  dayStart: string;
  dayEnd: string;
  breaks: { start: string; end: string }[];
  slotDurationMinutes: 60 | 120;
  bufferMinutes: number;
  notificationsEnabled?: boolean;
};

function timeToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function validateAndSaveAvailability(d: AvailabilityPutInput): { ok: true } | { ok: false; error: string } {
  const startM = timeToMin(d.dayStart);
  const endM = timeToMin(d.dayEnd);
  if (endM <= startM) {
    return { ok: false, error: "dayEnd must be after dayStart" };
  }
  for (const b of d.breaks) {
    const bs = timeToMin(b.start);
    const be = timeToMin(b.end);
    if (be <= bs || bs < startM || be > endM) {
      return { ok: false, error: "Each break must fit inside working hours" };
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
  return { ok: true };
}
