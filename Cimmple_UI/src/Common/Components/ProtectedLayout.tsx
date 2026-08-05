import React from "react";
import { Switch, Route, Redirect } from "react-router-dom";
import { User } from "../Services/User";
import { AuthService } from "../Services/AuthService";
import Layout from "./Layout";
import { protectedRoutes } from "../Routes";

export const ProtectedLayout: React.FC = () => {
  if (!User.isAuthenticated || !localStorage.getItem("token")) {
    return <Redirect to="/login" />;
  }

  try {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    if (storage?.mustChangePassword) {
      return <Redirect to="/change-password" />;
    }
  } catch {
    // ignore
  }

  return (
    <Layout>
      <Switch>
        {protectedRoutes.map((route, index) => (
          <Route
            key={index}
            exact
            path={route.path}
            render={(props) => {
              if (route.path !== "/home" && !AuthService.hasPermissionForPath(route.path)) {
                return <Redirect to="/home" />;
              }
              const Component = route.Component;
              return <Component {...props} />;
            }}
          />
        ))}
        <Route exact path="/" render={() => <Redirect to="/home" />} />
      </Switch>
    </Layout>
  );
};
