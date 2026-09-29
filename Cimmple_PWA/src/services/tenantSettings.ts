import api from "./apiClient";
import { AuthService } from "./authService";

export interface TenantDisplaySettings {
  dateFormat: string;
  timeFormat: string;
  timezone: string;
}

const STORAGE_KEY = "pwaTenantDisplaySettings";
const DEFAULTS: TenantDisplaySettings = {
  dateFormat: "M/d/yyyy",
  timeFormat: "12",
  timezone: "America/New_York",
};

let cached: TenantDisplaySettings | null = null;
let inflight: Promise<TenantDisplaySettings> | null = null;

function readStored(): TenantDisplaySettings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TenantDisplaySettings> & { tenantId?: number };
    if (parsed.tenantId !== AuthService.getTenantId()) return null;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return null;
  }
}

export function getTenantDisplaySettings(): TenantDisplaySettings {
  if (!cached) cached = readStored();
  return cached || DEFAULTS;
}

/** Fetches the tenant's date/time settings once per session (same source as Flow). */
export function loadTenantDisplaySettings(): Promise<TenantDisplaySettings> {
  if (inflight) return inflight;
  const tenantId = AuthService.getTenantId();
  if (tenantId <= 0) return Promise.resolve(getTenantDisplaySettings());

  inflight = api
    .get("/SystemSettings/GetSettings", { params: { tenantId } })
    .then((res) => {
      const data = (res.data || {}) as Partial<TenantDisplaySettings>;
      const next: TenantDisplaySettings = {
        dateFormat: data.dateFormat || DEFAULTS.dateFormat,
        timeFormat: data.timeFormat || DEFAULTS.timeFormat,
        timezone: data.timezone || DEFAULTS.timezone,
      };
      cached = next;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, tenantId }));
      } catch {
        /* storage full / private mode */
      }
      return next;
    })
    .catch(() => {
      inflight = null;
      return getTenantDisplaySettings();
    });
  return inflight;
}

/** API instants are UTC; ISO strings without an offset must not be read as device-local. */
function parseApiInstant(value: string | Date): Date {
  if (value instanceof Date) return value;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    return new Date(`${raw}Z`);
  }
  return new Date(raw);
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Formats a UTC instant in the tenant timezone using the tenant date/time format (matches Flow formatDateTime). */
export function formatTenantDateTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = parseApiInstant(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const settings = getTenantDisplaySettings();
  const timeZone = isValidTimeZone(settings.timezone) ? settings.timezone : DEFAULTS.timezone;
  const use24h = settings.timeFormat === "24";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: use24h ? "h23" : "h12",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || "";

  const year = part("year");
  const month = Number(part("month"));
  const day = Number(part("day"));
  const monthLong = new Intl.DateTimeFormat("en-US", { timeZone, month: "long" }).format(date);

  const datePart = settings.dateFormat.replace(/yyyy|MMMM|MMM|MM|M|dd|d/g, (token) => {
    switch (token) {
      case "yyyy":
        return year;
      case "MMMM":
        return monthLong;
      case "MMM":
        return monthLong.slice(0, 3);
      case "MM":
        return String(month).padStart(2, "0");
      case "M":
        return String(month);
      case "dd":
        return String(day).padStart(2, "0");
      default:
        return String(day);
    }
  });

  const hour = part("hour");
  const minute = part("minute");
  const timePart = use24h
    ? `${hour.padStart(2, "0")}:${minute}`
    : `${hour}:${minute} ${part("dayPeriod").toUpperCase()}`;

  return `${datePart} ${timePart}`;
}
