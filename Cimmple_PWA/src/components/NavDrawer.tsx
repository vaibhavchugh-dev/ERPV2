import { NavLink } from "react-router-dom";
import { PRIMARY_NAV } from "../nav";

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
        className={`absolute inset-0 bg-slate-900/40 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        aria-label="Close menu"
        onClick={onClose}
      />

      <aside
        className={`absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-white shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4">
          <img src="/logo.svg" alt="" width={40} height={40} className="h-10 w-10 object-contain" />
          <div className="min-w-0">
            <div className="truncate font-bold text-slate-900">Cimmple Shop Floor</div>
            <div className="truncate text-sm text-slate-500">{userName || "Operator"}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Drawer">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex min-h-tap items-center rounded-xl px-4 text-base font-semibold transition ${
                  isActive
                    ? "bg-accent-soft text-accent"
                    : "text-slate-700 hover:bg-slate-50"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="btn btn-ghost w-full"
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            Logout
          </button>
        </div>
      </aside>
    </div>
  );
}
