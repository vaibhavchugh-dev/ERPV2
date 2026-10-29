import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import {
  apiError,
  MasterApplyBatch,
  MasterImportResult,
  MasterSetupOverview,
  PlatformTenantService,
  TenantSummary,
} from "./PlatformTenantService";

const MASTERS: { key: "workstations" | "processes" | "jobTemplates" | "categories" | "ncrCodes"; label: string; file: boolean }[] = [
  { key: "workstations", label: "Workstations", file: true },
  { key: "processes", label: "Processes", file: true },
  { key: "jobTemplates", label: "Job templates", file: true },
  { key: "categories", label: "Categories", file: true },
  { key: "ncrCodes", label: "NCR codes", file: true },
];

function summarize(result: MasterImportResult): string {
  return `${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`;
}

function masterLabel(key: string): string {
  return MASTERS.find((m) => m.key === key)?.label || key;
}

function batchText(batch: MasterApplyBatch): string {
  return (batch.results || []).map((r) => `${masterLabel(r.master)}: ${summarize(r)}`).join("; ");
}

interface Props {
  tenant: TenantSummary;
  busy: boolean;
  onTenant: (tenant: TenantSummary | null | undefined) => void;
}

const SupportClientMasterData: React.FC<Props> = ({ tenant, busy, onTenant }) => {
  const [industries, setIndustries] = useState<{ code: string; label: string }[]>([]);
  const [industry, setIndustry] = useState(tenant.industry || "");
  const [overview, setOverview] = useState<MasterSetupOverview | null>(null);
  const [preview, setPreview] = useState<{ title: string; batch: MasterApplyBatch; confirm: () => Promise<void> } | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await PlatformTenantService.masterSetup(tenant.tenantId));
    } catch (err: any) {
      toast.error(apiError(err, "Failed to load master data."));
    }
  }, [tenant.tenantId]);

  useEffect(() => {
    setIndustry(tenant.industry || "");
    setPreview(null);
    void load();
  }, [tenant.tenantId, tenant.industry, load]);

  useEffect(() => {
    void PlatformTenantService.industries().then(setIndustries).catch(() => undefined);
  }, []);

  const locked = busy || working;

  const saveIndustry = async (value: string) => {
    setIndustry(value);
    setWorking(true);
    try {
      onTenant(await PlatformTenantService.setIndustry(tenant.tenantId, value));
    } catch (err: any) {
      toast.error(apiError(err, "Could not save the industry."));
      setIndustry(tenant.industry || "");
    } finally {
      setWorking(false);
    }
  };

  const loadSample = async (masters: string[]) => {
    if (!industry) {
      toast.error("Choose an industry first.");
      return;
    }
    const label = masters.length === 1 ? masterLabel(masters[0]) : "the selected industry samples";
    if (!window.confirm(`Load the ${industry} sample for ${label}? Existing records are left as they are.`)) return;
    setWorking(true);
    try {
      const batch = await PlatformTenantService.applySamples(tenant.tenantId, industry, masters);
      if (batch.success) toast.success(batchText(batch) || "Sample data loaded.");
      else toast.warning(batch.error || batchText(batch));
      await load();
    } catch (err: any) {
      toast.error(apiError(err, "Sample data failed."));
    } finally {
      setWorking(false);
    }
  };

  const stageFile = async (master: string, file: File) => {
    setWorking(true);
    try {
      const result = await PlatformTenantService.previewMasterFile(tenant.tenantId, master, file);
      setPreview({
        title: `${file.name}`,
        batch: { success: result.failed === 0, results: [result] },
        confirm: async () => {
          const saved = await PlatformTenantService.importMasterFile(tenant.tenantId, master, file);
          if (saved.failed === 0) toast.success(summarize(saved));
          else toast.warning(summarize(saved));
          setPreview(null);
          await load();
        },
      });
    } catch (err: any) {
      toast.error(apiError(err, "Could not read the file."));
    } finally {
      setWorking(false);
    }
  };

  const stageWorkbook = async (file: File) => {
    setWorking(true);
    try {
      const batch = await PlatformTenantService.previewWorkbook(tenant.tenantId, file);
      setPreview({
        title: file.name,
        batch,
        confirm: async () => {
          const saved = await PlatformTenantService.importWorkbook(tenant.tenantId, file);
          if (saved.success) toast.success(batchText(saved));
          else toast.warning(saved.error || batchText(saved));
          setPreview(null);
          await load();
        },
      });
    } catch (err: any) {
      toast.error(apiError(err, "Could not read the workbook."));
    } finally {
      setWorking(false);
    }
  };

  const confirmPreview = async () => {
    if (!preview) return;
    setWorking(true);
    try {
      await preview.confirm();
    } catch (err: any) {
      toast.error(apiError(err, "Import failed."));
    } finally {
      setWorking(false);
    }
  };

  const countFor = (key: string) => {
    if (!overview) return null;
    if (key === "workstations") return overview.workstations;
    if (key === "processes") return overview.processes;
    if (key === "categories") return overview.categories;
    if (key === "ncrCodes") return overview.ncrCodes;
    return overview.jobTemplates;
  };

  return (
    <div className="support-inbox__description">
      <h3>Master data</h3>
      <p className="si-muted">
        Sample workstations, processes, job templates, categories, and NCR codes follow the selected industry.
        Customers, vendors, and employees stay empty until the client imports its own files.
      </p>
      <div className="sc-actions" style={{ marginBottom: "0.75rem" }}>
        <label>
          Industry
          <select value={industry} disabled={locked} onChange={(e) => void saveIndustry(e.target.value)}>
            <option value="">None</option>
            {industries.map((i) => (
              <option key={i.code} value={i.code}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="si-btn si-btn--ghost" disabled={locked || !industry} onClick={() => void loadSample(MASTERS.map((m) => m.key))}>
          Load all samples
        </button>
        <label className="si-btn si-btn--ghost" style={{ cursor: locked ? "wait" : "pointer" }}>
          Upload workbook
          <input
            type="file"
            accept=".xlsx,.xlsm"
            hidden
            disabled={locked}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void stageWorkbook(file);
            }}
          />
        </label>
      </div>

      {MASTERS.map((master) => {
        const count = countFor(master.key);
        return (
          <div key={master.key} className="sc-master-row">
            <div>
              <strong>{master.label}</strong>
              <div className="si-muted">
                {count ? `${count.count} on file` : "…"}
                {count?.lastSource ? ` · last ${count.lastSource.toLowerCase()}: ${count.lastCreated} created, ${count.lastFailed} failed` : ""}
              </div>
            </div>
            <div className="sc-actions">
              <button type="button" className="si-btn si-btn--ghost" disabled={locked || !industry} onClick={() => void loadSample([master.key])}>
                Load sample
              </button>
              {master.file && (
                <>
                  <button type="button" className="si-btn si-btn--ghost" disabled={locked} onClick={() => void PlatformTenantService.downloadTemplate(master.key)}>
                    Template
                  </button>
                  <label className="si-btn si-btn--ghost" style={{ cursor: locked ? "wait" : "pointer" }}>
                    Upload
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xlsm,text/csv"
                      hidden
                      disabled={locked}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void stageFile(master.key, file);
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        );
      })}

      {preview && (
        <div className="sc-credentials" style={{ marginTop: "0.85rem" }}>
          <h3>Preview · {preview.title}</h3>
          {(preview.batch.results || []).map((result) => (
            <div key={result.master} style={{ marginBottom: "0.6rem" }}>
              <strong>{masterLabel(result.master)}</strong>
              <div>{summarize(result)}</div>
              {(result.issues || []).slice(0, 12).map((issue, index) => (
                <div key={`${issue.rowNumber}-${index}`} className="si-muted">
                  {issue.rowNumber > 0 ? `Row ${issue.rowNumber}: ` : ""}
                  {issue.message}
                </div>
              ))}
            </div>
          ))}
          <div className="sc-actions">
            <button type="button" className="si-btn si-btn--ghost" disabled={locked} onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button type="button" className="si-btn si-btn--primary" disabled={locked} onClick={() => void confirmPreview()}>
              {working ? "Importing…" : "Import these rows"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupportClientMasterData;
