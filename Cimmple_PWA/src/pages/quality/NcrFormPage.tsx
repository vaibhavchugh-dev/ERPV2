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
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/quality" className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition-transform active:scale-95">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 leading-tight">
              {ncrId > 0 ? "Edit NCR" : "New NCR"}
            </h1>
            <p className="text-xs font-bold tracking-widest text-slate-400 uppercase">
              {ncr.ncrNumber || "Non-Conformance Report"}
            </p>
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700" role="alert">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700" role="status">
          {okMsg}
        </div>
      )}

      <form className="space-y-6" onSubmit={(e) => void handleSave(e)}>
        <section className="card p-6">
          <h2 className="mb-5 text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Basic information
          </h2>
          <div className="space-y-4">
            <label className="field">
              <span className="text-xs font-bold text-slate-500 mb-1 block">Title *</span>
              <input
                className="field-input min-h-12 text-sm font-semibold shadow-sm"
                value={ncr.title || ""}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Brief description of the issue"
                required
              />
            </label>
            
            <div className="grid grid-cols-2 gap-4">
              <label className="field">
                <span className="text-xs font-bold text-slate-500 mb-1 block">Category</span>
                <select
                  className="field-input min-h-12 text-sm font-semibold shadow-sm bg-white"
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
                <span className="text-xs font-bold text-slate-500 mb-1 block">Severity</span>
                <select
                  className="field-input min-h-12 text-sm font-semibold shadow-sm bg-white"
                  value={ncr.severity || "Minor"}
                  onChange={(e) => setField("severity", e.target.value as NCRSeverity)}
                >
                  <option value="Minor">Minor</option>
                  <option value="Major">Major</option>
                  <option value="Critical">Critical</option>
                </select>
              </label>
            </div>
            
            <label className="field">
              <span className="text-xs font-bold text-slate-500 mb-1 block">Source</span>
              <select
                className="field-input min-h-12 text-sm font-semibold shadow-sm bg-white"
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
              <span className="text-xs font-bold text-slate-500 mb-1 block">Description</span>
              <textarea
                className="field-input min-h-[96px] py-3 text-sm font-semibold shadow-sm"
                value={ncr.description || ""}
                onChange={(e) => setField("description", e.target.value)}
                rows={3}
              />
            </label>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-5 text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Job details
          </h2>
          <div className="space-y-4">
            <label className="field">
              <span className="text-xs font-bold text-slate-500 mb-1 block">Job order</span>
              <select
                className="field-input min-h-12 text-sm font-semibold shadow-sm bg-white"
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
            
            <div className="grid grid-cols-2 gap-4">
              <label className="field">
                <span className="text-xs font-bold text-slate-500 mb-1 block">Part number</span>
                <input
                  className="field-input min-h-12 text-sm font-semibold shadow-sm"
                  value={ncr.partNo || ""}
                  onChange={(e) => setField("partNo", e.target.value)}
                  readOnly={!!ncr.jobOrderId}
                />
              </label>
              <label className="field">
                <span className="text-xs font-bold text-slate-500 mb-1 block">Customer</span>
                <input className="field-input min-h-12 text-sm font-semibold shadow-sm" value={ncr.customerName || ""} readOnly />
              </label>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-5 text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Defect details
          </h2>
          <div className="space-y-4">
            <label className="field">
              <span className="text-xs font-bold text-slate-500 mb-1 block">Defect location</span>
              <input
                className="field-input min-h-12 text-sm font-semibold shadow-sm"
                value={ncr.defectLocation || ""}
                onChange={(e) => setField("defectLocation", e.target.value)}
              />
            </label>
            
            <div className="grid grid-cols-2 gap-4">
              <label className="field">
                <span className="text-xs font-bold text-slate-500 mb-1 block">Defect qty</span>
                <input
                  className="field-input min-h-12 text-sm font-semibold shadow-sm"
                  type="number"
                  min={0}
                  value={ncr.defectQuantity ?? 0}
                  onChange={(e) => setField("defectQuantity", Number(e.target.value))}
                />
              </label>
              <label className="field">
                <span className="text-xs font-bold text-slate-500 mb-1 block">Total qty</span>
                <input
                  className="field-input min-h-12 text-sm font-semibold shadow-sm"
                  type="number"
                  min={0}
                  value={ncr.totalQuantity ?? 0}
                  onChange={(e) => setField("totalQuantity", Number(e.target.value))}
                />
              </label>
            </div>
            
            <label className="field">
              <span className="text-xs font-bold text-slate-500 mb-1 block">Photos</span>
              <input
                className="field-input py-2.5 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:text-white file:px-4 file:py-1.5 file:text-xs file:font-bold shadow-sm"
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                onChange={(e) =>
                  setPendingFiles(e.target.files ? Array.from(e.target.files) : [])
                }
              />
              {pendingFiles.length > 0 && (
                <span className="mt-1 block text-xs font-semibold text-slate-500">
                  {pendingFiles.length} file(s) will upload on save
                </span>
              )}
              {(ncr.photos?.length || 0) > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {ncr.photos!.map((photo, index) => (
                    <div key={`${photo}-${index}`} className="relative overflow-hidden rounded-xl border border-slate-200">
                      <img src={photo} alt="" className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-white backdrop-blur-sm"
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
          </div>
        </section>

        <section className="card p-6">
          <h2 className="mb-5 text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Root cause & actions
          </h2>
          <div className="space-y-4">
            <label className="field">
              <span className="text-xs font-bold text-slate-500 mb-1 block">Root cause category</span>
              <select
                className="field-input min-h-12 text-sm font-semibold shadow-sm bg-white"
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
              <span className="text-xs font-bold text-slate-500 mb-1 block">Root cause</span>
              <textarea
                className="field-input min-h-[80px] py-3 text-sm font-semibold shadow-sm"
                value={ncr.rootCause || ""}
                onChange={(e) => setField("rootCause", e.target.value)}
                rows={2}
              />
            </label>
            
            <label className="field">
              <span className="text-xs font-bold text-slate-500 mb-1 block">Immediate action</span>
              <textarea
                className="field-input min-h-[80px] py-3 text-sm font-semibold shadow-sm"
                value={ncr.immediateAction || ""}
                onChange={(e) => setField("immediateAction", e.target.value)}
                rows={2}
              />
            </label>
          </div>
        </section>

        <button type="submit" className="btn btn-primary w-full h-14 rounded-full text-[1.05rem] font-black shadow-lg" disabled={saving}>
          {saving ? "Saving…" : ncrId > 0 ? "Save NCR" : "Create NCR"}
        </button>
      </form>
    </div>
  );
}
