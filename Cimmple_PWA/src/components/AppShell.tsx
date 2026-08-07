import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AppShell() {
  const { userName, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <img
            className="brand-logo"
            src="/logo.svg"
            alt="Cimmple"
            width={36}
            height={36}
          />
          <div>
            <div className="brand-name">Cimmple Shop Floor</div>
            <div className="brand-user">{userName || "Operator"}</div>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="app-nav" aria-label="Primary">
        <NavLink to="/jobs" className={({ isActive }) => (isActive ? "active" : "")}>
          Jobs
        </NavLink>
        <button type="button" className="nav-logout" onClick={handleLogout}>
          Logout
        </button>
      </nav>
    </div>
  );
}
