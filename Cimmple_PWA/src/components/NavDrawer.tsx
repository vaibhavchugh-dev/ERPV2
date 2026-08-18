import { NavLink } from "react-router-dom";
import { DRAWER_LINKS } from "../nav";
import { useTheme } from "../theme/ThemeContext";

function DrawerIcon({ label }: { label: string }) {
  switch (label) {
    case "Dashboard":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "Jobs":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
        </svg>
      );
    case "Quality":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "Profile":
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    default:
      return null;
  }
}

interface NavDrawerProps {
  open: boolean;
  userName: string;
  onClose: () => void;
  onLogout: () => void;
}

export function NavDrawer({ open, userName, onClose, onLogout }: NavDrawerProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={`absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close menu"
        onClick={onClose}
      />

      <aside
        className={`absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-slate-900 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <div className="flex items-center justify-between px-5 pt-[calc(1.25rem+env(safe-area-inset-top,0px))] pb-3">
          <div>
            <div className="font-extrabold text-slate-900 text-base leading-tight dark:text-white">Cimmple Shop Floor</div>
            <div className="text-xs font-medium text-slate-500 mt-0.5 truncate max-w-[200px] dark:text-slate-300">
              {userName || "Operator"}
            </div>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <hr className="border-slate-100 mb-2 dark:border-slate-700" />

        <nav className="flex-1 space-y-1.5 px-3 py-2" aria-label="Main">
          {DRAWER_LINKS.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-tap items-center gap-3.5 rounded-2xl px-4 text-sm font-bold transition-all ${
                  isActive
                    ? "bg-[#eff4ff] text-[#1e3a8a] dark:bg-slate-800 dark:text-blue-300"
                    : "text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                }`
              }
            >
              <DrawerIcon label={item.label} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleTheme();
            }}
            className="flex min-h-tap w-full items-center justify-between rounded-2xl px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-pressed={theme === "dark"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            <span className="flex items-center gap-3.5">
              {theme === "dark" ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              )}
              Appearance
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[0.7rem] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {theme === "dark" ? "Dark" : "Light"}
              </span>
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  theme === "dark" ? "bg-blue-600" : "bg-slate-300"
                }`}
                aria-hidden
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    theme === "dark" ? "left-5" : "left-0.5"
                  }`}
                />
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex min-h-tap w-full items-center gap-3.5 rounded-2xl px-4 text-sm font-bold text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 17l5-5-5-5M21 12H9M9 3H4a1 1 0 00-1 1v16a1 1 0 001 1h5" />
            </svg>
            Logout
          </button>
          <div className="flex items-center gap-3 rounded-2xl bg-[#f8fafc] p-3 border border-slate-100 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#090d16] text-white font-black text-sm shrink-0">
              c
            </div>
            <div className="min-w-0">
              <div className="truncate font-extrabold text-slate-900 text-xs leading-tight dark:text-white">Cimmple Shop Floor</div>
              <div className="truncate text-[0.65rem] font-medium text-slate-500 mt-0.5 dark:text-slate-300">v2.4.1</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
