import { SystemSettings } from "../Services/SystemSettingsService";
import { getDefaultSystemSettings } from "./defaultSystemSettings";

export const resolvePasswordSettings = (settings?: SystemSettings | null): SystemSettings => {
  if (settings) return settings;
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  const tenantId = Number(storage?.tenantID) || 1;
  return getDefaultSystemSettings(tenantId);
};

export const getPasswordPolicyHints = (settings?: SystemSettings | null): string[] => {
  const s = resolvePasswordSettings(settings);
  const hints = [`at least ${s.minPasswordLength || 8} characters`];
  if (s.requireUppercase) hints.push("one uppercase letter");
  if (s.requireLowercase) hints.push("one lowercase letter");
  if (s.requireNumbers) hints.push("one number");
  if (s.requireSpecialChars) hints.push("one special character");
  return hints;
};

export const validatePasswordAgainstPolicy = (
  password: string,
  settings?: SystemSettings | null
): string | null => {
  const s = resolvePasswordSettings(settings);
  const minLen = s.minPasswordLength > 0 ? s.minPasswordLength : 8;

  if (!password.trim()) return "Password is required";
  if (password.length < minLen) return `Password must be at least ${minLen} characters`;
  if (s.requireUppercase && !/[A-Z]/.test(password)) {
    return "Password must contain an uppercase letter";
  }
  if (s.requireLowercase && !/[a-z]/.test(password)) {
    return "Password must contain a lowercase letter";
  }
  if (s.requireNumbers && !/[0-9]/.test(password)) {
    return "Password must contain a number";
  }
  if (s.requireSpecialChars && /^[A-Za-z0-9]*$/.test(password)) {
    return "Password must contain a special character";
  }
  return null;
};
