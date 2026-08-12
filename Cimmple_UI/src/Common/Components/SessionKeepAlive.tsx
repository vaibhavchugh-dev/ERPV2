import React from "react";
import { AuthService } from "../Services/AuthService";
import { User } from "../Services/User";
import { useSettingsSafe } from "../Contexts/SettingsContext";

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "wheel",
  "touchstart",
  "touchmove",
  "click",
  "pointerdown",
];

const CHECK_INTERVAL_MS = 30_000;
const REFRESH_SKEW_MS = 2 * 60 * 1000;
const MIN_TIMEOUT_MINUTES = 5;
const MAX_TIMEOUT_MINUTES = 480;
const DEFAULT_TIMEOUT_MINUTES = 30;

/**
 * Keeps the JWT session alive while the user is interacting with the app,
 * and logs out only after true idle (Session Timeout setting).
 */
export const SessionKeepAlive: React.FC = () => {
  const settings = useSettingsSafe();
  const lastActivityRef = React.useRef(Date.now());
  const refreshingRef = React.useRef(false);

  React.useEffect(() => {
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };

    // capture: true so nested scroll / interactions still count (scroll does not bubble)
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true, capture: true })
    );
    window.addEventListener("focus", onActivity);
    document.addEventListener("visibilitychange", onActivity);

    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity, { capture: true } as EventListenerOptions)
      );
      window.removeEventListener("focus", onActivity);
      document.removeEventListener("visibilitychange", onActivity);
    };
  }, []);

  React.useEffect(() => {
    const redirectToLogin = (reason: "idle" | "session") => {
      try {
        if (reason === "idle") {
          localStorage.setItem("logOutFromIdlePopUp", "1");
        } else {
          localStorage.removeItem("logOutFromIdlePopUp");
        }
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

    const resolveTimeoutMinutes = (): number => {
      // Prefer the login/refresh session value first — it matches JWT lifetime and is
      // written before SettingsContext finishes loading (which otherwise defaults to 30).
      let fromStorage = 0;
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        fromStorage = Number(storage.sessionTimeoutMinutes) || 0;
      } catch {
        // ignore
      }
      const fromSettings = Number(settings?.sessionTimeoutMinutes) || 0;
      const minutes =
        fromStorage > 0
          ? fromStorage
          : fromSettings > 0
            ? fromSettings
            : DEFAULT_TIMEOUT_MINUTES;
      // Match System Settings UI bounds so a bad DB value cannot force near-instant logout
      return Math.max(MIN_TIMEOUT_MINUTES, Math.min(MAX_TIMEOUT_MINUTES, minutes));
    };

    const tick = async () => {
      if (!localStorage.getItem("token")) return;

      let storage: {
        expiresAtUtc?: string;
        sessionTimeoutMinutes?: number;
      } = {};
      try {
        storage = JSON.parse(localStorage.getItem("storage") || "{}");
      } catch {
        return;
      }

      const timeoutMinutes = resolveTimeoutMinutes();
      const idleLimitMs = timeoutMinutes * 60 * 1000;
      const idleForMs = Date.now() - lastActivityRef.current;

      // True inactivity — match System Settings "Session Timeout"
      if (idleForMs >= idleLimitMs) {
        redirectToLogin("idle");
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
          // Token refresh failed (network/race/expired refresh) — not the same as idle timeout
          redirectToLogin("session");
        }
      } catch {
        redirectToLogin("session");
      } finally {
        refreshingRef.current = false;
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, CHECK_INTERVAL_MS);
    void tick();

    return () => window.clearInterval(id);
  }, [settings?.sessionTimeoutMinutes]);

  return null;
};
