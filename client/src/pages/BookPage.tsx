import { Alert, CircularProgress } from "@mui/material";
import { useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { useAvailabilityQuery, useSlotsRangeQuery } from "../api/hooks";
import { APP_TIMEZONE } from "../constants/timezone";
import { BookingModal } from "../components/BookingModal";
import { ScheduleCalendar } from "../components/ScheduleCalendar";
import { CalendarToolbar } from "../components/calendar/CalendarToolbar";
import { PageCard } from "../components/layout/PageCard";
import { formatCalendarTitle, type CalendarTitleView } from "../lib/calendarTitle";
import { goToToday, navigateAnchor, rangeForView, type ViewMode } from "../lib/dateRange";

const VIEW_KEYS = { month: "bookViewMonth", week: "bookViewWeek", day: "bookViewDay" } as const;

export function BookPage() {
  const { locale, t } = useLocale();
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState<{ start: string; end: string } | null>(null);

  const range = useMemo(() => rangeForView(view, anchor, APP_TIMEZONE), [view, anchor]);

  const availabilityQuery = useAvailabilityQuery();
  const slotsQuery = useSlotsRangeQuery(range.from, range.to, !!availabilityQuery.data);

  const settings = availabilityQuery.data;
  const slots = slotsQuery.data ?? [];
  const loading = availabilityQuery.isPending || (!!settings && slotsQuery.isPending);
  const error =
    availabilityQuery.isError
      ? availabilityQuery.error instanceof Error
        ? availabilityQuery.error.message
        : t("bookErrorSettings")
      : slotsQuery.isError
        ? slotsQuery.error instanceof Error
          ? slotsQuery.error.message
          : t("bookErrorSchedule")
        : null;

  const title = useMemo(
    () => formatCalendarTitle(anchor, view as CalendarTitleView, locale),
    [anchor, view, locale]
  );

  const viewTabs = useMemo(
    () =>
      (["month", "week", "day"] as const).map((m) => ({
        id: m,
        label: t(VIEW_KEYS[m]),
      })),
    [t]
  );

  function onToday() {
    setAnchor(goToToday(view, APP_TIMEZONE));
  }

  return (
    <div>
      <PageCard title={t("bookTitle")} subtitle={t("bookSub")}>
        <CalendarToolbar
          views={viewTabs}
          activeView={view}
          onViewChange={(id) => setView(id as ViewMode)}
          viewsAriaLabel={t("bookAriaCalView")}
          title={title}
          onPrev={() => setAnchor((a) => navigateAnchor(view, a, -1, APP_TIMEZONE))}
          onNext={() => setAnchor((a) => navigateAnchor(view, a, 1, APP_TIMEZONE))}
          onToday={onToday}
          prevAria={t("bookAriaPrev")}
          nextAria={t("bookAriaNext")}
          todayLabel={t("bookToday")}
        />

        {loading && <CircularProgress size={28} sx={{ display: "block", mx: "auto", my: 2 }} />}
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        {!loading && settings && (
          <ScheduleCalendar
            view={view}
            anchor={anchor}
            slotDurationMinutes={settings.slotDurationMinutes}
            availabilityHours={{ dayStart: settings.dayStart, dayEnd: settings.dayEnd }}
            slots={slots}
            onSlotClick={(start, end) => setModal({ start, end })}
          />
        )}
      </PageCard>

      {settings && (
        <BookingModal
          open={!!modal}
          start={modal?.start ?? ""}
          end={modal?.end ?? ""}
          notificationsEnabled={settings.notificationsEnabled}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
