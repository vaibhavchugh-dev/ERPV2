import { toast } from "react-toastify";
import { SystemSettings } from "../Services/SystemSettingsService";

let cachedSettings: SystemSettings | null = null;
let toastGateInstalled = false;
let originalToastSuccess: typeof toast.success | null = null;
let originalToastInfo: typeof toast.info | null = null;
let originalToastWarn: typeof toast.warn | null = null;
let originalToastWarning: typeof toast.warning | null = null;

/** Latest loaded system settings for non-React helpers (formatting, notify gates). */
export const getCachedSettings = (): SystemSettings | null => cachedSettings;

export const isInAppNotificationsEnabled = (): boolean =>
  cachedSettings?.enableInAppNotifications !== false;

export const isEmailNotificationsEnabled = (): boolean =>
  cachedSettings?.enableEmailNotifications !== false;

/**
 * Keep localStorage + toast gates in sync when settings load or save.
 * SessionKeepAlive and legacy readers use storage.sessionTimeoutMinutes.
 */
export const applyRuntimeSettings = (settings: SystemSettings | null | undefined): void => {
  if (!settings) return;
  cachedSettings = settings;

  try {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    storage.sessionTimeoutMinutes = settings.sessionTimeoutMinutes;
    storage.enableEmailNotifications = settings.enableEmailNotifications;
    storage.enableInAppNotifications = settings.enableInAppNotifications;
    storage.defaultPageSize = settings.defaultPageSize;
    storage.dateFormat = settings.dateFormat;
    storage.timezone = settings.timezone;
    storage.defaultCurrency = settings.defaultCurrency;
    storage.currencySymbol = settings.currencySymbol;
    storage.locale = settings.locale;
    storage.decimalPlaces = settings.decimalPlaces;
    localStorage.setItem("storage", JSON.stringify(storage));
  } catch {
    // ignore storage sync failures
  }

  ensureToastGate();
};

const ensureToastGate = (): void => {
  if (toastGateInstalled) return;
  toastGateInstalled = true;

  originalToastSuccess = toast.success.bind(toast);
  originalToastInfo = toast.info.bind(toast);
  originalToastWarn = toast.warn.bind(toast);
  originalToastWarning = toast.warning.bind(toast);

  toast.success = ((content: any, options?: any) => {
    if (!isInAppNotificationsEnabled()) return { unmount: () => undefined } as any;
    return originalToastSuccess!(content, options);
  }) as typeof toast.success;

  toast.info = ((content: any, options?: any) => {
    if (!isInAppNotificationsEnabled()) return { unmount: () => undefined } as any;
    return originalToastInfo!(content, options);
  }) as typeof toast.info;

  toast.warn = ((content: any, options?: any) => {
    if (!isInAppNotificationsEnabled()) return { unmount: () => undefined } as any;
    return originalToastWarn!(content, options);
  }) as typeof toast.warn;

  toast.warning = ((content: any, options?: any) => {
    if (!isInAppNotificationsEnabled()) return { unmount: () => undefined } as any;
    return originalToastWarning!(content, options);
  }) as typeof toast.warning;
};

/** Always show a success toast (e.g. settings saved), ignoring the in-app gate. */
export const toastAlwaysSuccess = (content: any, options?: any) => {
  ensureToastGate();
  return (originalToastSuccess || toast.success)(content, options);
};
