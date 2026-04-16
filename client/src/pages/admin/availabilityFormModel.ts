import type { Availability } from "../../api/client";

export type AvailabilityFormValues = {
  slotDurationMinutes: number;
  bufferMinutes: number;
  notificationsEnabled: boolean;
  dayStart: string;
  dayEnd: string;
  workingDays: boolean[];
  breaks: { start: string; end: string }[];
};

export function availabilityToForm(a: Availability): AvailabilityFormValues {
  return {
    slotDurationMinutes: a.slotDurationMinutes,
    bufferMinutes: a.bufferMinutes,
    notificationsEnabled: a.notificationsEnabled,
    dayStart: a.dayStart,
    dayEnd: a.dayEnd,
    workingDays: [...a.workingDays],
    breaks: a.breaks.length ? a.breaks.map((b) => ({ ...b })) : [],
  };
}

export function formToAvailabilityPayload(data: AvailabilityFormValues) {
  const slotDurationMinutes = data.slotDurationMinutes === 120 ? 120 : 60;
  return {
    workingDays: data.workingDays,
    dayStart: data.dayStart,
    dayEnd: data.dayEnd,
    breaks: data.breaks.filter((b) => b.start && b.end),
    slotDurationMinutes,
    bufferMinutes: data.bufferMinutes,
    notificationsEnabled: data.notificationsEnabled,
  };
}
