import axios, { type AxiosError } from "axios";

export function errMsg(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const e = (body as { error?: unknown }).error;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return fallback;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.BASE_URL || "/",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: unknown }>) => {
    const data = error.response?.data as unknown;
    const message = errMsg(data, error.message || "Request failed");
    return Promise.reject(new Error(message));
  }
);
