import {
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import type { Dispatch, SetStateAction } from "react";
import { DateTime } from "luxon";
import type { Booking, Service } from "../../api/client";
import { ScheduleCalendar } from "../../components/ScheduleCalendar";
import { CalendarToolbar } from "../../components/calendar/CalendarToolbar";
import { PageCard } from "../../components/layout/PageCard";
import { APP_TIMEZONE } from "../../constants/timezone";
import { useLocale } from "../../context/LocaleContext";
import type { EventInput } from "@fullcalendar/core";
import { goToToday, navigateAnchor, type ViewMode } from "../../lib/dateRange";
import { TIME_24 } from "../../lib/timeDisplay";
import type { BookingsSub, CalView } from "./adminStorage";

export type AdminTranslate = ReturnType<typeof useLocale>["t"];

type Props = {
  t: AdminTranslate;
  locale: string;
  bookingsSub: BookingsSub;
  setBookingsSub: (v: BookingsSub) => void;
  calView: CalView;
  setCalView: (v: CalView) => void;
  adminCalViewTabs: { id: string; label: string }[];
  calTitle: string;
  filterDate: string;
  setFilterDate: (v: string) => void;
  filterService: number | "";
  setFilterService: (v: number | "") => void;
  services: Service[];
  listBookings: Booking[];
  bookingsLoading: boolean;
  setEdit: (b: Booking) => void;
  anchor: Date;
  setAnchor: Dispatch<SetStateAction<Date>>;
  viewAsFc: ViewMode;
  calendarEvents: EventInput[];
  availability: {
    slotDurationMinutes: number;
    dayStart: string;
    dayEnd: string;
  } | null;
  onDeleteBooking: (id: number) => void;
};

export function AdminBookingsPanel({
  t,
  locale,
  bookingsSub,
  setBookingsSub,
  calView,
  setCalView,
  adminCalViewTabs,
  calTitle,
  filterDate,
  setFilterDate,
  filterService,
  setFilterService,
  services,
  listBookings,
  bookingsLoading,
  setEdit,
  anchor,
  setAnchor,
  viewAsFc,
  calendarEvents,
  availability,
  onDeleteBooking,
}: Props) {
  return (
    <PageCard title={t("adminBookingsTitle")} subtitle={t("adminBookingsSub")}>
      <ToggleButtonGroup
        value={bookingsSub}
        exclusive
        size="small"
        sx={{ mb: 1 }}
        onChange={(_, v: BookingsSub | null) => {
          if (v != null) setBookingsSub(v);
        }}
      >
        <ToggleButton value="list" sx={{ textTransform: "none" }}>
          {t("adminList")}
        </ToggleButton>
        <ToggleButton value="calendar" sx={{ textTransform: "none" }}>
          {t("adminCalendar")}
        </ToggleButton>
      </ToggleButtonGroup>

      {bookingsSub === "list" && (
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} useFlexGap sx={{ alignItems: { sm: "flex-end" }, flexWrap: "wrap" }}>
            <TextField
              label={t("adminDate")}
              type="date"
              size="small"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 160 }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="adm-filter-svc">{t("adminService")}</InputLabel>
              <Select
                labelId="adm-filter-svc"
                label={t("adminService")}
                value={filterService === "" ? "" : String(filterService)}
                onChange={(e) => {
                  const v = e.target.value;
                  setFilterService(v === "" ? "" : Number(v));
                }}
              >
                <MenuItem value="">{t("adminAllServices")}</MenuItem>
                {services.map((s) => (
                  <MenuItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          {bookingsLoading && <CircularProgress size={28} />}
          {!bookingsLoading && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t("adminThDate")}</TableCell>
                    <TableCell>{t("adminThTime")}</TableCell>
                    <TableCell>{t("adminThCustomer")}</TableCell>
                    <TableCell>{t("adminThService")}</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {listBookings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          {t("adminNoBookings")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {listBookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        {DateTime.fromISO(b.startTime)
                          .setZone(APP_TIMEZONE)
                          .setLocale(locale === "sv" ? "sv" : "en")
                          .toFormat("ccc LLL d")}
                      </TableCell>
                      <TableCell>
                        {DateTime.fromISO(b.startTime).setZone(APP_TIMEZONE).toFormat(TIME_24)} –{" "}
                        {DateTime.fromISO(b.endTime).setZone(APP_TIMEZONE).toFormat(TIME_24)}
                      </TableCell>
                      <TableCell>{b.name}</TableCell>
                      <TableCell>{b.serviceName ?? "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Button size="small" onClick={() => setEdit(b)}>
                          {t("adminEdit")}
                        </Button>
                        <Button size="small" color="error" onClick={() => onDeleteBooking(b.id)}>
                          {t("adminDelete")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      )}

      {bookingsSub === "calendar" && availability && (
        <Stack spacing={2}>
          <CalendarToolbar
            views={adminCalViewTabs}
            activeView={calView}
            onViewChange={(id) => setCalView(id as CalView)}
            viewsAriaLabel={t("bookAriaCalView")}
            title={calTitle}
            onPrev={() => setAnchor((a) => navigateAnchor(viewAsFc, a, -1, APP_TIMEZONE))}
            onNext={() => setAnchor((a) => navigateAnchor(viewAsFc, a, 1, APP_TIMEZONE))}
            onToday={() => setAnchor(goToToday(viewAsFc, APP_TIMEZONE))}
            prevAria={t("adminAriaPrev")}
            nextAria={t("adminAriaNext")}
            todayLabel={t("adminToday")}
          />
          {bookingsLoading && <CircularProgress size={28} />}
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
          <Typography variant="caption" color="text.secondary">
            {t("adminCalLegend")}
          </Typography>
        </Stack>
      )}
    </PageCard>
  );
}
