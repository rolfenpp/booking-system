import { DateTime } from "luxon";

export const TIME_24 = "HH:mm";

export const FC_TIME_24: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
};

export function formatTimeInZone(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { setZone: true }).setZone(zone).toFormat(TIME_24);
}

export function formatTimeRangeInZone(startIso: string, endIso: string, zone: string): string {
  return `${formatTimeInZone(startIso, zone)}–${formatTimeInZone(endIso, zone)}`;
}

export function normalizeIsoUtcForApi(iso: string): string {
  const d = DateTime.fromISO(iso, { setZone: true });
  if (!d.isValid) return iso;
  return d.toUTC().toISO() ?? iso;
}
