import { toast } from "react-toastify";
import {
  getPunchDirectionLabel,
  PunchBoardUser as ServicePunchBoardUser,
  PunchDirection,
  PunchInOutService,
  resolveNextPunchDirection,
} from "../services/punchInOutService";
import React from "react";
import { Navigate } from "react-router-dom";
import { FaCamera, FaLock, FaRightFromBracket, FaUnlock } from "react-icons/fa6";
import { login as apiLogin } from "../services/apiClient";
import {
  AuthService,
  PUNCH_ADMIN_UNLOCK_KEY,
  PUNCH_SESSION_COOKIE,
  PUNCH_STORAGE_KEY,
  PUNCH_TOKEN_KEY,
  getCookie,
  isAdminRole,
  isPunchSessionExpired,
} from "../services/authService";
import "./PunchInOut.scss";

/** Face punch uses Azure against CimmplePunch.EmployeeFace. Password remains a fallback. */
const FACE_PUNCH_ENABLED = true;
const FACE_MATCH_THRESHOLD = 0.75;

const Spinner: React.FC<{ animation?: string; size?: string }> = () => (
  <span className="punch-spinner" aria-hidden="true" />
);

const isFaceMatchValid = (confidence?: number): boolean => {
  return confidence !== undefined && confidence >= FACE_MATCH_THRESHOLD;
};

const getNormalizedConfidence = (result: any): number | undefined => {
  if (result?.faceMatchConfidence !== undefined) {
    return result.faceMatchConfidence;
  }
  if (result?.confidence !== undefined) {
    return result.confidence / 100;
  }
  return undefined;
};

export type PunchBoardUser = ServicePunchBoardUser & {
  noofusers?: number;
  profilePicUrl?: string;
};

const getDisplayName = (user: PunchBoardUser) => {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || user.userName || "Unknown user";
};

const formatPunchTime = (value?: string) => {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const hours = date.getHours() % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const normalizeEmployeeCode = (value?: string) => (value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const getUserInitials = (user: PunchBoardUser) => {
  const first = (user.firstName || "").trim();
  const last = (user.lastName || "").trim();
  const name = `${first} ${last}`.trim() || user.userName || user.empCode || "";
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]).join("");
  return (initials || "U").toUpperCase();
};

const getReadableDateTime = (value: Date) => {
  const time = value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = value.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return { time, date };
};

const getTimezoneDateTime = (value: Date, timeZone?: string) => {
  const resolvedTimeZone = timeZone && timeZone.trim() ? timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const time = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: resolvedTimeZone,
  }).format(value);

  const date = new Intl.DateTimeFormat([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: resolvedTimeZone,
  }).format(value);

  return { time, date };
};

const clearPunchSession = () => {
  AuthService.clearSession();
};

const normalizePunchStorage = (session: any) => ({
  user_UniqueID: session.user_UniqueID,
  userName: session.userName,
  tenantID: session.tenantID,
  rolId: session.rolId,
  role: session.role || "",
  companyName: session.companyName || session.name || "",
  name: session.companyName || session.name || "",
  currentUtcTime: session.currentUtcTime || "",
  timeZone: session.timeZone || session.currentUtcTime || "",
  expiresAt: session.expiresAt,
});


// User List Component for Attendance Tabs
const AttendanceUserListItem: React.FC<{
  user: PunchBoardUser;
  status: "on-premises" | "on-break" | "not-arrived" | "left";
}> = ({ user, status }) => {
  return (
    <div className={`attendance-user-item ${status}`}>
      <div className="attendance-user-info">
        <strong>{getDisplayName(user)}</strong>
        <span className="emp-code">{user.empCode || "--"}</span>
        {status === "on-premises" && user.todayPunchIn && (
          <span className="punch-time">{formatPunchTime(user.todayPunchIn)} In</span>
        )}
        {status === "on-break" && user.todayBreakOut && (
          <span className="punch-time">{formatPunchTime(user.todayBreakOut)} Break</span>
        )}
        {status === "left" && user.todayPunchOut && (
          <span className="punch-time">{formatPunchTime(user.todayPunchOut)} Out</span>
        )}
      </div>
      {status === "on-premises" && (
        <span className="status-badge on-premises">ON PREMISES</span>
      )}
      {status === "on-break" && (
        <span className="status-badge on-break">ON BREAK</span>
      )}
      {status === "not-arrived" && (
        <span className="status-badge not-arrived">NOT ARRIVED</span>
      )}
      {status === "left" && (
        <span className="status-badge left">LEFT</span>
      )}
    </div>
  );
};

type PunchEntryMode = "code" | "name";
type PunchStage = "select" | "camera";

const PunchWorkflowPanel: React.FC<{
  stage: PunchStage;
  entryMode: PunchEntryMode;
  boardMembers: PunchBoardUser[];
  filteredEmployees: PunchBoardUser[];
  selectedEmployee: PunchBoardUser | null;
  employeeCodeEntry: string;
  employeeSearchQuery: string;
  passwordEntry: string;
  passwordVisible: boolean;
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraLoading: boolean;
  cameraError: string | null;
  captureLoading: boolean;
  passwordLoading: boolean;
  onModeChange: (mode: PunchEntryMode) => void;
  onEmployeeCodeChange: (value: string) => void;
  onEmployeeSearchChange: (value: string) => void;
  onEmployeeSelect: (employee: PunchBoardUser) => void;
  onPasswordChange: (value: string) => void;
  onPasswordToggle: () => void;
  onContinue: () => void;
  onBackToSelection: () => void;
  onSubmit: () => void;
}> = ({
  stage,
  entryMode,
  boardMembers,
  filteredEmployees,
  selectedEmployee,
  employeeCodeEntry,
  employeeSearchQuery,
  passwordEntry,
  passwordVisible,
  stream,
  videoRef,
  cameraLoading,
  cameraError,
  captureLoading,
  passwordLoading,
  onModeChange,
  onEmployeeCodeChange,
  onEmployeeSearchChange,
  onEmployeeSelect,
  onPasswordChange,
  onPasswordToggle,
  onContinue,
  onBackToSelection,
  onSubmit,
}) => {
    const isNewEmployee = selectedEmployee?.isProfile === false;
    const selectedLabel = selectedEmployee ? `${getDisplayName(selectedEmployee)}${selectedEmployee.empCode ? ` - ${selectedEmployee.empCode}` : ""}` : "No employee selected";
    const canContinue = entryMode === "code" ? employeeCodeEntry.trim().length > 0 : !!selectedEmployee;
    const canSubmit =
      !!selectedEmployee &&
      !captureLoading &&
      !passwordLoading &&
      (FACE_PUNCH_ENABLED
        ? !isNewEmployee || passwordEntry.trim().length > 0
        : passwordEntry.trim().length > 0);
    const nextDirection = selectedEmployee
      ? resolveNextPunchDirection(selectedEmployee)
      : "IN";
    const nextLabel =
      selectedEmployee?.nextDirectionLabel || getPunchDirectionLabel(nextDirection);
    const submitLabel = !FACE_PUNCH_ENABLED || isNewEmployee || passwordEntry.trim()
      ? `Verify & ${nextLabel}`
      : `Capture & ${nextLabel}`;

    return (
      <div className="punch-workflow-panel">
        {stage === "select" ? (
          <>
            <div className="punch-workflow-header">
              <h2>Who&apos;s checking in?</h2>
              <div className="punch-workflow-kicker">Enter your Employee ID or find your name below.</div>
            </div>

            <div className="punch-mode-toggle">
              <button
                type="button"
                className={entryMode === "code" ? "active" : ""}
                onClick={() => onModeChange("code")}
              >
                Employee ID
              </button>
              <button
                type="button"
                className={entryMode === "name" ? "active" : ""}
                onClick={() => onModeChange("name")}
              >
                Find My Name
              </button>
            </div>

            <div className="punch-selection-card">
              {entryMode === "code" ? (
                <>
                  <label className="punch-field-label">Employee ID</label>
                  <div className={`punch-code-display ${employeeCodeEntry ? "has-value" : "is-placeholder"}`}>
                    {employeeCodeEntry || <span className="punch-code-placeholder">e.g. E001</span>}
                  </div>
                  <div className="punch-keypad">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "E", "0", "back"].map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`punch-key ${key === "back" ? "backspace" : ""}`}
                        onClick={() => {
                          if (key === "back") {
                            onEmployeeCodeChange(employeeCodeEntry.slice(0, -1));
                            return;
                          }

                          if (key === "E") {
                            if (employeeCodeEntry.startsWith("E")) return;
                            onEmployeeCodeChange(`E${employeeCodeEntry.replace(/^E/, "")}`);
                            return;
                          }

                          onEmployeeCodeChange(`${employeeCodeEntry}${key}`.toUpperCase());
                        }}
                      >
                        {key === "back" ? "DEL" : key}
                      </button>
                    ))}
                  </div>
                  <div className="punch-code-actions">
                    <button
                      type="button"
                      className="punch-secondary-btn"
                      onClick={() => onEmployeeCodeChange("")}
                      disabled={!employeeCodeEntry}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="punch-primary-btn"
                      onClick={onContinue}
                      disabled={!canContinue}
                    >
                      Continue
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="punch-search-wrapper">
                    <input
                      type="text"
                      className="punch-search-input"
                      placeholder="Search..."
                      value={employeeSearchQuery}
                      onChange={(event) => onEmployeeSearchChange(event.target.value)}
                    />
                  </div>

                  <div className="punch-employee-list">
                    {filteredEmployees.length === 0 ? (
                      <div className="punch-empty-state">No board members found</div>
                    ) : (
                      filteredEmployees.map((employee) => {
                        const isActive = selectedEmployee?.userUniqueId === employee.userUniqueId;
                        return (
                          <button
                            key={employee.userUniqueId}
                            type="button"
                            className={`punch-employee-row ${isActive ? "active" : ""}`}
                            onClick={() => onEmployeeSelect(employee)}
                          >
                            <div className="punch-employee-avatar">{getUserInitials(employee)}</div>
                            <div className="punch-employee-info">
                              <strong>{getDisplayName(employee)}</strong>
                              <span>{employee.empCode || employee.userName || "--"}</span>
                            </div>
                            {employee.isProfile === false && <span className="punch-new-tag">NEW</span>}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="punch-code-actions">
                    <button
                      type="button"
                      className="punch-secondary-btn"
                      onClick={() => onEmployeeSearchChange("")}
                      disabled={!employeeSearchQuery}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="punch-primary-btn"
                      onClick={onContinue}
                      disabled={!canContinue}
                    >
                      Continue
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="punch-selection-footer">
              <span>{boardMembers.length} board members available</span>
              <span>{selectedLabel}</span>
            </div>
          </>
        ) : (
          <>
            <div className="punch-workflow-header">
              <h2>Place your face inside the oval frame.</h2>
              <p>{selectedEmployee ? `Capturing for ${selectedLabel}.` : "Confirm the selected employee before capture."}</p>
            </div>



            <div className="punch-camera-stage">
              <div className="punch-camera-stage-preview">
                <video ref={videoRef} autoPlay playsInline muted />
                {cameraError ? (
                  <div className="camera-placeholder">
                    <FaCamera />
                    <span>{cameraError}</span>
                  </div>
                ) : !stream ? (
                  <div className="camera-placeholder">
                    <FaCamera />
                    <span>{cameraLoading ? "Starting camera..." : "Opening camera..."}</span>
                  </div>
                ) : null}
                <div className="punch-oval-overlay" />
              </div>

              <div className="punch-camera-hint">
                <div className="punch-next-action">
                  Next action: <strong>{nextLabel}</strong>
                  {nextDirection === "BREAK_OUT" && (
                    <span className="punch-next-action-note"> (before 5:00 PM)</span>
                  )}
                  {nextDirection === "OUT" && (
                    <span className="punch-next-action-note"> (end of day)</span>
                  )}
                </div>
                {isNewEmployee
                  ? "This employee is not enrolled yet. Enter the password to punch, then add a face photo in Employee Master."
                  : passwordEntry.trim()
                    ? "Password entered - tap submit to verify only."
                    : FACE_PUNCH_ENABLED
                      ? "Look at the camera, or enter a password as a fallback."
                      : "Enter your password to punch. Face recognition will be enabled later."}
              </div>

              <div className="punch-password-block">
                <label className="punch-field-label">Password</label>
                <div className="punch-password-row">
                  <input
                    type={passwordVisible ? "text" : "password"}
                    className="punch-password-input"
                    placeholder={
                      FACE_PUNCH_ENABLED
                        ? isNewEmployee
                          ? "Required until a face is enrolled"
                          : "Optional fallback"
                        : "Required to punch"
                    }
                    value={passwordEntry}
                    onChange={(event) => onPasswordChange(event.target.value)}
                  />
                  <button type="button" className="punch-password-toggle" onClick={onPasswordToggle}>
                    {passwordVisible ? "Hide" : "Show"}
                  </button>
                </div>
                {/* <small className="punch-password-help">
                {isNewEmployee
                  ? "Password is required before we register the face."
                  : "If you enter a password, we will verify it instead of doing a face punch."}
              </small> */}
              </div>

              <div className="punch-camera-actions">
                <button type="button" className="punch-secondary-btn" onClick={onBackToSelection}>
                  Back
                </button>
                <button
                  type="button"
                  className="punch-primary-btn"
                  onClick={onSubmit}
                  disabled={!canSubmit || cameraLoading}
                >
                  {captureLoading || passwordLoading ? "Processing..." : submitLabel}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

// Attendance Summary Panel
const AttendanceSummaryPanel: React.FC<{
  inUsers: PunchBoardUser[];
  breakUsers: PunchBoardUser[];
  outUsers: PunchBoardUser[];
  availableUsers: PunchBoardUser[];
  loading: boolean;
}> = ({ inUsers, breakUsers, outUsers, availableUsers, loading }) => {
  const totalOnPremises = inUsers.length;
  const totalOnBreak = breakUsers.length;
  const totalNotArrived = availableUsers.length;
  const totalLeft = outUsers.length;
  const total = totalOnPremises + totalOnBreak + totalNotArrived + totalLeft;

  const onPremisesPercent = total > 0 ? (totalOnPremises / total) * 100 : 0;
  const onBreakPercent = total > 0 ? (totalOnBreak / total) * 100 : 0;
  const notArrivedPercent = total > 0 ? (totalNotArrived / total) * 100 : 0;
  const leftPercent = total > 0 ? (totalLeft / total) * 100 : 0;

  return (
    <div className="attendance-panel">
      <div className="attendance-header">
        <div className="attendance-title">
          <h2>Today's Attendance</h2>
        </div>
      </div>

      <div className="attendance-stats">
        <div className="stat-box on-premises">
          <span className="stat-value">{totalOnPremises}</span>
          <span className="stat-label">PRESENT</span>
        </div>
        <div className="stat-box on-break">
          <span className="stat-value">{totalOnBreak}</span>
          <span className="stat-label">ON BREAK</span>
        </div>
        <div className="stat-box not-arrived">
          <span className="stat-value">{totalNotArrived}</span>
          <span className="stat-label">NOT ARRIVED</span>
        </div>
        <div className="stat-box left">
          <span className="stat-value">{totalLeft}</span>
          <span className="stat-label">OUT</span>
        </div>
      </div>

      <div className="attendance-progress">
        <div className="progress-bar-wrapper">
          {onPremisesPercent > 0 && (
            <div
              className="progress-segment on-premises"
              style={{ width: `${onPremisesPercent}%` }}
              title={`On Premises: ${totalOnPremises}`}
            />
          )}
          {onBreakPercent > 0 && (
            <div
              className="progress-segment on-break"
              style={{ width: `${onBreakPercent}%` }}
              title={`On Break: ${totalOnBreak}`}
            />
          )}
          {notArrivedPercent > 0 && (
            <div
              className="progress-segment not-arrived"
              style={{ width: `${notArrivedPercent}%` }}
              title={`Not Arrived: ${totalNotArrived}`}
            />
          )}
          {leftPercent > 0 && (
            <div
              className="progress-segment left"
              style={{ width: `${leftPercent}%` }}
              title={`Left: ${totalLeft}`}
            />
          )}
        </div>
        <div className="progress-legend">
          <span>
            {totalOnPremises} present, {totalOnBreak} on break  {totalOnPremises > 0 ? `${Math.round(onPremisesPercent)}% arrived` : ""}
          </span>
        </div>
      </div>

      <div className="attendance-tabs">
        <div className="attendance-list-section">
          <h3>Present ({totalOnPremises})</h3>
          <div className="attendance-list">
            {loading ? (
              <div className="loading-state">
                <Spinner animation="border" size="sm" />
              </div>
            ) : inUsers.length === 0 ? (
              <div className="empty-state">No users present</div>
            ) : (
              inUsers.map((user) => (
                <AttendanceUserListItem key={user.userUniqueId} user={user} status="on-premises" />
              ))
            )}
          </div>
        </div>

        <div className="attendance-list-section">
          <h3>On Break ({totalOnBreak})</h3>
          <div className="attendance-list">
            {loading ? (
              <div className="loading-state">
                <Spinner animation="border" size="sm" />
              </div>
            ) : breakUsers.length === 0 ? (
              <div className="empty-state">No users on break</div>
            ) : (
              breakUsers.map((user) => (
                <AttendanceUserListItem key={user.userUniqueId} user={user} status="on-break" />
              ))
            )}
          </div>
        </div>

        <div className="attendance-list-section">
          <h3>Not Arrived ({totalNotArrived})</h3>
          <div className="attendance-list">
            {loading ? (
              <div className="loading-state">
                <Spinner animation="border" size="sm" />
              </div>
            ) : availableUsers.length === 0 ? (
              <div className="empty-state">No users not arrived</div>
            ) : (
              availableUsers.map((user) => (
                <AttendanceUserListItem key={user.userUniqueId} user={user} status="not-arrived" />
              ))
            )}
          </div>
        </div>

        <div className="attendance-list-section">
          <h3>Out ({totalLeft})</h3>
          <div className="attendance-list">
            {loading ? (
              <div className="loading-state">
                <Spinner animation="border" size="sm" />
              </div>
            ) : outUsers.length === 0 ? (
              <div className="empty-state">No users out</div>
            ) : (
              outUsers.map((user) => (
                <AttendanceUserListItem key={user.userUniqueId} user={user} status="left" />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const getUserStatusTone = (user: PunchBoardUser): "in" | "out" | "available" => {
  if (user.isPunchedInOnly === 1) {
    return "in";
  }

  if (user.isCompletedPunch === 1) {
    return "out";
  }

  return "available";
};

const UserList: React.FC<{
  title: string;
  users: PunchBoardUser[];
  tone: "in" | "out";
  onSelectUser?: (user: PunchBoardUser) => void;
}> = ({ title, users, tone, onSelectUser }) => {
  const isSelectable = tone === "in" && !!onSelectUser;

  return (
    <section className={`punch-board-list ${tone}`}>
      <div className="punch-board-list-header">
        <div>
          <h3>{title}</h3>
          <span>{users.length} users</span>
        </div>
      </div>

      <div className="punch-user-list">
        {users.length === 0 && (
          <div className="punch-empty-state">No users to show</div>
        )}

        {users.map((user) => (
          <article
            className={`punch-user-row ${getUserStatusTone(user)}${isSelectable ? " selectable" : ""}`}
            key={`${tone}-${user.userUniqueId || user.userName}`}
            role={isSelectable ? "button" : undefined}
            tabIndex={isSelectable ? 0 : undefined}
            onClick={isSelectable ? () => onSelectUser?.(user) : undefined}
            onKeyDown={
              isSelectable
                ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectUser?.(user);
                  }
                }
                : undefined
            }
          >
            <div></div>
            <div className="punch-user-main">
              <strong>{getDisplayName(user)}</strong>
              {tone === "in" && user.todayPunchIn && (
                <div className="punch-timer green-timer">
                  {formatPunchTime(user.todayPunchIn)} In
                </div>
              )}
              {tone === "out" && user.todayPunchOut && (
                <div className="punch-timer red-timer">
                  {formatPunchTime(user.todayPunchOut)} Out
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export const PunchInOut: React.FC = () => {
  // Board data state
  const [inUsers, setInUsers] = React.useState<PunchBoardUser[]>([]);
  const [breakUsers, setBreakUsers] = React.useState<PunchBoardUser[]>([]);
  const [outUsers, setOutUsers] = React.useState<PunchBoardUser[]>([]);
  const [availableUsers, setAvailableUsers] = React.useState<PunchBoardUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [clockNow, setClockNow] = React.useState(() => new Date());

  // Camera state
  const [mainStream, setMainStream] = React.useState<MediaStream | null>(null);
  const [cameraLoading, setCameraLoading] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [captureLoading, setCaptureLoading] = React.useState(false);
  const mainVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const captureInFlightRef = React.useRef(false);
  const capturedImageBlobRef = React.useRef<Blob | null>(null);

  const [boardMembers, setBoardMembers] = React.useState<PunchBoardUser[]>([]);
  const [entryMode, setEntryMode] = React.useState<PunchEntryMode>("code");
  const [punchStage, setPunchStage] = React.useState<PunchStage>("select");
  const [selectedEmployee, setSelectedEmployee] = React.useState<PunchBoardUser | null>(null);
  const [employeeCodeEntry, setEmployeeCodeEntry] = React.useState("");
  const [employeeSearchQuery, setEmployeeSearchQuery] = React.useState("");
  const [passwordEntry, setPasswordEntry] = React.useState("");
  const [passwordVisible, setPasswordVisible] = React.useState(false);
  const [adminUnlockVisible, setAdminUnlockVisible] = React.useState(false);
  const [adminUnlockPassword, setAdminUnlockPassword] = React.useState("");
  const [adminUnlockLoading, setAdminUnlockLoading] = React.useState(false);
  const [adminModeUnlocked, setAdminModeUnlocked] = React.useState(
    () => localStorage.getItem(PUNCH_ADMIN_UNLOCK_KEY) === "true"
  );

  // Auth
  const getPunchStorage = (): any => {
    try {
      const stored = localStorage.getItem(PUNCH_STORAGE_KEY);
      if (stored) {
        const parsedStored = JSON.parse(stored);
        if (!isPunchSessionExpired(parsedStored)) {
          return parsedStored;
        }

        clearPunchSession();
      }
      const rawCookie = getCookie(PUNCH_SESSION_COOKIE);
      if (!rawCookie) {
        return {};
      }
      const session = JSON.parse(rawCookie);
      if (!session?.userName || !session?.token || isPunchSessionExpired(session)) {
        clearPunchSession();
        return {};
      }
      const punchStorage = {
        ...normalizePunchStorage(session),
      };
      localStorage.setItem(PUNCH_STORAGE_KEY, JSON.stringify(punchStorage));
      localStorage.setItem(PUNCH_TOKEN_KEY, session.token);
      return punchStorage;
    } catch {
      return {};
    }
  };

  const getPunchToken = (): string => {
    const existingToken = localStorage.getItem(PUNCH_TOKEN_KEY);
    if (existingToken) {
      try {
        const stored = localStorage.getItem(PUNCH_STORAGE_KEY);
        if (stored) {
          const parsedStored = JSON.parse(stored);
          if (!isPunchSessionExpired(parsedStored)) {
            return existingToken;
          }
        }
        clearPunchSession();
      } catch {
        clearPunchSession();
      }
    }
    try {
      const rawCookie = getCookie(PUNCH_SESSION_COOKIE);
      if (!rawCookie) {
        return "";
      }
      const session = JSON.parse(rawCookie);
      if (!session?.token || isPunchSessionExpired(session)) {
        clearPunchSession();
        return "";
      }
      localStorage.setItem(PUNCH_TOKEN_KEY, session.token);
      return session.token;
    } catch {
      return "";
    }
  };

  const punchStorage = React.useMemo(() => getPunchStorage(), []);
  const punchToken = React.useMemo(() => getPunchToken(), []);
  const isPunchAuthorized = !!punchStorage?.userName && !!punchStorage?.user_UniqueID && !!punchToken;
  const isAdminPunch = isAdminRole(Number(punchStorage?.rolId), punchStorage?.role);
  const showAttendancePanel = isAdminPunch && adminModeUnlocked;
  const punchDisplayName = punchStorage?.companyName || punchStorage?.name || punchStorage?.userName || "Main Entrance";
  const punchTimeZone = punchStorage?.timeZone || punchStorage?.currentUtcTime || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const punchAdminUserName =
    punchStorage?.userName || JSON.parse(localStorage.getItem("storage") || "{}")?.userName || "";

  const handlePunchLogout = () => {
    localStorage.removeItem(PUNCH_STORAGE_KEY);
    localStorage.removeItem(PUNCH_TOKEN_KEY);
    localStorage.removeItem(PUNCH_ADMIN_UNLOCK_KEY);
    AuthService.clearSession();
    window.location.href = "/login";
  };

  const closeAdminUnlockModal = React.useCallback(() => {
    setAdminUnlockVisible(false);
    setAdminUnlockPassword("");
  }, []);

  const lockAdminMode = React.useCallback(() => {
    localStorage.removeItem(PUNCH_ADMIN_UNLOCK_KEY);
    setAdminModeUnlocked(false);
    setAdminUnlockPassword("");
    setAdminUnlockVisible(false);
    toast.success("Admin mode locked.");
  }, []);

  const handleAdminUnlock = React.useCallback(async () => {
    if (!punchAdminUserName) {
      toast.error("Unable to find the admin username.");
      return;
    }

    if (!adminUnlockPassword.trim()) {
      toast.error("Please enter the admin password.");
      return;
    }

    setAdminUnlockLoading(true);
    try {
      const response = await apiLogin(punchAdminUserName, adminUnlockPassword);
      if (response?.user && isAdminRole(response.user.roleId, response.user.roleName)) {
        localStorage.setItem(PUNCH_ADMIN_UNLOCK_KEY, "true");
        setAdminModeUnlocked(true);
        toast.success("Admin mode unlocked.");
        closeAdminUnlockModal();
        return;
      }

      toast.error("Authentication failed. Please verify your credentials and try again.");
    } catch (err: any) {
      console.error("Admin unlock error:", err);
      toast.error(err?.response?.data?.message || err?.message || "Unable to unlock admin mode.");
    } finally {
      setAdminUnlockLoading(false);
    }
  }, [adminUnlockPassword, closeAdminUnlockModal, punchAdminUserName]);

  const stopStream = React.useCallback(() => {
    const stream = mainStream;
    const videoRef = mainVideoRef;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }

    stream?.getTracks().forEach((track) => track.stop());
    setMainStream(null);
  }, [mainStream]);

  const startCamera = React.useCallback(
    async (): Promise<MediaStream | null> => {
      const stream = mainStream;

      if (stream) {
        return stream;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access is not supported in this browser.");
        return null;
      }

      setCameraLoading(true);
      setCameraError(null);
      try {
        capturedImageBlobRef.current = null;
        stopStream();
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        setMainStream(mediaStream);
        return mediaStream;
      } catch (err) {
        console.error("Camera error:", err);
        setCameraError("Unable to start the camera. Please allow permission and try again.");
        toast.error("Unable to start the camera.");
        return null;
      } finally {
        setCameraLoading(false);
      }
    },
    [mainStream, stopStream]
  );

  // Load profile pictures
  const loadProfilePictures = React.useCallback(async (users: PunchBoardUser[]) => {
    const updatedUsers = Array.from(new Map(users.map((user) => [user.userUniqueId, user])).values());
    // const updatedUsers = await Promise.all(
    //   users.map(async (user) => {
    //     try {
    //       const profilePicBlob = await PunchInOutService.GetProfilePic({
    //         userId: user.userUniqueId,
    //         tenantId: user.tenantID,
    //       });
    //       if (profilePicBlob) {
    //         const profilePicUrl = URL.createObjectURL(profilePicBlob);
    //         return { ...user, profilePicUrl };
    //       }
    //     } catch (error) {
    //       console.warn(`Failed to load profile picture for user ${user.userUniqueId}:`, error);
    //     }
    //     return user;
    //   })
    // );

    const inUsersWithPics = updatedUsers.filter((u) => Number(u.isPunchedInOnly) === 1);
    const breakUsersWithPics = updatedUsers.filter((u) => Number(u.isOnBreak) === 1);
    const outUsersWithPics = updatedUsers.filter((u) => Number(u.isCompletedPunch) === 1);
    const availableUsersWithPics = updatedUsers.filter((u) => Number(u.isNotPunched) === 1);

    setInUsers(inUsersWithPics);
    setBreakUsers(breakUsersWithPics);
    setOutUsers(outUsersWithPics);
    setAvailableUsers(availableUsersWithPics);
    setBoardMembers(updatedUsers);
  }, []);

  // Load punch board
  const loadBoard = React.useCallback(() => {
    setLoading(true);
    PunchInOutService.GetPunchBoard()
      .then((board) => {
        const allUsersList = [
          ...(board.inUsers || []),
          ...(board.breakUsers || []),
          ...(board.outUsers || []),
          ...(board.availableUsers || []),
        ];
        loadProfilePictures(allUsersList);
      })
      .catch((err) => {
        console.error(`Server Error loading board:`, err);
      })
      .finally(() => setLoading(false));
  }, [loadProfilePictures]);

  // Wait for video to be ready
  const waitForVideoReady = async (video: HTMLVideoElement): Promise<boolean> => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      return true;
    }
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(video.videoWidth > 0 && video.videoHeight > 0);
      }, 2500); // 25 seconds timeout

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        video.removeEventListener("loadedmetadata", handleReady);
        video.removeEventListener("canplay", handleReady);
      };

      const handleReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(true);
      };

      video.addEventListener("loadedmetadata", handleReady, { once: true });
      video.addEventListener("canplay", handleReady, { once: true });
    });
  };

  // Capture current frame
  const captureCurrentFrameBlob = async (): Promise<Blob | null> => {
    const mediaStream = mainStream;
    const videoRef = mainVideoRef;
    const canvas = canvasRef;
    const activeStream = mediaStream || (await startCamera());
    if (!activeStream) {
      return null;
    }

    const video = videoRef.current;
    const canvasElement = canvas.current;

    if (!video || !canvasElement) {
      return null;
    }

    const videoReady = await waitForVideoReady(video);
    if (!videoReady) {
      return null;
    }

    canvasElement.width = video.videoWidth || 640;
    canvasElement.height = video.videoHeight || 480;
    const context = canvasElement.getContext("2d");
    context?.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);

    return new Promise<Blob | null>((resolve) => {
      canvasElement.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });
  };

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setClockNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    const video = mainVideoRef.current;
    if (!video || !mainStream) {
      return;
    }

    video.srcObject = mainStream;
    void video.play().catch(() => {
      // Autoplay can wait for the existing camera-step user gesture.
    });
  }, [mainStream]);

  React.useEffect(() => {
    if (punchStage !== "camera") {
      stopStream();
      return;
    }

    startCamera();

    return () => stopStream();
  }, [punchStage]);


  // Initial board load
  React.useEffect(() => {
    if (!isPunchAuthorized) return;
    loadBoard();
  }, [isPunchAuthorized, loadBoard]);

  // Filter employees by search
  const filteredEmployees = React.useMemo(() => {
    if (!employeeSearchQuery.trim()) {
      return [...boardMembers].sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
    }
    const query = employeeSearchQuery.toLowerCase();
    return [...boardMembers].filter((emp) => {
      const firstName = (emp.firstName || "").toLowerCase();
      const lastName = (emp.lastName || "").toLowerCase();
      const userName = (emp.userName || "").toLowerCase();
      const empCode = (emp.empCode || "").toLowerCase();
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      return firstName.includes(query) || lastName.includes(query) || fullName.includes(query) || userName.includes(query) || empCode.includes(query);
    }).sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));
  }, [boardMembers, employeeSearchQuery]);

  const determinePunchDirection = React.useCallback((employee: PunchBoardUser): PunchDirection => {
    return resolveNextPunchDirection(employee);
  }, []);

  const formatPunchSuccess = React.useCallback((employee: PunchBoardUser, message?: string, direction?: string) => {
    const label = getPunchDirectionLabel(direction || resolveNextPunchDirection(employee));
    return message || `${label} successful for ${getDisplayName(employee)}.`;
  }, []);

  const findEmployeeByCode = React.useCallback((value: string) => {
    const normalizedInput = normalizeEmployeeCode(value);

    if (!normalizedInput) {
      return null;
    }

    return boardMembers.find((employee) => {
      const normalizedCode = normalizeEmployeeCode(employee.empCode);
      return normalizedCode === normalizedInput || normalizedCode.replace(/^E/, "") === normalizedInput.replace(/^E/, "");
    }) || null;
  }, [boardMembers]);

  const handleModeChange = (mode: PunchEntryMode) => {
    setEntryMode(mode);
    setEmployeeSearchQuery("");
    setEmployeeCodeEntry("");
    setSelectedEmployee(null);
    setPasswordEntry("");
    setPasswordVisible(false);
  };

  const handleContinueSelection = () => {
    if (entryMode === "code") {
      const employee = findEmployeeByCode(employeeCodeEntry);
      if (!employee) {
        toast.error("No employee found for that ID.");
        return;
      }
      setSelectedEmployee(employee);
      setPunchStage("camera");
      return;
    }

    if (!selectedEmployee) {
      toast.error("Please select an employee from the list.");
      return;
    }

    setPunchStage("camera");
  };

  const verifyPasswordPunch = React.useCallback(async (): Promise<{
    success: boolean;
    message?: string;
    direction?: string;
  }> => {
    if (!selectedEmployee) {
      toast.error("Please select an employee first.");
      return { success: false };
    }

    if (!passwordEntry.trim()) {
      toast.error("Please enter your password.");
      return { success: false };
    }

    setCaptureLoading(true);
    try {
      const result = await PunchInOutService.PunchByPassword(
        determinePunchDirection(selectedEmployee),
        passwordEntry,
        selectedEmployee.userName,
        selectedEmployee.userUniqueId
      );

      if (result?.success) {
        return {
          success: true,
          message: result.message,
          direction: result.direction,
        };
      }

      toast.error(result?.message || "Password verification failed.");
      return { success: false };
    } catch (err: any) {
      console.error("Password verification error:", err);
      toast.error(`Password verification failed: ${err}`);
      return { success: false };
    } finally {
      setCaptureLoading(false);
    }
  }, [determinePunchDirection, passwordEntry, selectedEmployee]);

  const resetSelection = React.useCallback(() => {
    setSelectedEmployee(null);
    setEmployeeCodeEntry("");
    setEmployeeSearchQuery("");
    setPasswordEntry("");
    setPasswordVisible(false);
    setPunchStage("select");
  }, []);

  const captureAndPunch = React.useCallback(async (): Promise<{
    success: boolean;
    message?: string;
    direction?: string;
  }> => {
    if (!selectedEmployee || captureLoading || captureInFlightRef.current) {
      return { success: false, message: "Capture already in progress." };
    }

    captureInFlightRef.current = true;
    setCaptureLoading(true);

    try {
      const imageBlob = await captureCurrentFrameBlob();
      if (!imageBlob) {
        return { success: false, message: "Unable to capture the current frame." };
      }

      const result = await PunchInOutService.PunchByCapturedImage(
        imageBlob,
        selectedEmployee.userUniqueId,
        undefined,
        determinePunchDirection(selectedEmployee));

      const normalizedConfidence = getNormalizedConfidence(result);

      if (result?.success && (normalizedConfidence === undefined || isFaceMatchValid(normalizedConfidence))) {
        capturedImageBlobRef.current = null;
        return { success: true, message: result?.message, direction: result?.direction };
      }

      // Clear cached frame so the next attempt captures a fresh image
      capturedImageBlobRef.current = null;
      return { success: false, message: result?.message || "No matching user was identified." };
    } catch (err) {
      console.error("Punch capture error:", err);
      capturedImageBlobRef.current = null;
      return { success: false, message: "Unable to process face punch." };
    } finally {
      captureInFlightRef.current = false;
      setCaptureLoading(false);
    }
  }, [captureCurrentFrameBlob, captureLoading, determinePunchDirection, selectedEmployee]);

  const handleCameraSubmit = React.useCallback(async () => {
    if (!selectedEmployee || captureLoading || captureInFlightRef.current) {
      return;
    }

    const isNewEmployee = selectedEmployee.isProfile === false;
    const hasPassword = passwordEntry.trim().length > 0;

    if (!FACE_PUNCH_ENABLED) {
      if (!hasPassword) {
        toast.error("Enter your password to punch. Face punch is not enabled yet.");
        return;
      }
      const passwordResult = await verifyPasswordPunch();
      if (passwordResult.success) {
        toast.success(formatPunchSuccess(selectedEmployee, passwordResult.message, passwordResult.direction));
        resetSelection();
        setTimeout(() => loadBoard(), 500);
      }
      return;
    }

    if (isNewEmployee) {
      if (!hasPassword) {
        toast.error("This employee is not enrolled. Enter a password, or add a face photo in Employee Master.");
        return;
      }

      const passwordResult = await verifyPasswordPunch();
      if (passwordResult.success) {
        toast.success(formatPunchSuccess(selectedEmployee, passwordResult.message, passwordResult.direction));
        resetSelection();
        setTimeout(() => loadBoard(), 500);
      }
      return;
    }

    if (hasPassword) {
      const passwordResult = await verifyPasswordPunch();
      if (passwordResult.success) {
        toast.success(formatPunchSuccess(selectedEmployee, passwordResult.message, passwordResult.direction));
        resetSelection();
        setTimeout(() => loadBoard(), 500);
      }
      return;
    }

    const captureResult = await captureAndPunch();
    if (captureResult.success) {
      toast.success(formatPunchSuccess(selectedEmployee, captureResult.message, captureResult.direction));
      resetSelection();
      setTimeout(() => loadBoard(), 500);
      return;
    }

    toast.error(captureResult.message || "Unable to process face punch.");
  }, [
    captureAndPunch,
    captureLoading,
    formatPunchSuccess,
    loadBoard,
    passwordEntry,
    resetSelection,
    selectedEmployee,
    verifyPasswordPunch,
  ]);

  if (!isPunchAuthorized) {
    return <Navigate to="/login" replace />;
  }

  // const { time, date } = getReadableDateTime(clockNow);
  const { time, date } = getTimezoneDateTime(clockNow, punchTimeZone);
  return (
    <div className="punch-app">
      <header className="punch-topbar">
        <div className="punch-brand-block">
          <div className="punch-brand-mark">Cimmple</div>
          <div>
            <div className="punch-brand-title-row">
              <h1>Time Clock</h1>
              {isAdminPunch && adminModeUnlocked && (
                <span className="punch-admin-mode-pill">ADMIN MODE</span>
              )}
            </div>
            <p>Cimmple ERP - {punchDisplayName}</p>
          </div>
        </div>
        <div className="punch-topbar-actions">
          <div className="punch-clock-block">
            <div className="punch-clock-text">
              <strong>{time}</strong>
              <span>{date}</span>
            </div>
          </div>
          {isAdminPunch && (
            adminModeUnlocked ? (
              <div className="punch-admin-mode-actions">
                <button
                  type="button"
                  className="punch-admin-lock-btn"
                  onClick={lockAdminMode}
                  aria-label="Lock admin mode"
                  title="Lock admin mode"
                >
                  <span>Lock</span>
                  <FaLock />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="punch-admin-unlock-btn"
                onClick={() => setAdminUnlockVisible(true)}
                aria-label="Open admin unlock dialog"
              >
                <FaUnlock />
                <span>Admin Unlock</span>
              </button>
            )
          )}
          <button type="button" className="punch-logout-btn" onClick={handlePunchLogout} aria-label="Logout">
            <FaRightFromBracket />
            <span>Logout</span>
          </button>
        </div>
      </header>

      <div className={`punch-main-layout ${showAttendancePanel ? "" : "single-panel"}`.trim()}>
        <PunchWorkflowPanel
          stage={punchStage}
          entryMode={entryMode}
          boardMembers={boardMembers}
          filteredEmployees={filteredEmployees}
          selectedEmployee={selectedEmployee}
          employeeCodeEntry={employeeCodeEntry}
          employeeSearchQuery={employeeSearchQuery}
          passwordEntry={passwordEntry}
          passwordVisible={passwordVisible}
          stream={mainStream}
          videoRef={mainVideoRef}
          cameraLoading={cameraLoading}
          cameraError={cameraError}
          captureLoading={captureLoading}
          passwordLoading={captureLoading}
          onModeChange={handleModeChange}
          onEmployeeCodeChange={setEmployeeCodeEntry}
          onEmployeeSearchChange={setEmployeeSearchQuery}
          onEmployeeSelect={setSelectedEmployee}
          onPasswordChange={setPasswordEntry}
          onPasswordToggle={() => setPasswordVisible((prev) => !prev)}
          onContinue={handleContinueSelection}
          onBackToSelection={() => {
            resetSelection();
            setCameraError(null);
          }}
          onSubmit={handleCameraSubmit}
        />

        {showAttendancePanel && (
          <AttendanceSummaryPanel
            inUsers={inUsers}
            breakUsers={breakUsers}
            outUsers={outUsers}
            availableUsers={availableUsers}
            loading={loading}
          />
        )}
      </div>

      {adminUnlockVisible && isAdminPunch && !adminModeUnlocked && (
        <div className="admin-unlock-overlay" role="presentation" onClick={closeAdminUnlockModal}>
          <div className="admin-unlock-modal" role="dialog" aria-modal="true" aria-labelledby="admin-unlock-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="admin-unlock-close" onClick={closeAdminUnlockModal} aria-label="Close admin unlock dialog">
              ×
            </button>
            <h2 id="admin-unlock-title">Admin Unlock</h2>
            <p>Enter admin PIN to enable the attendance sidebar and admin tools.</p>

            <label className="admin-unlock-label" htmlFor="admin-unlock-password">
              PIN
            </label>
            <input
              id="admin-unlock-password"
              type="password"
              className="admin-unlock-input"
              value={adminUnlockPassword}
              onChange={(event) => setAdminUnlockPassword(event.target.value)}
              placeholder="Enter admin PIN"
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdminUnlock();
                }
              }}
            />

            <button
              type="button"
              className="admin-unlock-submit"
              onClick={handleAdminUnlock}
              disabled={adminUnlockLoading}
            >
              {adminUnlockLoading ? "Unlocking..." : "Unlock Admin Mode"}
            </button>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="d-none" />
    </div>
  );
};

export default PunchInOut;
