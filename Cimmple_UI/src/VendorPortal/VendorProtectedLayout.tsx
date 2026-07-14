import React from "react";
import { Route, Switch, Redirect } from "react-router-dom";
import { VendorLogin } from "./VendorLogin";
import VendorDashboard from "./VendorDashboard";

const VendorProtectedLayout: React.FC = () => {
  const isVendorAuthenticated = localStorage.getItem("vendorToken") !== null;

  return (
    <Switch>
      <Route exact path="/vendor/login" component={VendorLogin} />
      <Route
        path="/vendor/dashboard"
        render={() =>
          isVendorAuthenticated ? (
            <VendorDashboard />
          ) : (
            <Redirect to="/vendor/login" />
          )
        }
      />
      <Route
        path="/vendor"
        render={() =>
          isVendorAuthenticated ? (
            <Redirect to="/vendor/dashboard" />
          ) : (
            <Redirect to="/vendor/login" />
          )
        }
      />
      <Redirect to="/vendor/login" />
    </Switch>
  );
};

export default VendorProtectedLayout;




































