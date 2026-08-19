import api from "./apiClient";

export type PunchDirection = "IN" | "OUT";

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
  status?: PunchDirection;
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
}

export interface PunchResult {
  success: boolean;
  message?: string;
  faceMatchConfidence?: number;
  confidence?: number;
}

const readApiResult = (data: unknown) => {
  if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "result")) {
    return (data as { result: unknown }).result;
  }
  return data;
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
      status: user.status as PunchDirection | undefined,
      lastPunchTime: user.lastPunchTime as string | undefined,
      lastPunchMode: user.lastPunchMode as string | undefined,
      locationName: user.locationName as string | undefined,
      isProfile: user.isProfile as boolean | undefined,
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
  };
};

export class PunchInOutService {
  public static GetPunchBoard = async (): Promise<PunchBoardResponse> => {
    const response = await api.get("/Attendance/GetPunchBoard");
    return normalizeBoard(response.data);
  };

  public static PunchByCapturedImage = async (
    _image: Blob,
    _userId?: number,
    _tenantId?: number,
    _direction?: PunchDirection
  ): Promise<PunchResult> => {
    const response = await api.post("/Attendance/Punch");
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
