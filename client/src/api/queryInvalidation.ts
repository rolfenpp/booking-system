import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

export function invalidateAvailability(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.availability() });
}

export function invalidateServices(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.services() });
}

export function invalidateAllSlots(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.slots.root });
}

export function invalidateAllAdmin(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.admin.root });
}

export async function invalidateAfterBookingWrite(queryClient: QueryClient) {
  await invalidateAllSlots(queryClient);
  await invalidateAllAdmin(queryClient);
}

export async function invalidateAfterAvailabilityWrite(queryClient: QueryClient) {
  await invalidateAvailability(queryClient);
  await invalidateAllSlots(queryClient);
  await invalidateAllAdmin(queryClient);
}

export async function invalidateAfterServiceWrite(queryClient: QueryClient) {
  await invalidateServices(queryClient);
  // Booking rows display serviceName from a server join; refresh admin list/calendar without invalidating public slot queries (service CRUD does not change the slot grid).
  await invalidateAllAdmin(queryClient);
}
