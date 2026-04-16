import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createService,
  deleteBooking,
  deleteService,
  updateAvailability,
  updateBooking,
  updateService,
} from "../../api/client";
import {
  invalidateAfterAvailabilityWrite,
  invalidateAfterBookingWrite,
  invalidateAfterServiceWrite,
} from "../../api/queryInvalidation";

export function useAdminMutations() {
  const queryClient = useQueryClient();

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

  return {
    updateAvailabilityMut,
    deleteBookingMut,
    updateBookingMut,
    createServiceMut,
    updateServiceMut,
    deleteServiceMut,
  };
}
