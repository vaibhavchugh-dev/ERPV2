import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { AuthService } from "../services/authService";
import api from "../services/apiClient";

interface EmployeeDetail {
  firstName: string;
  lastName: string;
  email: string;
  userName: string;
  status: string;
  roleName: string;
  employeeType: string;
  empCode: string;
  phone1: string;
  date_of_hire: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  locationName?: string;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-sm font-semibold text-slate-500 shrink-0 dark:text-slate-300">{label}</span>
      <span className="text-sm font-bold text-slate-900 text-right dark:text-white">{value}</span>
    </div>
  );
}

export function ProfilePage() {
  const { userName, logout } = useAuth();
  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [empLoading, setEmpLoading] = useState(true);

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);

  const name = userName || "Operator";
  const initials = getInitials(name);

  useEffect(() => {
    const storage = AuthService.getStorage();
    if (!storage) { setEmpLoading(false); return; }
    const { userId, tenantID } = storage;
    if (!userId || !tenantID) { setEmpLoading(false); return; }

    api
      .get<{ result?: EmployeeDetail; firstName?: string }>(`/Employee/GetEmployeeById`, {
        params: { employeeId: userId, tenantId: tenantID },
      })
      .then((res) => {
        const data = res.data?.result ?? (res.data as unknown as EmployeeDetail);
        setEmployee(data ?? null);
      })
      .catch(() => { /* silently ignore — session data is still shown */ })
      .finally(() => setEmpLoading(false));
  }, []);

  const storage = AuthService.getStorage();
  const fullName = employee
    ? [employee.firstName, employee.lastName].filter(Boolean).join(" ") || name
    : name;
  const hireDate = employee?.date_of_hire
    ? (() => {
        try {
          const d = new Date(employee.date_of_hire);
          return Number.isNaN(d.getTime()) ? employee.date_of_hire : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
        } catch { return employee.date_of_hire; }
      })()
    : null;
  const addressLine = [employee?.address, employee?.city, employee?.state, employee?.zip]
    .filter(Boolean)
    .join(", ") || null;

  return (
    <div>
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={() => window.dispatchEvent(new CustomEvent("open-drawer"))}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </button>
          <h1 className="text-[1.3rem] font-extrabold tracking-tight text-slate-900 dark:text-white">My Profile</h1>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white dark:bg-white dark:text-slate-900">
          {initials}
        </div>
      </header>

      {/* Avatar card */}
      <div className="card mb-5 flex flex-col items-center p-8">
        <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-slate-900 text-3xl font-bold text-white dark:bg-white dark:text-slate-900">
          {initials}
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{fullName}</h2>
        {storage?.role && (
          <span className="mt-1 rounded-full bg-blue-50 px-3 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            {storage.role}
          </span>
        )}
        <p className="text-sm font-medium text-emerald-600 mt-2 flex items-center gap-1.5 dark:text-emerald-400">
          <span className="block h-2 w-2 rounded-full bg-emerald-500" />
          Online
        </p>
      </div>

      {/* Employee Information */}
      <div className="mb-5">
        <h3 className="mb-3 text-[0.75rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
          Employee Information
        </h3>
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-700">
          {empLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between animate-pulse">
                  <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                  <div className="h-3 w-32 rounded bg-slate-100 dark:bg-slate-700/70" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <InfoRow label="Full Name" value={fullName} />
              <InfoRow label="Username" value={storage?.userLogin} />
              <InfoRow label="Email" value={employee?.email || storage?.email} />
              <InfoRow label="Employee Code" value={employee?.empCode} />
              <InfoRow label="Employee Type" value={employee?.employeeType} />
              <InfoRow label="Phone" value={employee?.phone1} />
              <InfoRow label="Date of Hire" value={hireDate} />
              <InfoRow label="Address" value={addressLine} />
              <InfoRow label="Status" value={employee?.status} />
            </>
          )}
        </div>
      </div>

      {/* Account Operations */}
      <div className="mb-8">
        <h3 className="mb-3 text-[0.75rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
          Account Operations
        </h3>
        <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-700">
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-4 bg-white p-4 text-left hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700/60"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-200">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M16 17l5-5-5-5M21 12H9M9 3H4a1 1 0 00-1 1v16a1 1 0 001 1h5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white">Logout</div>
              <div className="text-sm text-slate-500 dark:text-slate-300">Sign out of this device</div>
            </div>
          </button>
        </div>
      </div>

      {/* App Information */}
      <div className="mb-6">
        <h3 className="mb-3 text-[0.75rem] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-300">
          App Information
        </h3>
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="font-bold text-slate-900 dark:text-white">App Version</span>
            </div>
            <span className="text-sm font-semibold text-slate-500 dark:text-slate-300">v2.4.1</span>
          </div>
        </div>
      </div>
    </div>
  );
}
