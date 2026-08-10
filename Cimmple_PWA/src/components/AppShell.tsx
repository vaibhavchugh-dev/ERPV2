import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { PRIMARY_NAV } from "../nav";
import { NavDrawer } from "./NavDrawer";

export function AppShell() {
  const { userName, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="grid min-h-dvh grid-rows-[64px_1fr_68px]">
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-slate-200 bg-white px-3 shadow-sm">
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <span className="sr-only">Menu</span>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/logo.svg"
            alt="Cimmple"
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-tight text-slate-900">
              Cimmple Shop Floor
            </div>
            <div className="truncate text-xs text-slate-500">{userName || "Operator"}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[540px] overflow-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>

      <nav
        className="sticky bottom-0 z-40 grid grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        aria-label="Primary"
      >
        {PRIMARY_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `inline-flex min-h-tap items-center justify-center rounded-xl text-sm font-bold transition ${
                isActive
                  ? "border border-blue-200 bg-accent-soft text-accent"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <NavDrawer
        open={drawerOpen}
        userName={userName}
        onClose={() => setDrawerOpen(false)}
        onLogout={() => void handleLogout()}
      />
    </div>
  );
}
