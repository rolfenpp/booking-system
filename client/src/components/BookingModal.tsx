import CloseIcon from "@mui/icons-material/Close";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { createBooking, sendMockConfirmation, type Service } from "../api/client";
import { useServicesQuery } from "../api/hooks";
import { invalidateAfterBookingWrite } from "../api/queryInvalidation";
import { APP_TIMEZONE } from "../constants/timezone";
import { useLocale } from "../context/LocaleContext";
import { formatTimeRangeInZone, normalizeIsoUtcForApi } from "../lib/timeDisplay";

type Props = {
  open: boolean;
  start: string;
  end: string;
  notificationsEnabled: boolean;
  onClose: () => void;
};

type BookingFormValues = {
  name: string;
  email: string;
  notes: string;
  service_id: string;
};

export function BookingModal({ open, start, end, notificationsEnabled, onClose }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [sent, setSent] = useState<string | null>(null);

  const servicesQuery = useServicesQuery({ enabled: open });
  const services: Service[] = servicesQuery.data ?? [];

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    defaultValues: { name: "", email: "", notes: "", service_id: "" },
  });

  const bookMutation = useMutation({
    mutationFn: async (data: BookingFormValues) => {
      const service_id = data.service_id === "" ? null : Number(data.service_id);
      const { id } = await createBooking({
        name: data.name.trim(),
        email: data.email.trim(),
        startTime: normalizeIsoUtcForApi(start),
        endTime: normalizeIsoUtcForApi(end),
        notes: data.notes.trim(),
        serviceId: service_id,
      });
      if (notificationsEnabled) {
        try {
          const r = await sendMockConfirmation(id);
          return r.message;
        } catch {
          return t("bookingSuccessSkipped");
        }
      }
      return t("bookingSuccessNoEmail");
    },
    onSuccess: async (message) => {
      setSent(message);
      await invalidateAfterBookingWrite(queryClient);
    },
  });

  useEffect(() => {
    if (!open) {
      reset({ name: "", email: "", notes: "", service_id: "" });
      clearErrors();
      setSent(null);
    }
  }, [open, reset, clearErrors]);

  const slotRangeLabel = useMemo(() => {
    if (!start || !end) return null;
    return formatTimeRangeInZone(start, end, APP_TIMEZONE);
  }, [start, end]);

  async function onValid(data: BookingFormValues) {
    clearErrors();
    try {
      await bookMutation.mutateAsync(data);
    } catch (err) {
      setError("root", {
        type: "server",
        message: err instanceof Error ? err.message : t("bookingError"),
      });
    }
  }

  const saving = isSubmitting || bookMutation.isPending;
  const servicesError =
    servicesQuery.isError
      ? servicesQuery.error instanceof Error
        ? servicesQuery.error.message
        : t("bookingError")
      : null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle sx={{ pr: 5 }} id="booking-modal-title">
        {t("bookingTitle")}
        <IconButton
          aria-label={t("bookingClose")}
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary">
          {t("bookingSubTimes")}
        </Typography>
        {slotRangeLabel && (
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
            {slotRangeLabel}
          </Typography>
        )}
        {servicesQuery.isPending && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("bookLoading")}
          </Typography>
        )}
        {servicesError && (
          <Alert severity="error" sx={{ mt: 2 }} role="alert">
            {servicesError}
          </Alert>
        )}
        {sent ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            {sent}
          </Alert>
        ) : (
          <Box component="form" id="booking-form" onSubmit={handleSubmit(onValid)} noValidate sx={{ mt: 2 }}>
            <TextField
              {...register("name", { required: t("valNameRequired"), maxLength: { value: 200, message: t("valMaxChars") } })}
              label={t("bookingName")}
              fullWidth
              required
              margin="normal"
              autoComplete="name"
              autoFocus
              slotProps={{ htmlInput: { maxLength: 200 } }}
              error={!!errors.name}
              helperText={errors.name?.message}
              disabled={!!servicesError}
            />
            <TextField
              {...register("email", {
                required: t("valEmailRequired"),
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: t("valEmailInvalid"),
                },
              })}
              label={t("bookingEmail")}
              type="email"
              fullWidth
              required
              margin="normal"
              autoComplete="email"
              slotProps={{ htmlInput: { maxLength: 320 } }}
              error={!!errors.email}
              helperText={errors.email?.message}
              disabled={!!servicesError}
            />
            {services.length > 0 && (
              <FormControl fullWidth margin="normal" disabled={!!servicesError}>
                <InputLabel id="bm-service-label">{t("bookingServiceOptional")}</InputLabel>
                <Controller
                  name="service_id"
                  control={control}
                  render={({ field }) => (
                    <Select labelId="bm-service-label" label={t("bookingServiceOptional")} {...field}>
                      <MenuItem value="">—</MenuItem>
                      {services.map((s) => (
                        <MenuItem key={s.id} value={String(s.id)}>
                          {s.name}
                          {s.price != null ? ` ($${s.price})` : ""}
                        </MenuItem>
                      ))}
                    </Select>
                  )}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                  {t("bookingServiceHint")}
                </Typography>
              </FormControl>
            )}
            <TextField
              {...register("notes", { maxLength: 2000 })}
              label={t("bookingNotesOptional")}
              fullWidth
              margin="normal"
              multiline
              minRows={3}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              disabled={!!servicesError}
            />
            {errors.root && (
              <Alert severity="error" sx={{ mt: 2 }} role="alert">
                {errors.root.message}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        {sent ? (
          <Button variant="contained" onClick={onClose}>
            {t("bookingDone")}
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>{t("bookingCancel")}</Button>
            <Button type="submit" form="booking-form" variant="contained" disabled={saving || !!servicesError}>
              {saving ? t("bookingSaving") : t("bookingConfirm")}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
