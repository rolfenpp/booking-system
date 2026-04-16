import type { EventApi, EventClickArg, EventContentArg, EventInput } from "@fullcalendar/core";
import svLocale from "@fullcalendar/core/locales/sv";
import interactionPlugin from "@fullcalendar/interaction";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import FullCalendar from "@fullcalendar/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocale } from "../context/LocaleContext";
import type { Booking, Slot } from "../api/client";
import type { MessageKey } from "../i18n/messages";
import type { ViewMode } from "../lib/dateRange";
import { APP_TIMEZONE } from "../constants/timezone";
import { FC_TIME_24, formatTimeRangeInZone } from "../lib/timeDisplay";

function buildEventTooltip(
  event: EventApi,
  tz: string,
  t: (key: MessageKey, vars?: Record<string, string>) => string
): string {
  const booking = event.extendedProps.booking as Booking | undefined;
  if (booking) {
    const parts: string[] = [
      booking.name,
      booking.email,
      formatTimeRangeInZone(booking.startTime, booking.endTime, tz),
    ];
    if (booking.serviceName) parts.push(booking.serviceName);
    if (booking.notes?.trim()) {
      const n = booking.notes.trim();
      parts.push(`${t("calTooltipNotes")}: ${n.length > 100 ? `${n.slice(0, 100)}…` : n}`);
    }
    parts.push(t("calTooltipEdit"));
    return parts.join(" · ");
  }
  const start = event.startStr;
  const end = event.endStr;
  if (!start || !end) return event.title || "";
  const range = formatTimeRangeInZone(start, end, tz);
  if (event.extendedProps.available === true) {
    return `${range} · ${t("calSlotAvailable")} · ${t("calTooltipAvailable")}`;
  }
  if (event.extendedProps.available === false) {
    return `${range} · ${t("calSlotBooked")}`;
  }
  return [range, event.title].filter(Boolean).join(" · ");
}

const TIME_GRID_FALLBACK_MIN = "09:00:00";
const TIME_GRID_FALLBACK_MAX = "22:00:00";
const MONTH_VIEW_HEIGHT = 640;
const TIME_GRID_VIEW_HEIGHT = 540;

function toSlotDurationStr(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function timeGridFromAvailability(dayStart: string, dayEnd: string): {
  slotMinTime: string;
  slotMaxTime: string;
  scrollTime: string;
} {
  const slotMinTime = `${dayStart}:00`;
  const scrollTime = slotMinTime;
  const [eh, em] = dayEnd.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(eh) || !Number.isFinite(em)) {
    return { slotMinTime, slotMaxTime: TIME_GRID_FALLBACK_MAX, scrollTime };
  }
  const endTotal = Math.min(24 * 60, eh * 60 + em + 60);
  const sh = Math.floor(endTotal / 60);
  const sm = endTotal % 60;
  const slotMaxTime = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`;
  return { slotMinTime, slotMaxTime, scrollTime };
}

type Props = {
  view: ViewMode;
  anchor: Date;
  slots: Slot[];
  slotDurationMinutes: number;
  availabilityHours?: { dayStart: string; dayEnd: string };
  calendarEvents?: EventInput[];
  onSlotClick?: (startIso: string, endIso: string) => void;
  onBookingClick?: (booking: Booking) => void;
};

function viewToInitial(view: ViewMode): string {
  if (view === "month") return "dayGridMonth";
  if (view === "week") return "timeGridWeek";
  return "timeGridDay";
}

export function ScheduleCalendar({
  view,
  anchor,
  slots,
  slotDurationMinutes,
  availabilityHours,
  calendarEvents,
  onSlotClick,
  onBookingClick,
}: Props) {
  const { t, locale } = useLocale();
  const calRef = useRef<FullCalendar>(null);
  const fcView = viewToInitial(view);
  const isTimeGrid = view === "week" || view === "day";
  const slotDur = toSlotDurationStr(slotDurationMinutes);
  const timeGrid = useMemo(
    () =>
      availabilityHours
        ? timeGridFromAvailability(availabilityHours.dayStart, availabilityHours.dayEnd)
        : {
            slotMinTime: TIME_GRID_FALLBACK_MIN,
            slotMaxTime: TIME_GRID_FALLBACK_MAX,
            scrollTime: TIME_GRID_FALLBACK_MIN,
          },
    [availabilityHours]
  );

  const events = useMemo<EventInput[]>(() => {
    if (calendarEvents !== undefined) return calendarEvents;
    return slots.map((s) => ({
      id: s.start,
      title: s.available ? t("calSlotAvailable") : t("calSlotBooked"),
      start: s.start,
      end: s.end,
      display: "block",
      extendedProps: { available: s.available },
      classNames: s.available ? ["fc-slot-free"] : ["fc-slot-busy"],
    }));
  }, [calendarEvents, slots, t]);

  useEffect(() => {
    const api = calRef.current?.getApi();
    if (!api) return;
    if (api.view.type !== fcView) {
      api.changeView(fcView);
    }
    api.gotoDate(anchor);
  }, [anchor, fcView]);

  const handleEventDidMount = useCallback(
    (info: { event: EventApi; el: HTMLElement }) => {
      info.el.setAttribute("title", buildEventTooltip(info.event, APP_TIMEZONE, t));
    },
    [t]
  );

  const renderEventContent = useCallback((arg: EventContentArg) => {
    const vt = arg.view.type;
    if (vt !== "timeGridWeek" && vt !== "timeGridDay") {
      return true;
    }
    const time = arg.timeText ?? "";
    const title = arg.event.title ?? "";
    return (
      <div className="fc-timegrid-event-inline">
        {time && <span className="fc-timegrid-event-inline__time">{time}</span>}
        {title && <span className="fc-timegrid-event-inline__title">{title}</span>}
      </div>
    );
  }, []);

  const handleEventClick = useCallback(
    (info: EventClickArg) => {
      const booking = info.event.extendedProps.booking as Booking | undefined;
      if (booking && onBookingClick) {
        info.jsEvent.preventDefault();
        onBookingClick(booking);
        return;
      }
      if (!onSlotClick) return;
      const available = Boolean(info.event.extendedProps.available);
      if (!available) return;
      info.jsEvent.preventDefault();
      const s = info.event.start;
      const e = info.event.end;
      if (s && e) {
        onSlotClick(s.toISOString(), e.toISOString());
        return;
      }
      const startIso = info.event.startStr;
      const endIso = info.event.endStr;
      if (startIso && endIso) onSlotClick(startIso, endIso);
    },
    [onBookingClick, onSlotClick]
  );

  return (
    <div className="fc-shell">
      <FullCalendar
        ref={calRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        locale={locale === "sv" ? svLocale : undefined}
        initialView={fcView}
        initialDate={anchor}
        timeZone={APP_TIMEZONE}
        headerToolbar={false}
        events={events}
        eventContent={renderEventContent}
        eventDidMount={handleEventDidMount}
        eventClick={onSlotClick || onBookingClick ? handleEventClick : undefined}
        height="auto"
        contentHeight={view === "month" ? MONTH_VIEW_HEIGHT : TIME_GRID_VIEW_HEIGHT}
        slotDuration={slotDur}
        snapDuration={slotDur}
        slotMinTime={isTimeGrid ? timeGrid.slotMinTime : "00:00:00"}
        slotMaxTime={isTimeGrid ? timeGrid.slotMaxTime : "24:00:00"}
        scrollTime={isTimeGrid ? timeGrid.scrollTime : "08:00:00"}
        allDaySlot={false}
        nowIndicator={view !== "month"}
        firstDay={1}
        dayMaxEvents={view === "month" ? 4 : undefined}
        selectable={false}
        editable={false}
        eventStartEditable={false}
        eventDurationEditable={false}
        stickyHeaderDates
        slotLabelFormat={FC_TIME_24}
        eventTimeFormat={FC_TIME_24}
      />
    </div>
  );
}
