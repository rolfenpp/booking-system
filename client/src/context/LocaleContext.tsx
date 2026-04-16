import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type Locale, type MessageKey, messages } from "../i18n/messages";

const STORAGE_KEY = "booking-ui-locale";

function readStoredLocale(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en" || v === "sv") return v;
  } catch {}
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("sv")) {
    return "sv";
  }
  return "en";
}

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
};

const LocaleContext = createContext<Ctx | null>(null);

function interpolate(template: string, vars?: Record<string, string>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? vars[k]! : `{${k}}`));
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    document.documentElement.lang = locale === "sv" ? "sv" : "en";
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {}
    document.documentElement.lang = l === "sv" ? "sv" : "en";
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string>) => {
      const table = messages[locale];
      const raw = (table[key] ?? messages.en[key]) as string;
      return interpolate(raw ?? String(key), vars);
    },
    [locale]
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Ctx {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
