import React from "react";
import { NavLink } from "react-router-dom";
import { SupportStaffAuth } from "./SupportStaffAuth";

const SupportHeader: React.FC = () => {
  const user = SupportStaffAuth.getUser();

  const logout = () => {
    SupportStaffAuth.clear();
    window.location.href = "/support/login";
  };

  return (
    <header className="support-inbox__header">
      <div className="support-inbox__header-left">
        <div>
          <div className="support-inbox__brand">Cimmple Support</div>
          <div className="support-inbox__user">
            {user?.displayName || user?.username || "Staff"}
          </div>
        </div>
        {user?.platformAdmin && (
          <nav className="support-inbox__nav">
            <NavLink exact to="/support" activeClassName="is-active">
              Inbox
            </NavLink>
            <NavLink to="/support/clients" activeClassName="is-active">
              Clients
            </NavLink>
          </nav>
        )}
      </div>
      <button type="button" className="si-btn si-btn--ghost" onClick={logout}>
        Sign out
      </button>
    </header>
  );
};

export default SupportHeader;
