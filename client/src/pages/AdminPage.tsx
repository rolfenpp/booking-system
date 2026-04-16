import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { Booking, Service } from "../api/client";
import {
  useAdminBookingsListQuery,
  useAdminScheduleQuery,
  useAvailabilityQuery,
  useEditDaySlotsQuery,
  useServicesQuery,
} from "../api/hooks";
import { PageCard } from "../components/layout/PageCard";
import { APP_TIMEZONE } from "../constants/timezone";
import { useLocale } from "../context/LocaleContext";
import { buildMergedCalendarEvents, timeToMin } from "../lib/adminCalendar";
import { formatCalendarTitle } from "../lib/calendarTitle";
import { type ViewMode } from "../lib/dateRange";
import { TIME_24 } from "../lib/timeDisplay";
import { AdminBookingsPanel } from "./admin/AdminBookingsPanel";
import type { AvailabilityFormValues } from "./admin/availabilityFormModel";
import { availabilityToForm, formToAvailabilityPayload } from "./admin/availabilityFormModel";
import type { BookingsSub, CalView } from "./admin/adminStorage";
import { loadSavedBookingsSub, loadSavedCalView, persistBookingsSub, persistCalView } from "./admin/adminStorage";
import { useAdminMutations } from "./admin/useAdminMutations";

type Section = "bookings" | "services" | "availability" | "settings";

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

const SECTIONS = [
  ["bookings", "adminNavBookings"],
  ["services", "adminNavServices"],
  ["availability", "adminNavAvailability"],
  ["settings", "adminNavSettings"],
] as const;

export function AdminPage() {
  const { locale, t } = useLocale();
  const {
    updateAvailabilityMut,
    deleteBookingMut,
    updateBookingMut,
    createServiceMut,
    updateServiceMut,
    deleteServiceMut,
  } = useAdminMutations();
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
    control: availControl,
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
    control: editControl,
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
    persistBookingsSub(bookingsSub);
  }, [bookingsSub]);

  useEffect(() => {
    persistCalView(calView);
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
        service_id: edit.serviceId != null ? String(edit.serviceId) : "",
      });
      const d = DateTime.fromISO(edit.startTime).setZone(APP_TIMEZONE).toFormat("yyyy-LL-dd");
      setPickDate(d);
      setSlotValue(edit.startTime);
    }
  }, [edit, availability, resetEdit]);

  const slotChoices = useMemo(() => {
    if (!edit) return [];
    return slotOptions.filter((s) => s.available || s.start === edit.startTime);
  }, [slotOptions, edit]);

  useEffect(() => {
    if (!edit || slotChoices.length === 0) return;
    if (!slotChoices.some((s) => s.start === slotValue)) {
      const preferred =
        slotChoices.find((s) => s.start === edit.startTime) ??
        slotChoices.find((s) => s.available) ??
        slotChoices[0];
      if (preferred) setSlotValue(preferred.start);
    }
  }, [slotChoices, edit, slotValue]);

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

  const calTitle = useMemo(() => formatCalendarTitle(anchor, calView, locale), [anchor, calView, locale]);

  const adminCalViewTabs = useMemo(
    () => [
      { id: "week", label: t("adminWeek") },
      { id: "day", label: t("adminDay") },
    ],
    [t]
  );

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
    const allowed = slot.available || slot.start === edit.startTime;
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
          startTime: slot.start,
          endTime: slot.end,
          notes: data.notes.trim(),
          serviceId: data.service_id === "" ? null : Number(data.service_id),
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
    <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: "flex-start" }}>
      <Paper variant="outlined" sx={{ p: 1, width: { xs: "100%", md: 220 }, flexShrink: 0 }}>
        <Typography variant="overline" color="text.secondary" sx={{ px: 1, display: "block" }}>
          {t("adminLabel")}
        </Typography>
        <List dense component="nav" aria-label={t("adminAriaSections")} disablePadding>
          {SECTIONS.map(([id, labelKey]) => (
            <ListItemButton key={id} selected={section === id} onClick={() => setSection(id)}>
              <ListItemText primary={t(labelKey)} slotProps={{ primary: { variant: "body2" } }} />
            </ListItemButton>
          ))}
        </List>
      </Paper>

      <Box sx={{ flex: 1, minWidth: 0, width: "100%" }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {section === "bookings" && (
          <AdminBookingsPanel
            t={t}
            locale={locale}
            bookingsSub={bookingsSub}
            setBookingsSub={setBookingsSub}
            calView={calView}
            setCalView={setCalView}
            adminCalViewTabs={adminCalViewTabs}
            calTitle={calTitle}
            filterDate={filterDate}
            setFilterDate={setFilterDate}
            filterService={filterService}
            setFilterService={setFilterService}
            services={services}
            listBookings={listBookings}
            bookingsLoading={bookingsLoading}
            setEdit={setEdit}
            anchor={anchor}
            setAnchor={setAnchor}
            viewAsFc={viewAsFc}
            calendarEvents={calendarEvents}
            availability={
              availability
                ? {
                    slotDurationMinutes: availability.slotDurationMinutes,
                    dayStart: availability.dayStart,
                    dayEnd: availability.dayEnd,
                  }
                : null
            }
            onDeleteBooking={removeBooking}
          />
        )}

        {section === "services" && (
          <PageCard title={t("adminServicesTitle")} subtitle={t("adminServicesSub")}>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
              <Button variant="contained" onClick={() => setServiceModal("new")}>
                {t("adminAddService")}
              </Button>
            </Box>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("adminThName")}</TableCell>
                    <TableCell>{t("adminThRefMin")}</TableCell>
                    <TableCell>{t("adminThPrice")}</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {servicesQuery.isPending && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          {t("adminLoading")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {!servicesQuery.isPending && !servicesQuery.isError && services.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          {t("adminNoServices")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {!servicesQuery.isPending &&
                    !servicesQuery.isError &&
                    services.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>
                          {s.durationMinutes} {t("adminMinSuffix")}
                        </TableCell>
                        <TableCell>{s.price != null ? `$${s.price}` : "—"}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                          <Button size="small" onClick={() => setServiceModal(s)}>
                            {t("adminEdit")}
                          </Button>
                          <Button size="small" color="error" onClick={() => removeService(s)}>
                            {t("adminDelete")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
          </PageCard>
        )}

        {section === "availability" && availability && (
          <PageCard title={t("adminAvailTitle")} subtitle={t("adminAvailSub")}>
            <Box component="form" onSubmit={handleSubmitAvail(onSaveAvailability)} noValidate>
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
                  <Controller
                    name="slotDurationMinutes"
                    control={availControl}
                    render={({ field }) => (
                      <FormControl fullWidth sx={{ maxWidth: 280 }}>
                        <InputLabel id="af-slot-dur">{t("adminApptLength")}</InputLabel>
                        <Select
                          labelId="af-slot-dur"
                          label={t("adminApptLength")}
                          value={field.value}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        >
                          <MenuItem value={60}>{t("adminSlotDuration60")}</MenuItem>
                          <MenuItem value={120}>{t("adminSlotDuration120")}</MenuItem>
                        </Select>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                          {t("adminSlotDurationHint")}
                        </Typography>
                      </FormControl>
                    )}
                  />
                  <TextField
                    label={t("adminBuffer")}
                    type="number"
                    size="small"
                    slotProps={{ htmlInput: { min: 0, max: 120 } }}
                    {...registerAvail("bufferMinutes", { valueAsNumber: true, min: 0, max: 120 })}
                    sx={{ maxWidth: 200 }}
                    helperText={t("adminBufferHint")}
                  />
                  <Typography variant="body2" color="text.secondary" sx={{ alignSelf: "center" }}>
                    {t("adminScheduleTimezoneFixed")}
                  </Typography>
                </Stack>

                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                  <TextField
                    label={t("adminDayStarts")}
                    type="time"
                    size="small"
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 3600 } }}
                    {...registerAvail("dayStart")}
                  />
                  <TextField
                    label={t("adminDayEnds")}
                    type="time"
                    size="small"
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 3600 } }}
                    {...registerAvail("dayEnd")}
                  />
                </Stack>

                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                    {t("adminWorkingDays")}
                  </Typography>
                  <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: "wrap" }}>
                    {weekdayLabels.map((label, i) => (
                      <FormControlLabel key={label} control={<Checkbox {...registerAvail(`workingDays.${i}` as const)} />} label={label} />
                    ))}
                  </Stack>
                </Box>

                <Accordion defaultExpanded={false} variant="outlined">
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>{t("adminBreaksSummary")}</AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {t("adminBreaksHint")}
                    </Typography>
                    <Stack spacing={1}>
                      {watchAvail("breaks").map((_, i) => (
                        <Stack key={i} direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                          <TextField
                            type="time"
                            size="small"
                            slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 3600 } }}
                            {...registerAvail(`breaks.${i}.start` as const)}
                            aria-label={`Break ${i + 1} start`}
                          />
                          <Typography variant="body2" color="text.secondary">
                            {t("adminBreakTo")}
                          </Typography>
                          <TextField
                            type="time"
                            size="small"
                            slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 3600 } }}
                            {...registerAvail(`breaks.${i}.end` as const)}
                            aria-label={`Break ${i + 1} end`}
                          />
                          <Button
                            size="small"
                            onClick={() => {
                              const cur = getAvailValues("breaks");
                              setAvailValue(
                                "breaks",
                                cur.filter((__, j) => j !== i)
                              );
                            }}
                          >
                            {t("adminRemove")}
                          </Button>
                        </Stack>
                      ))}
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const cur = getAvailValues("breaks");
                          setAvailValue("breaks", [...cur, { start: "12:00", end: "13:00" }]);
                        }}
                      >
                        {t("adminAddBreak")}
                      </Button>
                    </Stack>
                  </AccordionDetails>
                </Accordion>

                {availErrors.root && (
                  <Alert severity="error" role="alert">
                    {availErrors.root.message}
                  </Alert>
                )}

                <Button type="submit" variant="contained" disabled={isSavingAvailability} sx={{ alignSelf: "flex-start" }}>
                  {isSavingAvailability ? t("adminSaving") : t("adminSaveAvail")}
                </Button>
              </Stack>
            </Box>
          </PageCard>
        )}

        {section === "settings" && availability && (
          <PageCard title={t("adminSettingsTitle")} subtitle={t("adminSettingsSub")}>
            <Stack spacing={3} sx={{ maxWidth: 480 }}>
              <Box component="section" aria-labelledby="settings-schedule-ro">
                <Typography id="settings-schedule-ro" variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                  {t("adminScheduleSummary")}
                </Typography>
                <Stack spacing={0.5} sx={{ pl: 0 }}>
                  <Typography variant="body2">
                    <strong>{t("adminStTimezone")}:</strong> {APP_TIMEZONE}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{t("adminStSlotLength")}:</strong> {availability.slotDurationMinutes} {t("adminMinutesWord")}
                  </Typography>
                  <Typography variant="body2">
                    <strong>{t("adminStBuffer")}:</strong> {availability.bufferMinutes} {t("adminStBufferSuffix")}
                  </Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                  {t("adminStHint")}
                </Typography>
              </Box>

              <Box component="section" aria-labelledby="settings-bookings-ui">
                <Typography id="settings-bookings-ui" variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                  {t("adminWorkspace")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {t("adminWorkspaceHint")}
                </Typography>
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel id="settings-default-bookings-tab">{t("adminOpenWith")}</InputLabel>
                  <Select
                    labelId="settings-default-bookings-tab"
                    label={t("adminOpenWith")}
                    value={bookingsSub}
                    onChange={(e) => setBookingsSub(e.target.value as BookingsSub)}
                  >
                    <MenuItem value="list">{t("adminList")}</MenuItem>
                    <MenuItem value="calendar">{t("adminCalendar")}</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth size="small">
                  <InputLabel id="settings-default-cal-view">{t("adminCalZoom")}</InputLabel>
                  <Select
                    labelId="settings-default-cal-view"
                    label={t("adminCalZoom")}
                    value={calView}
                    onChange={(e) => setCalView(e.target.value as CalView)}
                  >
                    <MenuItem value="week">{t("adminWeek")}</MenuItem>
                    <MenuItem value="day">{t("adminDay")}</MenuItem>
                  </Select>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                    {t("adminCalZoomHint")}
                  </Typography>
                </FormControl>
              </Box>

              <Box component="section" aria-labelledby="settings-notifications">
                <Typography id="settings-notifications" variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                  {t("adminNotifications")}
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={availability.notificationsEnabled}
                      onChange={(e) => onSaveNotifications(e.target.checked)}
                      slotProps={{ input: { "aria-describedby": "notif-toggle-desc" } }}
                    />
                  }
                  label={t("adminMockEmail")}
                />
                <Typography id="notif-toggle-desc" variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {t("adminMockEmailDesc")}
                </Typography>
              </Box>
            </Stack>
          </PageCard>
        )}

        <Dialog open={Boolean(serviceModal)} onClose={() => setServiceModal(null)} fullWidth maxWidth="sm">
          <DialogTitle id="svc-modal-title">
            {serviceModal === "new" ? t("modalAddService") : t("modalEditService")}
          </DialogTitle>
          <Box component="form" id="svc-form" onSubmit={handleSubmitSvc(onSaveService)} noValidate>
            <DialogContent dividers>
              <TextField
                {...registerSvc("name", { required: true })}
                label={t("adminThName")}
                fullWidth
                required
                margin="normal"
                autoFocus
              />
              {svcErrors.root && (
                <Alert severity="error" role="alert" sx={{ mt: 1 }}>
                  {svcErrors.root.message}
                </Alert>
              )}
              <TextField
                {...registerSvc("durationMinutes", { valueAsNumber: true, min: 5, max: 480 })}
                label={t("modalSvcDur")}
                type="number"
                fullWidth
                margin="normal"
                slotProps={{ htmlInput: { min: 5, max: 480 } }}
              />
              <TextField
                {...registerSvc("price")}
                label={t("modalSvcPrice")}
                placeholder={t("modalSvcPlaceholder")}
                fullWidth
                margin="normal"
                inputMode="decimal"
              />
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => setServiceModal(null)}>{t("bookingCancel")}</Button>
              <Button type="submit" form="svc-form" variant="contained" disabled={isSavingSvc}>
                {isSavingSvc ? t("bookingSaving") : t("modalSave")}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>

        <Dialog open={Boolean(edit && availability)} onClose={() => setEdit(null)} fullWidth maxWidth="md">
          <DialogTitle>{t("modalBookingTitle")}</DialogTitle>
          <Box component="form" id="edit-booking-form" onSubmit={handleSubmitEdit(onSaveEdit)} noValidate>
            <DialogContent dividers>
              <Stack spacing={2}>
                <TextField
                  {...registerEdit("name", { required: t("valNameRequired") })}
                  label={t("bookingName")}
                  fullWidth
                  required
                  error={!!editErrors.name}
                  helperText={editErrors.name?.message}
                />
                <TextField
                  {...registerEdit("email", {
                    required: t("valEmailRequired"),
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: t("valEmailInvalid") },
                  })}
                  label={t("bookingEmail")}
                  type="email"
                  fullWidth
                  required
                  error={!!editErrors.email}
                  helperText={editErrors.email?.message}
                />
                <FormControl fullWidth>
                  <InputLabel id="eb-svc-label">{t("bookingServiceOptional")}</InputLabel>
                  <Controller
                    name="service_id"
                    control={editControl}
                    render={({ field }) => (
                      <Select labelId="eb-svc-label" label={t("bookingServiceOptional")} {...field}>
                        <MenuItem value="">—</MenuItem>
                        {services.map((s) => (
                          <MenuItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </MenuItem>
                        ))}
                      </Select>
                    )}
                  />
                  {servicesQuery.isError && (
                    <Alert severity="error" role="alert" sx={{ mt: 1 }}>
                      {servicesQuery.error instanceof Error ? servicesQuery.error.message : t("errorLoad")}
                    </Alert>
                  )}
                </FormControl>
                <TextField
                  label={t("adminDate")}
                  type="date"
                  value={pickDate}
                  onChange={(e) => setPickDate(e.target.value)}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <FormControl fullWidth disabled={editSlotsQuery.isPending || editSlotsQuery.isError}>
                  <InputLabel id="eb-slot-label">{t("modalSlot")}</InputLabel>
                  <Select
                    labelId="eb-slot-label"
                    label={t("modalSlot")}
                    value={slotValue}
                    onChange={(e) => setSlotValue(e.target.value)}
                  >
                    {slotChoices.length === 0 && <MenuItem value="">{t("modalNoSlotsDay")}</MenuItem>}
                    {slotChoices.map((s) => (
                      <MenuItem key={s.start} value={s.start}>
                        {DateTime.fromISO(s.start).setZone(APP_TIMEZONE).toFormat(TIME_24)} –{" "}
                        {DateTime.fromISO(s.end).setZone(APP_TIMEZONE).toFormat(TIME_24)}
                        {!s.available ? ` ${t("modalSlotCurrent")}` : ""}
                      </MenuItem>
                    ))}
                  </Select>
                  {editSlotsQuery.isPending && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {t("adminLoading")}
                    </Typography>
                  )}
                  {editSlotsQuery.isError && (
                    <Alert severity="error" role="alert" sx={{ mt: 1 }}>
                      {editSlotsQuery.error instanceof Error ? editSlotsQuery.error.message : t("errorLoad")}
                    </Alert>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                    {t("modalSlotHint")}
                  </Typography>
                </FormControl>
                <TextField {...registerEdit("notes")} label={t("adminNotesLabel")} fullWidth multiline minRows={2} />
                {editErrors.root && (
                  <Alert severity="error" role="alert">
                    {editErrors.root.message}
                  </Alert>
                )}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => setEdit(null)}>{t("bookingCancel")}</Button>
              <Button type="submit" form="edit-booking-form" variant="contained" disabled={isSavingEdit || editSlotsQuery.isError}>
                {isSavingEdit ? t("bookingSaving") : t("modalSave")}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>

        <Snackbar
          open={Boolean(toast)}
          autoHideDuration={3200}
          onClose={() => setToast(null)}
          message={toast ?? ""}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        />
      </Box>
    </Stack>
  );
}
