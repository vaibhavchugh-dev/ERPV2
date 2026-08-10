import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthService } from "../../services/authService";
import {
  JobOrderListItem,
  JobOrderService,
} from "../../services/jobOrderService";
import {
  emptyNcrDraft,
  NonConformanceReport,
  NCRCategory,
  NCRSeverity,
  QualityService,
  RootCauseCategory,
} from "../../services/qualityService";

export function NcrFormPage() {
  const { ncrId: ncrIdParam } = useParams<{ ncrId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !ncrIdParam || ncrIdParam === "new";
  const ncrId = isNew ? 0 : Number(ncrIdParam);

  const [ncr, setNcr] = useState<Partial<NonConformanceReport>>(emptyNcrDraft());
  const [jobOrders, setJobOrders] = useState<JobOrderListItem[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const setField = <K extends keyof NonConformanceReport>(
    field: K,
    value: NonConformanceReport[K]
  ) => {
    setNcr((prev) => ({ ...prev, [field]: value }));
  };

  const loadJobOrders = useCallback(async () => {
    try {
      const list = await JobOrderService.getJobOrders();
      setJobOrders(list);
      return list;
    } catch {
      setJobOrders([]);
      return [] as JobOrderListItem[];
    }
  }, []);

  const applyJobOrder = (job: JobOrderListItem | undefined) => {
    if (!job) return;
    setNcr((prev) => ({
      ...prev,
      jobOrderId: job.jobOrderID,
      jobOrderNumber: String(job.jobOrderNumber || job.jobNumber || ""),
      partNo: job.partNo,
      partName: job.partName,
      customerId: job.customerID,
      customerName: job.customerName,
      totalQuantity: prev.totalQuantity || job.qtyOrdered || 0,
    }));
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const jobs = await loadJobOrders();
      if (cancelled) return;

      const prefillJobId = Number(searchParams.get("jobOrderId") || 0);
      if (isNew && prefillJobId > 0) {
        applyJobOrder(jobs.find((j) => j.jobOrderID === prefillJobId));
      }

      if (!isNew && ncrId > 0) {
        setLoading(true);
        setError("");
        try {
          const detail = await QualityService.getNCRById(ncrId);
          if (!detail) {
            setError("NCR not found");
          } else if (!cancelled) {
            setNcr(detail);
          }
        } catch (err: unknown) {
          const ax = err as {
            response?: { data?: { error?: { message?: string }; message?: string } };
            message?: string;
          };
          if (!cancelled) {
            setError(
              ax?.response?.data?.error?.message ||
                ax?.response?.data?.message ||
                ax?.message ||
                "Failed to load NCR"
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNew, ncrId, loadJobOrders, searchParams]);

  const handleJobChange = (jobOrderId: number) => {
    if (!jobOrderId) {
      setNcr((prev) => ({
        ...prev,
        jobOrderId: undefined,
        jobOrderNumber: undefined,
        partNo: "",
        partName: "",
        customerId: undefined,
        customerName: "",
      }));
      return;
    }
    applyJobOrder(jobOrders.find((j) => j.jobOrderID === jobOrderId));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setOkMsg("");

    if (!ncr.title?.trim()) {
      setError("Please provide a title for the NCR");
      return;
    }

    const tenantId = AuthService.getTenantId();
    const userId = AuthService.getUserId();
    if (tenantId <= 0) {
      setError("Invalid session. Please log out and log back in.");
      return;
    }

    setSaving(true);
    try {
      const ncrData: Partial<NonConformanceReport> = {
        ...ncr,
        tenantId,
        status: ncr.status || "Open",
        reportedBy: ncr.reportedBy || userId,
        reportedDate: ncr.reportedDate || new Date().toISOString(),
        description: ncr.description || "",
        defectLocation: ncr.defectLocation || "",
        defectDescription: ncr.defectDescription || "",
        partNo: ncr.partNo || "",
        partName: ncr.partName || "",
        customerName: ncr.customerName || "",
        jobOrderNumber: ncr.jobOrderNumber || "",
        rootCause: ncr.rootCause || "",
        rootCauseCategory: ncr.rootCauseCategory || "Other",
        immediateAction: ncr.immediateAction || "",
        correctiveAction: ncr.correctiveAction || "",
        preventiveAction: ncr.preventiveAction || "",
        notes: ncr.notes || "",
        defectQuantity: ncr.defectQuantity ?? 0,
        totalQuantity: ncr.totalQuantity ?? 0,
        costImpact: ncr.costImpact ?? 0,
        // Omit invalid optional FKs (API treats <=0 as null)
        jobOrderId: ncr.jobOrderId && ncr.jobOrderId > 0 ? ncr.jobOrderId : undefined,
        customerId: ncr.customerId && ncr.customerId > 0 ? ncr.customerId : undefined,
        routingStepId:
          ncr.routingStepId && ncr.routingStepId > 0 ? ncr.routingStepId : undefined,
        dueDate: ncr.dueDate?.trim() || undefined,
        investigatedDate: ncr.investigatedDate?.trim() || undefined,
        approvedDate: ncr.approvedDate?.trim() || undefined,
        closedDate: ncr.closedDate?.trim() || undefined,
      };

      if (ncrId > 0) {
        const ok = await QualityService.updateNCR(ncrId, ncrData);
        if (!ok) throw new Error("Failed to update NCR");

        if (pendingFiles.length > 0) {
          const urls = await QualityService.uploadNCRPhotos(ncrId, pendingFiles);
          if (urls.length) {
            await QualityService.updateNCR(ncrId, {
              photos: [...(ncr.photos || []), ...urls],
            });
          }
          setPendingFiles([]);
        }

        setOkMsg("NCR updated successfully");
        const refreshed = await QualityService.getNCRById(ncrId);
        if (refreshed) setNcr(refreshed);
      } else {
        const created = await QualityService.createNCR(
          ncrData as Omit<NonConformanceReport, "ncrId" | "ncrNumber">
        );
        if (!created?.ncrId) throw new Error("Failed to create NCR");

        if (pendingFiles.length > 0) {
          const urls = await QualityService.uploadNCRPhotos(created.ncrId, pendingFiles);
          if (urls.length) {
            await QualityService.updateNCR(created.ncrId, {
              photos: [...(created.photos || []), ...urls],
            });
          }
        }

        navigate(`/quality/${created.ncrId}`, { replace: true });
      }
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { error?: { message?: string }; message?: string } };
        message?: string;
      };
      setError(
        ax?.response?.data?.error?.message ||
          ax?.response?.data?.message ||
          ax?.message ||
          "Failed to save NCR"
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-slate-500">Loading NCR…</div>;
  }

  return (
    <div>
      <Link to="/quality" className="mb-3 inline-flex min-h-10 items-center font-semibold text-accent">
        ← Quality
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {ncrId > 0 ? "Edit NCR" : "New NCR"}
        </h1>
        {ncr.ncrNumber && (
          <p className="mt-1 text-sm font-semibold text-slate-500">{ncr.ncrNumber}</p>
        )}
      </div>

      <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
        You can save with a title only and complete the rest later.
      </p>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700" role="status">
          {okMsg}
        </div>
      )}

      <form className="space-y-4" onSubmit={(e) => void handleSave(e)}>
        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Basic information
          </h2>
          <label className="field">
            <span>Title *</span>
            <input
              className="field-input"
              value={ncr.title || ""}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Brief description of the issue"
              required
            />
          </label>
          <label className="field">
            <span>Source</span>
            <select
              className="field-input"
              value={ncr.source || "Internal"}
              onChange={(e) =>
                setField("source", e.target.value as NonConformanceReport["source"])
              }
            >
              <option value="Internal">Internal</option>
              <option value="External">External</option>
              <option value="Customer">Customer</option>
            </select>
          </label>
          <label className="field">
            <span>Category</span>
            <select
              className="field-input"
              value={ncr.category || "Other"}
              onChange={(e) => setField("category", e.target.value as NCRCategory)}
            >
              <option value="Material_Defect">Material Defect</option>
              <option value="Dimensional_Issue">Dimensional Issue</option>
              <option value="Process_Failure">Process Failure</option>
              <option value="Equipment_Problem">Equipment Problem</option>
              <option value="Documentation_Error">Documentation Error</option>
              <option value="Supplier_Quality">Supplier Quality</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>Severity</span>
            <select
              className="field-input"
              value={ncr.severity || "Minor"}
              onChange={(e) => setField("severity", e.target.value as NCRSeverity)}
            >
              <option value="Minor">Minor</option>
              <option value="Major">Major</option>
              <option value="Critical">Critical</option>
            </select>
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              className="field-input min-h-[96px] py-3"
              value={ncr.description || ""}
              onChange={(e) => setField("description", e.target.value)}
              rows={3}
            />
          </label>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Job order
          </h2>
          <label className="field">
            <span>Job order</span>
            <select
              className="field-input"
              value={ncr.jobOrderId || ""}
              onChange={(e) => handleJobChange(Number(e.target.value) || 0)}
            >
              <option value="">Select job order</option>
              {jobOrders.map((jo) => (
                <option key={jo.jobOrderID} value={jo.jobOrderID}>
                  JO#{jo.jobOrderNumber} — {jo.partNo}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Part number</span>
            <input
              className="field-input"
              value={ncr.partNo || ""}
              onChange={(e) => setField("partNo", e.target.value)}
              readOnly={!!ncr.jobOrderId}
            />
          </label>
          <label className="field">
            <span>Part name</span>
            <input
              className="field-input"
              value={ncr.partName || ""}
              onChange={(e) => setField("partName", e.target.value)}
              readOnly={!!ncr.jobOrderId}
            />
          </label>
          <label className="field">
            <span>Customer</span>
            <input className="field-input" value={ncr.customerName || ""} readOnly />
          </label>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Defect details
          </h2>
          <label className="field">
            <span>Defect location</span>
            <input
              className="field-input"
              value={ncr.defectLocation || ""}
              onChange={(e) => setField("defectLocation", e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span>Defect qty</span>
              <input
                className="field-input"
                type="number"
                min={0}
                value={ncr.defectQuantity ?? 0}
                onChange={(e) => setField("defectQuantity", Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span>Total qty</span>
              <input
                className="field-input"
                type="number"
                min={0}
                value={ncr.totalQuantity ?? 0}
                onChange={(e) => setField("totalQuantity", Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            <span>Due date</span>
            <input
              className="field-input"
              type="date"
              value={ncr.dueDate ? ncr.dueDate.slice(0, 10) : ""}
              onChange={(e) => setField("dueDate", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Defect description</span>
            <textarea
              className="field-input min-h-[80px] py-3"
              value={ncr.defectDescription || ""}
              onChange={(e) => setField("defectDescription", e.target.value)}
              rows={2}
            />
          </label>
          <label className="field">
            <span>Photos</span>
            <input
              className="field-input py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold"
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={(e) =>
                setPendingFiles(e.target.files ? Array.from(e.target.files) : [])
              }
            />
            {pendingFiles.length > 0 && (
              <span className="text-xs font-normal text-slate-500">
                {pendingFiles.length} file(s) will upload on save
              </span>
            )}
            {(ncr.photos?.length || 0) > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {ncr.photos!.map((photo, index) => (
                  <div key={`${photo}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200">
                    <img src={photo} alt="" className="h-20 w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-xs text-white"
                      onClick={() =>
                        setField(
                          "photos",
                          (ncr.photos || []).filter((_, i) => i !== index)
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </label>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
            Root cause & actions
          </h2>
          <label className="field">
            <span>Root cause category</span>
            <select
              className="field-input"
              value={ncr.rootCauseCategory || "Other"}
              onChange={(e) =>
                setField("rootCauseCategory", e.target.value as RootCauseCategory)
              }
            >
              <option value="Man">Man</option>
              <option value="Machine">Machine</option>
              <option value="Material">Material</option>
              <option value="Method">Method</option>
              <option value="Measurement">Measurement</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="field">
            <span>Root cause</span>
            <textarea
              className="field-input min-h-[80px] py-3"
              value={ncr.rootCause || ""}
              onChange={(e) => setField("rootCause", e.target.value)}
              rows={2}
            />
          </label>
          <label className="field">
            <span>Immediate action</span>
            <textarea
              className="field-input min-h-[72px] py-3"
              value={ncr.immediateAction || ""}
              onChange={(e) => setField("immediateAction", e.target.value)}
              rows={2}
            />
          </label>
          <label className="field">
            <span>Corrective action</span>
            <textarea
              className="field-input min-h-[72px] py-3"
              value={ncr.correctiveAction || ""}
              onChange={(e) => setField("correctiveAction", e.target.value)}
              rows={2}
            />
          </label>
          <label className="field">
            <span>Preventive action</span>
            <textarea
              className="field-input min-h-[72px] py-3"
              value={ncr.preventiveAction || ""}
              onChange={(e) => setField("preventiveAction", e.target.value)}
              rows={2}
            />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea
              className="field-input min-h-[72px] py-3"
              value={ncr.notes || ""}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
            />
          </label>
        </section>

        <button type="submit" className="btn btn-primary w-full" disabled={saving}>
          {saving ? "Saving…" : ncrId > 0 ? "Save NCR" : "Create NCR"}
        </button>
      </form>
    </div>
  );
}
