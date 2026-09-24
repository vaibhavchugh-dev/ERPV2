import Instense from "./Axios-config";

export interface ReportScheduleDto {
  id: number;
  tenantId: number;
  createdByUserId: number;
  reportCategory: string;
  reportType: string;
  reportName: string;
  dateRange: string;
  customStartDate?: string | null;
  customEndDate?: string | null;
  locationId?: number | null;
  parametersJson?: string | null;
  format: string;
  frequency: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timeOfDayMinutes: number;
  timeZoneId: string;
  toEmails: string;
  ccEmails?: string | null;
  subject?: string | null;
  isEnabled: boolean;
  nextRunUtc?: string | null;
  lastRunUtc?: string | null;
  lastRunStatus?: string | null;
  lastRunError?: string | null;
  createdUtc: string;
  updatedUtc: string;
}

export interface ReportScheduleUpsertPayload {
  reportCategory: string;
  reportType: string;
  reportName: string;
  dateRange: string;
  customStartDate?: string;
  customEndDate?: string;
  locationId?: number | null;
  parameters?: Record<string, unknown>;
  format: string;
  frequency: string;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timeOfDayMinutes: number;
  timeZoneId?: string;
  toEmails: string;
  ccEmails?: string;
  subject?: string;
  isEnabled?: boolean;
}

export class ReportScheduleService {
  public static List = async (params?: {
    locationId?: number;
  }): Promise<ReportScheduleDto[]> => {
    const response = await Instense.get(`/ReportSchedules`, {
      params: {
        ...(params?.locationId && params.locationId > 0
          ? { locationId: params.locationId }
          : {}),
      },
    });
    return response.data?.result || [];
  };

  public static Create = async (
    payload: ReportScheduleUpsertPayload
  ): Promise<ReportScheduleDto> => {
    const response = await Instense.post(`/ReportSchedules`, payload);
    return response.data?.result;
  };

  public static Update = async (
    id: number,
    payload: ReportScheduleUpsertPayload
  ): Promise<ReportScheduleDto> => {
    const response = await Instense.put(`/ReportSchedules/${id}`, payload);
    return response.data?.result;
  };

  public static SetEnabled = async (
    id: number,
    isEnabled: boolean
  ): Promise<ReportScheduleDto> => {
    const response = await Instense.patch(`/ReportSchedules/${id}/enabled`, {
      isEnabled,
    });
    return response.data?.result;
  };

  public static Delete = async (id: number): Promise<void> => {
    await Instense.delete(`/ReportSchedules/${id}`);
  };

  public static RunNow = async (id: number): Promise<ReportScheduleDto> => {
    const response = await Instense.post(`/ReportSchedules/${id}/run`);
    return response.data?.result;
  };
}

export const minutesToTimeInput = (minutes: number): string => {
  const m = Math.max(0, Math.min(1439, minutes || 0));
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
};

export const timeInputToMinutes = (value: string): number => {
  const [hh, mm] = (value || "08:00").split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 480;
  return Math.min(1439, Math.max(0, hh * 60 + mm));
};

/**
 * Format a UTC instant in the schedule's timezone as 24-hour `YYYY-MM-DD HH:mm`.
 */
const WINDOWS_TO_IANA: Record<string, string> = {
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "US Mountain Standard Time": "America/Phoenix",
  "GMT Standard Time": "Europe/London",
  "Romance Standard Time": "Europe/Paris",
  "W. Europe Standard Time": "Europe/Berlin",
  "India Standard Time": "Asia/Kolkata",
  "Arabian Standard Time": "Asia/Dubai",
  "Singapore Standard Time": "Asia/Singapore",
  "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland",
};

const resolveScheduleTimeZone = (timeZoneId?: string | null): string => {
  const raw = (timeZoneId || "UTC").trim() || "UTC";
  return WINDOWS_TO_IANA[raw] || raw;
};

export const formatScheduleInstant = (
  value?: string | null,
  timeZoneId?: string | null
): string => {
  if (!value) return "—";
  try {
    const raw = String(value).trim();
    // Treat API datetime2 (no Z) as UTC.
    const utcIso =
      /^\d{4}-\d{2}-\d{2}T/.test(raw) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)
        ? `${raw}Z`
        : raw.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(raw)
        ? raw
        : `${raw.replace(" ", "T")}Z`;
    const date = new Date(utcIso);
    if (Number.isNaN(date.getTime())) return value;
    const tz = resolveScheduleTimeZone(timeZoneId);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
  } catch {
    return value;
  }
};
