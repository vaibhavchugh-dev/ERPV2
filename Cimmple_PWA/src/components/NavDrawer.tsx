import { NavLink } from "react-router-dom";
import { PRIMARY_NAV } from "../nav";

interface NavDrawerProps {
  open: boolean;
  userName: string;
  onClose: () => void;
  onLogout: () => void;
}

export function NavDrawer({ open, onClose }: NavDrawerProps) {
  const getIcon = (label: string) => {
    switch (label) {
      case "Dashboard":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
          </svg>
        );
      case "Jobs":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
          </svg>
        );
      case "Job Tracker":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        );
      case "Quality":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        );
      case "NCR":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3" />
          </svg>
        );
      case "Profile":
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
      default:
        return null;
    }
  };

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
        className={`absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <div className="font-extrabold text-slate-900 text-base leading-tight">Cimmple Shop Floor</div>
            <div className="text-xs font-medium text-slate-400 mt-0.5">Navigation</div>
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <hr className="border-slate-100 mb-2" />

        <nav className="flex-1 space-y-1.5 px-3 py-2" aria-label="Drawer">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-12 items-center gap-3.5 rounded-2xl px-4 text-sm font-bold transition-all ${
                  isActive
                    ? "bg-[#eff4ff] text-[#1e3a8a]"
                    : "text-slate-800 hover:bg-slate-50"
                }`
              }
            >
              {getIcon(item.label)}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <hr className="border-slate-100 my-2" />

        <div className="p-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 rounded-2xl bg-[#f8fafc] p-3 border border-slate-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#090d16] text-white font-black text-sm shrink-0">
              c
            </div>
            <div className="min-w-0">
              <div className="truncate font-extrabold text-slate-900 text-xs leading-tight">Cimmple Shop Floor</div>
              <div className="truncate text-[0.65rem] font-medium text-slate-400 mt-0.5">Industrial ERP workspace</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

