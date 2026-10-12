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
    <p>
      You don&apos;t have permission to open this page or document. Contact an
      administrator if you need access.
    </p>
  </div>
);

const endSession = (reason: "idle" | "session") => {
  try {
    if (reason === "idle") {
      localStorage.setItem("logOutFromIdlePopUp", "1");
    } else {
      localStorage.removeItem("logOutFromIdlePopUp");
    }
  } catch {
    // ignore
  }
  if (reason === "idle") {
    // Reads the refresh token synchronously, so it is safe to clear the session right after.
    void AuthService.revokeSession("erp");
  }
  AuthService.clearSession("erp");
  User.isAuthenticated = false;
};

/** Validates the stored session before any protected UI renders (e.g. a tab reopened hours later). */
const useSessionGate = () => {
  const [state, setState] = React.useState(() =>
    User.isAuthenticated ? AuthService.getStoredSessionState() : "none"
  );

  React.useEffect(() => {
    if (state === "idle") {
      endSession("idle");
      setState("none");
      return;
    }
    if (state !== "expired") return;

    let cancelled = false;
    AuthService.refresh()
      .catch(() => null)
      .then((refreshed) => {
        if (cancelled) return;
        if (refreshed) {
          setState("valid");
        } else {
          endSession("session");
          setState("none");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  return state;
};

export const ProtectedLayout: React.FC = () => {
  const sessionState = useSessionGate();

  if (sessionState === "none" || !localStorage.getItem("token")) {
    return <Redirect to="/login" />;
  }
  if (sessionState !== "valid") {
    return <PageFallback />;
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
          <Route
            exact
            path="/messages"
            render={({ location }) => {
              const params = new URLSearchParams(location.search || "");
              const open = params.get("open");
              const conversationId = open ? Number(open) : 0;
              const search =
                conversationId > 0
                  ? `?conversation=${conversationId}`
                  : "?openMessages=1";
              return <Redirect to={{ pathname: landingPath, search }} />;
            }}
          />
          <Route exact path="/" render={() => <Redirect to={landingPath} />} />
        </Switch>
      </React.Suspense>
    </Layout>
  );
};
