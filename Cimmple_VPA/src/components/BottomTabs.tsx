import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { IconHome, IconLogout } from "./Icons";

export function BottomTabs() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-[68px] max-w-[600px] items-stretch">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-bold transition-colors ${
              isActive
                ? "text-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
            }`
          }
        >
          <IconHome size={22} />
          <span>Home</span>
        </NavLink>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex min-h-tap flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-bold text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
        >
          <IconLogout size={22} />
          <span>Logout</span>
        </button>
      </div>
    </nav>
  );
}
