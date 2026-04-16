import { DateTime } from "luxon";
import { APP_TIMEZONE } from "../constants/timezone";

export type CalendarTitleView = "month" | "week" | "day";

export function formatCalendarTitle(anchor: Date, view: CalendarTitleView, locale: "en" | "sv"): string {
  const loc = locale === "sv" ? "sv" : "en";
  const dt = DateTime.fromJSDate(anchor, { zone: APP_TIMEZONE }).setLocale(loc);
  if (view === "day") return dt.toFormat("cccc, LLL d, yyyy");
  if (view === "week") {
    const a = dt.startOf("week");
    const b = dt.endOf("week");
    return `${a.toFormat("LLL d")} – ${b.toFormat("LLL d, yyyy")}`;
  }
  return dt.toFormat("LLLL yyyy");
}
