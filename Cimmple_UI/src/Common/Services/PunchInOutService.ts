import Instense from "./Axios-config";

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
  noofusers?: number;
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
}

export interface PunchBoardResponse {
  inUsers: PunchBoardUser[];
  breakUsers: PunchBoardUser[];
  outUsers: PunchBoardUser[];
  availableUsers?: PunchBoardUser[];
  lastUpdated?: string;
}

export interface PunchLivenessSession {
  sessionId: string;
  authToken?: string;
  quickLinkUrl?: string;
  status?: string;
  livenessDecision?: string;
}

export interface PunchResult {
  success: boolean;
  message?: string;
  user?: PunchBoardUser;
  livenessDecision?: string;
  verifyIsIdentical?: boolean;
  verifyConfidence?: number;
  faceMatchConfidence?: number;
  confidence?: number;
  faceMatched?: boolean;
}

const getStorage = (): any => {
  try {
    const punchStorage = localStorage.getItem("punchStorage");
    if (punchStorage) {
      return JSON.parse(punchStorage);
    }
    return JSON.parse(localStorage.getItem("storage") || "{}");
  } catch (err) {
    return {};
  }
};

const getContext = () => {
  const storage = getStorage();
  const rawLocationId = localStorage.getItem("locationId");

  return {
    tenantId: storage?.tenantID || 0,
    locationId: rawLocationId === null ? 0 : Number(rawLocationId),
    userUniqueId: storage?.user_UniqueID || 0,
    userName: storage?.userName || "",
  };
};

const readApiResult = (data: any) => {
  if (data && Object.prototype.hasOwnProperty.call(data, "result")) {
    return data.result;
  }

  return data;
};

const normalizeBoard = (data: any): PunchBoardResponse => {
  const result = readApiResult(data) || {};
  const source = Array.isArray(result) ? { users: result } : result;
  const users = source.users || source.attendanceUsers || (Array.isArray(result) ? result : []);

  const inUsers: PunchBoardUser[] = [];
  const breakUsers: PunchBoardUser[] = [];
  const outUsers: PunchBoardUser[] = [];
  const availableUsers: PunchBoardUser[] = [];

  users.forEach((user: any) => {
    const normalizedUser: PunchBoardUser = {
      userUniqueId: user.user_UniqueID || user.userUniqueId,
      empCode: user.empCode,
      firstName: user.firstName,
      lastName: user.lastName,
      userName: user.userName,
      email: user.email,
      tenantID: user.tenantID,
      empid: user.empid,
      role: user.role,
      roleName: user.roleName,
      noofusers: user.noofusers,
      todayPunchIn: user.todayPunchIn,
      todayPunchOut: user.todayPunchOut,
      todayBreakOut: user.todayBreakOut,
      isNotPunched: user.isNotPunched,
      isPunchedInOnly: user.isPunchedInOnly,
      isCompletedPunch: user.isCompletedPunch,
      isOnBreak: user.isOnBreak,
      status: user.status,
      lastPunchTime: user.lastPunchTime,
      lastPunchMode: user.lastPunchMode,
      locationName: user.locationName,
      isProfile: user.isProfile,
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
    lastUpdated: source.lastUpdated,
  };
};

export class PunchInOutService {
  public static GetPunchBoard = async (): Promise<PunchBoardResponse> => {
    const context = getContext();
    const url = `/User/GetPunchBoard`;

    const payload = {
      TenantID: context.tenantId,
      userId: context.userUniqueId,
    };

    return Instense.get(url, { params: payload }).then((response) => {
      return normalizeBoard(response.data);
    });
  };

  public static GetProfilePic = async (request: any): Promise<Blob | null> => {
    const url = `/User/GetProfilePic`;

    try {
      const response = await Instense.get(url, {
        params: request,
        responseType: "blob",
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching profile picture:", error);
      return null;
    }
  };

  public static CreateLivenessSession = async (
    direction: PunchDirection,
    userId?: number,
    tenantId?: number
  ): Promise<string> => {
    const context = getContext();
    const url = `/User/CreateLivenessSession`;

    const payload = {
      ...context,
      direction,
      ...(userId ?? context.userUniqueId ? { userId: userId ?? context.userUniqueId } : {}),
      ...(tenantId ?? context.tenantId ? { tenantId: tenantId ?? context.tenantId } : {}),
    };

    return Instense.post(url, payload).then((response) => {
      return readApiResult(response.data) as string;
    });
  };

  public static PunchByCapturedImage = async (
    image: Blob,
    userId?: number,
    tenantId?: number,
    direction?: PunchDirection
  ): Promise<PunchResult> => {
    const context = getContext();
    const url = `/User/Punch`;
    const formData = new FormData();

    const payload = {
      ...context,
      userUniqueId: userId,
      ...(direction ? { direction } : {}),
    };

    formData.append("image", image, "punch-face.jpg");
    formData.append("formField", JSON.stringify(payload));

    return Instense.post(url, formData).then((response) => {
      return readApiResult(response.data) as PunchResult;
    });
  };

  public static PunchByPassword = async (
    direction: PunchDirection,
    password: string,
    userName?: string
  ): Promise<PunchResult> => {
    const url = `/User/PunchPasswordVerify`;
    const payload = {
      direction,
      password,
      ...(userName && { userName }),
    };

    return Instense.post(url, payload).then((response) => {
      return readApiResult(response.data) as PunchResult;
    });
  };
}
