import React from "react";
import Sidebar from "../Sidebar";
import TopBar from "../TopBar";
import { useActiveLocation } from "../../Hooks/useActiveLocation";
import "./Layout.scss";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { locationId: activeLocationId } = useActiveLocation();

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="main-content">
        <TopBar />
        {/* Remount page content when working site changes (inventory default, stamped creates) */}
        <main className="page-content" key={activeLocationId || "no-location"}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
