import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthService } from "../../services/authService";
import {
  JobOrderListItem,
  JobOrderRoutingStep,
  JobOrderService,
} from "../../services/jobOrderService";
import {
  CustomerOption,
  EmployeeOption,
  employeeDisplayName,
  NcrCodeOption,
  NcrLookupService,
  VendorOption,
  VendorOrderOption,
} from "../../services/ncrLookupService";
import {
  emptyNcrDraft,
  NonConformanceReport,
  NCRCategory,
  NCRSeverity,
  NCRStatus,
  QualityService,
  resolveNcrPhotoUrl,
  RootCauseCategory,
} from "../../services/qualityService";
import { formatJobNumber } from "../../utils/formatJobNumber";

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];

const STATUS_OPTIONS: { value: NCRStatus; label: string }[] = [
  { value: "Open", label: "Open" },
  { value: "Under_Investigation", label: "Under Investigation" },
  { value: "Pending_Approval", label: "Pending Approval" },
  { value: "Approved", label: "Approved" },
  { value: "Implemented", label: "Implemented" },
  { value: "Closed", label: "Closed" },
  { value: "Rejected", label: "Rejected" },
];

export function NcrFormPage() {
  const { ncrId: ncrIdParam } = useParams<{ ncrId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !ncrIdParam || ncrIdParam === "new";
  const ncrId = isNew ? 0 : Number(ncrIdParam);

  const [ncr, setNcr] = useState<Partial<NonConformanceReport>>(emptyNcrDraft());
  const [jobOrders, setJobOrders] = useState<JobOrderListItem[]>([]);
  const [routingSteps, setRoutingSteps] = useState<JobOrderRoutingStep[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorOrders, setVendorOrders] = useState<VendorOrderOption[]>([]);
  const [ncrCodes, setNcrCodes] = useState<NcrCodeOption[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [photoWarn, setPhotoWarn] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const fromJobOrderId = Number(searchParams.get("jobOrderId") || 0);
  const fromStepId = Number(searchParams.get("stepId") || 0);
  const returnTo = searchParams.get("returnTo") || "";

  const setField = <K extends keyof NonConformanceReport>(
    field: K,
    value: NonConformanceReport[K]
  ) => {
    setNcr((prev) => ({ ...prev, [field]: value }));
  };

  const vendorPoOptions = useMemo(() => {
    if (ncr.vendorId && ncr.vendorId > 0) {
      return vendorOrders.filter((o) => o.vendorID === ncr.vendorId);
    }
    return vendorOrders;
  }, [vendorOrders, ncr.vendorId]);

  const loadRoutingSteps = useCallback(async (jobOrderId: number) => {
    if (!jobOrderId) {
      setRoutingSteps([]);
      return;
    }
    try {
      const detail = await JobOrderService.getJobOrderById(jobOrderId);
      setRoutingSteps(detail?.RoutingSteps || []);
    } catch {
      setRoutingSteps([]);
    }
  }, []);

  const applyJobOrder = useCallback(
    (job: JobOrderListItem | undefined, clearStep = true) => {
      if (!job) return;
      setNcr((prev) => ({
        ...prev,
        jobOrderId: job.jobOrderID,
        jobOrderNumber: String(job.jobOrderNumber || job.jobNumber || ""),
        partNo: job.partNo,
        partName: job.partName,
        customerId: job.customerID,
        customerName: job.customerName,
        totalQuantity:
          prev.totalQuantity && prev.totalQuantity > 0
            ? prev.totalQuantity
            : job.qtyOrdered || 0,
        ...(clearStep ? { routingStepId: undefined } : {}),
      }));
      void loadRoutingSteps(job.jobOrderID);
    },
    [loadRoutingSteps]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const tenantId = AuthService.getTenantId();
      try {
        const [jobs, emps, custs, vends, vos, codes] = await Promise.all([
          JobOrderService.getJobOrders(),
          NcrLookupService.getEmployees().catch(() => [] as EmployeeOption[]),
          NcrLookupService.getCustomers().catch(() => [] as CustomerOption[]),
          NcrLookupService.getVendors().catch(() => [] as VendorOption[]),
          NcrLookupService.getVendorOrders().catch(() => [] as VendorOrderOption[]),
          NcrLookupService.getNcrCodes().catch(() => [] as NcrCodeOption[]),
        ]);
        if (cancelled) return;
        setJobOrders(jobs);
        setEmployees(emps);
        setCustomers(custs);
        setVendors(vends);
        setVendorOrders(vos);
        setNcrCodes(codes);

        if (isNew) {
          const draft = emptyNcrDraft();
          const userId = AuthService.getUserId();
          draft.reportedBy = userId;
          draft.reportedByName = AuthService.getUserName();
          draft.tenantId = tenantId;

          if (fromJobOrderId > 0) {
            const job = jobs.find((j) => j.jobOrderID === fromJobOrderId);
            if (job) {
              draft.jobOrderId = job.jobOrderID;
              draft.jobOrderNumber = String(job.jobOrderNumber || job.jobNumber || "");
              draft.partNo = job.partNo;
              draft.partName = job.partName;
              draft.customerId = job.customerID;
              draft.customerName = job.customerName;
              draft.totalQuantity = job.qtyOrdered || 0;
            }
            if (fromStepId > 0) {
              draft.routingStepId = fromStepId;
              draft.category = "Process_Failure";
              draft.defectQuantity = 1;
              draft.source = "Internal";
              draft.severity = "Minor";
              draft.status = "Open";
              try {
                const detail = await JobOrderService.getJobOrderById(fromJobOrderId);
                if (!cancelled && detail) {
                  const step = detail.RoutingSteps?.find((s) => s.id === fromStepId);
                  const joLabel = formatJobNumber(
                    detail.JobOrderNumber || detail.JobNumber || detail.JobOrderID
                  );
                  draft.title = step
                    ? `NCR — ${joLabel} / Step ${step.sequence}: ${step.processName}`
                    : `NCR — ${joLabel}`;
                  draft.defectLocation = step?.processName || "";
                  draft.partNo = detail.PartNo || draft.partNo;
                  draft.partName = detail.PartName || draft.partName;
                  draft.customerId = detail.CustomerID || draft.customerId;
                  draft.customerName = detail.CustomerName || draft.customerName;
                  draft.totalQuantity = detail.QtyOrdered || draft.totalQuantity || 0;
                  draft.jobOrderNumber = String(detail.JobOrderNumber || "");
                  setRoutingSteps(detail.RoutingSteps || []);
                }
              } catch {
                /* keep list-level prefill */
              }
            } else if (job) {
              void loadRoutingSteps(job.jobOrderID);
            }
          }
          if (!cancelled) setNcr(draft);
        }
      } catch {
        /* lookups optional for edit load */
      }

      if (!isNew && ncrId > 0) {
        setLoading(true);
        setError("");
        try {
          const detail = await QualityService.getNCRById(ncrId);
          if (!detail) {
            if (!cancelled) setError("NCR not found");
          } else if (!cancelled) {
            setNcr(detail);
            if (detail.jobOrderId && detail.jobOrderId > 0) {
              void loadRoutingSteps(detail.jobOrderId);
            }
          }
        } catch (err: unknown) {
          const ax = err as { message?: string };
          if (!cancelled) setError(ax?.message || "Failed to load NCR");
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNew, ncrId, fromJobOrderId, fromStepId, loadRoutingSteps]);

  const handleJobChange = (jobOrderId: number) => {
    if (!jobOrderId) {
      setNcr((prev) => ({
        ...prev,
        jobOrderId: undefined,
        jobOrderNumber: undefined,
        routingStepId: undefined,
        partNo: "",
        partName: "",
        customerId: undefined,
        customerName: "",
      }));
      setRoutingSteps([]);
      return;
    }
    applyJobOrder(jobOrders.find((j) => j.jobOrderID === jobOrderId), true);
  };

  const handleSourceChange = (source: NonConformanceReport["source"]) => {
    setNcr((prev) => ({
      ...prev,
      source,
      ...(source !== "External"
        ? {
            vendorId: 0,
            vendorName: "",
            vendorOrderId: 0,
            poNumber: "",
          }
        : {}),
    }));
  };

  const handleReportedByChange = (id: number) => {
    const emp = employees.find((e) => e.user_UniqueID === id);
    setNcr((prev) => ({
      ...prev,
      reportedBy: id,
      reportedByName: employeeDisplayName(emp) || AuthService.getUserName(),
    }));
  };

  const handleInvestigatorChange = (id: number) => {
    const emp = employees.find((e) => e.user_UniqueID === id);
    setNcr((prev) => ({
      ...prev,
      investigatedBy: id > 0 ? id : undefined,
      investigatedByName: id > 0 ? employeeDisplayName(emp) : "",
      investigatedDate:
        id > 0 && !prev.investigatedDate
          ? new Date().toISOString()
          : prev.investigatedDate,
    }));
  };

  const handleApproverChange = (id: number) => {
    const emp = employees.find((e) => e.user_UniqueID === id);
    setNcr((prev) => ({
      ...prev,
      approvedBy: id > 0 ? id : undefined,
      approvedByName: id > 0 ? employeeDisplayName(emp) : "",
      approvedDate:
        id > 0 && !prev.approvedDate ? new Date().toISOString() : prev.approvedDate,
    }));
  };

  const handleFileChange = (files: FileList | null) => {
    setPhotoWarn("");
    if (!files?.length) {
      setPendingFiles([]);
      return;
    }
    const existing = ncr.photos?.length || 0;
    const next: File[] = [];
    for (const file of Array.from(files)) {
      if (!PHOTO_TYPES.includes(file.type) && !file.type.startsWith("image/")) {
        setPhotoWarn("Only image files are allowed (JPEG, PNG, GIF, WebP, BMP)");
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setPhotoWarn("Each photo must be 8MB or smaller");
        continue;
      }
      if (existing + next.length >= MAX_PHOTOS) {
        setPhotoWarn(`Maximum ${MAX_PHOTOS} photos`);
        break;
      }
      next.push(file);
    }
    setPendingFiles(next);
  };

  const linkNcrToJobStep = async (created: NonConformanceReport) => {
    if (fromJobOrderId <= 0 || fromStepId <= 0 || !created.ncrId) return;
    try {
      const detail = await JobOrderService.getJobOrderById(fromJobOrderId);
      if (!detail?.RoutingSteps) return;
      const updatedSteps = detail.RoutingSteps.map((s) =>
        Number(s.id) === fromStepId
          ? {
              ...s,
              ncrFlags: [
                {
                  ncrId: created.ncrId,
                  ncrNumber: created.ncrNumber || `NCR-${created.ncrId}`,
                  status: created.status || "Open",
                },
              ],
            }
          : s
      );
      await JobOrderService.saveJobOrder({
        ...detail,
        RoutingSteps: updatedSteps,
      });
    } catch {
      /* NCR already saved; flag link is best-effort like UI onCreated */
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setOkMsg("");
    setPhotoWarn("");

    if (!ncr.title?.trim()) {
      setError("Please provide a title for the NCR");
      return;
    }
    if (ncr.title.trim().length > 200) {
      setError("Title must be 200 characters or fewer");
      return;
    }
    const defectQty = Number(ncr.defectQuantity) || 0;
    const totalQty = Number(ncr.totalQuantity) || 0;
    if (totalQty > 0 && defectQty > totalQty) {
      setError("Defect quantity cannot exceed total quantity");
      return;
    }
    if (ncr.source === "External" && !(ncr.vendorId && ncr.vendorId > 0)) {
      setError("Select a vendor for an External NCR");
      return;
    }
    if (
      ncr.source === "External" &&
      !ncr.poNumber?.trim() &&
      !(ncr.vendorOrderId && ncr.vendorOrderId > 0)
    ) {
      setError("Select a vendor PO for an External NCR");
      return;
    }

    const tenantId = AuthService.getTenantId();
    const userId = AuthService.getUserId();
    if (tenantId <= 0) {
      setError("Invalid session. Please log out and log back in.");
      return;
    }
    if (userId <= 0) {
      setError("Invalid user session. Please log out and log back in.");
      return;
    }

    setSaving(true);
    try {
      const reporterId =
        ncr.reportedBy && ncr.reportedBy > 0 ? ncr.reportedBy : userId;
      const reporter = employees.find((e) => e.user_UniqueID === reporterId);

      const ncrData: Partial<NonConformanceReport> = {
        ...ncr,
        tenantId,
        title: ncr.title.trim(),
        status: ncr.status || "Open",
        reportedBy: reporterId,
        reportedByName:
          ncr.reportedByName ||
          employeeDisplayName(reporter) ||
          AuthService.getUserName(),
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
        defectQuantity: defectQty,
        totalQuantity: totalQty,
        costImpact: ncr.costImpact ?? 0,
        photos: ncr.photos || [],
        dueDate: ncr.dueDate?.trim() || undefined,
        investigatedDate: ncr.investigatedDate?.trim() || undefined,
        approvedDate: ncr.approvedDate?.trim() || undefined,
        closedDate:
          ncr.status === "Closed"
            ? ncr.closedDate?.trim() || new Date().toISOString()
            : ncr.closedDate?.trim() || undefined,
        jobOrderId: ncr.jobOrderId && ncr.jobOrderId > 0 ? ncr.jobOrderId : 0,
        customerId: ncr.customerId && ncr.customerId > 0 ? ncr.customerId : 0,
        routingStepId:
          ncr.routingStepId && ncr.routingStepId > 0 ? ncr.routingStepId : 0,
        vendorId: ncr.vendorId && ncr.vendorId > 0 ? ncr.vendorId : 0,
        vendorName: ncr.vendorName || "",
        vendorOrderId:
          ncr.vendorOrderId && ncr.vendorOrderId > 0 ? ncr.vendorOrderId : 0,
        poNumber: ncr.poNumber || "",
        ncrCodeId: ncr.ncrCodeId && ncr.ncrCodeId > 0 ? ncr.ncrCodeId : 0,
        ncrCode: ncr.ncrCode || "",
      };

      let savedId = ncrId;
      let created: NonConformanceReport | null = null;

      if (ncrId > 0) {
        await QualityService.updateNCR(ncrId, ncrData);
        setOkMsg("NCR updated successfully");
      } else {
        created = await QualityService.createNCR(
          ncrData as Omit<NonConformanceReport, "ncrId" | "ncrNumber">
        );
        if (!created?.ncrId) {
          setError("Failed to create NCR");
          return;
        }
        savedId = created.ncrId;
        setOkMsg("NCR created successfully");
        await linkNcrToJobStep(created);
      }

      if (pendingFiles.length && savedId > 0) {
        try {
          const urls = await QualityService.uploadNCRPhotos(savedId, pendingFiles);
          if (urls.length) {
            const merged = [...(ncr.photos || []), ...urls];
            await QualityService.updateNCR(savedId, { photos: merged });
            setNcr((prev) => ({ ...prev, photos: merged }));
          }
          setPendingFiles([]);
        } catch (photoErr: unknown) {
          const ax = photoErr as { message?: string };
          setPhotoWarn(
            `NCR saved, but photos failed: ${ax?.message || "upload error"}`
          );
        }
      }

      if (ncrId > 0) {
        const refreshed = await QualityService.getNCRById(ncrId);
        if (refreshed) setNcr(refreshed);
      } else if (created?.ncrId) {
        if (returnTo) {
          navigate(returnTo, { replace: true });
        } else {
          navigate(`/quality/${created.ncrId}`, { replace: true });
        }
      }
    } catch (err: unknown) {
      const ax = err as { message?: string };
      setError(ax?.message || "Error saving NCR");
    } finally {
      setSaving(false);
    }
  };

  const pageHeader = (
    <header className="mb-5 flex items-center gap-3">
      <Link
        to={returnTo || "/quality"}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 19l-7-7 7-7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {ncrId > 0 ? "Edit NCR" : "Create NCR"}
        </h1>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-300">
          {loading ? "Non-Conformance Report" : ncr.ncrNumber || "Non-Conformance Report"}
        </p>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {pageHeader}
        <div className="space-y-4 animate-pulse">
          <div className="h-3 w-56 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-600 dark:bg-slate-800">
            <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-900" />
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-600 dark:bg-slate-800">
            <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-900" />
            <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-900" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-900" />
              <div className="h-12 rounded-xl bg-slate-100 dark:bg-slate-900" />
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-600 dark:bg-slate-800">
            <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-900" />
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-600 dark:bg-slate-800">
            <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="h-20 rounded-xl bg-slate-100 dark:bg-slate-900" />
          </div>
        </div>
      </div>
    );
  }

  const joLocked = !!(ncr.jobOrderId && ncr.jobOrderId > 0);

  return (
    <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      {pageHeader}

      {error && (
        <div
          className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}
      {okMsg && (
        <div
          className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
          role="status"
        >
          {okMsg}
        </div>
      )}
      {photoWarn && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {photoWarn}
        </div>
      )}

      <p className="mb-4 text-xs font-semibold text-slate-500">
        You can save this NCR with a title and return later to complete it.
      </p>

      <form id="ncr-form" className="space-y-4" onSubmit={(e) => void handleSave(e)}>
        {/* Status */}
        <section className="card space-y-3 p-5">
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Status</span>
            <select
              className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
              value={ncr.status || "Open"}
              onChange={(e) => setField("status", e.target.value as NCRStatus)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Basic */}
        <section className="card space-y-3 p-5">
          <h2 className="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Basic information
          </h2>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Title *</span>
            <input
              className="field-input min-h-12 text-sm font-semibold shadow-sm"
              value={ncr.title || ""}
              maxLength={200}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="Brief description of the issue"
              required
            />
          </label>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">NCR Code</span>
            <select
              className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
              value={ncr.ncrCodeId && ncr.ncrCodeId > 0 ? ncr.ncrCodeId : ""}
              onChange={(e) => {
                const id = Number(e.target.value) || 0;
                const code = ncrCodes.find((c) => c.id === id);
                setNcr((prev) => ({
                  ...prev,
                  ncrCodeId: id,
                  ncrCode: code?.ncrCode || "",
                }));
              }}
            >
              <option value="">None</option>
              {ncrCodes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ncrCode}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">Source</span>
              <select
                className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
                value={ncr.source || "Internal"}
                onChange={(e) =>
                  handleSourceChange(e.target.value as NonConformanceReport["source"])
                }
              >
                <option value="Internal">Internal</option>
                <option value="External">External</option>
                <option value="Customer">Customer</option>
              </select>
            </label>
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">Severity</span>
              <select
                className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
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
            <span className="mb-1 block text-xs font-bold text-slate-500">Category</span>
            <select
              className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
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
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Description (recommended)
            </span>
            <textarea
              className="field-input min-h-[96px] py-3 text-sm font-semibold shadow-sm"
              value={ncr.description || ""}
              maxLength={1000}
              onChange={(e) => setField("description", e.target.value)}
              rows={3}
            />
          </label>
        </section>

        {/* JO / Customer */}
        <section className="card space-y-3 p-5">
          <h2 className="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Job / customer
          </h2>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Job Order</span>
            <select
              className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
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
            <span className="mb-1 block text-xs font-bold text-slate-500">Routing Step</span>
            <select
              className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm disabled:opacity-60"
              value={ncr.routingStepId || ""}
              disabled={!joLocked}
              onChange={(e) =>
                setField("routingStepId", Number(e.target.value) || undefined)
              }
            >
              <option value="">None</option>
              {routingSteps.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sequence}. {s.processName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">Part Number</span>
              <input
                className="field-input min-h-12 text-sm font-semibold shadow-sm"
                value={ncr.partNo || ""}
                maxLength={100}
                readOnly={joLocked}
                onChange={(e) => setField("partNo", e.target.value)}
              />
            </label>
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">Part Name</span>
              <input
                className="field-input min-h-12 text-sm font-semibold shadow-sm"
                value={ncr.partName || ""}
                maxLength={200}
                readOnly={joLocked}
                onChange={(e) => setField("partName", e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Customer</span>
            {joLocked ? (
              <input
                className="field-input min-h-12 text-sm font-semibold shadow-sm"
                value={ncr.customerName || ""}
                readOnly
              />
            ) : (
              <select
                className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
                value={ncr.customerId || ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || 0;
                  const c = customers.find((x) => x.customer_id === id);
                  setNcr((prev) => ({
                    ...prev,
                    customerId: id || undefined,
                    customerName: c?.company_name || "",
                  }));
                }}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            )}
          </label>
        </section>

        {/* Vendor / PO — External only */}
        {ncr.source === "External" && (
          <section className="card space-y-3 p-5">
            <h2 className="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
              Vendor / PO
            </h2>
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">Vendor *</span>
              <select
                className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
                value={ncr.vendorId && ncr.vendorId > 0 ? ncr.vendorId : ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || 0;
                  const v = vendors.find((x) => x.vendor_id === id);
                  setNcr((prev) => ({
                    ...prev,
                    vendorId: id,
                    vendorName: v?.company_name || v?.vendorcode || "",
                    vendorOrderId: 0,
                    poNumber: "",
                  }));
                }}
              >
                <option value="">Select vendor</option>
                {vendors
                  .filter((v) => v.vendor_id > 0)
                  .map((v) => (
                    <option key={v.vendor_id} value={v.vendor_id}>
                      {v.company_name || v.vendorcode || `Vendor #${v.vendor_id}`}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">Vendor PO *</span>
              <select
                className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
                value={ncr.vendorOrderId && ncr.vendorOrderId > 0 ? ncr.vendorOrderId : ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || 0;
                  const o = vendorOrders.find((x) => x.orderID === id);
                  setNcr((prev) => ({
                    ...prev,
                    vendorOrderId: id,
                    poNumber:
                      o?.poNumber ||
                      (o?.orderNumber != null ? String(o.orderNumber) : ""),
                    vendorId: o?.vendorID || prev.vendorId,
                    vendorName: o?.vendorName || prev.vendorName,
                  }));
                }}
              >
                <option value="">Select PO</option>
                {vendorPoOptions.map((o) => (
                  <option key={o.orderID} value={o.orderID}>
                    {o.poNumber ||
                      (o.orderNumber != null ? `PO#${o.orderNumber}` : `PO #${o.orderID}`)}
                    {o.vendorName ? ` — ${o.vendorName}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </section>
        )}

        {/* Defect */}
        <section className="card space-y-3 p-5">
          <h2 className="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Defect details
          </h2>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Defect Location</span>
            <input
              className="field-input min-h-12 text-sm font-semibold shadow-sm"
              value={ncr.defectLocation || ""}
              maxLength={200}
              onChange={(e) => setField("defectLocation", e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">Defect Quantity</span>
              <input
                className="field-input min-h-12 text-sm font-semibold shadow-sm"
                type="number"
                min={0}
                value={ncr.defectQuantity ?? 0}
                onChange={(e) => setField("defectQuantity", Number(e.target.value))}
              />
            </label>
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">Total Quantity</span>
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
            <span className="mb-1 block text-xs font-bold text-slate-500">Due Date</span>
            <input
              className="field-input min-h-12 text-sm font-semibold shadow-sm"
              type="date"
              value={
                ncr.dueDate
                  ? String(ncr.dueDate).slice(0, 10)
                  : ""
              }
              onChange={(e) => setField("dueDate", e.target.value)}
            />
          </label>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Defect Description
            </span>
            <textarea
              className="field-input min-h-[80px] py-3 text-sm font-semibold shadow-sm"
              value={ncr.defectDescription || ""}
              maxLength={500}
              onChange={(e) => setField("defectDescription", e.target.value)}
              rows={2}
            />
          </label>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Photo Attachments
            </span>
            <input
              className="field-input py-2.5 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-1.5 file:text-xs file:font-bold file:text-white shadow-sm"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/*"
              multiple
              capture="environment"
              onChange={(e) => handleFileChange(e.target.files)}
            />
            {pendingFiles.length > 0 && (
              <span className="mt-1 block text-xs font-semibold text-slate-500">
                {pendingFiles.length} file(s) will upload on save
              </span>
            )}
            {(ncr.photos?.length || 0) > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {ncr.photos!.map((photo, index) => (
                  <div
                    key={`${photo}-${index}`}
                    className="relative overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img
                      src={resolveNcrPhotoUrl(photo)}
                      alt=""
                      className="h-24 w-full object-cover"
                    />
                    <button
                      type="button"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-white"
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

        {/* Workflow */}
        <section className="card space-y-3 p-5">
          <h2 className="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Workflow
          </h2>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Reported By</span>
            <select
              className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
              value={
                ncr.reportedBy && ncr.reportedBy > 0
                  ? ncr.reportedBy
                  : AuthService.getUserId()
              }
              onChange={(e) => handleReportedByChange(Number(e.target.value) || 0)}
            >
              <option value={AuthService.getUserId()}>
                Current user ({AuthService.getUserName() || "me"})
              </option>
              {employees.map((e) => (
                <option key={e.user_UniqueID} value={e.user_UniqueID}>
                  {employeeDisplayName(e) || e.userName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Investigator</span>
            <select
              className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
              value={ncr.investigatedBy || ""}
              onChange={(e) => handleInvestigatorChange(Number(e.target.value) || 0)}
            >
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.user_UniqueID} value={e.user_UniqueID}>
                  {employeeDisplayName(e) || e.userName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Approver</span>
            <select
              className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
              value={ncr.approvedBy || ""}
              onChange={(e) => handleApproverChange(Number(e.target.value) || 0)}
            >
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.user_UniqueID} value={e.user_UniqueID}>
                  {employeeDisplayName(e) || e.userName}
                </option>
              ))}
            </select>
          </label>
        </section>

        {/* Root cause */}
        <section className="card space-y-3 p-5">
          <h2 className="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Root cause
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="field">
              <span className="mb-1 block text-xs font-bold text-slate-500">
                Root Cause Category
              </span>
              <select
                className="field-input min-h-12 bg-white text-sm font-semibold shadow-sm"
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
              <span className="mb-1 block text-xs font-bold text-slate-500">
                Cost Impact ($)
              </span>
              <input
                className="field-input min-h-12 text-sm font-semibold shadow-sm"
                type="number"
                min={0}
                step={0.01}
                value={ncr.costImpact ?? 0}
                onChange={(e) => setField("costImpact", Number(e.target.value))}
              />
            </label>
          </div>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Root Cause</span>
            <textarea
              className="field-input min-h-[80px] py-3 text-sm font-semibold shadow-sm"
              value={ncr.rootCause || ""}
              maxLength={500}
              onChange={(e) => setField("rootCause", e.target.value)}
              rows={2}
            />
          </label>
        </section>

        {/* Actions */}
        <section className="card space-y-3 p-5">
          <h2 className="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Actions
          </h2>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Immediate Action
            </span>
            <textarea
              className="field-input min-h-[80px] py-3 text-sm font-semibold shadow-sm"
              value={ncr.immediateAction || ""}
              maxLength={500}
              onChange={(e) => setField("immediateAction", e.target.value)}
              rows={2}
            />
          </label>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Corrective Action
            </span>
            <textarea
              className="field-input min-h-[80px] py-3 text-sm font-semibold shadow-sm"
              value={ncr.correctiveAction || ""}
              maxLength={500}
              onChange={(e) => setField("correctiveAction", e.target.value)}
              rows={2}
            />
          </label>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">
              Preventive Action
            </span>
            <textarea
              className="field-input min-h-[80px] py-3 text-sm font-semibold shadow-sm"
              value={ncr.preventiveAction || ""}
              maxLength={500}
              onChange={(e) => setField("preventiveAction", e.target.value)}
              rows={2}
            />
          </label>
        </section>

        {/* Additional Notes */}
        <section className="card space-y-3 p-5">
          <h2 className="text-[0.65rem] font-extrabold uppercase tracking-widest text-slate-400">
            Additional notes
          </h2>
          <label className="field">
            <span className="mb-1 block text-xs font-bold text-slate-500">Notes</span>
            <textarea
              className="field-input min-h-[80px] py-3 text-sm font-semibold shadow-sm"
              value={ncr.notes || ""}
              maxLength={500}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
            />
          </label>
        </section>
      </form>

      <div className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] left-0 right-0 z-30 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95">
        <div className="mx-auto max-w-[540px]">
          <button
            type="submit"
            form="ncr-form"
            className="btn btn-primary min-h-tap w-full rounded-2xl text-sm font-extrabold"
            disabled={saving}
          >
            {saving ? "Saving…" : ncrId > 0 ? "Save NCR" : "Create NCR"}
          </button>
        </div>
      </div>
    </div>
  );
}
