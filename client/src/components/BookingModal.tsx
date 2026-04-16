import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "../context/LocaleContext";
import { createBooking, sendMockConfirmation, type Service } from "../api/client";
import { useServicesQuery } from "../api/hooks";
import { invalidateAfterBookingWrite } from "../api/queryInvalidation";
import { APP_TIMEZONE } from "../constants/timezone";
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
        start_time: normalizeIsoUtcForApi(start),
        end_time: normalizeIsoUtcForApi(end),
        notes: data.notes.trim(),
        service_id,
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const slotRangeLabel = useMemo(() => {
    if (!start || !end) return null;
    return formatTimeRangeInZone(start, end, APP_TIMEZONE);
  }, [start, end]);

  if (!open) return null;

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
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="booking-modal-title">
        <div className="modal__head">
          <h2 id="booking-modal-title" className="modal__title">
            {t("bookingTitle")}
          </h2>
          <button type="button" className="modal__close btn-ghost btn-sm" onClick={onClose} aria-label={t("bookingClose")}>
            ×
          </button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {t("bookingSubTimes")}
        </p>
        {slotRangeLabel && (
          <p className="muted" style={{ marginTop: "0.35rem", fontWeight: 600, color: "var(--text)" }}>
            {slotRangeLabel}
          </p>
        )}
        {servicesQuery.isPending && <p className="muted">{t("bookLoading")}</p>}
        {servicesError && (
          <p className="error-text" role="alert">
            {servicesError}
          </p>
        )}
        {sent ? (
          <p className="success-banner">{sent}</p>
        ) : (
          <form onSubmit={handleSubmit(onValid)} noValidate>
            <div className="field">
              <label htmlFor="bm-name">{t("bookingName")}</label>
              <input
                id="bm-name"
                autoFocus
                autoComplete="name"
                maxLength={200}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "bm-name-err" : undefined}
                {...register("name", { required: t("valNameRequired"), maxLength: { value: 200, message: t("valMaxChars") } })}
              />
              {errors.name && (
                <p id="bm-name-err" className="error-text" role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="field">
              <label htmlFor="bm-email">{t("bookingEmail")}</label>
              <input
                id="bm-email"
                type="email"
                autoComplete="email"
                maxLength={320}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "bm-email-err" : undefined}
                {...register("email", {
                  required: t("valEmailRequired"),
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: t("valEmailInvalid"),
                  },
                })}
              />
              {errors.email && (
                <p id="bm-email-err" className="error-text" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>
            {services.length > 0 && (
              <div className="field">
                <label htmlFor="bm-service">{t("bookingServiceOptional")}</label>
                <select id="bm-service" {...register("service_id")}>
                  <option value="">—</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.price != null ? ` ($${s.price})` : ""}
                    </option>
                  ))}
                </select>
                <p className="muted" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
                  {t("bookingServiceHint")}
                </p>
              </div>
            )}
            <div className="field">
              <label htmlFor="bm-notes">{t("bookingNotesOptional")}</label>
              <textarea id="bm-notes" rows={3} maxLength={2000} {...register("notes", { maxLength: 2000 })} />
            </div>
            {errors.root && (
              <p className="error-text" role="alert">
                {errors.root.message}
              </p>
            )}
            <div className="modal__actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t("bookingCancel")}
              </button>
              <button type="submit" className="btn" disabled={saving || !!servicesError}>
                {saving ? t("bookingSaving") : t("bookingConfirm")}
              </button>
            </div>
          </form>
        )}
        {sent && (
          <div className="modal__actions" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn" onClick={onClose}>
              {t("bookingDone")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
