import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { faTimes, faSave, faFileAlt, faCamera, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  QualityService,
  NonConformanceReport,
  NCRStatus,
  resolveNcrPhotoUrl,
} from "../../Common/Services/QualityService";
import { JobOrderService, JobOrderMaster, JobOrderRoutingStep } from "../../Common/Services/JobOrderService";
import { EmployeeService, EmployeeMaster } from "../../Common/Services/EmployeeService";
import { CustomerService, CustomerMaster } from "../../Common/Services/CustomerService";
import { VendorService, VendorMaster } from "../../Common/Services/VendorService";
import { VendorOrderService, VendorOrderMaster } from "../../Common/Services/VendorOrderService";
import { PdfService } from "../../Common/Services/PdfService";
import { NCRCodeService, NCRCodeMaster } from "../../Common/Services/NCRCodeService";
import { useActiveLocation } from "../../Common/Hooks/useActiveLocation";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./NonConformanceReportSlideout.scss";

interface NonConformanceReportSlideoutProps {
  ncrId: number;
  onClose: (refreshList?: boolean) => void;
  /** Prefill fields when creating an NCR from a Job Order step. */
  prefill?: Partial<NonConformanceReport>;
  /** Called after a successful create (before close). May be async. */
  onCreated?: (ncr: NonConformanceReport) => void | Promise<void>;
  /** Called after a successful delete (before close). May be async. */
  onDeleted?: (ncrId: number) => void | Promise<void>;
  /** Raise z-index above Job Order slideout / dialogs. */
  elevated?: boolean;
}

interface PendingPhoto {
  id: string;
  file: File;
  preview: string;
}

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"];

const formatDisplayJobOrderNumber = (number?: number | string): string => {
  const n = typeof number === "string" ? parseInt(number.replace(/\D/g, ""), 10) : number;
  if (!n || n <= 0) return "";
  return n < 1000 ? `JO#${n + 999}` : `JO#${n}`;
};

const formatDisplayVendorOrderNumber = (number?: number | string): string => {
  const n = typeof number === "string" ? parseInt(number.replace(/\D/g, ""), 10) : number;
  if (!n || n <= 0) return "";
  return n < 1000 ? `VO#${n + 999}` : `VO#${n}`;
};

const jobOrderLabel = (jo: JobOrderMaster) => {
  const num = formatDisplayJobOrderNumber(jo.jobOrderNumber) || String(jo.jobOrderNumber || "");
  const part = [jo.partNo, jo.partName].filter(Boolean).join(" — ");
  return part ? `${num} — ${part}` : num;
};

const jobOrderMatches = (jo: JobOrderMaster, query: string) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const display = formatDisplayJobOrderNumber(jo.jobOrderNumber).toLowerCase();
  const digits = String(jo.jobOrderNumber ?? "");
  const qDigits = q.replace(/^jo#?/, "").replace(/\s/g, "");
  const hay = [
    display,
    digits,
    String(jo.jobOrderID),
    jo.partNo,
    jo.partName,
    jo.customerName,
    jo.jobNumber,
    jo.jobDesc,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q) || (!!qDigits && (digits.includes(qDigits) || display.includes(qDigits)));
};

const isNcrStatusActive = (status?: string) => {
  const s = status || "Open";
  return s === "Open" || s === "Under_Investigation" || s === "Pending_Approval";
};

const formatDateForInput = (dateStr?: string): string => {
  if (!dateStr) return "";
  const match = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
};

const employeeName = (emp?: EmployeeMaster) => {
  if (!emp) return "";
  const name = `${emp.firstName || ""} ${emp.lastName || ""}`.trim();
  return name || emp.userName || `User #${emp.user_UniqueID}`;
};

const defaultNcr = (prefill?: Partial<NonConformanceReport>): Partial<NonConformanceReport> => ({
  title: "",
  description: "",
  category: "Other",
  severity: "Minor",
  status: "Open",
  source: "Internal",
  reportedBy: 0,
  defectLocation: "",
  defectQuantity: 0,
  totalQuantity: 0,
  defectDescription: "",
  photos: [],
  rootCause: "",
  rootCauseCategory: "Other",
  immediateAction: "",
  correctiveAction: "",
  preventiveAction: "",
  dueDate: "",
  costImpact: 0,
  notes: "",
  ...prefill,
});

const snapshotOf = (ncr: Partial<NonConformanceReport>) =>
  JSON.stringify({
    title: ncr.title || "",
    description: ncr.description || "",
    category: ncr.category,
    severity: ncr.severity,
    status: ncr.status,
    source: ncr.source,
    jobOrderId: ncr.jobOrderId || 0,
    routingStepId: ncr.routingStepId || 0,
    partNo: ncr.partNo || "",
    partName: ncr.partName || "",
    customerId: ncr.customerId || 0,
    customerName: ncr.customerName || "",
    vendorId: ncr.vendorId || 0,
    vendorName: ncr.vendorName || "",
    vendorOrderId: ncr.vendorOrderId || 0,
    poNumber: ncr.poNumber || "",
    ncrCodeId: ncr.ncrCodeId || 0,
    ncrCode: ncr.ncrCode || "",
    defectLocation: ncr.defectLocation || "",
    defectQuantity: ncr.defectQuantity || 0,
    totalQuantity: ncr.totalQuantity || 0,
    defectDescription: ncr.defectDescription || "",
    photos: ncr.photos || [],
    rootCause: ncr.rootCause || "",
    rootCauseCategory: ncr.rootCauseCategory,
    immediateAction: ncr.immediateAction || "",
    correctiveAction: ncr.correctiveAction || "",
    preventiveAction: ncr.preventiveAction || "",
    dueDate: formatDateForInput(ncr.dueDate),
    costImpact: ncr.costImpact || 0,
    notes: ncr.notes || "",
    reportedBy: ncr.reportedBy || 0,
    investigatedBy: ncr.investigatedBy || 0,
    approvedBy: ncr.approvedBy || 0,
  });

const NonConformanceReportSlideout: React.FC<NonConformanceReportSlideoutProps> = ({
  ncrId,
  onClose,
  prefill,
  onCreated,
  onDeleted,
  elevated,
}) => {
  const { locationId: activeLocationId } = useActiveLocation();
  const { settings } = useFormatting();
  const currencySymbol = settings?.currencySymbol || "$";

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [jobOrders, setJobOrders] = useState<JobOrderMaster[]>([]);
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);
  const [customers, setCustomers] = useState<CustomerMaster[]>([]);
  const [vendors, setVendors] = useState<VendorMaster[]>([]);
  const [vendorOrders, setVendorOrders] = useState<VendorOrderMaster[]>([]);
  const [ncrCodes, setNcrCodes] = useState<NCRCodeMaster[]>([]);
  const [routingSteps, setRoutingSteps] = useState<JobOrderRoutingStep[]>([]);
  const [joSearch, setJoSearch] = useState("");
  const [joOpen, setJoOpen] = useState(false);
  const joBoxRef = useRef<HTMLDivElement | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const [ncr, setNcr] = useState<Partial<NonConformanceReport>>(() => defaultNcr(prefill));
  const snapshotRef = useRef(snapshotOf(defaultNcr(prefill)));
  const pendingPhotosRef = useRef<PendingPhoto[]>([]);

  useEffect(() => {
    pendingPhotosRef.current = pendingPhotos;
  }, [pendingPhotos]);

  useEffect(() => {
    return () => {
      pendingPhotosRef.current.forEach((p) => URL.revokeObjectURL(p.preview));
    };
  }, []);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (joBoxRef.current && !joBoxRef.current.contains(event.target as Node)) {
        setJoOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    loadLookups();
    if (ncrId > 0) {
      loadNCR();
    } else {
      const initial = defaultNcr(prefill);
      setNcr(initial);
      snapshotRef.current = snapshotOf(initial);
      if (initial.jobOrderId && initial.jobOrderId > 0) {
        loadRoutingSteps(initial.jobOrderId);
        setJoSearch(initial.jobOrderNumber || "");
      } else {
        setJoSearch("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ncrId]);

  const loadLookups = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      const [jobOrdersResult, employeesResult, customersResult, vendorsResult, vendorOrdersResult, ncrCodesResult] =
        await Promise.all([
          JobOrderService.GetJobOrders({ tenantid: tenantID }),
          EmployeeService.GetEmployees({ tenantid: tenantID }),
          CustomerService.GetCustomerlist({ tenantid: tenantID }),
          VendorService.GetVendorlist({ tenantid: tenantID }),
          VendorOrderService.GetVendorOrders({
            tenantid: tenantID,
            ...(activeLocationId > 0 && { locationId: activeLocationId }),
          }),
          NCRCodeService.GetNCRCodes(tenantID || (process.env.NODE_ENV === "development" ? 1 : 0)),
        ]);

      setJobOrders(jobOrdersResult || []);
      setEmployees(employeesResult || []);
      setCustomers(customersResult || []);
      setVendors(vendorsResult || []);
      setVendorOrders(vendorOrdersResult || []);
      setNcrCodes(ncrCodesResult || []);
    } catch (error) {
      console.error("Error loading NCR lookups:", error);
    }
  };

  const loadRoutingSteps = async (jobOrderId: number) => {
    try {
      const jo = await JobOrderService.GetJobOrderById(jobOrderId);
      setRoutingSteps(jo?.RoutingSteps || []);
    } catch (error) {
      console.error("Error loading routing steps:", error);
      setRoutingSteps([]);
    }
  };

  const loadNCR = async () => {
    if (ncrId <= 0) return;
    setLoading(true);
    try {
      const result = await QualityService.GetNCRById(ncrId);
      if (result) {
        const loaded = {
          ...result,
          photos: Array.isArray(result.photos) ? result.photos : [],
        };
        setNcr(loaded);
        snapshotRef.current = snapshotOf(loaded);
        if (loaded.jobOrderId && loaded.jobOrderId > 0) {
          loadRoutingSteps(loaded.jobOrderId);
          setJoSearch(loaded.jobOrderNumber || "");
        } else {
          setJoSearch("");
        }
      } else {
        toast.error("NCR not found or failed to load");
      }
    } catch (error: any) {
      toast.error(`Error loading NCR: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const isDirty =
    snapshotOf(ncr) !== snapshotRef.current || pendingPhotos.length > 0;

  const requestClose = (refreshList = false) => {
    if (!refreshList && isDirty && !window.confirm("You have unsaved changes. Are you sure you want to close?")) {
      return;
    }
    onClose(refreshList);
  };

  const storedPhotos = useMemo(
    () => (Array.isArray(ncr.photos) ? ncr.photos.filter((p) => p && !p.startsWith("data:")) : []),
    [ncr.photos]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const remaining = MAX_PHOTOS - storedPhotos.length - pendingPhotos.length;
    if (remaining <= 0) {
      toast.error(`A maximum of ${MAX_PHOTOS} photos is allowed`);
      return;
    }

    const accepted: PendingPhoto[] = [];
    for (const file of files.slice(0, remaining)) {
      if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
        toast.error(`${file.name}: use JPEG, PNG, GIF, WebP, or BMP`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        toast.error(`${file.name}: each photo must be 8MB or smaller`);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
      });
    }
    if (accepted.length) {
      setPendingPhotos((prev) => [...prev, ...accepted]);
    }
  };

  const handleDeleteStoredPhoto = (index: number) => {
    setNcr((prev) => ({
      ...prev,
      photos: (prev.photos || []).filter((_, i) => i !== index),
    }));
  };

  const handleDeletePendingPhoto = (id: string) => {
    setPendingPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleInputChange = (field: keyof NonConformanceReport, value: any) => {
    setNcr((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleNcrCodeChange = (rawValue: string) => {
    const codeId = rawValue ? Number(rawValue) : 0;
    const selected = ncrCodes.find((c) => c.id === codeId);
    setNcr((prev) => ({
      ...prev,
      ncrCodeId: codeId > 0 ? codeId : undefined,
      ncrCode: selected?.ncrCode || "",
    }));
  };

  const handleJobOrderChange = (rawValue: string) => {
    if (!rawValue) {
      setRoutingSteps([]);
      setNcr((prev) => ({
        ...prev,
        jobOrderId: undefined,
        jobOrderNumber: "",
        routingStepId: undefined,
        partNo: "",
        partName: "",
        ...(prev.source === "Customer"
          ? {}
          : { customerId: undefined, customerName: "" }),
      }));
      setJoSearch("");
      return;
    }

    const jobOrderId = Number(rawValue);
    const selectedJobOrder = jobOrders.find((jo) => jo.jobOrderID === jobOrderId);
    if (!selectedJobOrder) return;

    const displayNumber = formatDisplayJobOrderNumber(selectedJobOrder.jobOrderNumber);
    setNcr((prev) => ({
      ...prev,
      jobOrderId: selectedJobOrder.jobOrderID,
      jobOrderNumber: displayNumber || String(selectedJobOrder.jobOrderNumber || ""),
      routingStepId: undefined,
      partNo: selectedJobOrder.partNo,
      partName: selectedJobOrder.partName,
      customerId: selectedJobOrder.customerID,
      customerName: selectedJobOrder.customerName,
      totalQuantity: prev.totalQuantity || selectedJobOrder.qtyOrdered || 0,
    }));
    setJoSearch(jobOrderLabel(selectedJobOrder));
    setJoOpen(false);
    loadRoutingSteps(jobOrderId);
  };

  const handleSourceChange = (source: string) => {
    setNcr((prev) => ({
      ...prev,
      source: source as NonConformanceReport["source"],
      ...(source !== "External"
        ? { vendorId: undefined, vendorName: "", vendorOrderId: undefined, poNumber: "" }
        : {}),
    }));
  };

  const handleVendorChange = (rawValue: string) => {
    if (!rawValue) {
      setNcr((prev) => ({
        ...prev,
        vendorId: undefined,
        vendorName: "",
        vendorOrderId: undefined,
        poNumber: "",
      }));
      return;
    }
    const vendorId = Number(rawValue);
    const selected = vendors.find((v) => v.vendor_id === vendorId);
    setNcr((prev) => ({
      ...prev,
      vendorId,
      vendorName: selected?.company_name || selected?.vendorcode || "",
      vendorOrderId: undefined,
      poNumber: "",
    }));
  };

  const handlePoChange = (rawValue: string) => {
    if (!rawValue) {
      setNcr((prev) => ({ ...prev, vendorOrderId: undefined, poNumber: "" }));
      return;
    }
    const vendorOrderId = Number(rawValue);
    const selected = vendorOrders.find((o) => o.orderID === vendorOrderId);
    if (!selected) return;
    const vendor = vendors.find((v) => v.vendor_id === selected.vendorID);
    setNcr((prev) => ({
      ...prev,
      vendorOrderId,
      poNumber: formatDisplayVendorOrderNumber(selected.orderNumber) || String(selected.orderNumber || ""),
      vendorId: selected.vendorID || prev.vendorId,
      vendorName: selected.vendorName || vendor?.company_name || prev.vendorName,
    }));
  };

  const handleCustomerChange = (rawValue: string) => {
    if (!rawValue) {
      setNcr((prev) => ({ ...prev, customerId: undefined, customerName: "" }));
      return;
    }
    const customerId = Number(rawValue);
    const selected = customers.find((c) => c.customer_id === customerId);
    setNcr((prev) => ({
      ...prev,
      customerId,
      customerName: selected?.company_name || selected?.customercode || "",
    }));
  };

  const handleEmployeeChange = (
    field: "reportedBy" | "investigatedBy" | "approvedBy",
    rawValue: string
  ) => {
    const id = rawValue ? Number(rawValue) : 0;
    const emp = employees.find((e) => e.user_UniqueID === id);
    const name = employeeName(emp);
    setNcr((prev) => {
      const next: Partial<NonConformanceReport> = { ...prev };
      if (field === "reportedBy") {
        next.reportedBy = id;
        next.reportedByName = name;
      } else if (field === "investigatedBy") {
        next.investigatedBy = id || undefined;
        next.investigatedByName = name;
        if (id && !prev.investigatedDate) {
          next.investigatedDate = new Date().toISOString().slice(0, 10);
        }
        if (!id) {
          next.investigatedDate = undefined;
        }
      } else {
        next.approvedBy = id || undefined;
        next.approvedByName = name;
        if (id && !prev.approvedDate) {
          next.approvedDate = new Date().toISOString().slice(0, 10);
        }
        if (!id) {
          next.approvedDate = undefined;
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!ncr.title?.trim()) {
      toast.error("Please provide a title for the NCR");
      return;
    }
    if (ncr.title.trim().length > 200) {
      toast.error("Title must be 200 characters or fewer");
      return;
    }
    const defectQty = Number(ncr.defectQuantity) || 0;
    const totalQty = Number(ncr.totalQuantity) || 0;
    if (totalQty > 0 && defectQty > totalQty) {
      toast.error("Defect quantity cannot exceed total quantity");
      return;
    }
    if (ncr.source === "External" && !(ncr.vendorId && ncr.vendorId > 0)) {
      toast.error("Select a vendor for an External NCR");
      return;
    }
    if (ncr.source === "External" && !ncr.poNumber?.trim() && !(ncr.vendorOrderId && ncr.vendorOrderId > 0)) {
      toast.error("Select a vendor PO for an External NCR");
      return;
    }

    setSaving(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const userId = parseInt(storage?.user_UniqueID || "0", 10) || 0;
      const tenantId = storage?.tenantID || 0;

      if (tenantId <= 0) {
        toast.error("Invalid session. Please log out and log back in.");
        return;
      }
      if (userId <= 0) {
        toast.error("Invalid user session. Please log out and log back in.");
        return;
      }

      const reporterId = ncr.reportedBy && ncr.reportedBy > 0 ? ncr.reportedBy : userId;
      const reporter = employees.find((e) => e.user_UniqueID === reporterId);

      const ncrData: Partial<NonConformanceReport> = {
        ...ncr,
        tenantId,
        title: ncr.title.trim(),
        reportedBy: reporterId,
        reportedByName: ncr.reportedByName || employeeName(reporter),
        reportedDate: ncr.reportedDate || new Date().toISOString(),
        photos: storedPhotos,
        dueDate: ncr.dueDate?.trim() || undefined,
        investigatedDate: ncr.investigatedDate?.trim() || undefined,
        approvedDate: ncr.approvedDate?.trim() || undefined,
        closedDate:
          ncr.status === "Closed"
            ? ncr.closedDate?.trim() || new Date().toISOString()
            : ncr.closedDate?.trim() || undefined,
        jobOrderId: ncr.jobOrderId && ncr.jobOrderId > 0 ? ncr.jobOrderId : 0,
        customerId: ncr.customerId && ncr.customerId > 0 ? ncr.customerId : 0,
        routingStepId: ncr.routingStepId && ncr.routingStepId > 0 ? ncr.routingStepId : 0,
        vendorId: ncr.vendorId && ncr.vendorId > 0 ? ncr.vendorId : 0,
        vendorName: ncr.vendorName || "",
        vendorOrderId: ncr.vendorOrderId && ncr.vendorOrderId > 0 ? ncr.vendorOrderId : 0,
        poNumber: ncr.poNumber || "",
        ncrCodeId: ncr.ncrCodeId && ncr.ncrCodeId > 0 ? ncr.ncrCodeId : 0,
        ncrCode: ncr.ncrCode || "",
      };

      let result: NonConformanceReport | null = null;
      let savedId = ncrId;

      if (ncrId > 0) {
        await QualityService.UpdateNCR(ncrId, ncrData);
        result = { ...(ncrData as NonConformanceReport), ncrId };
        toast.success("NCR updated successfully");
      } else {
        result = await QualityService.CreateNCR(
          ncrData as Omit<NonConformanceReport, "ncrId" | "ncrNumber">
        );
        if (!result) {
          toast.error("Failed to create NCR");
          return;
        }
        savedId = result.ncrId;
        toast.success("NCR created successfully");
        await Promise.resolve(onCreated?.(result));
      }

      if (pendingPhotos.length && savedId > 0) {
        try {
          const uploaded = await QualityService.UploadNCRPhotos(
            savedId,
            pendingPhotos.map((p) => p.file)
          );
          if (result) {
            result.photos = uploaded;
          }
        } catch (photoError: any) {
          toast.warn(`NCR saved, but photos failed: ${photoError.message || "Unknown error"}`);
        }
      }

      snapshotRef.current = snapshotOf({ ...ncr, photos: result?.photos || storedPhotos });
      pendingPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
      setPendingPhotos([]);
      onClose(true);
    } catch (error: any) {
      toast.error(`Error saving NCR: ${error.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (ncrId === 0) return;
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const response = await QualityService.CheckNCRDeletionImpact(ncrId, tenantID);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
      setShowDeletionDialog(true);
    } catch (error: any) {
      toast.error(`Error checking deletion impact: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeletion = async () => {
    const canDelete = deletionImpact?.canDelete ?? (deletionImpact as any)?.CanDelete ?? true;
    if (ncrId === 0 || !canDelete) return;
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      await QualityService.DeleteNCR(ncrId, tenantID);
      toast.success("NCR deleted successfully");
      setShowDeletionDialog(false);
      await Promise.resolve(onDeleted?.(ncrId));
      onClose(true);
    } catch (error: any) {
      toast.error(`Error deleting NCR: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredJobOrders = useMemo(() => {
    const selectedId = ncr.jobOrderId && ncr.jobOrderId > 0 ? ncr.jobOrderId : 0;
    const selectedJo = selectedId ? jobOrders.find((jo) => jo.jobOrderID === selectedId) : undefined;
    const searching =
      !!joSearch.trim() &&
      (!selectedJo || joSearch.trim() !== jobOrderLabel(selectedJo));
    const matches = searching ? jobOrders.filter((jo) => jobOrderMatches(jo, joSearch)) : jobOrders;
    if (selectedJo && !matches.some((jo) => jo.jobOrderID === selectedJo.jobOrderID)) {
      return [selectedJo, ...matches];
    }
    return matches;
  }, [jobOrders, joSearch, ncr.jobOrderId]);

  const vendorPoOptions = useMemo(() => {
    if (ncr.vendorId && ncr.vendorId > 0) {
      return vendorOrders.filter((o) => o.vendorID === ncr.vendorId);
    }
    return vendorOrders;
  }, [vendorOrders, ncr.vendorId]);

  const handlePrint = async () => {
    if (ncrId <= 0) {
      toast.error("Save the NCR before printing");
      return;
    }
    if (printing) return;
    setPrinting(true);
    const toastId = toast.info("Generating NCR PDF…", { autoClose: false });
    try {
      const blob = await PdfService.GenerateNCR(ncrId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${ncr.ncrNumber || `NCR-${ncrId}`}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.update(toastId, { render: "NCR PDF ready", type: "success", autoClose: 3000 });
    } catch (error: any) {
      const message =
        error?.message ||
        error?.response?.data?.error ||
        (typeof error?.response?.data === "string" ? error.response.data : null) ||
        "Failed to generate NCR PDF";
      toast.update(toastId, {
        render: message,
        type: "error",
        autoClose: 5000,
      });
    } finally {
      setPrinting(false);
    }
  };

  const customerLocked = !!(ncr.jobOrderId && ncr.jobOrderId > 0);
  const employeeOptions = employees.filter(
    (e) => !e.status || e.status.toLowerCase() === "active" || e.user_UniqueID === ncr.reportedBy
  );

  const overlayClass = `ncr-slideout-overlay${elevated || prefill ? " ncr-slideout--elevated" : ""}`;

  if (loading) {
    return (
      <div className={overlayClass}>
        <div className="ncr-slideout-card">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading NCR...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={overlayClass} onClick={() => requestClose(false)}>
      <div className="ncr-slideout-card" onClick={(e) => e.stopPropagation()}>
        <div className="ncr-slideout-header">
          <div>
            <h2>{ncrId > 0 ? "Edit NCR" : "Create NCR"}</h2>
            {ncr.ncrNumber && (
              <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                {ncr.ncrNumber}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {ncrId > 0 && (
              <button
                type="button"
                className="btn-icon"
                onClick={handlePrint}
                disabled={printing || saving}
                title={printing ? "Printing..." : "Print NCR"}
                style={{ color: "#6366f1" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
              </button>
            )}
            <div className="status-field-inline">
              <div
                className={`input-group ${isNcrStatusActive(ncr.status) ? "status-active-group" : "status-inactive-group"}`}
                style={{ maxWidth: "220px", minWidth: "180px" }}
              >
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                  </span>
                </div>
                <select
                  className={`form-input ${isNcrStatusActive(ncr.status) ? "status-active" : "status-inactive"}`}
                  value={ncr.status || "Open"}
                  onChange={(e) => handleInputChange("status", e.target.value as NCRStatus)}
                >
                  <option value="Open">Open</option>
                  <option value="Under_Investigation">Under Investigation</option>
                  <option value="Pending_Approval">Pending Approval</option>
                  <option value="Approved">Approved</option>
                  <option value="Implemented">Implemented</option>
                  <option value="Closed">Closed</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={() => requestClose(false)}>
              ×
            </button>
          </div>
        </div>

        <form
          className="ncr-slideout-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="ncr-slideout-content">
            <div className="form-info">
              <FontAwesomeIcon icon={faFileAlt} />
              <span>You can save this NCR with a title and return later to complete it.</span>
            </div>
            <div className="ncr-form">
            <div className="form-section">
              <h4>Basic Information</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>
                    Title <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    value={ncr.title || ""}
                    maxLength={200}
                    onChange={(e) => handleInputChange("title", e.target.value)}
                    placeholder="Brief description of the issue"
                  />
                </div>

                <div className="form-group">
                  <label>NCR Code</label>
                  <select
                    value={ncr.ncrCodeId && ncr.ncrCodeId > 0 ? String(ncr.ncrCodeId) : ""}
                    onChange={(e) => handleNcrCodeChange(e.target.value)}
                  >
                    <option value="">Select NCR Code</option>
                    {ncrCodes.map((code) => (
                      <option key={code.id} value={code.id}>
                        {code.ncrCode}
                        {code.description ? ` — ${code.description}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Source</label>
                  <select
                    value={ncr.source || "Internal"}
                    onChange={(e) => handleSourceChange(e.target.value)}
                  >
                    <option value="Internal">Internal</option>
                    <option value="External">External</option>
                    <option value="Customer">Customer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={ncr.category || "Other"}
                    onChange={(e) => handleInputChange("category", e.target.value)}
                  >
                    <option value="Material_Defect">Material Defect</option>
                    <option value="Dimensional_Issue">Dimensional Issue</option>
                    <option value="Process_Failure">Process Failure</option>
                    <option value="Equipment_Problem">Equipment Problem</option>
                    <option value="Documentation_Error">Documentation Error</option>
                    <option value="Supplier_Quality">Supplier Quality</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Severity</label>
                  <select
                    value={ncr.severity || "Minor"}
                    onChange={(e) => handleInputChange("severity", e.target.value)}
                  >
                    <option value="Minor">Minor</option>
                    <option value="Major">Major</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>
                  Description <span className="recommended">(recommended)</span>
                </label>
                <textarea
                  value={ncr.description || ""}
                  maxLength={1000}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Detailed description of the non-conformance"
                  rows={3}
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Job Order / Customer</h4>
              <div className="form-grid">
                <div className="form-group ncr-combobox-field">
                  <label>Job Order</label>
                  <div className="ncr-combobox" ref={joBoxRef}>
                    <input
                      type="text"
                      value={joSearch}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (ncr.jobOrderId) {
                          handleJobOrderChange("");
                        }
                        setJoSearch(value);
                        setJoOpen(true);
                      }}
                      onFocus={() => setJoOpen(true)}
                      placeholder="Search JO#, part, or customer"
                      autoComplete="off"
                    />
                    {(ncr.jobOrderId && ncr.jobOrderId > 0) || joSearch ? (
                      <button
                        type="button"
                        className="ncr-combobox-clear"
                        onClick={() => handleJobOrderChange("")}
                        aria-label="Clear job order"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </button>
                    ) : null}
                    {joOpen && (
                      <ul className="ncr-combobox-list">
                        {jobOrders.length === 0 && (
                          <li className="ncr-combobox-empty">No job orders loaded</li>
                        )}
                        {jobOrders.length > 0 && filteredJobOrders.length === 0 && (
                          <li className="ncr-combobox-empty">No matching job orders</li>
                        )}
                        {filteredJobOrders.slice(0, 80).map((jo) => (
                          <li key={jo.jobOrderID}>
                            <button
                              type="button"
                              className={
                                ncr.jobOrderId === jo.jobOrderID ? "is-selected" : undefined
                              }
                              onClick={() => handleJobOrderChange(String(jo.jobOrderID))}
                            >
                              <span className="ncr-combobox-primary">{jobOrderLabel(jo)}</span>
                              {jo.customerName ? (
                                <span className="ncr-combobox-secondary">{jo.customerName}</span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Routing Step</label>
                  <select
                    value={ncr.routingStepId && ncr.routingStepId > 0 ? ncr.routingStepId : ""}
                    onChange={(e) =>
                      handleInputChange("routingStepId", e.target.value ? Number(e.target.value) : undefined)
                    }
                    disabled={!ncr.jobOrderId}
                  >
                    <option value="">None</option>
                    {routingSteps.map((step) => (
                      <option key={step.id} value={step.id}>
                        Step {step.sequence}: {step.processName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Part Number</label>
                  <input
                    type="text"
                    value={ncr.partNo || ""}
                    maxLength={100}
                    onChange={(e) => handleInputChange("partNo", e.target.value)}
                    readOnly={customerLocked}
                  />
                </div>

                <div className="form-group">
                  <label>Part Name</label>
                  <input
                    type="text"
                    value={ncr.partName || ""}
                    maxLength={200}
                    onChange={(e) => handleInputChange("partName", e.target.value)}
                    readOnly={customerLocked}
                  />
                </div>

                <div className="form-group">
                  <label>Customer</label>
                  {customerLocked ? (
                    <input type="text" value={ncr.customerName || ""} readOnly />
                  ) : (
                    <select
                      value={ncr.customerId && ncr.customerId > 0 ? ncr.customerId : ""}
                      onChange={(e) => handleCustomerChange(e.target.value)}
                    >
                      <option value="">Select Customer</option>
                      {customers
                        .filter((c) => c.customer_id > 0)
                        .sort((a, b) =>
                          (a.company_name || "").localeCompare(b.company_name || "")
                        )
                        .map((c) => (
                          <option key={c.customer_id} value={c.customer_id}>
                            {c.company_name || c.customercode || `Customer #${c.customer_id}`}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {ncr.source === "External" && (
              <div className="form-section">
                <h4>Vendor / PO</h4>
                <div className="form-grid">
                  <div className="form-group">
                    <label>
                      Vendor <span className="required">*</span>
                    </label>
                    <select
                      value={ncr.vendorId && ncr.vendorId > 0 ? ncr.vendorId : ""}
                      onChange={(e) => handleVendorChange(e.target.value)}
                    >
                      <option value="">Select Vendor</option>
                      {vendors
                        .filter((v) => v.vendor_id > 0)
                        .sort((a, b) =>
                          (a.company_name || "").localeCompare(b.company_name || "")
                        )
                        .map((v) => (
                          <option key={v.vendor_id} value={v.vendor_id}>
                            {v.company_name || v.vendorcode || `Vendor #${v.vendor_id}`}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>
                      Vendor PO <span className="required">*</span>
                    </label>
                    <select
                      value={ncr.vendorOrderId && ncr.vendorOrderId > 0 ? ncr.vendorOrderId : ""}
                      onChange={(e) => handlePoChange(e.target.value)}
                    >
                      <option value="">Select PO</option>
                      {vendorPoOptions.map((order) => (
                        <option key={order.orderID} value={order.orderID}>
                          {formatDisplayVendorOrderNumber(order.orderNumber) || order.orderNumber}
                          {order.vendorName ? ` — ${order.vendorName}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="form-section">
              <h4>Defect Details</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Defect Location</label>
                  <input
                    type="text"
                    value={ncr.defectLocation || ""}
                    maxLength={200}
                    onChange={(e) => handleInputChange("defectLocation", e.target.value)}
                    placeholder="Where was the defect found?"
                  />
                </div>

                <div className="form-group">
                  <label>Defect Quantity</label>
                  <input
                    type="number"
                    value={ncr.defectQuantity ?? 0}
                    onChange={(e) => handleInputChange("defectQuantity", Number(e.target.value))}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Total Quantity</label>
                  <input
                    type="number"
                    value={ncr.totalQuantity ?? 0}
                    onChange={(e) => handleInputChange("totalQuantity", Number(e.target.value))}
                    min="0"
                  />
                </div>

                <div className="form-group">
                  <label>Due Date</label>
                  <input
                    type="date"
                    value={formatDateForInput(ncr.dueDate)}
                    onChange={(e) => handleInputChange("dueDate", e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Defect Description</label>
                <textarea
                  value={ncr.defectDescription || ""}
                  maxLength={500}
                  onChange={(e) => handleInputChange("defectDescription", e.target.value)}
                  placeholder="Detailed description of the defect"
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>Photo Attachments</label>
                <div className="photo-upload-section">
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                    id="photo-upload"
                  />
                  <label htmlFor="photo-upload" className="photo-upload-btn">
                    <FontAwesomeIcon icon={faCamera} />
                    Choose Photos
                  </label>
                  <span className="photo-hint">
                    Up to {MAX_PHOTOS} images, 8MB each. Saved to the server after you create the NCR.
                  </span>
                  {(storedPhotos.length > 0 || pendingPhotos.length > 0) && (
                    <div className="photo-preview-grid">
                      {storedPhotos.map((photo, index) => (
                        <div key={`stored-${index}`} className="photo-preview-item">
                          <img src={resolveNcrPhotoUrl(photo)} alt={`Attachment ${index + 1}`} />
                          <button
                            type="button"
                            className="photo-delete-btn"
                            onClick={() => handleDeleteStoredPhoto(index)}
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        </div>
                      ))}
                      {pendingPhotos.map((photo) => (
                        <div key={photo.id} className="photo-preview-item">
                          <img src={photo.preview} alt={photo.file.name} />
                          <button
                            type="button"
                            className="photo-delete-btn"
                            onClick={() => handleDeletePendingPhoto(photo.id)}
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Workflow</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Reported By</label>
                  <select
                    value={ncr.reportedBy && ncr.reportedBy > 0 ? ncr.reportedBy : ""}
                    onChange={(e) => handleEmployeeChange("reportedBy", e.target.value)}
                  >
                    <option value="">Current user</option>
                    {employeeOptions.map((emp) => (
                      <option key={emp.user_UniqueID} value={emp.user_UniqueID}>
                        {employeeName(emp)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Investigator</label>
                  <select
                    value={ncr.investigatedBy && ncr.investigatedBy > 0 ? ncr.investigatedBy : ""}
                    onChange={(e) => handleEmployeeChange("investigatedBy", e.target.value)}
                  >
                    <option value="">Not assigned</option>
                    {employeeOptions.map((emp) => (
                      <option key={emp.user_UniqueID} value={emp.user_UniqueID}>
                        {employeeName(emp)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Approver</label>
                  <select
                    value={ncr.approvedBy && ncr.approvedBy > 0 ? ncr.approvedBy : ""}
                    onChange={(e) => handleEmployeeChange("approvedBy", e.target.value)}
                  >
                    <option value="">Not assigned</option>
                    {employeeOptions.map((emp) => (
                      <option key={emp.user_UniqueID} value={emp.user_UniqueID}>
                        {employeeName(emp)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-section">
              <h4>Root Cause Analysis</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Root Cause Category</label>
                  <select
                    value={ncr.rootCauseCategory || "Other"}
                    onChange={(e) => handleInputChange("rootCauseCategory", e.target.value)}
                  >
                    <option value="Man">Man (Human Error)</option>
                    <option value="Machine">Machine (Equipment)</option>
                    <option value="Material">Material (Raw Materials)</option>
                    <option value="Method">Method (Process)</option>
                    <option value="Measurement">Measurement (Gauging)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Cost Impact ({currencySymbol})</label>
                  <input
                    type="number"
                    value={ncr.costImpact || 0}
                    onChange={(e) => handleInputChange("costImpact", Number(e.target.value))}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Root Cause</label>
                <textarea
                  value={ncr.rootCause || ""}
                  maxLength={500}
                  onChange={(e) => handleInputChange("rootCause", e.target.value)}
                  placeholder="What caused this non-conformance?"
                  rows={2}
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Corrective Actions</h4>
              <div className="form-group">
                <label>Immediate Action</label>
                <textarea
                  value={ncr.immediateAction || ""}
                  maxLength={500}
                  onChange={(e) => handleInputChange("immediateAction", e.target.value)}
                  placeholder="What immediate action was taken?"
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label>Corrective Action</label>
                <textarea
                  value={ncr.correctiveAction || ""}
                  maxLength={500}
                  onChange={(e) => handleInputChange("correctiveAction", e.target.value)}
                  placeholder="What corrective action will be taken?"
                  rows={2}
                />
              </div>
              <div className="form-group">
                <label>Preventive Action</label>
                <textarea
                  value={ncr.preventiveAction || ""}
                  maxLength={500}
                  onChange={(e) => handleInputChange("preventiveAction", e.target.value)}
                  placeholder="What preventive action will prevent recurrence?"
                  rows={2}
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Additional Notes</h4>
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={ncr.notes || ""}
                  maxLength={500}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  placeholder="Additional notes or comments"
                  rows={3}
                />
              </div>
            </div>
            </div>
          </div>

          <div className="ncr-slideout-footer">
            {ncrId > 0 && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading || saving}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: loading || saving ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  opacity: loading || saving ? 0.6 : 1,
                  marginRight: "auto",
                }}
              >
                <FontAwesomeIcon icon={faTrash} />
                Delete
              </button>
            )}
            <button type="button" className="btn-cancel" onClick={() => requestClose(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={saving}>
              <FontAwesomeIcon icon={faSave} style={{ marginRight: "0.5rem" }} />
              {saving ? "Saving..." : ncrId > 0 ? "Update NCR" : "Create NCR"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`NCR ${ncr.ncrNumber || ncr.title || `#${ncrId}`}`}
          impact={deletionImpact}
          onConfirm={confirmDeletion}
          onCancel={() => {
            setShowDeletionDialog(false);
            setDeletionImpact(null);
          }}
        />
      </div>
    </div>
  );
};

export default NonConformanceReportSlideout;

export {};
