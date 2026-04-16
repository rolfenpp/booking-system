import type { EventInput } from "@fullcalendar/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  deleteBooking,
  deleteService,
  createService,
  updateAvailability,
  updateBooking,
  updateService,
  type Availability,
  type Booking,
  type Service,
  type Slot,
} from "../api/client";
import {
  useAdminBookingsListQuery,
  useAdminScheduleQuery,
  useAvailabilityQuery,
  useEditDaySlotsQuery,
  useServicesQuery,
} from "../api/hooks";
import {
  invalidateAfterAvailabilityWrite,
  invalidateAfterBookingWrite,
  invalidateAfterServiceWrite,
} from "../api/queryInvalidation";
import { APP_TIMEZONE } from "../constants/timezone";
import { ScheduleCalendar } from "../components/ScheduleCalendar";
import { useLocale } from "../context/LocaleContext";
import { goToToday, navigateAnchor, type ViewMode } from "../lib/dateRange";
import { TIME_24 } from "../lib/timeDisplay";

type Section = "bookings" | "services" | "availability" | "settings";
type BookingsSub = "list" | "calendar";
type CalView = "week" | "day";

const LS_ADMIN_BOOKINGS_TAB = "booking-admin-default-bookings-sub";
const LS_ADMIN_CAL_VIEW = "booking-admin-default-cal-view";

function loadSavedBookingsSub(): BookingsSub {
  try {
    const v = localStorage.getItem(LS_ADMIN_BOOKINGS_TAB);
    if (v === "list" || v === "calendar") return v;
  } catch {}
  return "list";
}

function loadSavedCalView(): CalView {
  try {
    const v = localStorage.getItem(LS_ADMIN_CAL_VIEW);
    if (v === "week" || v === "day") return v;
  } catch {}
  return "week";
}

function timeToMin(s: string): number {
  const [h, mm] = s.split(":").map(Number);
  return (h ?? 0) * 60 + (mm ?? 0);
}

function buildMergedCalendarEvents(
  slots: Slot[],
  bookings: Booking[],
  slotLabels: { available: string; booked: string }
): EventInput[] {
  const bookingStartMs = new Set(bookings.map((b) => Date.parse(b.start_time)).filter((n) => !Number.isNaN(n)));
  const ev: EventInput[] = [];
  for (const b of bookings) {
    ev.push({
      id: `booking-${b.id}`,
      title: b.service_name ? `${b.name} · ${b.service_name}` : b.name,
      start: b.start_time,
      end: b.end_time,
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

type AvailabilityFormValues = {
  slotDurationMinutes: number;
  bufferMinutes: number;
  notificationsEnabled: boolean;
  dayStart: string;
  dayEnd: string;
  workingDays: boolean[];
  breaks: { start: string; end: string }[];
};

function availabilityToForm(a: Availability): AvailabilityFormValues {
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

function formToAvailabilityPayload(data: AvailabilityFormValues) {
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

type EditBookingFormValues = {
  name: string;
  email: string;
  notes: string;
  service_id: string;
};

type ServiceFormValues = {
  name: string;
  durationMinutes: number;
  price: string;
};

export function AdminPage() {
  const { locale, t } = useLocale();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>("bookings");
  const [bookingsSub, setBookingsSub] = useState<BookingsSub>(loadSavedBookingsSub);
  const [calView, setCalView] = useState<CalView>(loadSavedCalView);
  const [anchor, setAnchor] = useState(() => new Date());

  const [filterDate, setFilterDate] = useState(() => DateTime.now().toFormat("yyyy-LL-dd"));
  const [filterService, setFilterService] = useState<number | "">("");

  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<Booking | null>(null);

  const [pickDate, setPickDate] = useState("");
  const [slotValue, setSlotValue] = useState("");

  const [serviceModal, setServiceModal] = useState<Service | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const viewAsFc: ViewMode = calView;

  const availForm = useForm<AvailabilityFormValues>({
    defaultValues: {
      slotDurationMinutes: 60,
      bufferMinutes: 0,
      notificationsEnabled: false,
      dayStart: "07:00",
      dayEnd: "16:00",
      workingDays: [true, true, true, true, true, false, false],
      breaks: [],
    },
  });

  const {
    register: registerAvail,
    handleSubmit: handleSubmitAvail,
    reset: resetAvail,
    watch: watchAvail,
    getValues: getAvailValues,
    setValue: setAvailValue,
    setError: setAvailError,
    clearErrors: clearAvailErrors,
    formState: { errors: availErrors, isSubmitting: isSavingAvailability },
  } = availForm;

  const editForm = useForm<EditBookingFormValues>({
    defaultValues: { name: "", email: "", notes: "", service_id: "" },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    setError: setEditError,
    clearErrors: clearEditErrors,
    formState: { errors: editErrors, isSubmitting: isSavingEdit },
  } = editForm;

  const serviceForm = useForm<ServiceFormValues>({
    defaultValues: { name: "", durationMinutes: 30, price: "" },
  });

  const {
    register: registerSvc,
    handleSubmit: handleSubmitSvc,
    reset: resetSvc,
    setError: setSvcError,
    clearErrors: clearSvcErrors,
    formState: { errors: svcErrors, isSubmitting: isSavingSvc },
  } = serviceForm;

  const availabilityQuery = useAvailabilityQuery();

  const servicesQuery = useServicesQuery();

  const scheduleQuery = useAdminScheduleQuery(
    viewAsFc,
    anchor.getTime(),
    !!availabilityQuery.data && section === "bookings" && bookingsSub === "calendar"
  );

  const listQuery = useAdminBookingsListQuery(
    filterDate,
    filterService,
    !!availabilityQuery.data && section === "bookings" && bookingsSub === "list"
  );

  const editSlotsQuery = useEditDaySlotsQuery(pickDate, !!edit && !!availabilityQuery.data && !!pickDate);

  const availability = availabilityQuery.data ?? null;
  const services = servicesQuery.data ?? [];
  const schedule = scheduleQuery.data;
  const listBookings = listQuery.data ?? [];
  const slotOptions = editSlotsQuery.data ?? [];

  const bookingsLoading =
    section === "bookings" &&
    (bookingsSub === "calendar" ? scheduleQuery.isPending : listQuery.isPending);

  const updateAvailabilityMut = useMutation({
    mutationFn: updateAvailability,
    onSuccess: async () => {
      await invalidateAfterAvailabilityWrite(queryClient);
    },
  });

  const deleteBookingMut = useMutation({
    mutationFn: deleteBooking,
    onSuccess: async () => {
      await invalidateAfterBookingWrite(queryClient);
    },
  });

  const updateBookingMut = useMutation({
    mutationFn: (args: { id: number; body: Parameters<typeof updateBooking>[1] }) => updateBooking(args.id, args.body),
    onSuccess: async () => {
      await invalidateAfterBookingWrite(queryClient);
    },
  });

  const createServiceMut = useMutation({
    mutationFn: createService,
    onSuccess: async () => {
      await invalidateAfterServiceWrite(queryClient);
    },
  });

  const updateServiceMut = useMutation({
    mutationFn: (args: { id: number; body: Parameters<typeof updateService>[1] }) => updateService(args.id, args.body),
    onSuccess: async () => {
      await invalidateAfterServiceWrite(queryClient);
    },
  });

  const deleteServiceMut = useMutation({
    mutationFn: deleteService,
    onSuccess: async () => {
      await invalidateAfterServiceWrite(queryClient);
    },
  });

  useEffect(() => {
    if (availabilityQuery.isError) setError(t("errorLoadAvail"));
  }, [availabilityQuery.isError, t]);

  useEffect(() => {
    if (section !== "services") return;
    if (servicesQuery.isError) setError(servicesQuery.error instanceof Error ? servicesQuery.error.message : t("errorLoad"));
  }, [section, servicesQuery.isError, servicesQuery.error, t]);

  useEffect(() => {
    if (section !== "bookings" || bookingsSub !== "list") return;
    if (listQuery.isError) setError(listQuery.error instanceof Error ? listQuery.error.message : t("errorLoad"));
  }, [section, bookingsSub, listQuery.isError, listQuery.error, t]);

  useEffect(() => {
    if (section !== "bookings" || bookingsSub !== "calendar") return;
    if (scheduleQuery.isError) setError(scheduleQuery.error instanceof Error ? scheduleQuery.error.message : t("errorLoad"));
  }, [section, bookingsSub, scheduleQuery.isError, scheduleQuery.error, t]);

  useEffect(() => {
    setError(null);
  }, [section]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ADMIN_BOOKINGS_TAB, bookingsSub);
    } catch {}
  }, [bookingsSub]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_ADMIN_CAL_VIEW, calView);
    } catch {}
  }, [calView]);

  useEffect(() => {
    if (availability) resetAvail(availabilityToForm(availability));
  }, [availability, resetAvail]);

  useEffect(() => {
    if (edit && availability) {
      resetEdit({
        name: edit.name,
        email: edit.email,
        notes: edit.notes,
        service_id: edit.service_id != null ? String(edit.service_id) : "",
      });
      const d = DateTime.fromISO(edit.start_time).setZone(APP_TIMEZONE).toFormat("yyyy-LL-dd");
      setPickDate(d);
      setSlotValue(edit.start_time);
    }
  }, [edit, availability, resetEdit]);

  const slotChoices = useMemo(() => {
    if (!edit) return [];
    return slotOptions.filter((s) => s.available || s.start === edit.start_time);
  }, [slotOptions, edit]);

  useEffect(() => {
    if (!edit || slotChoices.length === 0) return;
    if (!slotChoices.some((s) => s.start === slotValue)) {
      const preferred =
        slotChoices.find((s) => s.start === edit.start_time) ??
        slotChoices.find((s) => s.available) ??
        slotChoices[0];
      if (preferred) setSlotValue(preferred.start);
    }
  }, [slotChoices, edit, slotValue]);

  useEffect(() => {
    if (!toast) return;
    const tid = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(tid);
  }, [toast]);

  useEffect(() => {
    if (!serviceModal) return;
    if (serviceModal === "new") {
      resetSvc({ name: "", durationMinutes: 30, price: "" });
    } else {
      resetSvc({
        name: serviceModal.name,
        durationMinutes: serviceModal.durationMinutes,
        price: serviceModal.price != null ? String(serviceModal.price) : "",
      });
    }
  }, [serviceModal, resetSvc]);

  function pushToast(message: string) {
    setToast(message);
    console.log(`[admin] ${message}`);
  }

  const calendarEvents = useMemo(
    () =>
      buildMergedCalendarEvents(schedule?.slots ?? [], schedule?.bookings ?? [], {
        available: t("calSlotAvailable"),
        booked: t("calSlotBooked"),
      }),
    [schedule, t]
  );

  const weekdayLabels = useMemo(
    () =>
      (
        [
          "weekdayMon",
          "weekdayTue",
          "weekdayWed",
          "weekdayThu",
          "weekdayFri",
          "weekdaySat",
          "weekdaySun",
        ] as const
      ).map((k) => t(k)),
    [t]
  );

  const calTitle = useMemo(() => {
    const loc = locale === "sv" ? "sv" : "en";
    const dt = DateTime.fromJSDate(anchor, { zone: APP_TIMEZONE }).setLocale(loc);
    if (calView === "day") return dt.toFormat("cccc, LLL d, yyyy");
    const a = dt.startOf("week");
    const b = dt.endOf("week");
    return `${a.toFormat("LLL d")} – ${b.toFormat("LLL d, yyyy")}`;
  }, [anchor, calView, locale]);

  async function onSaveAvailability(data: AvailabilityFormValues) {
    clearAvailErrors("root");
    const ds = timeToMin(data.dayStart);
    const de = timeToMin(data.dayEnd);
    if (de <= ds) {
      setAvailError("root", { type: "validate", message: t("valEndAfterStart") });
      return;
    }
    for (const br of data.breaks) {
      if (!br.start || !br.end) continue;
      const bs = timeToMin(br.start);
      const be = timeToMin(br.end);
      if (be <= bs || bs < ds || be > de) {
        setAvailError("root", { type: "validate", message: t("valBreaksInHours") });
        return;
      }
    }
    setError(null);
    try {
      await updateAvailabilityMut.mutateAsync(formToAvailabilityPayload(data));
      pushToast(t("toastAvailSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("toastSaveFailed"));
    }
  }

  async function onSaveNotifications(enabled: boolean) {
    if (!availability) return;
    try {
      await updateAvailabilityMut.mutateAsync({
        workingDays: availability.workingDays,
        dayStart: availability.dayStart,
        dayEnd: availability.dayEnd,
        breaks: availability.breaks,
        slotDurationMinutes: availability.slotDurationMinutes,
        bufferMinutes: availability.bufferMinutes,
        notificationsEnabled: enabled,
      });
      pushToast(enabled ? t("toastNotifOn") : t("toastNotifOff"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("toastSaveFailed"));
    }
  }

  async function removeBooking(id: number) {
    if (!confirm(t("confirmDeleteBooking"))) return;
    try {
      await deleteBookingMut.mutateAsync(id);
      pushToast(t("toastBookingDeleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("toastDeleteFailed"));
    }
  }

  async function onSaveEdit(data: EditBookingFormValues) {
    if (!edit || !availability) return;
    clearEditErrors("root");
    const slot = slotOptions.find((s) => s.start === slotValue);
    if (!slot) {
      setEditError("root", { type: "validate", message: t("valPickSlot") });
      return;
    }
    const allowed = slot.available || slot.start === edit.start_time;
    if (!allowed) {
      setEditError("root", { type: "validate", message: t("valSlotUnavailable") });
      return;
    }
    try {
      await updateBookingMut.mutateAsync({
        id: edit.id,
        body: {
          name: data.name.trim(),
          email: data.email.trim(),
          start_time: slot.start,
          end_time: slot.end,
          notes: data.notes.trim(),
          service_id: data.service_id === "" ? null : Number(data.service_id),
        },
      });
      setEdit(null);
      pushToast(t("toastBookingUpdated"));
    } catch (err) {
      setEditError("root", {
        type: "server",
        message: err instanceof Error ? err.message : t("toastUpdateFailed"),
      });
    }
  }

  async function onSaveService(values: ServiceFormValues) {
    clearSvcErrors("root");
    const name = values.name.trim();
    if (!name) return;
    const priceRaw = values.price.trim();
    const price = priceRaw === "" ? null : Number(priceRaw);
    if (price != null && (Number.isNaN(price) || price < 0)) {
      setSvcError("root", { type: "validate", message: t("valPriceInvalid") });
      return;
    }
    try {
      if (serviceModal === "new") {
        await createServiceMut.mutateAsync({ name, durationMinutes: values.durationMinutes, price });
        pushToast(t("toastServiceAdded"));
      } else if (serviceModal) {
        await updateServiceMut.mutateAsync({
          id: serviceModal.id,
          body: { name, durationMinutes: values.durationMinutes, price },
        });
        pushToast(t("toastServiceUpdated"));
      }
      setServiceModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("toastCouldNotSaveService"));
    }
  }

  async function removeService(s: Service) {
    if (!confirm(t("confirmDeleteService", { name: s.name }))) return;
    try {
      await deleteServiceMut.mutateAsync(s.id);
      pushToast(t("toastServiceDeleted"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("toastDeleteFailed"));
    }
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar card">
        <p className="admin-sidebar__label">{t("adminLabel")}</p>
        <nav className="admin-sidebar__nav" aria-label={t("adminAriaSections")}>
          {(
            [
              ["bookings", "adminNavBookings"],
              ["services", "adminNavServices"],
              ["availability", "adminNavAvailability"],
              ["settings", "adminNavSettings"],
            ] as const
          ).map(([id, labelKey]) => (
            <button
              key={id}
              type="button"
              className={section === id ? "is-active" : ""}
              onClick={() => setSection(id)}
            >
              {t(labelKey)}
            </button>
          ))}
        </nav>
      </aside>

      <div className="admin-main">
        {error && <p className="error-text">{error}</p>}

        {section === "bookings" && (
          <div className="card">
            <h1 className="card-title">{t("adminBookingsTitle")}</h1>
            <p className="card-sub">{t("adminBookingsSub")}</p>

            <div className="admin-toolbar">
              <div className="segmented" role="tablist">
                <button type="button" className={bookingsSub === "list" ? "is-active" : ""} onClick={() => setBookingsSub("list")}>
                  {t("adminList")}
                </button>
                <button
                  type="button"
                  className={bookingsSub === "calendar" ? "is-active" : ""}
                  onClick={() => setBookingsSub("calendar")}
                >
                  {t("adminCalendar")}
                </button>
              </div>
            </div>

            {bookingsSub === "list" && (
              <div style={{ marginTop: "1rem" }}>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.75rem",
                    alignItems: "flex-end",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div className="field" style={{ marginBottom: 0, minWidth: "160px" }}>
                    <label htmlFor="adm-filter-date">{t("adminDate")}</label>
                    <input id="adm-filter-date" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0, minWidth: "180px" }}>
                    <label htmlFor="adm-filter-svc">{t("adminService")}</label>
                    <select
                      id="adm-filter-svc"
                      value={filterService === "" ? "" : String(filterService)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilterService(v === "" ? "" : Number(v));
                      }}
                    >
                      <option value="">{t("adminAllServices")}</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {bookingsLoading && <p className="muted">{t("adminLoading")}</p>}
                {!bookingsLoading && (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t("adminThDate")}</th>
                          <th>{t("adminThTime")}</th>
                          <th>{t("adminThCustomer")}</th>
                          <th>{t("adminThService")}</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {listBookings.length === 0 && (
                          <tr>
                            <td colSpan={5} className="muted">
                              {t("adminNoBookings")}
                            </td>
                          </tr>
                        )}
                        {listBookings.map((b) => (
                          <tr key={b.id}>
                            <td>
                              {DateTime.fromISO(b.start_time)
                                .setZone(APP_TIMEZONE)
                                .setLocale(locale === "sv" ? "sv" : "en")
                                .toFormat("ccc LLL d")}
                            </td>
                            <td>
                              {DateTime.fromISO(b.start_time).setZone(APP_TIMEZONE).toFormat(TIME_24)} –{" "}
                              {DateTime.fromISO(b.end_time).setZone(APP_TIMEZONE).toFormat(TIME_24)}
                            </td>
                            <td>{b.name}</td>
                            <td>{b.service_name ?? "—"}</td>
                            <td style={{ whiteSpace: "nowrap" }}>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(b)}>
                                {t("adminEdit")}
                              </button>{" "}
                              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeBooking(b.id)}>
                                {t("adminDelete")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {bookingsSub === "calendar" && availability && (
              <div style={{ marginTop: "1rem" }}>
                <div className="cal-toolbar">
                  <div className="cal-toolbar__views">
                    <button type="button" className={calView === "week" ? "is-active" : ""} onClick={() => setCalView("week")}>
                      {t("adminWeek")}
                    </button>
                    <button type="button" className={calView === "day" ? "is-active" : ""} onClick={() => setCalView("day")}>
                      {t("adminDay")}
                    </button>
                  </div>
                  <div className="cal-toolbar__nav">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setAnchor((a) => navigateAnchor(viewAsFc, a, -1, APP_TIMEZONE))}
                      aria-label={t("adminAriaPrev")}
                    >
                      ‹
                    </button>
                    <span className="cal-toolbar__title">{calTitle}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setAnchor((a) => navigateAnchor(viewAsFc, a, 1, APP_TIMEZONE))}
                      aria-label={t("adminAriaNext")}
                    >
                      ›
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setAnchor(goToToday(viewAsFc, APP_TIMEZONE))}>
                      {t("adminToday")}
                    </button>
                  </div>
                </div>
                {bookingsLoading && <p className="muted">{t("adminLoading")}</p>}
                {!bookingsLoading && (
                  <ScheduleCalendar
                    view={viewAsFc}
                    anchor={anchor}
                    slotDurationMinutes={availability.slotDurationMinutes}
                    availabilityHours={{ dayStart: availability.dayStart, dayEnd: availability.dayEnd }}
                    slots={[]}
                    calendarEvents={calendarEvents}
                    onBookingClick={(b) => setEdit(b)}
                  />
                )}
                <p className="muted" style={{ marginTop: "0.75rem", fontSize: "0.82rem" }}>
                  {t("adminCalLegend")}
                </p>
              </div>
            )}
          </div>
        )}

        {section === "services" && (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
              <div>
                <h1 className="card-title">{t("adminServicesTitle")}</h1>
                <p className="card-sub">{t("adminServicesSub")}</p>
              </div>
              <button type="button" className="btn" onClick={() => setServiceModal("new")}>
                {t("adminAddService")}
              </button>
            </div>
            <div className="table-wrap" style={{ marginTop: "1rem" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("adminThName")}</th>
                    <th>{t("adminThRefMin")}</th>
                    <th>{t("adminThPrice")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {servicesQuery.isPending && (
                    <tr>
                      <td colSpan={4} className="muted">
                        {t("adminLoading")}
                      </td>
                    </tr>
                  )}
                  {!servicesQuery.isPending && !servicesQuery.isError && services.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        {t("adminNoServices")}
                      </td>
                    </tr>
                  )}
                  {!servicesQuery.isPending &&
                    !servicesQuery.isError &&
                    services.map((s) => (
                      <tr key={s.id}>
                        <td>{s.name}</td>
                        <td>
                          {s.durationMinutes} {t("adminMinSuffix")}
                        </td>
                        <td>{s.price != null ? `$${s.price}` : "—"}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setServiceModal(s)}>
                            {t("adminEdit")}
                          </button>{" "}
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => removeService(s)}>
                            {t("adminDelete")}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {section === "availability" && availability && (
          <div className="card">
            <h1 className="card-title">{t("adminAvailTitle")}</h1>
            <p className="card-sub">{t("adminAvailSub")}</p>
            <form onSubmit={handleSubmitAvail(onSaveAvailability)} noValidate>
              <div style={{ display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <div className="field">
                  <label htmlFor="af-slot-dur">{t("adminApptLength")}</label>
                  <select id="af-slot-dur" {...registerAvail("slotDurationMinutes", { valueAsNumber: true })}>
                    <option value={60}>{t("adminSlotDuration60")}</option>
                    <option value={120}>{t("adminSlotDuration120")}</option>
                  </select>
                  <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.25rem", marginBottom: 0 }}>
                    {t("adminSlotDurationHint")}
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="af-buffer">{t("adminBuffer")}</label>
                  <input
                    id="af-buffer"
                    type="number"
                    min={0}
                    max={120}
                    {...registerAvail("bufferMinutes", { valueAsNumber: true, min: 0, max: 120 })}
                  />
                  <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.25rem", marginBottom: 0 }}>
                    {t("adminBufferHint")}
                  </p>
                </div>
                <div className="field">
                  <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--muted)" }}>{t("adminScheduleTimezoneFixed")}</p>
                </div>
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.75rem" }}>
                <div className="field" style={{ marginBottom: 0, minWidth: "120px" }}>
                  <label htmlFor="af-day-start">{t("adminDayStarts")}</label>
                  <input id="af-day-start" type="time" step={3600} {...registerAvail("dayStart")} />
                </div>
                <div className="field" style={{ marginBottom: 0, minWidth: "120px" }}>
                  <label htmlFor="af-day-end">{t("adminDayEnds")}</label>
                  <input id="af-day-end" type="time" step={3600} {...registerAvail("dayEnd")} />
                </div>
              </div>

              <div style={{ marginTop: "0.85rem" }}>
                <p className="field" style={{ marginBottom: "0.35rem", fontSize: "0.8rem", fontWeight: 600, color: "var(--muted)" }}>
                  {t("adminWorkingDays")}
                </p>
                <div className="admin-weekdays">
                  {weekdayLabels.map((label, i) => (
                    <label key={label} className="admin-weekdays__item">
                      <input type="checkbox" {...registerAvail(`workingDays.${i}` as const)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <details className="admin-details" style={{ marginTop: "1rem" }}>
                <summary>{t("adminBreaksSummary")}</summary>
                <p className="muted" style={{ marginTop: "0.5rem" }}>
                  {t("adminBreaksHint")}
                </p>
                {watchAvail("breaks").map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
                    <input
                      type="time"
                      step={3600}
                      {...registerAvail(`breaks.${i}.start` as const)}
                      aria-label={`Break ${i + 1} start`}
                    />
                    <span className="muted">{t("adminBreakTo")}</span>
                    <input type="time" step={3600} {...registerAvail(`breaks.${i}.end` as const)} aria-label={`Break ${i + 1} end`} />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const cur = getAvailValues("breaks");
                        setAvailValue(
                          "breaks",
                          cur.filter((__, j) => j !== i)
                        );
                      }}
                    >
                      {t("adminRemove")}
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: "0.65rem" }}
                  onClick={() => {
                    const cur = getAvailValues("breaks");
                    setAvailValue("breaks", [...cur, { start: "12:00", end: "13:00" }]);
                  }}
                >
                  {t("adminAddBreak")}
                </button>
              </details>

              {availErrors.root && (
                <p className="error-text" role="alert">
                  {availErrors.root.message}
                </p>
              )}

              <button className="btn" type="submit" disabled={isSavingAvailability} style={{ marginTop: "0.85rem" }}>
                {isSavingAvailability ? t("adminSaving") : t("adminSaveAvail")}
              </button>
            </form>
          </div>
        )}

        {section === "settings" && availability && (
          <div className="card">
            <h1 className="card-title">{t("adminSettingsTitle")}</h1>
            <p className="card-sub">{t("adminSettingsSub")}</p>

            <div className="admin-settings">
              <section className="admin-settings__block" aria-labelledby="settings-schedule-ro">
                <h2 id="settings-schedule-ro" className="admin-settings__title">
                  {t("adminScheduleSummary")}
                </h2>
                <dl className="admin-settings__dl">
                  <dt>{t("adminStTimezone")}</dt>
                  <dd>{APP_TIMEZONE}</dd>
                  <dt>{t("adminStSlotLength")}</dt>
                  <dd>
                    {availability.slotDurationMinutes} {t("adminMinutesWord")}
                  </dd>
                  <dt>{t("adminStBuffer")}</dt>
                  <dd>
                    {availability.bufferMinutes} {t("adminStBufferSuffix")}
                  </dd>
                </dl>
                <p className="muted admin-settings__hint" style={{ marginTop: "0.65rem" }}>
                  {t("adminStHint")}
                </p>
              </section>

              <section className="admin-settings__block" aria-labelledby="settings-bookings-ui">
                <h2 id="settings-bookings-ui" className="admin-settings__title">
                  {t("adminWorkspace")}
                </h2>
                <p className="muted admin-settings__hint" style={{ marginTop: 0, marginBottom: "0.75rem" }}>
                  {t("adminWorkspaceHint")}
                </p>
                <div className="field">
                  <label htmlFor="settings-default-bookings-tab">{t("adminOpenWith")}</label>
                  <select
                    id="settings-default-bookings-tab"
                    value={bookingsSub}
                    onChange={(e) => setBookingsSub(e.target.value as BookingsSub)}
                  >
                    <option value="list">{t("adminList")}</option>
                    <option value="calendar">{t("adminCalendar")}</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="settings-default-cal-view">{t("adminCalZoom")}</label>
                  <select
                    id="settings-default-cal-view"
                    value={calView}
                    onChange={(e) => setCalView(e.target.value as CalView)}
                  >
                    <option value="week">{t("adminWeek")}</option>
                    <option value="day">{t("adminDay")}</option>
                  </select>
                  <p className="muted admin-settings__hint" style={{ marginTop: "0.35rem" }}>
                    {t("adminCalZoomHint")}
                  </p>
                </div>
              </section>

              <section className="admin-settings__block" aria-labelledby="settings-notifications">
                <h2 id="settings-notifications" className="admin-settings__title">
                  {t("adminNotifications")}
                </h2>
                <div className="admin-settings__row">
                  <input
                    id="notif-toggle"
                    type="checkbox"
                    checked={availability.notificationsEnabled}
                    onChange={(e) => onSaveNotifications(e.target.checked)}
                    aria-describedby="notif-toggle-desc"
                  />
                  <div className="admin-settings__row-text">
                    <label htmlFor="notif-toggle">{t("adminMockEmail")}</label>
                    <p id="notif-toggle-desc" className="muted admin-settings__hint">
                      {t("adminMockEmailDesc")}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {serviceModal && (
          <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setServiceModal(null)}>
            <div className="modal" role="dialog" aria-modal="true" aria-labelledby="svc-modal-title">
              <h2 id="svc-modal-title" className="modal__title">
                {serviceModal === "new" ? t("modalAddService") : t("modalEditService")}
              </h2>
              <form onSubmit={handleSubmitSvc(onSaveService)} noValidate>
                <div className="field">
                  <label htmlFor="svc-name">{t("adminThName")}</label>
                  <input id="svc-name" {...registerSvc("name", { required: true })} />
                </div>
                {svcErrors.root && (
                  <p className="error-text" role="alert">
                    {svcErrors.root.message}
                  </p>
                )}
                <div className="field">
                  <label htmlFor="svc-dur">{t("modalSvcDur")}</label>
                  <input
                    id="svc-dur"
                    type="number"
                    min={5}
                    max={480}
                    {...registerSvc("durationMinutes", { valueAsNumber: true, min: 5, max: 480 })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="svc-price">{t("modalSvcPrice")}</label>
                  <input id="svc-price" type="text" inputMode="decimal" placeholder={t("modalSvcPlaceholder")} {...registerSvc("price")} />
                </div>
                <div className="modal__actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setServiceModal(null)}>
                    {t("bookingCancel")}
                  </button>
                  <button type="submit" className="btn" disabled={isSavingSvc}>
                    {isSavingSvc ? t("bookingSaving") : t("modalSave")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {edit && availability && (
          <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setEdit(null)}>
            <div className="modal modal--wide" role="dialog" aria-modal="true">
              <h2 className="modal__title">Booking</h2>
              <form onSubmit={handleSubmitEdit(onSaveEdit)} noValidate>
                <div className="field">
                  <label htmlFor="eb-name">Name</label>
                  <input id="eb-name" {...registerEdit("name", { required: "Name is required" })} />
                  {editErrors.name && <p className="error-text">{editErrors.name.message}</p>}
                </div>
                <div className="field">
                  <label htmlFor="eb-email">Email</label>
                  <input id="eb-email" type="email" {...registerEdit("email", { required: "Email is required" })} />
                  {editErrors.email && <p className="error-text">{editErrors.email.message}</p>}
                </div>
                <div className="field">
                  <label htmlFor="eb-svc">Service</label>
                  <select id="eb-svc" {...registerEdit("service_id")}>
                    <option value="">—</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {servicesQuery.isError && (
                    <p className="error-text" role="alert" style={{ marginTop: "0.35rem" }}>
                      {servicesQuery.error instanceof Error ? servicesQuery.error.message : t("errorLoad")}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="eb-date">{t("adminDate")}</label>
                  <input id="eb-date" type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="eb-slot">{t("modalSlot")}</label>
                  {editSlotsQuery.isPending && <p className="muted">{t("adminLoading")}</p>}
                  {editSlotsQuery.isError && (
                    <p className="error-text" role="alert">
                      {editSlotsQuery.error instanceof Error ? editSlotsQuery.error.message : t("errorLoad")}
                    </p>
                  )}
                  <select id="eb-slot" value={slotValue} onChange={(e) => setSlotValue(e.target.value)} disabled={editSlotsQuery.isPending || editSlotsQuery.isError}>
                    {slotChoices.length === 0 && <option value="">{t("modalNoSlotsDay")}</option>}
                    {slotChoices.map((s) => (
                      <option key={s.start} value={s.start}>
                        {DateTime.fromISO(s.start).setZone(APP_TIMEZONE).toFormat(TIME_24)} –{" "}
                        {DateTime.fromISO(s.end).setZone(APP_TIMEZONE).toFormat(TIME_24)}
                        {!s.available ? ` ${t("modalSlotCurrent")}` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
                    {t("modalSlotHint")}
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="eb-notes">{t("adminNotesLabel")}</label>
                  <textarea id="eb-notes" rows={2} {...registerEdit("notes")} />
                </div>
                {editErrors.root && (
                  <p className="error-text" role="alert">
                    {editErrors.root.message}
                  </p>
                )}
                <div className="modal__actions">
                  <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)}>
                    {t("bookingCancel")}
                  </button>
                  <button type="submit" className="btn" disabled={isSavingEdit || editSlotsQuery.isError}>
                    {isSavingEdit ? t("bookingSaving") : t("modalSave")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
