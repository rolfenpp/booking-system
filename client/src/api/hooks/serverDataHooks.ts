import { useQuery } from "@tanstack/react-query";
import { DateTime } from "luxon";
import { getAvailability, getBookings, getServices, getSlots } from "../client";
import { queryKeys } from "../queryKeys";
import { APP_TIMEZONE } from "../../constants/timezone";
import { rangeForView, type ViewMode } from "../../lib/dateRange";

export function useAvailabilityQuery() {
  return useQuery({
    queryKey: queryKeys.availability(),
    queryFn: getAvailability,
  });
}

export function useServicesQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.services(),
    queryFn: getServices,
    enabled: options?.enabled ?? true,
  });
}

export function useSlotsRangeQuery(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.slots.range(from, to),
    queryFn: () => getSlots(from, to),
    enabled,
  });
}

export function useEditDaySlotsQuery(pickDate: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.slots.day(pickDate),
    queryFn: () => {
      const dayAnchor = DateTime.fromISO(`${pickDate}T12:00:00`, { zone: APP_TIMEZONE }).toJSDate();
      const { from, to } = rangeForView("day", dayAnchor, APP_TIMEZONE);
      return getSlots(from, to);
    },
    enabled,
  });
}

export function useAdminScheduleQuery(view: ViewMode, anchorMs: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.schedule(view, anchorMs),
    queryFn: async () => {
      const anchor = new Date(anchorMs);
      const { from, to } = rangeForView(view, anchor, APP_TIMEZONE);
      const [slots, bookings] = await Promise.all([getSlots(from, to), getBookings({ from, to })]);
      return { slots, bookings };
    },
    enabled,
  });
}

export function useAdminBookingsListQuery(date: string, serviceId: number | "", enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.admin.bookingsList(date, serviceId),
    queryFn: () =>
      getBookings({
        date,
        serviceId: serviceId === "" ? undefined : serviceId,
      }),
    enabled,
  });
}
