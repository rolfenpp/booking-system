import { api } from "./http";

export type Availability = {
  workingDays: boolean[];
  dayStart: string;
  dayEnd: string;
  breaks: { start: string; end: string }[];
  timezone: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  notificationsEnabled: boolean;
};

export type AvailabilityWrite = Omit<Availability, "timezone">;

export type Service = {
  id: number;
  name: string;
  durationMinutes: number;
  price: number | null;
};

export type Slot = { start: string; end: string; available: boolean };

export type Booking = {
  id: number;
  name: string;
  email: string;
  start_time: string;
  end_time: string;
  notes: string;
  service_id: number | null;
  service_name: string | null;
};

export async function getAvailability(): Promise<Availability> {
  const { data } = await api.get<Availability>("/api/availability");
  return data;
}

export async function getSettings(): Promise<Availability> {
  return getAvailability();
}

export async function updateAvailability(body: AvailabilityWrite): Promise<void> {
  await api.put("/api/availability", body);
}

export async function updateSettings(body: AvailabilityWrite): Promise<void> {
  return updateAvailability(body);
}

export async function getServices(): Promise<Service[]> {
  const { data } = await api.get<{ services: Service[] }>("/api/services");
  return data.services;
}

export async function createService(body: {
  name: string;
  durationMinutes: number;
  price?: number | null;
}): Promise<{ id: number }> {
  const { data } = await api.post<{ id: number }>("/api/services", body);
  return data;
}

export async function updateService(
  id: number,
  body: { name: string; durationMinutes: number; price?: number | null }
): Promise<void> {
  await api.put(`/api/services/${id}`, body);
}

export async function deleteService(id: number): Promise<void> {
  await api.delete(`/api/services/${id}`);
}

export async function getSlots(from: string, to: string): Promise<Slot[]> {
  const { data } = await api.get<{ slots: Slot[] }>("/api/slots", { params: { from, to } });
  return data.slots;
}

export async function getBookings(q: {
  date?: string;
  from?: string;
  to?: string;
  serviceId?: number;
}): Promise<Booking[]> {
  const params: Record<string, string | number> = {};
  if (q.date != null) params.date = q.date;
  if (q.from != null) params.from = q.from;
  if (q.to != null) params.to = q.to;
  if (q.serviceId != null) params.serviceId = q.serviceId;
  const { data } = await api.get<{ bookings: Booking[] }>("/api/bookings", { params });
  return data.bookings;
}

export async function createBooking(body: {
  name: string;
  email: string;
  start_time: string;
  end_time: string;
  notes?: string;
  service_id?: number | null;
}): Promise<{ id: number }> {
  const { data } = await api.post<{ id: number }>("/api/bookings", body);
  return data;
}

export async function updateBooking(
  id: number,
  body: {
    name: string;
    email: string;
    start_time: string;
    end_time: string;
    notes?: string;
    service_id?: number | null;
  }
): Promise<void> {
  await api.put(`/api/bookings/${id}`, body);
}

export async function deleteBooking(id: number): Promise<void> {
  await api.delete(`/api/bookings/${id}`);
}

export async function sendMockConfirmation(id: number): Promise<{ message: string }> {
  const { data } = await api.post<{ message: string }>(`/api/bookings/${id}/confirm`);
  return data;
}
