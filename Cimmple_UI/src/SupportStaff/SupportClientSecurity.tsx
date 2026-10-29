import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { apiError, PlatformTenantService, TenantSecuritySettings } from "./PlatformTenantService";

export const defaultTenantSecurity = (): TenantSecuritySettings => ({
  minPasswordLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  passwordExpirationDays: 0,
  passwordHistoryCount: 5,
  sessionTimeoutMinutes: 30,
  maxConcurrentSessions: 1,
  failedLoginAttempts: 5,
  accountLockoutMinutes: 15,
});

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

interface Props {
  tenantId?: number;
  busy: boolean;
  draft?: TenantSecuritySettings;
  onDraftChange?: (value: TenantSecuritySettings) => void;
  hideHeading?: boolean;
}

const SupportClientSecurity: React.FC<Props> = ({ tenantId, busy, draft, onDraftChange, hideHeading }) => {
  const controlled = typeof onDraftChange === "function";
  const [stored, setStored] = useState<TenantSecuritySettings>(defaultTenantSecurity());
  const [loading, setLoading] = useState(!controlled);
  const [saving, setSaving] = useState(false);
  const form = controlled ? draft ?? defaultTenantSecurity() : stored;
  const setForm = (next: TenantSecuritySettings | ((prev: TenantSecuritySettings) => TenantSecuritySettings)) => {
    const resolved = typeof next === "function" ? next(form) : next;
    if (controlled) onDraftChange?.(resolved);
    else setStored(resolved);
  };

  const load = useCallback(async () => {
    if (controlled || !tenantId) return;
    setLoading(true);
    try {
      setStored(await PlatformTenantService.getSecuritySettings(tenantId));
    } catch (err: any) {
      toast.error(apiError(err, "Failed to load security settings."));
      setStored(defaultTenantSecurity());
    } finally {
      setLoading(false);
    }
  }, [controlled, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setNumber = (key: keyof TenantSecuritySettings, raw: string) => {
    if (raw === "") return;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    setForm((prev) => ({ ...prev, [key]: parsed }));
  };

  const blurNumber = (key: keyof TenantSecuritySettings, raw: string, min: number, max: number, fallback: number) => {
    setForm((prev) => ({ ...prev, [key]: clamp(parseInt(raw, 10), min, max, fallback) }));
  };

  const save = async () => {
    const next: TenantSecuritySettings = {
      ...form,
      minPasswordLength: clamp(form.minPasswordLength, 6, 20, 8),
      passwordExpirationDays: Math.max(0, form.passwordExpirationDays || 0),
      passwordHistoryCount: clamp(form.passwordHistoryCount, 0, 10, 5),
      sessionTimeoutMinutes: clamp(form.sessionTimeoutMinutes, 5, 480, 30),
      maxConcurrentSessions: clamp(form.maxConcurrentSessions, 1, 10, 1),
      failedLoginAttempts: clamp(form.failedLoginAttempts, 3, 10, 5),
      accountLockoutMinutes: clamp(form.accountLockoutMinutes, 5, 1440, 15),
    };
    setForm(next);
    setSaving(true);
    try {
      if (!tenantId) return;
      setStored(await PlatformTenantService.saveSecuritySettings(tenantId, next));
      toast.success("Security settings saved.");
    } catch (err: any) {
      toast.error(apiError(err, "Could not save security settings."));
    } finally {
      setSaving(false);
    }
  };

  const locked = busy || loading || saving;

  return (
    <div className="sc-security">
      {!hideHeading && <h3 className="sc-subhead">Security</h3>}
      {loading ? (
        <p className="si-muted">Loading security settings…</p>
      ) : (
        <>
          <div className="sc-form__grid sc-form__grid--aligned">
            <label>
              <span className="sc-field__name">Minimum password length</span>
              <input
                type="number"
                min={6}
                max={20}
                value={form.minPasswordLength}
                disabled={locked}
                onChange={(e) => setNumber("minPasswordLength", e.target.value)}
                onBlur={(e) => blurNumber("minPasswordLength", e.target.value, 6, 20, 8)}
              />
            </label>
            <label>
              <span className="sc-field__name">Password expiration (days)</span>
              <input
                type="number"
                min={0}
                value={form.passwordExpirationDays}
                disabled={locked}
                onChange={(e) => setNumber("passwordExpirationDays", e.target.value)}
                onBlur={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    passwordExpirationDays: Math.max(0, parseInt(e.target.value, 10) || 0),
                  }))
                }
              />
              <span className="sc-field__hint">0 = never expire</span>
            </label>
            <label>
              <span className="sc-field__name">Password history count</span>
              <input
                type="number"
                min={0}
                max={10}
                value={form.passwordHistoryCount}
                disabled={locked}
                onChange={(e) => setNumber("passwordHistoryCount", e.target.value)}
                onBlur={(e) => blurNumber("passwordHistoryCount", e.target.value, 0, 10, 5)}
              />
              <span className="sc-field__hint">Previous passwords that cannot be reused. 0 = disabled.</span>
            </label>
            <label>
              <span className="sc-field__name">Session timeout (minutes)</span>
              <input
                type="number"
                min={5}
                max={480}
                value={form.sessionTimeoutMinutes}
                disabled={locked}
                onChange={(e) => setNumber("sessionTimeoutMinutes", e.target.value)}
                onBlur={(e) => blurNumber("sessionTimeoutMinutes", e.target.value, 5, 480, 30)}
              />
              <span className="sc-field__hint">Logs out after this many minutes of inactivity.</span>
            </label>
            <label>
              <span className="sc-field__name">Max concurrent sessions</span>
              <input
                type="number"
                min={1}
                max={10}
                value={form.maxConcurrentSessions}
                disabled={locked}
                onChange={(e) => setNumber("maxConcurrentSessions", e.target.value)}
                onBlur={(e) => blurNumber("maxConcurrentSessions", e.target.value, 1, 10, 1)}
              />
            </label>
            <label>
              <span className="sc-field__name">Failed login attempts before lockout</span>
              <input
                type="number"
                min={3}
                max={10}
                value={form.failedLoginAttempts}
                disabled={locked}
                onChange={(e) => setNumber("failedLoginAttempts", e.target.value)}
                onBlur={(e) => blurNumber("failedLoginAttempts", e.target.value, 3, 10, 5)}
              />
            </label>
            <label>
              <span className="sc-field__name">Account lockout duration (minutes)</span>
              <input
                type="number"
                min={5}
                max={1440}
                value={form.accountLockoutMinutes}
                disabled={locked}
                onChange={(e) => setNumber("accountLockoutMinutes", e.target.value)}
                onBlur={(e) => blurNumber("accountLockoutMinutes", e.target.value, 5, 1440, 15)}
              />
            </label>
          </div>
          <div className="sc-security__rules">
            <div className="sc-field__name">Password requirements</div>
          <div className="sc-form__grid">
            <label className="sc-form__check">
              <input
                type="checkbox"
                checked={form.requireUppercase}
                disabled={locked}
                onChange={(e) => setForm((prev) => ({ ...prev, requireUppercase: e.target.checked }))}
              />
              Require uppercase letters
            </label>
            <label className="sc-form__check">
              <input
                type="checkbox"
                checked={form.requireLowercase}
                disabled={locked}
                onChange={(e) => setForm((prev) => ({ ...prev, requireLowercase: e.target.checked }))}
              />
              Require lowercase letters
            </label>
            <label className="sc-form__check">
              <input
                type="checkbox"
                checked={form.requireNumbers}
                disabled={locked}
                onChange={(e) => setForm((prev) => ({ ...prev, requireNumbers: e.target.checked }))}
              />
              Require numbers
            </label>
            <label className="sc-form__check">
              <input
                type="checkbox"
                checked={form.requireSpecialChars}
                disabled={locked}
                onChange={(e) => setForm((prev) => ({ ...prev, requireSpecialChars: e.target.checked }))}
              />
              Require special characters
            </label>
          </div>
          </div>
          {!controlled && (
            <div className="sc-actions" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="si-btn si-btn--primary" disabled={locked} onClick={() => void save()}>
                {saving ? "Saving…" : "Save security settings"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SupportClientSecurity;
