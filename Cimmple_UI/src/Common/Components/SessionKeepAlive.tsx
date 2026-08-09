import React from "react";
import { AuthService } from "../Services/AuthService";
import { User } from "../Services/User";

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "click",
];

const CHECK_INTERVAL_MS = 30_000;
const REFRESH_SKEW_MS = 2 * 60 * 1000;

/**
 * Keeps the JWT session alive while the user is interacting with the app,
 * and logs out only after true idle (Session Timeout setting).
 */
export const SessionKeepAlive: React.FC = () => {
  const lastActivityRef = React.useRef(Date.now());
  const refreshingRef = React.useRef(false);

  React.useEffect(() => {
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true })
    );

    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity)
      );
    };
  }, []);

  React.useEffect(() => {
    const forceIdleLogout = () => {
      try {
        localStorage.setItem("logOutFromIdlePopUp", "1");
      } catch {
        // ignore
      }
      try {
        AuthService.clearSession("erp");
      } catch {
        // ignore
      }
      User.isAuthenticated = false;
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    };

    const tick = async () => {
      if (!localStorage.getItem("token")) return;

      let storage: {
        sessionTimeoutMinutes?: number;
        expiresAtUtc?: string;
      } = {};
      try {
        storage = JSON.parse(localStorage.getItem("storage") || "{}");
      } catch {
        return;
      }

      const timeoutMinutes =
        Number(storage.sessionTimeoutMinutes) > 0
          ? Number(storage.sessionTimeoutMinutes)
          : 30;
      const idleLimitMs = timeoutMinutes * 60 * 1000;
      const idleForMs = Date.now() - lastActivityRef.current;

      // True inactivity — match System Settings "Session Timeout"
      if (idleForMs >= idleLimitMs) {
        forceIdleLogout();
        return;
      }

      const expiresAtMs = storage.expiresAtUtc
        ? Date.parse(storage.expiresAtUtc)
        : NaN;
      if (!Number.isFinite(expiresAtMs)) return;

      const msUntilExpiry = expiresAtMs - Date.now();
      const refreshSkew = Math.min(REFRESH_SKEW_MS, Math.max(30_000, idleLimitMs / 4));

      if (msUntilExpiry > refreshSkew || refreshingRef.current) return;

      refreshingRef.current = true;
      try {
        const refreshed = await AuthService.refresh();
        if (!refreshed) {
          forceIdleLogout();
        }
      } catch {
        forceIdleLogout();
      } finally {
        refreshingRef.current = false;
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, CHECK_INTERVAL_MS);
    void tick();

    return () => window.clearInterval(id);
  }, []);

  return null;
};
