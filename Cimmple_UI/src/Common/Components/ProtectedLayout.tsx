import React from "react";
import { Switch, Route, Redirect } from "react-router-dom";
import { User } from "../Services/User";
import { AuthService } from "../Services/AuthService";
import Layout from "./Layout";
import { protectedRoutes } from "../Routes";

const PageFallback: React.FC = () => (
  <div className="page-loading" style={{ padding: "2rem", textAlign: "center" }}>
    Loading…
  </div>
);

const routePaths = protectedRoutes.map((r) => r.path as string);

const AccessDenied: React.FC = () => (
  <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
    <h2 style={{ color: "#111827", marginBottom: "0.5rem" }}>No access</h2>
    <p>Your role does not include permission for this page. Contact an administrator if you need access.</p>
  </div>
);

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

  const landingPath = AuthService.getDefaultLandingPath(routePaths);

  return (
    <Layout>
      <React.Suspense fallback={<PageFallback />}>
        <Switch>
          {protectedRoutes.map((route, index) => (
            <Route
              key={index}
              exact
              path={route.path}
              render={(props) => {
                if (!AuthService.hasPermissionForPath(route.path)) {
                  // Avoid redirect loops when landing itself is denied
                  if (landingPath === route.path || !AuthService.hasPermissionForPath(landingPath)) {
                    return <AccessDenied />;
                  }
                  return <Redirect to={landingPath} />;
                }
                const Component = route.Component;
                return <Component {...props} />;
              }}
            />
          ))}
          <Route exact path="/" render={() => <Redirect to={landingPath} />} />
        </Switch>
      </React.Suspense>
    </Layout>
  );
};
