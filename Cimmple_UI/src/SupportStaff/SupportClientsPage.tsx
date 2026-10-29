import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { useFormatting } from "../Common/Hooks/useFormatting";
import { deriveCurrencySymbol } from "../Common/Utils/Formatting";
import { SYSTEM_CURRENCY_OPTIONS, SYSTEM_TIMEZONE_OPTIONS } from "../Common/Utils/defaultSystemSettings";
import SupportHeader from "./SupportHeader";
import SupportClientMasterData from "./SupportClientMasterData";
import SupportClientSecurity, { defaultTenantSecurity } from "./SupportClientSecurity";
import {
  apiError,
  PlatformTenantService,
  ProvisionTenantRequest,
  SeedStepResult,
  TenantSecuritySettings,
  TenantStatus,
  TenantSummary,
} from "./PlatformTenantService";
import "./SupportInbox.scss";

const emptyForm: ProvisionTenantRequest = {
  companyName: "",
  code: "",
  plan: "",
  loginSeatLimit: 0,
  adminFirstName: "",
  adminLastName: "",
  adminEmail: "",
  adminUserName: "",
  phone: "",
  country: "",
  timeZone: "America/New_York",
  currency: "USD",
  currencySymbol: "$",
  notes: "",
  industry: "",
  includeSampleWorkstations: false,
  includeSampleProcesses: false,
  includeSampleJobTemplates: false,
  includeSampleNcrCodes: false,
  security: defaultTenantSecurity(),
  sendInviteEmail: true,
};

interface Credentials {
  tenantName: string;
  userName: string;
  password: string;
  inviteQueued: boolean;
  inviteError?: string | null;
}

function statusClass(status: string): string {
  switch (status) {
    case "Active":
      return "si-badge si-badge--done";
    case "Provisioning":
      return "si-badge si-badge--wait";
    case "Suspended":
    case "Cancelled":
      return "si-badge si-badge--stopped";
    default:
      return "si-badge si-badge--open";
  }
}

function stepSummary(steps: SeedStepResult[] | undefined): string {
  const added = (steps || []).filter((s) => s.inserted > 0);
  if (added.length === 0) return "Nothing was missing.";
  return added.map((s) => `${s.name}: ${s.inserted}`).join(", ");
}

const SupportClientsPage: React.FC = () => {
  const { formatDateTime } = useFormatting();
  const formatWhen = (iso?: string | null) => (iso ? formatDateTime(iso) || iso : "—");

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProvisionTenantRequest>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [industries, setIndustries] = useState<{ code: string; label: string }[]>([]);
  const [security, setSecurity] = useState<TenantSecuritySettings>(defaultTenantSecurity());
  const [securityReady, setSecurityReady] = useState(false);
  const [applying, setApplying] = useState(false);
  const [seatDraft, setSeatDraft] = useState("");
  const securityRef = useRef(security);
  const setSecurityNow = (next: TenantSecuritySettings) => {
    securityRef.current = next;
    setSecurity(next);
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      setTenants(await PlatformTenantService.list());
    } catch (err: any) {
      toast.error(apiError(err, "Failed to load clients."));
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    void PlatformTenantService.industries().then(setIndustries).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSecurityReady(false);
      return;
    }
    let cancelled = false;
    setSecurityReady(false);
    void PlatformTenantService.getSecuritySettings(selectedId)
      .then((settings) => {
        if (!cancelled && settings) setSecurityNow(settings);
      })
      .catch(() => {
        if (!cancelled) setSecurityNow(defaultTenantSecurity());
      })
      .finally(() => {
        if (!cancelled) setSecurityReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return [t.name, t.code, t.contactName, t.contactEmail, String(t.tenantId)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [tenants, statusFilter, search]);

  const selected = tenants.find((t) => t.tenantId === selectedId) || null;

  useEffect(() => {
    setSeatDraft(selected?.loginSeatLimit != null ? String(selected.loginSeatLimit) : "");
  }, [selected?.tenantId, selected?.loginSeatLimit]);

  const replaceTenant = (tenant: TenantSummary | null | undefined) => {
    if (!tenant) return;
    setTenants((prev) => {
      const exists = prev.some((t) => t.tenantId === tenant.tenantId);
      return exists
        ? prev.map((t) => (t.tenantId === tenant.tenantId ? tenant : t))
        : [tenant, ...prev];
    });
  };

  const startCreate = () => {
    setCreating(true);
    setSelectedId(null);
    setCredentials(null);
    setForm(emptyForm);
  };

  const selectTenant = (id: number) => {
    setCreating(false);
    setSelectedId(id);
    setCredentials(null);
  };

  const setField = (key: keyof ProvisionTenantRequest) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value =
        e.target instanceof HTMLInputElement && e.target.type === "checkbox"
          ? e.target.checked
          : e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim() || !form.adminFirstName.trim() || !form.adminLastName.trim() || !form.adminEmail.trim()) {
      toast.error("Company name and the administrator's name and email are required.");
      return;
    }
    if (form.loginSeatLimit == null || !Number.isInteger(form.loginSeatLimit) || form.loginSeatLimit < 0) {
      toast.error("Login seats must be a whole number. Use 0 when no employee logins are allotted.");
      return;
    }
    setBusy(true);
    try {
      const result = await PlatformTenantService.create(form);
      replaceTenant(result.tenant);
      if (result.tenant) {
        setCreating(false);
        setSelectedId(result.tenant.tenantId);
      }
      if (result.temporaryPassword && result.adminUserName) {
        setCredentials({
          tenantName: result.tenant?.name || form.companyName,
          userName: result.adminUserName,
          password: result.temporaryPassword,
          inviteQueued: result.inviteQueued,
          inviteError: result.inviteError,
        });
      }
      if (result.success) {
        toast.success("Client created and ready to use.");
        if (result.sampleError) toast.warning(`Sample master data: ${result.sampleError}`);
      } else {
        toast.warning(
          `Client created, but default data could not be finished: ${result.error || "unknown error"}. Use Resume setup to retry.`
        );
      }
    } catch (err: any) {
      toast.error(apiError(err, "Failed to create client."));
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err: any) {
      toast.error(apiError(err, `${label} failed.`));
    } finally {
      setBusy(false);
    }
  };

  const resume = (tenant: TenantSummary) =>
    runAction("Resume setup", async () => {
      const result = await PlatformTenantService.resume(tenant.tenantId);
      replaceTenant(result.tenant);
      if (result.success) toast.success(`Setup finished. ${stepSummary(result.steps)}`);
      else toast.error(result.error || "Setup is still incomplete.");
    });

  const applyDefaults = (tenant: TenantSummary) => {
    if (!window.confirm(`Save security settings and add any missing roles, permissions, chart of accounts, and payment terms for ${tenant.name}? Existing roles, accounts, and payment terms are not changed.`)) {
      return;
    }
    void runAction("Apply defaults", async () => {
      setApplying(true);
      try {
        const current = securityRef.current;
        const saved = await PlatformTenantService.saveSecuritySettings(tenant.tenantId, current);
        if (saved) setSecurityNow(saved);
        const result = await PlatformTenantService.applyDefaults(tenant.tenantId, saved);
        replaceTenant(result.tenant);
        if (result.success) toast.success(`Security settings saved. ${stepSummary(result.steps)}`);
        else toast.error(result.error || "Security settings were saved, but applying default data failed.");
      } finally {
        setApplying(false);
      }
    });
  };

  const saveLoginSeats = (tenant: TenantSummary) => {
    const next = Number(seatDraft);
    if (!Number.isInteger(next) || next < 0) {
      toast.error("Login seats must be a whole number. Use 0 when no employee logins are allotted.");
      return;
    }
    const used = tenant.usedLoginSeats || 0;
    if (next < used) {
      const ok = window.confirm(
        `${used} people can still sign in. No one is signed out. New logins stay blocked until usage is back to ${next}.`
      );
      if (!ok) return;
    }
    void runAction("Save login seats", async () => {
      replaceTenant(await PlatformTenantService.setLoginSeatLimit(tenant.tenantId, next));
      toast.success(`Login seats set to ${next}.`);
    });
  };

  const changeStatus = (tenant: TenantSummary, status: TenantStatus) => {
    const warning =
      status === "Active"
        ? `Reactivate ${tenant.name}? Its users will be able to sign in again.`
        : `${status === "Suspended" ? "Suspend" : "Cancel"} ${tenant.name}? All of its users are signed out immediately and cannot sign in until the client is reactivated.`;
    if (!window.confirm(warning)) return;
    void runAction("Status change", async () => {
      replaceTenant(await PlatformTenantService.setStatus(tenant.tenantId, status));
      toast.success(`Client is now ${status}.`);
    });
  };

  const resendInvite = (tenant: TenantSummary) => {
    if (!window.confirm(`Issue a new temporary password for ${tenant.name}'s administrator? The old password stops working.`)) {
      return;
    }
    void runAction("Resend invite", async () => {
      const result = await PlatformTenantService.resendInvite(tenant.tenantId);
      if (!result.success || !result.temporaryPassword || !result.adminUserName) {
        toast.error(result.error || "Could not reissue the invite.");
        return;
      }
      setCredentials({
        tenantName: tenant.name,
        userName: result.adminUserName,
        password: result.temporaryPassword,
        inviteQueued: result.inviteQueued,
        inviteError: result.inviteError,
      });
      toast.success("New temporary password issued.");
    });
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.info("Copied."),
      () => toast.error("Copy failed.")
    );
  };

  return (
    <div className="support-inbox">
      <SupportHeader />

      <div className="support-inbox__body">
        <aside className="support-inbox__list">
          <div className="support-inbox__filters">
            <button type="button" className="si-btn si-btn--primary" onClick={startCreate}>
              New client
            </button>
            <label>
              Search
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, code, contact, ID…"
                autoComplete="off"
              />
            </label>
            <label>
              Status
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All</option>
                <option value="Active">Active</option>
                <option value="Provisioning">Provisioning</option>
                <option value="Suspended">Suspended</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>
            <button type="button" className="si-btn si-btn--ghost" onClick={() => void loadList()}>
              Refresh
            </button>
          </div>

          <div className="support-inbox__tickets">
            {loading && <p className="si-muted">Loading…</p>}
            {!loading && visible.length === 0 && <p className="si-muted">No clients match these filters.</p>}
            {visible.map((t) => (
              <button
                key={t.tenantId}
                type="button"
                className={`support-ticket-card ${selectedId === t.tenantId ? "is-active" : ""}`}
                onClick={() => selectTenant(t.tenantId)}
              >
                <div className="support-ticket-card__top">
                  <span>
                    #{t.tenantId}
                    {t.code ? ` · ${t.code}` : ""}
                  </span>
                  <span className={statusClass(t.status)}>{t.status}</span>
                </div>
                <div className="support-ticket-card__subject">{t.name}</div>
                <div className="support-ticket-card__meta">
                  {t.userCount} user{t.userCount === 1 ? "" : "s"}
                  {t.loginSeatLimit != null
                    ? ` · ${t.usedLoginSeats}/${t.loginSeatLimit} seats`
                    : " · seats not set"}
                  {t.plan ? ` · ${t.plan}` : ""}
                  {t.contactEmail ? ` · ${t.contactEmail}` : ""}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="support-inbox__detail">
          {credentials && (
            <div className="support-inbox__description sc-credentials">
              <h3>Administrator sign-in for {credentials.tenantName}</h3>
              <p>
                This temporary password is shown only once. The administrator must change it at first sign-in.
              </p>
              <dl className="sc-grid">
                <dt>Username</dt>
                <dd>
                  <code>{credentials.userName}</code>{" "}
                  <button type="button" className="si-btn si-btn--ghost sc-small" onClick={() => copy(credentials.userName)}>
                    Copy
                  </button>
                </dd>
                <dt>Temporary password</dt>
                <dd>
                  <code>{credentials.password}</code>{" "}
                  <button type="button" className="si-btn si-btn--ghost sc-small" onClick={() => copy(credentials.password)}>
                    Copy
                  </button>
                </dd>
                <dt>Invite email</dt>
                <dd>
                  {credentials.inviteQueued
                    ? "Queued for delivery."
                    : credentials.inviteError
                      ? `Not sent: ${credentials.inviteError}`
                      : "Not sent."}
                </dd>
              </dl>
              <button type="button" className="si-btn si-btn--ghost" onClick={() => setCredentials(null)}>
                I have saved these details
              </button>
            </div>
          )}

          {creating && (
            <form className="support-inbox__reply sc-form" onSubmit={(e) => void submitCreate(e)}>
              <h3>New client</h3>
              <section className="sc-section">
                <h3>Company</h3>
                <div className="sc-form__grid">
                  <label className="sc-form__wide">
                    Company name *
                    <input value={form.companyName} onChange={setField("companyName")} maxLength={200} required />
                  </label>
                  <label>
                    Client code
                    <input value={form.code} onChange={setField("code")} maxLength={50} placeholder="e.g. ACME" />
                  </label>
                <label>
                  Plan
                  <input value={form.plan} onChange={setField("plan")} maxLength={50} placeholder="e.g. Standard" />
                </label>
                <label>
                  Login seats *
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={form.loginSeatLimit ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setForm((prev) => ({
                        ...prev,
                        loginSeatLimit: raw === "" ? undefined : Number(raw),
                      }));
                    }}
                  />
                </label>
                  <label>
                    Phone
                    <input value={form.phone} onChange={setField("phone")} />
                  </label>
                  <label>
                    Country
                    <input value={form.country} onChange={setField("country")} />
                  </label>
                  <label className="sc-form__wide">
                    Internal notes
                    <textarea rows={3} value={form.notes} onChange={setField("notes")} maxLength={2000} />
                  </label>
                </div>
              </section>
              <section className="sc-section">
                <h3>Administrator</h3>
                <div className="sc-form__grid">
                  <label>
                    First name *
                    <input value={form.adminFirstName} onChange={setField("adminFirstName")} required />
                  </label>
                  <label>
                    Last name *
                    <input value={form.adminLastName} onChange={setField("adminLastName")} required />
                  </label>
                  <label>
                    Email *
                    <input type="email" value={form.adminEmail} onChange={setField("adminEmail")} required />
                  </label>
                  <label>
                    Username
                    <input
                      value={form.adminUserName}
                      onChange={setField("adminUserName")}
                      maxLength={100}
                      placeholder="Defaults to the email"
                    />
                  </label>
                  <label className="sc-form__check sc-form__wide">
                    <input type="checkbox" checked={form.sendInviteEmail} onChange={setField("sendInviteEmail")} />
                    Email the administrator their sign-in details
                  </label>
                </div>
              </section>
              <section className="sc-section">
                <h3>Regional</h3>
                <div className="sc-form__grid">
                  <label>
                    Time zone
                    <select value={form.timeZone} onChange={setField("timeZone")}>
                      {SYSTEM_TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label} ({tz.value})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Currency
                    <select
                      value={form.currency}
                      onChange={(e) => {
                        const currency = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          currency,
                          currencySymbol: deriveCurrencySymbol(currency),
                        }));
                      }}
                    >
                      {SYSTEM_CURRENCY_OPTIONS.map((currency) => (
                        <option key={currency.value} value={currency.value}>
                          {currency.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Currency symbol
                    <input value={form.currencySymbol} readOnly />
                  </label>
                </div>
              </section>
              <section className="sc-section">
                <h3>Sample data</h3>
                <div className="sc-form__grid">
                  <label>
                    Industry
                    <select
                      value={form.industry}
                      onChange={(e) => {
                        const value = e.target.value;
                        setForm((prev) => ({
                          ...prev,
                          industry: value,
                          includeSampleWorkstations: value ? prev.includeSampleWorkstations : false,
                          includeSampleProcesses: value ? prev.includeSampleProcesses : false,
                          includeSampleJobTemplates: value ? prev.includeSampleJobTemplates : false,
                          includeSampleNcrCodes: value ? prev.includeSampleNcrCodes : false,
                        }));
                      }}
                    >
                      <option value="">None</option>
                      {industries.map((industry) => (
                        <option key={industry.code} value={industry.code}>
                          {industry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="sc-form__check sc-form__wide">
                    <input
                      type="checkbox"
                      checked={form.includeSampleWorkstations}
                      disabled={!form.industry}
                      onChange={setField("includeSampleWorkstations")}
                    />
                    Include sample workstations
                  </label>
                  <label className="sc-form__check sc-form__wide">
                    <input
                      type="checkbox"
                      checked={form.includeSampleProcesses}
                      disabled={!form.industry}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          includeSampleProcesses: checked,
                          includeSampleJobTemplates: checked ? prev.includeSampleJobTemplates : false,
                        }));
                      }}
                    />
                    Include sample processes
                  </label>
                  <label className="sc-form__check sc-form__wide">
                    <input
                      type="checkbox"
                      checked={form.includeSampleJobTemplates}
                      disabled={!form.industry}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          includeSampleJobTemplates: checked,
                          includeSampleProcesses: checked ? true : prev.includeSampleProcesses,
                        }));
                      }}
                    />
                    Include sample job templates and categories
                  </label>
                  <label className="sc-form__check sc-form__wide">
                    <input
                      type="checkbox"
                      checked={form.includeSampleNcrCodes}
                      disabled={!form.industry}
                      onChange={setField("includeSampleNcrCodes")}
                    />
                    Include sample NCR codes
                  </label>
                  <p className="si-muted sc-form__wide">
                    Job templates require sample processes, so that option is selected with them.
                  </p>
                </div>
              </section>
              <section className="sc-section">
                <h3>Security</h3>
                <SupportClientSecurity
                  hideHeading
                  busy={busy}
                  draft={form.security ?? defaultTenantSecurity()}
                  onDraftChange={(next) => setForm((prev) => ({ ...prev, security: next }))}
                />
              </section>
              <div className="support-inbox__reply-actions">
                <button type="button" className="si-btn si-btn--ghost" onClick={() => setCreating(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" className="si-btn si-btn--primary" disabled={busy}>
                  {busy ? "Creating…" : "Create client"}
                </button>
              </div>
            </form>
          )}

          {!creating && !selected && !credentials && (
            <p className="si-muted">Select a client, or choose New client to set one up.</p>
          )}

          {!creating && selected && (
            <>
              <div className="support-inbox__detail-head">
                <div>
                  <div className="support-inbox__detail-id">
                    #{selected.tenantId}
                    {selected.code ? ` · ${selected.code}` : ""} ·{" "}
                    <span className={statusClass(selected.status)}>{selected.status}</span>
                  </div>
                  <h1>{selected.name}</h1>
                  <div className="si-muted">
                    {selected.contactName || "No contact"}
                    {selected.contactEmail ? ` · ${selected.contactEmail}` : ""}
                    {selected.plan ? ` · ${selected.plan}` : ""}
                  </div>
                </div>
                <div className="support-inbox__status-actions">
                  {selected.status === "Provisioning" && (
                    <button type="button" className="si-btn si-btn--primary" disabled={busy} onClick={() => void resume(selected)}>
                      Resume setup
                    </button>
                  )}
                  {(selected.status === "Suspended" || selected.status === "Cancelled") && (
                    <button type="button" className="si-btn si-btn--ghost" disabled={busy} onClick={() => changeStatus(selected, "Active")}>
                      Reactivate
                    </button>
                  )}
                  {selected.status === "Active" && (
                    <button type="button" className="si-btn si-btn--ghost" disabled={busy} onClick={() => changeStatus(selected, "Suspended")}>
                      Suspend
                    </button>
                  )}
                  {selected.status !== "Cancelled" && selected.status !== "Provisioning" && (
                    <button type="button" className="si-btn si-btn--ghost" disabled={busy} onClick={() => changeStatus(selected, "Cancelled")}>
                      Cancel client
                    </button>
                  )}
                </div>
              </div>

              {selected.lastProvisioningError && (
                <div className="support-inbox__description sc-error">
                  <h3>Last setup error</h3>
                  <pre>{selected.lastProvisioningError}</pre>
                </div>
              )}

              <div className="support-inbox__description">
                <h3>Details</h3>
                <dl className="sc-grid">
                  <dt>Tenant ID</dt>
                  <dd>{selected.tenantId}</dd>
                  <dt>Employees</dt>
                  <dd>{selected.userCount}</dd>
                  <dt>Login seats</dt>
                  <dd>
                    {selected.loginSeatLimit != null
                      ? `${selected.usedLoginSeats} of ${selected.loginSeatLimit} used · ${Math.max(0, selected.loginSeatLimit - selected.usedLoginSeats)} available`
                      : "Not set"}
                    <div className="sc-seat-edit">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={seatDraft}
                        onChange={(e) => setSeatDraft(e.target.value)}
                        aria-label="Login seats"
                      />
                      <button
                        type="button"
                        className="si-btn si-btn--ghost"
                        disabled={busy}
                        onClick={() => void saveLoginSeats(selected)}
                      >
                        Save seats
                      </button>
                    </div>
                  </dd>
                  <dt>Created</dt>
                  <dd>
                    {formatWhen(selected.createdUtc)}
                    {selected.createdBy ? ` by ${selected.createdBy}` : ""}
                  </dd>
                  <dt>Ready since</dt>
                  <dd>{formatWhen(selected.provisionedUtc)}</dd>
                  <dt>Status changed</dt>
                  <dd>{formatWhen(selected.statusChangedUtc)}</dd>
                  <dt>Default data</dt>
                  <dd>
                    Version {selected.seedVersion} of {selected.currentSeedVersion}
                    {selected.seedVersion < selected.currentSeedVersion ? " (newer defaults available)" : ""}
                  </dd>
                </dl>
                {selected.notes && (
                  <>
                    <h3 className="sc-subhead">Notes</h3>
                    <pre>{selected.notes}</pre>
                  </>
                )}
              </div>

              <SupportClientMasterData tenant={selected} busy={busy} onTenant={replaceTenant} />

              <div className="support-inbox__description">
                <h3>Default data</h3>
                {securityReady ? (
                  <SupportClientSecurity
                    hideHeading
                    busy={busy}
                    draft={security}
                    onDraftChange={setSecurityNow}
                  />
                ) : (
                  <p className="si-muted">Loading security settings…</p>
                )}
                {applying && <p className="si-muted">Saving security settings and default data…</p>}
                <div className="sc-actions sc-actions--spaced">
                  <button type="button" className="si-btn si-btn--ghost" disabled={busy || !securityReady} onClick={() => applyDefaults(selected)}>
                    {applying ? "Applying…" : "Apply default data"}
                  </button>
                  <button
                    type="button"
                    className="si-btn si-btn--ghost"
                    disabled={busy || selected.status === "Cancelled"}
                    onClick={() => resendInvite(selected)}
                  >
                    Reset administrator password and resend invite
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default SupportClientsPage;
