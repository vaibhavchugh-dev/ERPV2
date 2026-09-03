import api from "./apiClient";
import { getSessionTimeZone } from "./authService";

export type PunchDirection = "IN" | "OUT" | "BREAK_OUT" | "BREAK_IN";

export interface PunchBoardUser {
  userUniqueId: number;
  empCode?: string;
  firstName?: string;
  lastName?: string;
  userName?: string;
  email?: string;
  tenantID?: number;
  empid?: number;
  role?: number;
  roleName?: string;
  todayPunchIn?: string;
  todayPunchOut?: string;
  todayBreakOut?: string;
  isNotPunched?: number;
  isPunchedInOnly?: number;
  isCompletedPunch?: number;
  isOnBreak?: number;
  status?: string;
  nextDirection?: PunchDirection;
  nextDirectionLabel?: string;
  lastPunchTime?: string;
  lastPunchMode?: string;
  locationName?: string;
  isProfile?: boolean;
  hasPassword?: boolean;
}

export interface PunchBoardResponse {
  inUsers: PunchBoardUser[];
  breakUsers: PunchBoardUser[];
  outUsers: PunchBoardUser[];
  availableUsers?: PunchBoardUser[];
  lastUpdated?: string;
  tenantTimezone?: string;
  tenantLocalNow?: string;
  endOfDayPunchHour?: number;
}

const END_OF_DAY_PUNCH_HOUR = 17;

/** Hour (0–23) for a date in the given IANA timezone (defaults to session storage). */
export const getHourInTimeZone = (date: Date, timeZone?: string): number => {
  const tz = timeZone?.trim() || getSessionTimeZone();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour");
    return hourPart ? parseInt(hourPart.value, 10) : date.getHours();
  } catch {
    return date.getHours();
  }
};

/** At or after 5:00 PM tenant-local → end-of-day out; before → break out. */
export const isAtOrAfterEndOfDay = (
  date: Date,
  timeZone?: string,
  endHour = END_OF_DAY_PUNCH_HOUR
): boolean => getHourInTimeZone(date, timeZone) >= endHour;

export interface PunchResult {
  success: boolean;
  message?: string;
  direction?: PunchDirection;
  faceMatchConfidence?: number;
  confidence?: number;
}

const readApiResult = (data: unknown) => {
  if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "result")) {
    return (data as { result: unknown }).result;
  }
  return data;
};

const normalizeDirection = (value?: string): PunchDirection | undefined => {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper === "BREAKOUT") return "BREAK_OUT";
  if (upper === "BREAKIN") return "BREAK_IN";
  if (upper === "IN" || upper === "OUT" || upper === "BREAK_OUT" || upper === "BREAK_IN") {
    return upper;
  }
  return undefined;
};

export const getPunchDirectionLabel = (direction?: string): string => {
  switch ((direction || "").toUpperCase()) {
    case "OUT":
      return "Punch Out";
    case "BREAK_OUT":
    case "BREAKOUT":
      return "Break Out";
    case "BREAK_IN":
    case "BREAKIN":
      return "Break In";
    case "IN":
    default:
      return "Punch In";
  }
};

/** Client-side fallback mirroring server rules (tenant local time). */
export const resolveNextPunchDirection = (
  employee: PunchBoardUser,
  now = new Date(),
  timeZone?: string,
  endOfDayHour = END_OF_DAY_PUNCH_HOUR
): PunchDirection => {
  if (employee.isOnBreak === 1) {
    return "BREAK_IN";
  }
  if (employee.isCompletedPunch === 1) {
    return "IN";
  }
  if (employee.isPunchedInOnly === 1) {
    return isAtOrAfterEndOfDay(now, timeZone, endOfDayHour) ? "OUT" : "BREAK_OUT";
  }
  if (employee.nextDirection) {
    return employee.nextDirection;
  }
  return "IN";
};

const normalizeBoard = (data: unknown): PunchBoardResponse => {
  const result = (readApiResult(data) || {}) as Record<string, unknown>;
  const source = Array.isArray(result) ? { users: result } : result;
  const users = (source.users || source.attendanceUsers || []) as Record<string, unknown>[];

  const inUsers: PunchBoardUser[] = [];
  const breakUsers: PunchBoardUser[] = [];
  const outUsers: PunchBoardUser[] = [];
  const availableUsers: PunchBoardUser[] = [];

  users.forEach((user) => {
    const nextDirection = normalizeDirection(
      (user.nextDirection as string | undefined) || undefined
    );
    const normalizedUser: PunchBoardUser = {
      userUniqueId: Number(user.user_UniqueID || user.userUniqueId),
      empCode: user.empCode as string | undefined,
      firstName: user.firstName as string | undefined,
      lastName: user.lastName as string | undefined,
      userName: user.userName as string | undefined,
      email: user.email as string | undefined,
      tenantID: user.tenantID as number | undefined,
      empid: user.empid as number | undefined,
      role: user.role as number | undefined,
      roleName: user.roleName as string | undefined,
      todayPunchIn: user.todayPunchIn as string | undefined,
      todayPunchOut: user.todayPunchOut as string | undefined,
      todayBreakOut: user.todayBreakOut as string | undefined,
      isNotPunched: user.isNotPunched as number | undefined,
      isPunchedInOnly: user.isPunchedInOnly as number | undefined,
      isCompletedPunch: user.isCompletedPunch as number | undefined,
      isOnBreak: user.isOnBreak as number | undefined,
      status: user.status as string | undefined,
      nextDirection,
      nextDirectionLabel:
        (user.nextDirectionLabel as string | undefined) ||
        getPunchDirectionLabel(nextDirection),
      lastPunchTime: user.lastPunchTime as string | undefined,
      lastPunchMode: user.lastPunchMode as string | undefined,
      locationName: user.locationName as string | undefined,
      isProfile: user.isProfile as boolean | undefined,
      hasPassword: user.hasPassword as boolean | undefined,
    };

    if (normalizedUser.isOnBreak === 1) {
      breakUsers.push(normalizedUser);
    } else if (normalizedUser.isPunchedInOnly === 1) {
      inUsers.push(normalizedUser);
    } else if (normalizedUser.isCompletedPunch === 1) {
      outUsers.push(normalizedUser);
    } else {
      availableUsers.push(normalizedUser);
    }
  });

  return {
    inUsers,
    breakUsers,
    outUsers,
    availableUsers,
    lastUpdated: source.lastUpdated as string | undefined,
    tenantTimezone: (source.tenantTimezone as string | undefined) || undefined,
    tenantLocalNow: (source.tenantLocalNow as string | undefined) || undefined,
    endOfDayPunchHour:
      typeof source.endOfDayPunchHour === "number" ? source.endOfDayPunchHour : END_OF_DAY_PUNCH_HOUR,
  };
};

export class PunchInOutService {
  public static GetPunchBoard = async (): Promise<PunchBoardResponse> => {
    const response = await api.get("/Attendance/GetPunchBoard");
    return normalizeBoard(response.data);
  };

  public static PunchByCapturedImage = async (
    image: Blob,
    userId?: number,
    tenantId?: number,
    direction?: PunchDirection
  ): Promise<PunchResult> => {
    const formData = new FormData();
    formData.append("image", image, "punch-face.jpg");
    formData.append(
      "formField",
      JSON.stringify({
        userUniqueId: userId,
        tenantId,
        direction,
      })
    );
    const response = await api.post("/Attendance/Punch", formData);
    return readApiResult(response.data) as PunchResult;
  };

  public static PunchByPassword = async (
    direction: PunchDirection,
    password: string,
    userName?: string,
    userUniqueId?: number
  ): Promise<PunchResult> => {
    const response = await api.post("/Attendance/PunchPasswordVerify", {
      direction,
      password,
      userName,
      userUniqueId,
    });
    return readApiResult(response.data) as PunchResult;
  };
}
