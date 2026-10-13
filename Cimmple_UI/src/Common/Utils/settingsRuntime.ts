import { toast } from "react-toastify";
import { SystemSettings } from "../Services/SystemSettingsService";

let cachedSettings: SystemSettings | null = null;
let toastGateInstalled = false;
let originalToastSuccess: typeof toast.success | null = null;
let originalToastInfo: typeof toast.info | null = null;
let originalToastWarn: typeof toast.warn | null = null;
let originalToastWarning: typeof toast.warning | null = null;
let originalToastError: typeof toast.error | null = null;
let originalToastUpdate: typeof toast.update | null = null;
const suppressedToastIds = new Set<string>();
let suppressedToastSeq = 0;

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
    storage.timeFormat = settings.timeFormat;
    storage.timezone = settings.timezone;
    storage.defaultCurrency = settings.defaultCurrency;
    storage.currencySymbol = settings.currencySymbol;
    storage.locale = settings.locale;
    storage.decimalPlaces = settings.decimalPlaces;
    storage.decimalSeparator = settings.decimalSeparator;
    storage.thousandsSeparator = settings.thousandsSeparator;
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
  originalToastError = toast.error.bind(toast);
  originalToastUpdate = toast.update.bind(toast);

  // Suppressed toasts still return an id so callers can later toast.update() it (e.g. "Generating PDF…" → result).
  const suppress = (): any => {
    suppressedToastSeq += 1;
    const id = `suppressed-toast-${suppressedToastSeq}`;
    suppressedToastIds.add(id);
    return id;
  };

  toast.success = ((content: any, options?: any) => {
    if (!isInAppNotificationsEnabled()) return suppress();
    return originalToastSuccess!(content, options);
  }) as typeof toast.success;

  toast.info = ((content: any, options?: any) => {
    if (!isInAppNotificationsEnabled()) return suppress();
    return originalToastInfo!(content, options);
  }) as typeof toast.info;

  toast.warn = ((content: any, options?: any) => {
    if (!isInAppNotificationsEnabled()) return suppress();
    return originalToastWarn!(content, options);
  }) as typeof toast.warn;

  toast.warning = ((content: any, options?: any) => {
    if (!isInAppNotificationsEnabled()) return suppress();
    return originalToastWarning!(content, options);
  }) as typeof toast.warning;

  toast.update = ((toastId: any, options?: any) => {
    const isError = options?.type === "error";
    if (typeof toastId === "string" && suppressedToastIds.has(toastId)) {
      suppressedToastIds.delete(toastId);
      if (isError && options?.render != null) {
        const { render, type, ...rest } = options;
        originalToastError!(render, rest);
      }
      return;
    }
    if (!isError && options?.type && !isInAppNotificationsEnabled()) {
      toast.dismiss(toastId);
      return;
    }
    return originalToastUpdate!(toastId, options);
  }) as typeof toast.update;
};

/** Always show a success toast (e.g. settings saved), ignoring the in-app gate. */
export const toastAlwaysSuccess = (content: any, options?: any) => {
  ensureToastGate();
  return (originalToastSuccess || toast.success)(content, options);
};
