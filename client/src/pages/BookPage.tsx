import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { useLocale } from "../context/LocaleContext";
import { useAvailabilityQuery, useSlotsRangeQuery } from "../api/hooks";
import { APP_TIMEZONE } from "../constants/timezone";
import { BookingModal } from "../components/BookingModal";
import { ScheduleCalendar } from "../components/ScheduleCalendar";
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

  const title = useMemo(() => {
    const loc = locale === "sv" ? "sv" : "en";
    const dt = DateTime.fromJSDate(anchor, { zone: APP_TIMEZONE }).setLocale(loc);
    if (view === "day") return dt.toFormat("cccc, LLL d, yyyy");
    if (view === "week") {
      const a = dt.startOf("week");
      const b = dt.endOf("week");
      return `${a.toFormat("LLL d")} – ${b.toFormat("LLL d, yyyy")}`;
    }
    return dt.toFormat("LLLL yyyy");
  }, [anchor, view, locale]);

  function onToday() {
    setAnchor(goToToday(view, APP_TIMEZONE));
  }

  return (
    <div>
      <div className="card">
        <h1 className="card-title">{t("bookTitle")}</h1>
        <p className="card-sub">{t("bookSub")}</p>

        <div className="cal-toolbar">
          <div className="cal-toolbar__views" role="tablist" aria-label={t("bookAriaCalView")}>
            {(["month", "week", "day"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={view === m}
                className={view === m ? "is-active" : ""}
                onClick={() => setView(m)}
              >
                {t(VIEW_KEYS[m])}
              </button>
            ))}
          </div>
          <div className="cal-toolbar__nav">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnchor((a) => navigateAnchor(view, a, -1, APP_TIMEZONE))} aria-label={t("bookAriaPrev")}>
              ‹
            </button>
            <span className="cal-toolbar__title">{title}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAnchor((a) => navigateAnchor(view, a, 1, APP_TIMEZONE))} aria-label={t("bookAriaNext")}>
              ›
            </button>
            <button type="button" className="btn btn-sm" onClick={onToday}>
              {t("bookToday")}
            </button>
          </div>
        </div>

        {loading && <p className="muted">{t("bookLoading")}</p>}
        {error && <p className="error-text">{error}</p>}

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
      </div>

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
