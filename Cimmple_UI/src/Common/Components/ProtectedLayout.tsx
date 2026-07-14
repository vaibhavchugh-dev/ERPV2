import React from "react";
import { Switch, Route, Redirect } from "react-router-dom";
import { User } from "../Services/User";
import Layout from "./Layout";
import { protectedRoutes } from "../Routes";

export const ProtectedLayout: React.FC = () => {
  if (!User.isAuthenticated || !localStorage.getItem("token")) {
    return <Redirect to="/login" />;
  }

  return (
    <Layout>
      <Switch>
        {protectedRoutes.map((route, index) => (
          <Route
            key={index}
            exact
            path={route.path}
            component={route.Component}
          />
        ))}
        <Route exact path="/" render={() => <Redirect to="/home" />} />
      </Switch>
    </Layout>
  );
};
