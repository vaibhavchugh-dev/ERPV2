import { NavLink } from "react-router-dom";
import { DRAWER_LINKS } from "../nav";

interface NavDrawerProps {
  open: boolean;
  userName: string;
  onClose: () => void;
  onLogout: () => void;
}

export function NavDrawer({ open, userName, onClose, onLogout }: NavDrawerProps) {
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
        aria-label="Menu"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <div className="font-extrabold text-slate-900 text-base leading-tight">Cimmple Shop Floor</div>
            <div className="text-xs font-medium text-slate-400 mt-0.5 truncate max-w-[200px]">
              {userName || "Operator"}
            </div>
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <hr className="border-slate-100 mb-2" />

        <nav className="flex-1 space-y-1.5 px-3 py-2" aria-label="Secondary">
          {DRAWER_LINKS.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-tap items-center gap-3.5 rounded-2xl px-4 text-sm font-bold transition-all ${
                  isActive
                    ? "bg-[#eff4ff] text-[#1e3a8a]"
                    : "text-slate-800 hover:bg-slate-50"
                }`
              }
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
              </svg>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="flex min-h-tap w-full items-center gap-3.5 rounded-2xl px-4 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 17l5-5-5-5M21 12H9M9 3H4a1 1 0 00-1 1v16a1 1 0 001 1h5" />
            </svg>
            Logout
          </button>
          <div className="flex items-center gap-3 rounded-2xl bg-[#f8fafc] p-3 border border-slate-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#090d16] text-white font-black text-sm shrink-0">
              c
            </div>
            <div className="min-w-0">
              <div className="truncate font-extrabold text-slate-900 text-xs leading-tight">Cimmple Shop Floor</div>
              <div className="truncate text-[0.65rem] font-medium text-slate-400 mt-0.5">v2.4.1</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
