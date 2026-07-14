import React from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "../Sidebar";
import TopBar from "../TopBar";
import "./Layout.scss";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="main-content">
        <TopBar />
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
