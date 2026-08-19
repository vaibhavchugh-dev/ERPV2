import Instense from "./Axios-config";

export type AttendanceStatus = "in" | "completed" | "missingOut" | "noPunch";

export interface AttendanceRegisterRow {
  workDate: string;
  userUniqueId: number;
  empCode: string;
  firstName: string;
  lastName: string;
  userName: string;
  punchIn?: string | null;
  punchOut?: string | null;
  hours?: number | null;
  status: AttendanceStatus;
  lastMethod: string;
  locationName: string;
  punchCount: number;
}

export interface AttendancePunchLogRow {
  id: number;
  punchTime: string;
  userUniqueId: number;
  empCode: string;
  firstName: string;
  lastName: string;
  direction: string;
  verificationType: string;
  isSuccess: boolean;
  failureReason: string;
  confidence?: number | null;
}

export class AttendanceService {
  public static GetRegister = async (params: {
    from: string;
    to: string;
    employeeId?: number;
    includeNoPunch?: boolean;
  }): Promise<AttendanceRegisterRow[]> => {
    const url = "/Attendance/GetRegister";
    const response = await Instense.get(url, {
      params: {
        from: params.from,
        to: params.to,
        employeeId: params.employeeId || undefined,
        includeNoPunch: params.includeNoPunch || undefined,
      },
    });
    return (response.data.result || []) as AttendanceRegisterRow[];
  };

  public static GetPunchLog = async (params: {
    from: string;
    to: string;
    employeeId?: number;
    includeFailed?: boolean;
  }): Promise<AttendancePunchLogRow[]> => {
    const url = "/Attendance/GetPunchLog";
    const response = await Instense.get(url, {
      params: {
        from: params.from,
        to: params.to,
        employeeId: params.employeeId || undefined,
        includeFailed: params.includeFailed === true,
      },
    });
    return (response.data.result || []) as AttendancePunchLogRow[];
  };
}
