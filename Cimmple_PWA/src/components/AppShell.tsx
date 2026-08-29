import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { BottomTabs } from "./BottomTabs";
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
    const handleOpen = () => setDrawerOpen(true);
    window.addEventListener("open-drawer", handleOpen);
    return () => window.removeEventListener("open-drawer", handleOpen);
  }, []);

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
    <div className="flex min-h-dvh flex-col bg-canvas dark:bg-canvas-dark">
      <main className="mx-auto w-full max-w-[600px] flex-1 px-4 pt-[calc(2.25rem+env(safe-area-inset-top,0px))] pb-[calc(68px+2rem+env(safe-area-inset-bottom,0px))]">
        <Outlet />
      </main>

      <BottomTabs />

      <NavDrawer
        open={drawerOpen}
        userName={userName}
        onClose={() => setDrawerOpen(false)}
        onLogout={() => void handleLogout()}
      />
    </div>
  );
}
