import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useFormatting } from "../Common/Hooks/useFormatting";
import { SYSTEM_TIMEZONE_OPTIONS } from "../Common/Utils/defaultSystemSettings";
import SupportHeader from "./SupportHeader";
import {
  apiError,
  PlatformTenantService,
  ProvisionTenantRequest,
  SeedStepResult,
  TenantStatus,
  TenantSummary,
} from "./PlatformTenantService";
import "./SupportInbox.scss";

const emptyForm: ProvisionTenantRequest = {
  companyName: "",
  code: "",
  plan: "",
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
    if (!window.confirm(`Add any missing default data (roles, permissions, chart of accounts, categories, NCR codes, payment terms) for ${tenant.name}? Existing records are not changed.`)) {
      return;
    }
    void runAction("Apply defaults", async () => {
      const result = await PlatformTenantService.applyDefaults(tenant.tenantId);
      replaceTenant(result.tenant);
      if (result.success) toast.success(`Defaults applied. ${stepSummary(result.steps)}`);
      else toast.error(result.error || "Applying defaults failed.");
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
                  Administrator first name *
                  <input value={form.adminFirstName} onChange={setField("adminFirstName")} required />
                </label>
                <label>
                  Administrator last name *
                  <input value={form.adminLastName} onChange={setField("adminLastName")} required />
                </label>
                <label>
                  Administrator email *
                  <input type="email" value={form.adminEmail} onChange={setField("adminEmail")} required />
                </label>
                <label>
                  Administrator username
                  <input
                    value={form.adminUserName}
                    onChange={setField("adminUserName")}
                    maxLength={100}
                    placeholder="Defaults to the email"
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
                  <input value={form.currency} onChange={setField("currency")} maxLength={3} />
                </label>
                <label>
                  Currency symbol
                  <input value={form.currencySymbol} onChange={setField("currencySymbol")} maxLength={5} />
                </label>
                <label className="sc-form__wide">
                  Internal notes
                  <textarea rows={3} value={form.notes} onChange={setField("notes")} maxLength={2000} />
                </label>
                <label className="sc-form__check sc-form__wide">
                  <input type="checkbox" checked={form.sendInviteEmail} onChange={setField("sendInviteEmail")} />
                  Email the administrator their sign-in details
                </label>
              </div>
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
                  <dt>Users</dt>
                  <dd>{selected.userCount}</dd>
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

              <div className="support-inbox__description">
                <h3>Maintenance</h3>
                <div className="sc-actions">
                  <button type="button" className="si-btn si-btn--ghost" disabled={busy} onClick={() => applyDefaults(selected)}>
                    Apply default data
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
