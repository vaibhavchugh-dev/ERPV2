import React, { useRef } from "react";
import Sidebar from "../Sidebar";
import TopBar from "../TopBar";
import { SessionKeepAlive } from "../SessionKeepAlive";
import { useActiveLocation } from "../../Hooks/useActiveLocation";
import "./Layout.scss";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { locationId: activeLocationId } = useActiveLocation();
  // After login, Redux can still be 0 for one frame while localStorage already has the site.
  // Prefer that stored id for the remount key so Dashboard does not mount twice (0 → N)
  // and flash a failed-load toast from the abandoned first request.
  const storedSiteRef = useRef(Number(localStorage.getItem("locationId") || 0));
  const contentKey =
    activeLocationId > 0
      ? activeLocationId
      : storedSiteRef.current > 0
        ? storedSiteRef.current
        : "no-location";

  return (
    <div className="admin-layout">
      <SessionKeepAlive />
      <Sidebar />
      <div className="main-content">
        <TopBar />
        {/* Remount page content when working site changes (inventory default, stamped creates) */}
        <main className="page-content" key={contentKey}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
