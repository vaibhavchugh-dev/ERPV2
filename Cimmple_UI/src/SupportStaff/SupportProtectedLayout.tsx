import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import { SupportStaffAuth } from "./SupportStaffAuth";
import SupportStaffLogin from "./SupportStaffLogin";
import SupportInboxPage from "./SupportInboxPage";
import SupportClientsPage from "./SupportClientsPage";

const SupportProtectedLayout: React.FC = () => {
  const authed = SupportStaffAuth.isAuthenticated();

  return (
    <Switch>
      <Route
        exact
        path="/support/login"
        render={() => (authed ? <Redirect to="/support" /> : <SupportStaffLogin />)}
      />
      <Route
        exact
        path="/support"
        render={() => (authed ? <SupportInboxPage /> : <Redirect to="/support/login" />)}
      />
      <Route
        exact
        path="/support/clients"
        render={() => {
          if (!authed) return <Redirect to="/support/login" />;
          return SupportStaffAuth.getUser()?.platformAdmin ? <SupportClientsPage /> : <Redirect to="/support" />;
        }}
      />
      <Route
        path="/support"
        render={() =>
          authed ? <Redirect to="/support" /> : <Redirect to="/support/login" />
        }
      />
    </Switch>
  );
};

export default SupportProtectedLayout;
