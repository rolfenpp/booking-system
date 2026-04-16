const LS_ADMIN_BOOKINGS_TAB = "booking-admin-default-bookings-sub";
const LS_ADMIN_CAL_VIEW = "booking-admin-default-cal-view";

export type BookingsSub = "list" | "calendar";
export type CalView = "week" | "day";

export function loadSavedBookingsSub(): BookingsSub {
  try {
    const v = localStorage.getItem(LS_ADMIN_BOOKINGS_TAB);
    if (v === "list" || v === "calendar") return v;
  } catch {}
  return "list";
}

export function loadSavedCalView(): CalView {
  try {
    const v = localStorage.getItem(LS_ADMIN_CAL_VIEW);
    if (v === "week" || v === "day") return v;
  } catch {}
  return "week";
}

export function persistBookingsSub(bookingsSub: BookingsSub) {
  try {
    localStorage.setItem(LS_ADMIN_BOOKINGS_TAB, bookingsSub);
  } catch {}
}

export function persistCalView(calView: CalView) {
  try {
    localStorage.setItem(LS_ADMIN_CAL_VIEW, calView);
  } catch {}
}
