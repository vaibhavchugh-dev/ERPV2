import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  JobOrderService,
  JobOrderMasterReq,
  JobOrderRoutingStep,
  JobOrderStepNote,
  deriveJobStatus,
  computeElapsedSeconds,
  formatElapsedDuration,
  commitLiveElapsed,
  toElapsedFields,
  isStepCompleted,
  getCommittedSeconds,
  buildStepScanCode,
  JOB_STEP_PAUSE_REASONS,
} from "../../Common/Services/JobOrderService";
import QRCode from "qrcode";
import { NonConformanceReport } from "../../Common/Services/QualityService";
import NonConformanceReportSlideout from "../Quality/NonConformanceReportSlideout";
import { OrderService, OrderMasterReq } from "../../Common/Services/OrderService";
import { ProcessService, ProcessMaster } from "../../Common/Services/ProcessService";
import { WorkstationService, WorkstationMaster } from "../../Common/Services/WorkstationService";
import { EmployeeService, EmployeeMaster } from "../../Common/Services/EmployeeService";
import { JobTemplateService, JobTemplate, JobTemplateReq } from "../../Common/Services/JobTemplateService";
import JobTemplatePickerDialog from "../../Common/Components/JobTemplatePickerDialog";
import {
  JOB_PRIORITY_OPTIONS,
  normalizeJobPriority,
} from "../../Common/Constants/jobPriorities";
import CustomerOrderSlideout from "../Orders/CustomerOrderSlideout";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { PdfService } from "../../Common/Services/PdfService";
import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./JobOrderSlideout.scss";

interface JobOrderSlideoutProps {
  jobOrderId: number;
  onClose: (refreshList?: boolean) => void;
  /** Called after a successful save so the parent can refresh without closing the slideout. */
  onSaved?: () => void;
  /** Optional list-row values so the header can render without waiting on GetJobOrderById. */
  headerPreview?: {
    jobOrderNumber?: number;
    customerOrderId?: number;
  };
}

const formatDisplayJobOrderNumber = (number: number): string => {
  if (!number || number <= 0) return "";
  return number < 1000 ? `JO#${number + 999}` : `JO#${number}`;
};

const formatDisplayCustomerOrderNumber = (number: number): string => {
  if (!number || number <= 0) return "";
  return number < 1000 ? `CO#${number + 999}` : `CO#${number}`;
};

const JobOrderSlideout: React.FC<JobOrderSlideoutProps> = ({
  jobOrderId,
  onClose,
  onSaved,
  headerPreview,
}) => {
  const [formData, setFormData] = useState<JobOrderMasterReq>({
    JobOrderID: 0,
    JobOrderNumber: headerPreview?.jobOrderNumber || 0,
    CustomerOrderID: headerPreview?.customerOrderId || 0,
    CustomerOrderDetailID: 0,
    CustomerID: 0,
    CustomerName: "",
    CustomerCode: "",
    JobNumber: "",
    JobDesc: "",
    PartNo: "",
    PartName: "",
    QtyOrdered: 0,
    Unit: "",
    UnitPrice: 0,
    DueDate: "",
    JobPriority: 0,
    Status: "Draft",
    Tenantid: 0,
    UserId: 0,
    UserToken: 0,
    OrderDate: "",
    Attachments: [],
    Comments: [],
    RoutingSteps: [],
    DrawingNumber: "",
    DrawingRevision: "",
    JobTemplateId: null,
    JobTemplateCode: "",
    JobTemplateRevision: null,
    EnableJobTracking: false,
  });

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(jobOrderId > 0);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [attachments, setAttachments] = useState<Array<{ id: number; name: string; size: number; fileUrl?: string }>>([]);
  const [attachmentIdCounter, setAttachmentIdCounter] = useState(1);
  const [comments, setComments] = useState<Array<{ id: number; text: string; createdAt: string; createdBy: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [commentIdCounter, setCommentIdCounter] = useState(1);
  const [customerOrderNumber, setCustomerOrderNumber] = useState<string>(
    formatDisplayCustomerOrderNumber(headerPreview?.customerOrderId || 0)
  );
  const [customerOrderDetails, setCustomerOrderDetails] = useState<OrderMasterReq | null>(null);
  const [routingSteps, setRoutingSteps] = useState<JobOrderRoutingStep[]>([]);
  const routingStepsRef = useRef<JobOrderRoutingStep[]>([]);
  const formDataRef = useRef(formData);
  const [newRoutingStep, setNewRoutingStep] = useState<Partial<JobOrderRoutingStep>>({
    sequence: 1,
    processName: "",
    estimatedTime: 0,
  });
  const [showCustomerOrderSlideout, setShowCustomerOrderSlideout] = useState(false);
  const [enableJobTracking, setEnableJobTracking] = useState(false);
  const [stepTimers, setStepTimers] = useState<Map<number, NodeJS.Timeout>>(new Map());
  /** Forces re-render so wall-clock elapsed updates while steps are running. */
  const [, setElapsedTick] = useState(0);
  const [trackingSaving, setTrackingSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [trackingDialog, setTrackingDialog] = useState<null | {
    type: "pause" | "complete" | "reopen" | "replaceTemplate" | "stepNote";
    stepId?: number;
    template?: JobTemplate;
  }>(null);
  const [completeQtyInput, setCompleteQtyInput] = useState("");
  const [completeQtyError, setCompleteQtyError] = useState("");
  const [stepNoteInput, setStepNoteInput] = useState("");
  const [stepMenu, setStepMenu] = useState<null | {
    stepId: number;
    top?: number;
    bottom?: number;
    right: number;
  }>(null);
  const [barcodeDialog, setBarcodeDialog] = useState<null | {
    stepId: number;
    scanCode: string;
    label: string;
    qrDataUrl: string;
  }>(null);
  const [ncrSlideout, setNcrSlideout] = useState<null | {
    ncrId: number;
    stepId: number;
    prefill?: Partial<NonConformanceReport>;
  }>(null);
  const [showTextEditorPopup, setShowTextEditorPopup] = useState(false);
  const [editingPartDesc, setEditingPartDesc] = useState<string>("");
  const [processes, setProcesses] = useState<ProcessMaster[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationMaster[]>([]);
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<JobTemplate | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [showSaveAsTemplateDialog, setShowSaveAsTemplateDialog] = useState(false);
  const [savingAsTemplate, setSavingAsTemplate] = useState(false);
  const [saveAsTemplateForm, setSaveAsTemplateForm] = useState({
    TemplateCode: "",
    TemplateName: "",
    Revision: 1,
  });

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      Tenantid: storage?.tenantID || 0,
      UserId: storage?.userId || 0,
      UserToken: storage?.userToken || 0,
    }));

    setInitialLoading(jobOrderId > 0);
    if (jobOrderId > 0) {
      loadJobOrder();
    }

    // Load processes from Process Master
    loadProcesses();
    // Load workstations and employees
    loadWorkstations();
    loadEmployees();
  }, [jobOrderId]);

  // Keep refs in sync so async track/note/NCR saves never use a stale step list.
  useEffect(() => {
    routingStepsRef.current = routingSteps;
  }, [routingSteps]);

  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const loadProcesses = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1;
      }

      const result = await ProcessService.GetProcesses({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        // Filter to only show active processes
        const activeProcesses = result.filter(p => p.status === 1);
        setProcesses(activeProcesses);
      }
    } catch (error: any) {
      console.error("Error loading processes:", error);
      // Don't show error toast, just log it
    }
  };

  const loadWorkstations = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1;
      }

      const result = await WorkstationService.GetWorkstations({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        // Filter to only show active workstations
        const activeWorkstations = result.filter(w => w.isActive);
        setWorkstations(activeWorkstations);
      }
    } catch (error: any) {
      console.error("Error loading workstations:", error);
    }
  };

  const loadEmployees = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === 'development') {
        tenantID = 1;
      }

      const result = await EmployeeService.GetEmployees({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        // Filter to only show active employees
        const activeEmployees = result.filter(e => e.status === "Active");
        setEmployees(activeEmployees);
      }
    } catch (error: any) {
      console.error("Error loading employees:", error);
    }
  };

  // Keep job Status aligned with routing-step progress (same rules as PWA / API).
  useEffect(() => {
    if (routingSteps.length === 0) return;
    setFormData((prev) => {
      const next = deriveJobStatus(prev.Status, routingSteps);
      if (next === prev.Status) return prev;
      if (next === "Completed" && prev.Status !== "Completed" && prev.Status !== "Cancelled") {
        toast.info("All steps completed. Job automatically marked as completed.");
      }
      return { ...prev, Status: next };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingSteps]);

  const syncSteps = (updatedSteps: JobOrderRoutingStep[]) => {
    routingStepsRef.current = updatedSteps;
    setRoutingSteps(updatedSteps);
    setFormData((prev) => {
      const next = {
        ...prev,
        RoutingSteps: updatedSteps,
      };
      formDataRef.current = next;
      return next;
    });
  };

  const clearStepTimer = (stepId: number) => {
    const timer = stepTimers.get(stepId);
    if (timer) {
      clearInterval(timer);
      setStepTimers((prev) => {
        const next = new Map(prev);
        next.delete(stepId);
        return next;
      });
    }
  };

  const startDisplayTimer = (stepId: number) => {
    clearStepTimer(stepId);
    // 1s tick so M:SS display stays accurate while running.
    const timer = setInterval(() => {
      setElapsedTick((t) => t + 1);
    }, 1000);
    setStepTimers((prev) => new Map(prev).set(stepId, timer));
  };

  /** Persist tracking actions immediately so Start/Pause/Complete survive without a full form Save. */
  const persistTrackingSteps = async (updatedSteps: JobOrderRoutingStep[]): Promise<boolean> => {
    const currentForm = formDataRef.current;
    const id = jobOrderId > 0 ? jobOrderId : currentForm.JobOrderID;
    if (!id || id <= 0) {
      return false;
    }

    const stepsToSave = commitLiveElapsed(updatedSteps);
    const statusToSave = deriveJobStatus(currentForm.Status, stepsToSave);
    setTrackingSaving(true);
    try {
      await JobOrderService.SaveJobOrder({
        ...currentForm,
        JobOrderID: id,
        Status: statusToSave,
        EnableJobTracking: enableJobTracking,
        RoutingSteps: stepsToSave,
        Attachments: attachments,
        Comments: comments,
      });
      setFormData((prev) => {
        const next = {
          ...prev,
          Status: statusToSave,
          EnableJobTracking: enableJobTracking,
          RoutingSteps: stepsToSave,
        };
        formDataRef.current = next;
        return next;
      });
      routingStepsRef.current = stepsToSave;
      setRoutingSteps(stepsToSave);
      onSaved?.();
      return true;
    } catch (error: any) {
      console.error("Error saving step tracking:", error);
      const apiError =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Unknown error";
      toast.error(`Could not save step progress: ${apiError}`);
      return false;
    } finally {
      setTrackingSaving(false);
    }
  };

  const loadJobOrder = async () => {
    setLoading(true);
    try {
      const jobOrder = await JobOrderService.GetJobOrderById(jobOrderId);
      if (jobOrder) {
        // Apply the job order immediately so the header (JO #) can paint without
        // waiting on the linked customer order fetch.
        setFormData(jobOrder);
        setAttachments(jobOrder.Attachments || []);
        setComments(jobOrder.Comments || []);
        const steps = jobOrder.RoutingSteps || [];
        setRoutingSteps(steps);
        setEnableJobTracking(!!jobOrder.EnableJobTracking);

        // Resume wall-clock display ticks for any steps left running.
        stepTimers.forEach((timer) => clearInterval(timer));
        const nextTimers = new Map<number, NodeJS.Timeout>();
        steps.forEach((s) => {
          if (s.progressState === "running") {
            nextTimers.set(
              s.id,
              setInterval(() => {
                setElapsedTick((t) => t + 1);
              }, 1000)
            );
          }
        });
        setStepTimers(nextTimers);

        if (jobOrder.CustomerOrderID > 0) {
          try {
            const order = await OrderService.GetOrderById(jobOrder.CustomerOrderID);
            if (order) {
              setCustomerOrderDetails(order);
              setCustomerOrderNumber(formatDisplayCustomerOrderNumber(order.PONumber));
            }
          } catch (err) {
            console.error("Error loading customer order:", err);
          }
        }
      }
    } catch (error: any) {
      console.error("Error loading job order:", error);
      toast.error(`Error loading job order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  const handleInputChange = (field: keyof JobOrderMasterReq, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Helper function to get first line of text
  const getFirstLine = (text: string): string => {
    if (!text) return "";
    // Get the first line (split by newline and take first part)
    const firstLine = text.split(/\r?\n/)[0];
    return firstLine;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const stepsToSave = commitLiveElapsed(routingSteps);
      const statusToSave = deriveJobStatus(formData.Status, stepsToSave);
      const result = await JobOrderService.SaveJobOrder({
        ...formData,
        Status: statusToSave,
        EnableJobTracking: enableJobTracking,
        RoutingSteps: stepsToSave,
        Attachments: attachments,
        Comments: comments,
      });
      if (result && result.id > 0) {
        toast.success("Job order saved successfully");
        setRoutingSteps(stepsToSave);
        setFormData((prev) => ({
          ...prev,
          JobOrderID: result.id,
          Status: statusToSave,
          EnableJobTracking: enableJobTracking,
          RoutingSteps: stepsToSave,
        }));
        onSaved?.();
        // Stay open — reload so server-derived status / tracking match UI.
        if (jobOrderId > 0) {
          await loadJobOrder();
        }
      } else {
        toast.error("Failed to save job order");
      }
    } catch (error: any) {
      console.error("Error saving job order:", error);
      toast.error(`Error saving job order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    try {
      const response = await JobOrderService.CheckJobOrderDeletionImpact(jobOrderId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const response = await JobOrderService.CheckJobOrderDeletionImpact(jobOrderId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
      setShowDeletionDialog(true);
    } catch (error: any) {
      console.error("Error checking deletion impact:", error);
      toast.error(`Error checking deletion impact: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeletion = async () => {
    setLoading(true);
    try {
      await JobOrderService.DeleteJobOrder(jobOrderId);
      toast.success("Job order deleted successfully");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting job order:", error);
      toast.error(`Error deleting job order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose(false);
  };

  const handleAddAttachment = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const newAttachment = {
          id: attachmentIdCounter,
          name: file.name,
          size: file.size,
          fileUrl: URL.createObjectURL(file),
        };
        setAttachments((prev) => [...prev, newAttachment]);
        setAttachmentIdCounter((prev) => prev + 1);
        setFormData((prev) => ({
          ...prev,
          Attachments: [...(prev.Attachments || []), newAttachment],
        }));
      }
    };
    input.click();
  };

  const handleDeleteAttachment = (id: number) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setFormData((prev) => ({
      ...prev,
      Attachments: (prev.Attachments || []).filter((a) => a.id !== id),
    }));
  };

  const handleAddComment = () => {
    if (!newComment.trim()) {
      toast.error("Please enter a comment");
      return;
    }

    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const newCommentObj = {
      id: commentIdCounter,
      text: newComment,
      createdAt: new Date().toISOString(),
      createdBy: storage?.userName || "User",
    };

    setComments((prev) => [...prev, newCommentObj]);
    setFormData((prev) => ({
      ...prev,
      Comments: [...(prev.Comments || []), newCommentObj],
    }));
    setNewComment("");
    setCommentIdCounter((prev) => prev + 1);
  };

  const handleApplyJobTemplate = async (pickedTemplate?: JobTemplate) => {
    const sourceTemplate = pickedTemplate || selectedTemplate;
    if (!sourceTemplate) {
      toast.error("Please select a job template");
      return;
    }

    if (routingSteps.length > 0) {
      setTrackingDialog({ type: "replaceTemplate", template: sourceTemplate });
      return;
    }

    await applyJobTemplate(sourceTemplate);
  };

  const applyJobTemplate = async (sourceTemplate: JobTemplate) => {
    setApplyingTemplate(true);
    try {
      const template = await JobTemplateService.GetJobTemplateById(sourceTemplate.id);
      const operations = template?.Operations || [];

      if (operations.length === 0) {
        toast.error("This job template has no operations to apply");
        return;
      }

      // Cycle time is per piece, so a job needs one setup plus a cycle for every unit ordered.
      // Quantity is floored at 1 so a not-yet-quantified job still gets a usable estimate.
      const qtyMultiplier = Math.max(1, formData.QtyOrdered || 0);
      const joId = formData.JobOrderID || jobOrderId;
      let unavailableReferences = 0;

      const steps: JobOrderRoutingStep[] = operations
        .slice()
        .sort((a, b) => a.SequenceNumber - b.SequenceNumber)
        .map((operation, index) => {
          const processMissing =
            !!operation.ProcessId && !processes.some((p) => p.id === operation.ProcessId);
          const workstationMissing =
            !!operation.WorkstationId && !workstations.some((w) => w.id === operation.WorkstationId);
          if (processMissing || workstationMissing) {
            unavailableReferences += 1;
          }

          const setupTime = operation.SetupTimeMinutes || 0;
          const cycleTime = operation.CycleTimeMinutes || 0;
          const stepId = index + 1;

          return {
            id: stepId,
            sequence: operation.SequenceNumber,
            processName: operation.ProcessName || "",
            processId: operation.ProcessId ?? undefined,
            workstationName: operation.WorkstationName || "",
            workstationId: operation.WorkstationId ?? undefined,
            estimatedTime: Math.round(setupTime + cycleTime * qtyMultiplier),
            description: operation.Instructions || "",
            status: "Pending",
            progressState: "idle",
            qtyProduced: 0,
            elapsedTime: 0,
            notes: [],
            ncrFlags: [],
            scanCode: joId > 0 ? buildStepScanCode(joId, stepId) : undefined,
          } as JobOrderRoutingStep;
        });

      // The replaced steps take their ids with them, so any running timer is now orphaned.
      stepTimers.forEach((timer) => clearInterval(timer));
      setStepTimers(new Map());

      setRoutingSteps(steps);
      setSelectedTemplate(sourceTemplate);
      setFormData((prev) => ({
        ...prev,
        RoutingSteps: steps,
        JobTemplateId: template?.Id || sourceTemplate.id,
        JobTemplateCode: template?.TemplateCode || sourceTemplate.templateCode,
        JobTemplateRevision: template?.Revision ?? sourceTemplate.revision ?? null,
      }));
      setNewRoutingStep({
        sequence: Math.max(...steps.map((s) => s.sequence)) + 10,
        processName: "",
        processId: undefined,
        estimatedTime: 0,
      });

      toast.success(
        `${steps.length} step(s) added from template ${template?.TemplateCode || ""}`.trim()
      );
      if (unavailableReferences > 0) {
        toast.warning(
          `${unavailableReferences} step(s) reference a process or workstation that is no longer active. Review them before saving.`
        );
      }
    } catch (error: any) {
      console.error("Error applying job template:", error);
      toast.error(`Error applying job template: ${error.message || "Unknown error"}`);
    } finally {
      setApplyingTemplate(false);
    }
  };

  const handleTemplatePicked = async (template: JobTemplate) => {
    setSelectedTemplate(template);
    setShowTemplatePicker(false);
    await handleApplyJobTemplate(template);
  };

  const handleClearJobTemplateLink = () => {
    setFormData((prev) => ({
      ...prev,
      JobTemplateId: null,
      JobTemplateCode: "",
      JobTemplateRevision: null,
    }));
  };

  const openSaveAsTemplateDialog = () => {
    if (!routingSteps.length) {
      toast.error("Add at least one routing step before saving as a template");
      return;
    }
    const missingProcess = routingSteps.find((s) => !s.processId);
    if (missingProcess) {
      toast.error(
        `Step ${missingProcess.sequence} is missing a process. Select a process for every step before saving as a template.`
      );
      return;
    }

    const joLabel =
      formData.JobOrderNumber > 0
        ? formData.JobOrderNumber < 1000
          ? `JO${formData.JobOrderNumber + 999}`
          : `JO${formData.JobOrderNumber}`
        : "JO";
    const partHint = (formData.PartNo || formData.PartName || "Router").trim();
    setSaveAsTemplateForm({
      TemplateCode: `${joLabel}-${partHint}`.replace(/\s+/g, "-").slice(0, 40),
      TemplateName: `${partHint} Router`.slice(0, 100),
      Revision: 1,
    });
    setShowSaveAsTemplateDialog(true);
  };

  const handleSaveAsTemplate = async () => {
    const code = saveAsTemplateForm.TemplateCode.trim();
    const name = saveAsTemplateForm.TemplateName.trim();
    const revision = Number(saveAsTemplateForm.Revision) || 0;

    if (!code) {
      toast.error("Template code is required");
      return;
    }
    if (!name) {
      toast.error("Template name is required");
      return;
    }
    if (revision < 1) {
      toast.error("Revision must be 1 or greater");
      return;
    }
    if (!routingSteps.length) {
      toast.error("Add at least one routing step before saving as a template");
      return;
    }

    const missingProcess = routingSteps.find((s) => !s.processId);
    if (missingProcess) {
      toast.error(
        `Step ${missingProcess.sequence} is missing a process. Select a process for every step before saving as a template.`
      );
      return;
    }

    // JO stores a single estimatedTime; reverse the apply formula by treating it as
    // cycle time for the ordered qty (setup = 0) so re-applying with the same qty recovers it.
    const qtyMultiplier = Math.max(1, formData.QtyOrdered || 0);
    const operations = [...routingSteps]
      .sort((a, b) => a.sequence - b.sequence)
      .map((step) => ({
        Id: 0,
        SequenceNumber: step.sequence > 0 ? step.sequence : 10,
        ProcessId: step.processId || null,
        ProcessName: step.processName || "",
        WorkstationId: step.workstationId || null,
        WorkstationName: step.workstationName || "",
        SetupTimeMinutes: 0,
        CycleTimeMinutes: Math.round(((step.estimatedTime || 0) / qtyMultiplier) * 100) / 100,
        Instructions: step.description || "",
        IsMandatory: true,
        QualityCheckRequired: false,
      }));

    const firstWithProcess = routingSteps.find((s) => s.processId);
    const payload: JobTemplateReq = {
      Id: 0,
      Tenantid: formData.Tenantid || 0,
      TemplateCode: code,
      TemplateName: name,
      Description: `Saved from Job Order ${
        formData.JobOrderNumber > 0
          ? formData.JobOrderNumber < 1000
            ? `JO#${formData.JobOrderNumber + 999}`
            : `JO#${formData.JobOrderNumber}`
          : ""
      }`.trim(),
      Status: "Active",
      Revision: revision,
      EffectiveFrom: null,
      EffectiveTo: null,
      PrimaryProcessId: firstWithProcess?.processId || null,
      WorkstationId: firstWithProcess?.workstationId || null,
      EstimatedSetupTimeMinutes: null,
      EstimatedCycleTimeMinutes: null,
      EstimatedLabourTimeMinutes: null,
      EstimatedMachineTimeMinutes: null,
      DefaultMaterial: "",
      MaterialGrade: "",
      RawMaterialSize: "",
      MaterialNotes: "",
      Tool: "",
      Fixture: "",
      Workholding: "",
      Gauge: "",
      ToolingNotes: "",
      InspectionType: "",
      FirstArticleRequired: false,
      InProcessInspection: false,
      FinalInspection: false,
      CmmRequired: false,
      InspectionNotes: "",
      Operations: operations,
      CategoryValueIds: [],
      IsSystem: false,
    };

    setSavingAsTemplate(true);
    try {
      const result = await JobTemplateService.SaveJobTemplate(payload);
      const newId = result?.id || 0;
      toast.success(`Job template ${code} saved successfully`);
      setShowSaveAsTemplateDialog(false);

      if (newId > 0) {
        setFormData((prev) => ({
          ...prev,
          JobTemplateId: newId,
          JobTemplateCode: code,
          JobTemplateRevision: revision,
        }));
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(`Error saving job template: ${message}`);
    } finally {
      setSavingAsTemplate(false);
    }
  };

  const handleAddRoutingStep = () => {
    if (!newRoutingStep.processId || !newRoutingStep.processName?.trim()) {
      toast.error("Please select a process/operation name");
      return;
    }

    const stepId =
      routingSteps.length > 0 ? Math.max(...routingSteps.map((s) => s.id)) + 1 : 1;
    const joId = formData.JobOrderID || jobOrderId;
    const step: JobOrderRoutingStep = {
      id: stepId,
      sequence: newRoutingStep.sequence || routingSteps.length + 1,
      processName: newRoutingStep.processName || "",
      processId: newRoutingStep.processId,
      workstationName: newRoutingStep.workstationName,
      workstationId: newRoutingStep.workstationId,
      estimatedTime: newRoutingStep.estimatedTime || 0,
      description: newRoutingStep.description,
      status: "Pending",
      progressState: "idle",
      qtyProduced: 0,
      elapsedTime: 0,
      notes: [],
      ncrFlags: [],
      scanCode: joId > 0 ? buildStepScanCode(joId, stepId) : undefined,
    };

    const updatedSteps = [...routingSteps, step].sort((a, b) => a.sequence - b.sequence);
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));
    
    // Reset form
    setNewRoutingStep({
      sequence: Math.max(...updatedSteps.map((s) => s.sequence)) + 1,
      processName: "",
      processId: undefined,
      estimatedTime: 0,
    });
  };

  const handleDeleteRoutingStep = (id: number) => {
    clearStepTimer(id);

    const updatedSteps = routingSteps.filter((s) => s.id !== id);
    syncSteps(updatedSteps);
  };

  // Job tracking handlers — flexible sequencing (any op may start); Complete locks until Reopen.
  const handleStartStep = async (stepId: number) => {
    const step = routingStepsRef.current.find((s) => Number(s.id) === Number(stepId));
    if (!step || isStepCompleted(step)) return;

    const updatedSteps = routingStepsRef.current.map((s) =>
      Number(s.id) === Number(stepId)
        ? {
            ...s,
            progressState: "running" as const,
            startTime: new Date().toISOString(),
            elapsedTime: s.elapsedTime || 0,
            elapsedSeconds: getCommittedSeconds(s),
            status: "In Progress",
            pauseReason: undefined,
          }
        : s
    );

    syncSteps(updatedSteps);
    startDisplayTimer(stepId);
    await persistTrackingSteps(updatedSteps);
  };

  const requestPauseStep = (stepId: number) => {
    setTrackingDialog({ type: "pause", stepId });
  };

  const confirmPauseStep = async (reason: string) => {
    const stepId = trackingDialog?.type === "pause" ? trackingDialog.stepId : undefined;
    setTrackingDialog(null);
    if (stepId == null) return;

    clearStepTimer(stepId);
    const nowMs = Date.now();
    const updatedSteps = routingStepsRef.current.map((s) => {
      if (Number(s.id) !== Number(stepId)) return s;
      return {
        ...s,
        progressState: "paused" as const,
        ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
        startTime: undefined,
        pauseReason: reason || undefined,
      };
    });

    syncSteps(updatedSteps);
    await persistTrackingSteps(updatedSteps);
  };

  const handleResumeStep = async (stepId: number) => {
    await handleStartStep(stepId);
  };

  const requestCompleteStep = (stepId: number) => {
    const step = routingSteps.find((s) => s.id === stepId);
    if (!step || isStepCompleted(step)) return;
    const initialQty =
      step.qtyProduced && step.qtyProduced > 0
        ? step.qtyProduced
        : formData.QtyOrdered || 0;
    setCompleteQtyInput(String(initialQty));
    setCompleteQtyError("");
    setTrackingDialog({ type: "complete", stepId });
  };

  const confirmCompleteStep = async (forceComplete = false) => {
    const stepId = trackingDialog?.type === "complete" ? trackingDialog.stepId : undefined;
    if (stepId == null) return;

    const step = routingStepsRef.current.find((s) => Number(s.id) === Number(stepId));
    if (!step || isStepCompleted(step)) {
      setTrackingDialog(null);
      return;
    }

    const qty = parseInt(completeQtyInput, 10);
    if (Number.isNaN(qty) || qty < 0) {
      setCompleteQtyError("Enter a valid quantity (0 or greater).");
      return;
    }

    const orderQty = formDataRef.current.QtyOrdered || 0;
    const meetsOrderQty = orderQty <= 0 || qty >= orderQty;
    const shouldComplete = forceComplete || meetsOrderQty;

    setTrackingDialog(null);
    setCompleteQtyError("");
    const nowMs = Date.now();

    if (!shouldComplete) {
      // Partial qty: save produced qty, pause clock, keep operation open.
      clearStepTimer(stepId);
      const updatedSteps = routingStepsRef.current.map((s) => {
        if (Number(s.id) !== Number(stepId)) return s;
        return {
          ...s,
          qtyProduced: qty,
          progressState: "paused" as const,
          status: "In Progress",
          ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
          startTime: undefined,
          pauseReason: s.pauseReason || "Partial quantity",
        };
      });
      syncSteps(updatedSteps);
      await persistTrackingSteps(updatedSteps);
      toast.info(
        `Qty saved (${qty} of ${orderQty}). Operation stays open until order qty is met.`
      );
      return;
    }

    clearStepTimer(stepId);
    const updatedSteps = routingStepsRef.current.map((s) => {
      if (Number(s.id) !== Number(stepId)) return s;
      return {
        ...s,
        qtyProduced: qty,
        progressState: "stopped" as const,
        status: "Completed",
        ...toElapsedFields(computeElapsedSeconds(s, nowMs)),
        startTime: undefined,
      };
    });

    syncSteps(updatedSteps);
    await persistTrackingSteps(updatedSteps);
    toast.success("Operation completed");
  };

  const requestReopenStep = (stepId: number) => {
    const step = routingSteps.find((s) => s.id === stepId);
    if (!step || !isStepCompleted(step)) return;
    setTrackingDialog({ type: "reopen", stepId });
  };

  const confirmReopenStep = async () => {
    const stepId = trackingDialog?.type === "reopen" ? trackingDialog.stepId : undefined;
    setTrackingDialog(null);
    if (stepId == null) return;

    const step = routingStepsRef.current.find((s) => Number(s.id) === Number(stepId));
    if (!step || !isStepCompleted(step)) return;

    const updatedSteps = routingStepsRef.current.map((s) =>
      Number(s.id) === Number(stepId)
        ? {
            ...s,
            progressState: "idle" as const,
            status: "Pending",
            startTime: undefined,
          }
        : s
    );

    syncSteps(updatedSteps);
    await persistTrackingSteps(updatedSteps);
    toast.info("Operation reopened — job set to In Progress if it was Completed");
  };

  const handleUpdateQtyProduced = (stepId: number, qty: number) => {
    const updatedSteps = routingSteps.map((s) =>
      s.id === stepId ? { ...s, qtyProduced: qty } : s
    );
    syncSteps(updatedSteps);
  };

  const ensureStepScanCode = async (stepId: number): Promise<string> => {
    const joId = formData.JobOrderID || jobOrderId;
    const step = routingSteps.find((s) => s.id === stepId);
    if (!step || !joId) return "";

    if (step.scanCode) return step.scanCode;

    const scanCode = buildStepScanCode(joId, stepId);
    const updatedSteps = routingSteps.map((s) =>
      s.id === stepId ? { ...s, scanCode } : s
    );
    syncSteps(updatedSteps);
    await persistTrackingSteps(updatedSteps);
    return scanCode;
  };

  const openStepBarcode = async (stepId: number) => {
    setStepMenu(null);
    const step = routingSteps.find((s) => s.id === stepId);
    if (!step) return;

    try {
      const scanCode = await ensureStepScanCode(stepId);
      if (!scanCode) {
        toast.error("Save the job order before generating a step barcode.");
        return;
      }
      const qrDataUrl = await QRCode.toDataURL(scanCode, {
        width: 240,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      const joLabel =
        formatDisplayJobOrderNumber(formData.JobOrderNumber) ||
        `JO#${formData.JobOrderNumber || formData.JobOrderID}`;
      setBarcodeDialog({
        stepId,
        scanCode,
        label: `${joLabel} · Step ${step.sequence}: ${step.processName}`,
        qrDataUrl,
      });
    } catch (error: any) {
      console.error("Error generating step barcode:", error);
      toast.error("Could not generate barcode");
    }
  };

  const copyScanCode = async (scanCode: string) => {
    try {
      await navigator.clipboard.writeText(scanCode);
      toast.success("Scan code copied");
    } catch {
      toast.error("Could not copy scan code");
    }
  };

  const requestStepNote = (stepId: number) => {
    setStepMenu(null);
    setStepNoteInput("");
    setTrackingDialog({ type: "stepNote", stepId });
  };

  const confirmAddStepNote = async () => {
    const stepId = trackingDialog?.type === "stepNote" ? trackingDialog.stepId : undefined;
    if (stepId == null) return;
    const text = stepNoteInput.trim();
    if (!text) {
      toast.error("Please enter a note");
      return;
    }

    const joId = jobOrderId > 0 ? jobOrderId : formDataRef.current.JobOrderID;
    if (!joId || joId <= 0) {
      toast.error("Save the job order first, then add notes");
      return;
    }

    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const currentSteps = routingStepsRef.current;
    const existingNotes =
      currentSteps.find((s) => Number(s.id) === Number(stepId))?.notes || [];
    const nextNoteId =
      existingNotes.reduce((max, n) => Math.max(max, Number(n.id) || 0), 0) + 1;
    const note: JobOrderStepNote = {
      id: nextNoteId,
      text,
      createdAt: new Date().toISOString(),
      createdBy: storage?.userName || storage?.userLogin || "User",
    };

    const updatedSteps = currentSteps.map((s) =>
      Number(s.id) === Number(stepId)
        ? { ...s, notes: [...(s.notes || []), note] }
        : s
    );

    setStepNoteInput("");
    syncSteps(updatedSteps);
    const saved = await persistTrackingSteps(updatedSteps);
    if (saved) {
      toast.success("Note added");
      // Keep dialog open so the new note is visible immediately.
      setTrackingDialog({ type: "stepNote", stepId });
    } else {
      // Re-open dialog with the draft text so the user can retry.
      setStepNoteInput(text);
      setTrackingDialog({ type: "stepNote", stepId });
    }
  };

  const openCreateNcrForStep = (stepId: number) => {
    setStepMenu(null);
    const step = routingSteps.find((s) => s.id === stepId);
    if (!step) return;

    const existing = step.ncrFlags?.[0];
    if (existing?.ncrId) {
      openExistingNcr(stepId, existing.ncrId);
      return;
    }

    const joLabel =
      formatDisplayJobOrderNumber(formData.JobOrderNumber) ||
      `JO#${formData.JobOrderNumber || formData.JobOrderID}`;
    setTrackingDialog(null);
    setNcrSlideout({
      ncrId: 0,
      stepId,
      prefill: {
        title: `NCR — ${joLabel} / Step ${step.sequence}: ${step.processName}`,
        description: "",
        source: "Internal",
        category: "Process_Failure",
        severity: "Minor",
        status: "Open",
        jobOrderId: formData.JobOrderID || jobOrderId,
        jobOrderNumber: String(formData.JobOrderNumber || ""),
        routingStepId: step.id,
        partNo: formData.PartNo,
        partName: formData.PartName,
        customerId: formData.CustomerID,
        customerName: formData.CustomerName,
        totalQuantity: formData.QtyOrdered || 0,
        defectQuantity: 1,
        defectLocation: step.processName,
        defectDescription: "",
      },
    });
  };

  const openExistingNcr = (stepId: number, ncrId: number) => {
    setStepMenu(null);
    setTrackingDialog(null);
    setNcrSlideout({
      ncrId,
      stepId,
      prefill: {
        jobOrderId: formData.JobOrderID || jobOrderId,
      },
    });
  };

  const handleNcrCreated = async (ncr: NonConformanceReport) => {
    const stepId = ncrSlideout?.stepId;
    if (stepId == null || !ncr?.ncrId) return;

    // One NCR per step — replace any prior flag with the newly created record.
    // Use ref so we keep any notes added while the NCR slideout was open.
    const updatedSteps = routingStepsRef.current.map((s) => {
      if (Number(s.id) !== Number(stepId)) return s;
      return {
        ...s,
        ncrFlags: [
          {
            ncrId: ncr.ncrId,
            ncrNumber: ncr.ncrNumber || `NCR-${ncr.ncrId}`,
            status: ncr.status || "Open",
          },
        ],
      };
    });

    syncSteps(updatedSteps);
    await persistTrackingSteps(updatedSteps);
  };

  const closeNcrSlideoutSafely = () => {
    // Defer unmount so the click that saved/closed NCR does not hit the JO overlay.
    window.setTimeout(() => setNcrSlideout(null), 150);
  };

  const handleUpdateTechnician = (stepId: number, technicianName: string) => {
    const updatedSteps = routingSteps.map(s => 
      s.id === stepId ? { ...s, technicianName } : s
    );
    
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));
  };

  const handleUpdateAssignedTo = (stepId: number, value: string) => {
    // Value format: "WS:123" for workstation or "EMP:456" for employee
    const updatedSteps = routingSteps.map(s => {
      if (s.id === stepId) {
        if (value.startsWith("WS:")) {
          const workstationId = parseInt(value.replace("WS:", ""));
          const workstation = workstations.find(w => w.id === workstationId);
          return {
            ...s,
            workstationId,
            workstationName: workstation?.workstationName || "",
            technicianId: undefined,
            technicianName: undefined
          };
        } else if (value.startsWith("EMP:")) {
          const technicianId = parseInt(value.replace("EMP:", ""));
          const employee = employees.find(e => e.user_UniqueID === technicianId);
          return {
            ...s,
            technicianId,
            technicianName: employee ? `${employee.firstName} ${employee.lastName}` : "",
            workstationId: undefined,
            workstationName: undefined
          };
        } else {
          // Clear assignment
          return {
            ...s,
            workstationId: undefined,
            workstationName: undefined,
            technicianId: undefined,
            technicianName: undefined
          };
        }
      }
      return s;
    });
    
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));
  };

  const getAssignedToValue = (step: JobOrderRoutingStep): string => {
    if (step.workstationId) {
      return `WS:${step.workstationId}`;
    } else if (step.technicianId) {
      return `EMP:${step.technicianId}`;
    }
    return "";
  };

  const getAssignedToDisplay = (step: JobOrderRoutingStep): string => {
    if (step.workstationName) {
      return step.workstationName;
    } else if (step.technicianName) {
      return step.technicianName;
    }
    return "-";
  };

  // Quick completion handlers
  const handleMarkJobComplete = () => {
    setFormData((prev) => ({ ...prev, Status: "Completed" }));
    toast.success("Job marked as completed");
  };

  const handleToggleStepCompletion = (stepId: number) => {
    const step = routingSteps.find(s => s.id === stepId);
    if (!step) return;

    const newStatus = step.status === "Completed" ? "Pending" : "Completed";
    const updatedSteps = routingSteps.map(s =>
      s.id === stepId ? { ...s, status: newStatus } : s
    );

    syncSteps(updatedSteps);

    toast.success(`Step ${newStatus === "Completed" ? "marked as completed" : "reopened"}`);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      stepTimers.forEach((timer) => clearInterval(timer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close step overflow menu on outside click / Escape
  useEffect(() => {
    if (stepMenu == null) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(".jo-step-menu") || target?.closest(".jo-step-menu-dropdown")) {
        return;
      }
      setStepMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStepMenu(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [stepMenu]);

  const convertToDateInputFormat = (dateStr: string): string => {
    if (!dateStr) return "";
    try {
      const parts = dateStr.split("/");
      if (parts.length === 3) {
        const month = parts[0].padStart(2, "0");
        const day = parts[1].padStart(2, "0");
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return `${year}-${month}-${day}`;
      }
      return dateStr;
    } catch {
      return "";
    }
  };

  const convertFromDateInputFormat = (dateStr: string): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const year = String(date.getFullYear()).slice(-2);
      return `${month}/${day}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const handlePrintJobOrder = async () => {
    if (!jobOrderId || jobOrderId === 0) {
      toast.error('Job order not loaded');
      return;
    }
    if (printing) return;

    setPrinting(true);
    const toastId = toast.info("Generating Job Order PDF…", { autoClose: false });
    try {
      const blob = await PdfService.GenerateJobOrder(jobOrderId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const jobOrderNumber = formData.JobOrderNumber < 1000 
        ? `JO#${formData.JobOrderNumber + 999}` 
        : `JO#${formData.JobOrderNumber}`;
      link.download = `JobOrder_${jobOrderNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.update(toastId, {
        render: "Job Order PDF ready",
        type: "success",
        autoClose: 3000,
      });
    } catch (error: any) {
      console.error('Error generating job order PDF:', error);
      toast.update(toastId, {
        render: error.response?.data?.error || "Failed to generate job order PDF",
        type: "error",
        autoClose: 5000,
      });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div
      className="job-order-slideout-overlay"
      onClick={() => {
        // Ignore overlay clicks while nested NCR/dialogs are open (and the click
        // that closes them), so Save on NCR doesn't close the Job Order slideout.
        if (ncrSlideout || trackingDialog || barcodeDialog) return;
        handleCancel();
      }}
    >
      <div className="job-order-slideout-card" onClick={(e) => e.stopPropagation()}>
        <div className="job-order-slideout-header">
          <div className="jo-header-title-block">
            <h2>{jobOrderId > 0 ? "Edit Job Order" : "New Job Order"}</h2>
            {jobOrderId > 0 && (
              <div className="jo-header-meta" aria-live="polite">
                {formatDisplayJobOrderNumber(formData.JobOrderNumber) ? (
                  <>
                    <span>
                      Job Order Number: {formatDisplayJobOrderNumber(formData.JobOrderNumber)}
                    </span>
                    {(customerOrderNumber ||
                      formData.CustomerOrderID > 0 ||
                      initialLoading) && (
                      <span
                        className={`jo-header-meta-co ${customerOrderNumber ? "" : "is-pending"}`}
                      >
                        → From Order: {customerOrderNumber || "CO#----"}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="jo-header-meta-placeholder">Loading job details…</span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {jobOrderId > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void handlePrintJobOrder()}
                  disabled={printing}
                  title={printing ? "Generating PDF…" : "Print job order"}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: printing ? '#9ca3af' : '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: printing ? 'wait' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    opacity: printing ? 0.85 : 1,
                  }}
                >
                  <FontAwesomeIcon icon={faPrint} spin={printing} />
                  {printing ? "Generating…" : "Print"}
                </button>
                <button
                  type="button"
                  className="btn-icon btn-icon-danger"
                  onClick={handleDelete}
                  title="Delete"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </>
            )}
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <div className="status-field-inline" title="Job priority for shop-floor assignment">
                <div
                  className={`input-group jo-priority-group jo-priority-group--${normalizeJobPriority(formData.JobPriority)}`}
                  style={{ maxWidth: "130px" }}
                >
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
                      </svg>
                    </span>
                  </div>
                  <select
                    className="form-input"
                    value={normalizeJobPriority(formData.JobPriority)}
                    onChange={(e) => handleInputChange("JobPriority", parseInt(e.target.value, 10))}
                    aria-label="Job priority"
                  >
                    {JOB_PRIORITY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="status-field-inline">
                <div className={`input-group ${formData.Status === "In Progress" || formData.Status === "Partially Shipped" || formData.Status === "Shipped" || formData.Status === "Completed" ? "status-active-group" : "status-inactive-group"}`} style={{ maxWidth: "150px" }}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                      </svg>
                    </span>
                  </div>
                  <select
                    className={`form-input ${formData.Status === "In Progress" || formData.Status === "Partially Shipped" || formData.Status === "Shipped" || formData.Status === "Completed" ? "status-active" : "status-inactive"}`}
                    value={formData.Status}
                    onChange={(e) => handleInputChange("Status", e.target.value)}
                  >
                    <option value="Draft">Draft</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Partially Shipped">Partially Shipped</option>
                    <option value="Shipped">Shipped</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              {!initialLoading && formData.Status !== "Completed" && (
                <button
                  type="button"
                  onClick={handleMarkJobComplete}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#10b981",
                    color: "white",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    transition: "background-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#059669";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#10b981";
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  Mark Job Complete
                </button>
              )}
            </div>
            <button type="button" className="btn-close" onClick={handleCancel}>
              ×
            </button>
          </div>
        </div>

        <form className="job-order-slideout-form" onSubmit={handleSubmit}>
          <div className="job-order-slideout-content">
            {/* Two Column Layout: Customer Order Details (Left) and Part Details (Right) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem", marginBottom: "2rem" }}>
              {/* Customer Order Details Section - Left Column.
                  Kept in the layout while the job order is still loading so the grid
                  always starts with two columns and Part Details never shifts. */}
              {(customerOrderDetails || initialLoading) && (
                <div style={{ padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
                  <h3 style={{ margin: "0 0 1.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>
                    Customer Order Details
                  </h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>CO#</label>
                      <div
                        style={{
                          padding: "0.625rem 0.875rem",
                          backgroundColor: "#f3f4f6",
                          borderRadius: "0.375rem",
                          fontSize: "0.875rem",
                          color: customerOrderDetails ? "#6366f1" : "#9ca3af",
                          cursor: customerOrderDetails ? "pointer" : "default",
                          textDecoration: customerOrderDetails ? "underline" : "none",
                          border: "none",
                          minHeight: "2.5rem",
                          display: "flex",
                          alignItems: "center",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (customerOrderDetails) {
                            setShowCustomerOrderSlideout(true);
                          }
                        }}
                        title={customerOrderDetails ? "Click to view customer order" : ""}
                      >
                        {customerOrderDetails
                          ? customerOrderNumber ||
                            `CO#${customerOrderDetails.PONumber < 1000 ? customerOrderDetails.PONumber + 999 : customerOrderDetails.PONumber}`
                          : "-"}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Order Date</label>
                      <div
                        style={{
                          padding: "0.625rem 0.875rem",
                          backgroundColor: "#f3f4f6",
                          borderRadius: "0.375rem",
                          fontSize: "0.875rem",
                          color: "#374151",
                          border: "none",
                          minHeight: "2.5rem",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {customerOrderDetails?.OrderDate || "-"}
                      </div>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Customer Name</label>
                      <div
                        style={{
                          padding: "0.625rem 0.875rem",
                          backgroundColor: "#f3f4f6",
                          borderRadius: "0.375rem",
                          fontSize: "0.875rem",
                          color: "#374151",
                          border: "none",
                          minHeight: "2.5rem",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {customerOrderDetails?.CustomerName || "-"}
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Customer Ref No</label>
                      <div
                        style={{
                          padding: "0.625rem 0.875rem",
                          backgroundColor: "#f3f4f6",
                          borderRadius: "0.375rem",
                          fontSize: "0.875rem",
                          color: "#374151",
                          border: "none",
                          minHeight: "2.5rem",
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {customerOrderDetails?.QuotationNo || customerOrderDetails?.CustomerPoNumber || "-"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Part Details Section - Right Column */}
              <div style={{ padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
                <h3 style={{ margin: "0 0 1.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>Part Details</h3>
                
                <div className="form-row">
                  <div className="form-group">
                    <label>Part Name</label>
                    <div
                      style={{
                        padding: "0.625rem 0.875rem",
                        backgroundColor: "#f3f4f6",
                        borderRadius: "0.375rem",
                        fontSize: "0.875rem",
                        color: "#374151",
                        border: "none",
                        minHeight: "2.5rem",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {formData.PartNo || "-"}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Part Desc</label>
                    <input
                      type="text"
                      style={{
                        padding: "0.625rem 0.875rem",
                        backgroundColor: "#f3f4f6",
                        borderRadius: "0.375rem",
                        fontSize: "0.875rem",
                        color: "#374151",
                        border: "1px solid #d1d5db",
                        minHeight: "2.5rem",
                        width: "100%",
                        cursor: "pointer",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                      value={getFirstLine(formData.PartName || "")}
                      onClick={() => {
                        setEditingPartDesc(formData.PartName || "");
                        setShowTextEditorPopup(true);
                      }}
                      placeholder="Click to edit description"
                      readOnly
                      title={formData.PartName || "Click to edit description"}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Order Qty</label>
                    <div
                      style={{
                        padding: "0.625rem 0.875rem",
                        backgroundColor: "#f3f4f6",
                        borderRadius: "0.375rem",
                        fontSize: "0.875rem",
                        color: "#374151",
                        border: "none",
                        minHeight: "2.5rem",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {formData.QtyOrdered} {formData.Unit || ""}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Due Date</label>
                    <div
                      style={{
                        padding: "0.625rem 0.875rem",
                        backgroundColor: "#f3f4f6",
                        borderRadius: "0.375rem",
                        fontSize: "0.875rem",
                        color: "#374151",
                        border: "none",
                        minHeight: "2.5rem",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {formData.DueDate || "-"}
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Drawing Number</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">📄</span>
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.DrawingNumber || ""}
                        onChange={(e) => handleInputChange("DrawingNumber", e.target.value)}
                        placeholder="Enter drawing number"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Drawing Revision</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">📄</span>
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.DrawingRevision || ""}
                        onChange={(e) => handleInputChange("DrawingRevision", e.target.value)}
                        placeholder="Enter drawing revision"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Job Router Section */}
            <div style={{ marginBottom: "2rem", padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>Job Router - Manufacturing Steps</h3>
                  {formData.JobTemplateCode && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.375rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.125rem 0.5rem",
                          backgroundColor: "#eef2ff",
                          color: "#4338ca",
                          border: "1px solid #c7d2fe",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: 500,
                        }}
                      >
                        From template {formData.JobTemplateCode}
                        {formData.JobTemplateRevision ? ` Rev. ${formData.JobTemplateRevision}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearJobTemplateLink}
                        title="Stop recording this job order as built from that template"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "#6b7280",
                          fontSize: "0.75rem",
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        Unlink
                      </button>
                    </div>
                  )}
                </div>
                <div className="jo-router-header-actions">
                  <button
                    type="button"
                    className="jo-router-action-btn jo-router-action-btn--build"
                    title="Build router from a job template"
                    disabled={applyingTemplate}
                    onClick={() => setShowTemplatePicker(true)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    {applyingTemplate ? "Applying..." : "Build"}
                  </button>
                  <button
                    type="button"
                    className="jo-router-action-btn jo-router-action-btn--save-template"
                    title="Save current router as a new job template"
                    disabled={savingAsTemplate || routingSteps.length === 0}
                    onClick={openSaveAsTemplateDialog}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    {savingAsTemplate ? "Saving..." : "Save Template"}
                  </button>
                  <button
                    type="button"
                    className={`jo-router-action-btn jo-router-action-btn--track ${enableJobTracking ? "is-active" : ""}`}
                    title={enableJobTracking ? "Disable job tracking" : "Enable job tracking"}
                    aria-pressed={enableJobTracking}
                    onClick={() => {
                      const checked = !enableJobTracking;
                      setEnableJobTracking(checked);
                      setFormData((prev) => ({ ...prev, EnableJobTracking: checked }));
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" aria-hidden="true">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                    Track
                  </button>
                </div>
              </div>
              
              <div style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
                <table key={enableJobTracking ? "tracking-enabled" : "tracking-disabled"} style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "#ffffff", borderRadius: "0.375rem", overflow: "hidden", minWidth: "800px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Seq</th>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Process/Operation</th>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Assigned To</th>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Est. Time (min)</th>
                      {enableJobTracking && (
                        <>
                          <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Qty Produced</th>
                          <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Clock</th>
                        </>
                      )}
                      {!enableJobTracking && (
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Progress</th>
                      )}
                      <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }} title="Step actions">⋯</th>
                      <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routingSteps.length > 0 ? (
                      routingSteps.map((step) => (
                        <tr key={step.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{step.sequence}</td>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                            <div style={{ fontWeight: 500 }}>{step.processName}</div>
                            {step.description && (
                              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>{step.description}</div>
                            )}
                          </td>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                            <select
                              value={getAssignedToValue(step)}
                              onChange={(e) => handleUpdateAssignedTo(step.id, e.target.value)}
                              style={{
                                width: "100%",
                                minWidth: "150px",
                                padding: "0.375rem 0.5rem",
                                border: "1px solid #d1d5db",
                                borderRadius: "0.375rem",
                                fontSize: "0.875rem",
                              }}
                            >
                              <option value="">Select...</option>
                              {workstations && workstations.length > 0 && (
                                <optgroup label="Workstations">
                                  {workstations.map((ws) => (
                                    <option key={`WS:${ws.id}`} value={`WS:${ws.id}`}>
                                      {ws.workstationName}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {employees && employees.length > 0 && (
                                <optgroup label="Employees">
                                  {employees.map((emp) => (
                                    <option key={`EMP:${emp.user_UniqueID}`} value={`EMP:${emp.user_UniqueID}`}>
                                      {emp.firstName} {emp.lastName}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </td>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{step.estimatedTime || 0}</td>
                          {enableJobTracking && (
                            <>
                              <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                                <input
                                  type="number"
                                  min="0"
                                  value={step.qtyProduced || 0}
                                  onChange={(e) => handleUpdateQtyProduced(step.id, parseInt(e.target.value) || 0)}
                                  style={{
                                    width: "80px",
                                    padding: "0.375rem 0.5rem",
                                    border: "1px solid #d1d5db",
                                    borderRadius: "0.375rem",
                                    fontSize: "0.875rem",
                                  }}
                                />
                              </td>
                              <td style={{ padding: "0.75rem", fontSize: "0.875rem", whiteSpace: "nowrap" }}>
                                <div className="jo-progress-controls">
                                  {isStepCompleted(step) ? (
                                    <button
                                      type="button"
                                      className="jo-progress-btn jo-progress-btn--reopen"
                                      onClick={() => requestReopenStep(step.id)}
                                      title="Reopen completed operation"
                                      disabled={trackingSaving}
                                    >
                                      Reopen
                                    </button>
                                  ) : step.progressState === "running" ? (
                                    <>
                                      <button
                                        type="button"
                                        className="jo-progress-btn jo-progress-btn--pause"
                                        onClick={() => requestPauseStep(step.id)}
                                        title="Pause / hold"
                                        disabled={trackingSaving}
                                      >
                                        ⏸
                                      </button>
                                      <button
                                        type="button"
                                        className="jo-progress-btn jo-progress-btn--complete"
                                        onClick={() => requestCompleteStep(step.id)}
                                        title="Complete operation"
                                        disabled={trackingSaving}
                                      >
                                        ✓
                                      </button>
                                    </>
                                  ) : step.progressState === "paused" ? (
                                    <>
                                      <button
                                        type="button"
                                        className="jo-progress-btn jo-progress-btn--start"
                                        onClick={() => void handleResumeStep(step.id)}
                                        title="Resume"
                                        disabled={trackingSaving}
                                      >
                                        ▶
                                      </button>
                                      <button
                                        type="button"
                                        className="jo-progress-btn jo-progress-btn--complete"
                                        onClick={() => requestCompleteStep(step.id)}
                                        title="Complete operation"
                                        disabled={trackingSaving}
                                      >
                                        ✓
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      className="jo-progress-btn jo-progress-btn--start"
                                      onClick={() => void handleStartStep(step.id)}
                                      title="Start operation"
                                      disabled={trackingSaving}
                                    >
                                      ▶
                                    </button>
                                  )}
                                  <span
                                    className={`jo-progress-elapsed ${
                                      computeElapsedSeconds(step) > 0 || step.progressState === "running"
                                        ? "is-visible"
                                        : ""
                                    }`}
                                    title={`Elapsed: ${formatElapsedDuration(computeElapsedSeconds(step))}${
                                      step.pauseReason ? ` · Hold: ${step.pauseReason}` : ""
                                    }`}
                                  >
                                    {computeElapsedSeconds(step) > 0 || step.progressState === "running"
                                      ? formatElapsedDuration(computeElapsedSeconds(step))
                                      : ""}
                                  </span>
                                  {step.progressState === "paused" && step.pauseReason && (
                                    <span className="jo-progress-hold-reason" title={step.pauseReason}>
                                      {step.pauseReason}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </>
                          )}
                          {!enableJobTracking && (
                            <td style={{ padding: "0.75rem", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleToggleStepCompletion(step.id)}
                                style={{
                                  padding: step.status === "Completed" ? "0.5rem" : "0.375rem 0.75rem",
                                  backgroundColor: step.status === "Completed" ? "#10b981" : "#6b7280",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "0.25rem",
                                  cursor: "pointer",
                                  fontSize: "0.875rem",
                                  fontWeight: 500,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "0.375rem",
                                  whiteSpace: "nowrap",
                                  minWidth: step.status === "Completed" ? "2.5rem" : "auto",
                                }}
                                title={step.status === "Completed" ? "Mark as incomplete" : "Mark as completed"}
                              >
                                {step.status === "Completed" ? (
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                ) : (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <circle cx="12" cy="12" r="10"></circle>
                                    </svg>
                                    Complete
                                  </>
                                )}
                              </button>
                            </td>
                          )}
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                            <span style={{
                              padding: "0.25rem 0.5rem",
                              borderRadius: "0.25rem",
                              fontSize: "0.75rem",
                              fontWeight: 500,
                              backgroundColor: step.status === "Completed" ? "#d1fae5" : step.status === "In Progress" ? "#dbeafe" : "#f3f4f6",
                              color: step.status === "Completed" ? "#065f46" : step.status === "In Progress" ? "#1e40af" : "#6b7280",
                            }}>
                              {step.status || "Pending"}
                            </span>
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "center", position: "relative" }}>
                            <div className="jo-step-menu">
                              <button
                                type="button"
                                className={`jo-step-menu-trigger${
                                  (step.notes?.length || 0) > 0 ? " has-notes" : ""
                                }${
                                  step.ncrFlags?.[0]?.ncrId ? " has-ncr" : ""
                                }`}
                                title="Step actions"
                                aria-haspopup="menu"
                                aria-expanded={stepMenu?.stepId === step.id}
                                disabled={trackingSaving}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (stepMenu?.stepId === step.id) {
                                    setStepMenu(null);
                                    return;
                                  }
                                  const rect = (
                                    e.currentTarget as HTMLElement
                                  ).getBoundingClientRect();
                                  const menuApproxHeight = 140;
                                  const spaceBelow =
                                    window.innerHeight - rect.bottom;
                                  const openUp =
                                    spaceBelow < menuApproxHeight + 8;
                                  setStepMenu({
                                    stepId: step.id,
                                    right: window.innerWidth - rect.right,
                                    ...(openUp
                                      ? { bottom: window.innerHeight - rect.top + 4 }
                                      : { top: rect.bottom + 4 }),
                                  });
                                }}
                              >
                                ⋯
                                {(step.notes?.length || 0) > 0 && (
                                  <span className="jo-step-menu-dot jo-step-menu-dot--note" aria-hidden />
                                )}
                                {!!step.ncrFlags?.[0]?.ncrId && (
                                  <span className="jo-step-menu-dot jo-step-menu-dot--ncr" aria-hidden />
                                )}
                              </button>
                              {stepMenu?.stepId === step.id &&
                                createPortal(
                                  <div
                                    className="jo-step-menu-dropdown jo-step-menu-dropdown--portal"
                                    role="menu"
                                    style={{
                                      top: stepMenu.top,
                                      bottom: stepMenu.bottom,
                                      right: stepMenu.right,
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onMouseDown={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="jo-step-menu-item"
                                      onClick={() => requestStepNote(step.id)}
                                    >
                                      {(step.notes?.length || 0) > 0
                                        ? `Notes (${step.notes!.length})`
                                        : "Add Note"}
                                    </button>
                                    {step.ncrFlags?.[0]?.ncrId ? (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="jo-step-menu-item"
                                        onClick={() =>
                                          openExistingNcr(
                                            step.id,
                                            step.ncrFlags![0].ncrId
                                          )
                                        }
                                      >
                                        View{" "}
                                        {step.ncrFlags[0].ncrNumber ||
                                          `NCR-${step.ncrFlags[0].ncrId}`}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="jo-step-menu-item"
                                        onClick={() =>
                                          openCreateNcrForStep(step.id)
                                        }
                                      >
                                        Add NCR
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="jo-step-menu-item"
                                      onClick={() =>
                                        void openStepBarcode(step.id)
                                      }
                                    >
                                      Show barcode
                                    </button>
                                  </div>,
                                  document.body
                                )}
                            </div>
                          </td>
                          <td style={{ padding: "0.75rem", textAlign: "center" }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteRoutingStep(step.id)}
                              style={{
                                padding: "0.25rem 0.5rem",
                                backgroundColor: "#ef4444",
                                color: "white",
                                border: "none",
                                borderRadius: "0.25rem",
                                cursor: "pointer",
                                fontSize: "0.75rem",
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td 
                          colSpan={enableJobTracking ? 9 : 8} 
                          style={{ 
                            padding: "2rem", 
                            textAlign: "center", 
                            color: "#6b7280", 
                            fontSize: "0.875rem" 
                          }}
                        >
                          No routing steps added yet. Click Build to use a job template, or add manufacturing steps one at a time below.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Add New Routing Step Form */}
              <div style={{ padding: "1rem", backgroundColor: "#ffffff", borderRadius: "0.375rem", border: "1px solid #e5e7eb" }}>
                <h4 style={{ margin: "0 0 1rem 0", fontSize: "0.875rem", fontWeight: 600 }}>Add Manufacturing Step</h4>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 120px 1fr auto", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <div>
                    <label style={{ fontSize: "0.875rem", color: "#6b7280", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Step</label>
                    <input
                      type="number"
                      className="form-input no-spinner"
                      value={newRoutingStep.sequence || ""}
                      onChange={(e) => setNewRoutingStep({ ...newRoutingStep, sequence: parseInt(e.target.value) || 1 })}
                      min="1"
                      style={{ width: "100%" }}
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.875rem", color: "#6b7280", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Process/Operation Name *</label>
                    <select
                      className="form-input"
                      value={newRoutingStep.processId || ""}
                      onChange={(e) => {
                        const selectedProcessId = parseInt(e.target.value);
                        const selectedProcess = processes.find(p => p.id === selectedProcessId);
                        const defaultWsId = selectedProcess?.defaultWorkstationId || undefined;
                        const defaultWs = defaultWsId
                          ? workstations.find(w => w.id === defaultWsId)
                          : undefined;
                        setNewRoutingStep({ 
                          ...newRoutingStep, 
                          processId: selectedProcessId || undefined,
                          processName: selectedProcess?.processName || "",
                          description: selectedProcess?.pDescription || "",
                          estimatedTime: selectedProcess?.defaultEstimatedTimeMinutes ?? newRoutingStep.estimatedTime ?? 0,
                          workstationId: defaultWsId,
                          workstationName: defaultWs?.workstationName || selectedProcess?.defaultWorkstationName || "",
                        });
                      }}
                      style={{ width: "100%" }}
                    >
                      <option value="">Select a process...</option>
                      {processes.map((process) => (
                        <option key={process.id} value={process.id}>
                          {process.processCode
                            ? `${process.processCode} — ${process.processName}`
                            : process.processName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "0.875rem", color: "#6b7280", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Est. Time (min)</label>
                    <input
                      type="number"
                      className="form-input no-spinner"
                      value={newRoutingStep.estimatedTime || ""}
                      onChange={(e) => setNewRoutingStep({ ...newRoutingStep, estimatedTime: parseInt(e.target.value) || 0 })}
                      min="0"
                      style={{ width: "100%" }}
                      onWheel={(e) => e.currentTarget.blur()}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.875rem", color: "#6b7280", fontWeight: 500, display: "block", marginBottom: "0.25rem" }}>Description</label>
                    <input
                      type="text"
                      className="form-input"
                      value={newRoutingStep.description || ""}
                      onChange={(e) => setNewRoutingStep({ ...newRoutingStep, description: e.target.value })}
                      placeholder="Optional description for this step"
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <button
                      type="button"
                      onClick={handleAddRoutingStep}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#6366f1",
                        color: "white",
                        border: "none",
                        borderRadius: "0.375rem",
                        fontSize: "0.875rem",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      + Add Step
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Attachments Section */}
            <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600 }}>Attachments</h3>
              
              {attachments.length === 0 ? (
                <p style={{ margin: "0 0 1rem 0", color: "#6b7280", fontSize: "0.875rem" }}>No attachments added</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem",
                        backgroundColor: "#ffffff",
                        borderRadius: "0.375rem",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
                        <span style={{ fontSize: "1.25rem" }}>📎</span>
                        <div>
                          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>{attachment.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{(attachment.size / 1024).toFixed(2)} KB</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteAttachment(attachment.id)}
                        style={{
                          padding: "0.25rem 0.5rem",
                          backgroundColor: "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "0.25rem",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <button
                type="button"
                onClick={handleAddAttachment}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.5rem 1rem",
                  backgroundColor: "#6366f1",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                + Add Attachment
              </button>
            </div>

            {/* Comments Section */}
            <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600 }}>Comments</h3>
              
              {comments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: "0.75rem",
                        backgroundColor: "#ffffff",
                        borderRadius: "0.375rem",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: "0.875rem", marginBottom: "0.5rem" }}>{comment.text}</div>
                      <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        {comment.createdBy} - {new Date(comment.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  style={{
                    flex: 1,
                    padding: "0.75rem",
                    border: "1px solid #e5e7eb",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    fontFamily: "inherit",
                    resize: "vertical",
                    minHeight: "80px",
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddComment}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#6366f1",
                    color: "white",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    cursor: "pointer",
                    alignSelf: "flex-start",
                  }}
                >
                  Add Comment
                </button>
              </div>
            </div>
          </div>

          <div className="job-order-slideout-footer">
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>

      {/* Customer Order Slideout */}
      {showCustomerOrderSlideout && customerOrderDetails && (
        <CustomerOrderSlideout
          orderId={customerOrderDetails.OrderID}
          onClose={() => {
            setShowCustomerOrderSlideout(false);
            // Reload job order to refresh customer order details if needed
            if (jobOrderId > 0) {
              loadJobOrder();
            }
          }}
        />
      )}

      {/* Text Editor Popup for Part Desc */}
      {showTextEditorPopup && (
        <TextEditorPopup
          title="Part Description"
          value={editingPartDesc}
          onSave={(value) => {
            handleInputChange("PartName", value);
            setShowTextEditorPopup(false);
            setEditingPartDesc("");
          }}
          onClose={() => {
            setShowTextEditorPopup(false);
            setEditingPartDesc("");
          }}
        />
      )}

      {/* Save Router as Job Template */}
      {showSaveAsTemplateDialog && (
        <div className="text-editor-popup-overlay" onClick={() => !savingAsTemplate && setShowSaveAsTemplateDialog(false)}>
          <div className="text-editor-popup jo-save-template-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="text-editor-popup-header">
              <h3>Save Router as Job Template</h3>
              <button
                type="button"
                className="btn-close"
                disabled={savingAsTemplate}
                onClick={() => setShowSaveAsTemplateDialog(false)}
              >
                ×
              </button>
            </div>
            <div className="text-editor-popup-content">
              <p className="jo-save-template-hint">
                Creates a new template in Job Template Master from the {routingSteps.length} step
                {routingSteps.length === 1 ? "" : "s"} on this job order. Estimated times are stored as
                cycle time so they scale with quantity when reused.
              </p>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label>Template Code *</label>
                <input
                  type="text"
                  className="form-input"
                  value={saveAsTemplateForm.TemplateCode}
                  onChange={(e) =>
                    setSaveAsTemplateForm((prev) => ({ ...prev, TemplateCode: e.target.value }))
                  }
                  placeholder="e.g. JT-BRACKET-01"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label>Template Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={saveAsTemplateForm.TemplateName}
                  onChange={(e) =>
                    setSaveAsTemplateForm((prev) => ({ ...prev, TemplateName: e.target.value }))
                  }
                  placeholder="e.g. Bracket Router"
                />
              </div>
              <div className="form-group">
                <label>Revision *</label>
                <input
                  type="number"
                  className="form-input no-spinner"
                  min={1}
                  value={saveAsTemplateForm.Revision}
                  onChange={(e) =>
                    setSaveAsTemplateForm((prev) => ({
                      ...prev,
                      Revision: parseInt(e.target.value, 10) || 1,
                    }))
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                />
              </div>
            </div>
            <div className="text-editor-popup-footer">
              <button
                type="button"
                className="btn-cancel"
                disabled={savingAsTemplate}
                onClick={() => setShowSaveAsTemplateDialog(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-submit"
                disabled={savingAsTemplate}
                onClick={handleSaveAsTemplate}
              >
                {savingAsTemplate ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Template Picker */}
      <JobTemplatePickerDialog
        isOpen={showTemplatePicker}
        selectedTemplate={selectedTemplate}
        onSelect={handleTemplatePicked}
        onCancel={() => setShowTemplatePicker(false)}
      />

      {/* Tracking dialogs: pause reason, complete qty, reopen, replace template */}
      {trackingDialog && (
        <div
          className="jo-track-dialog-overlay"
          onClick={() => {
            if (!trackingSaving) setTrackingDialog(null);
          }}
          role="presentation"
        >
          <div
            className="jo-track-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {trackingDialog.type === "pause" && (
              <>
                <h4>Pause operation</h4>
                <p className="jo-track-dialog-hint">Optional hold reason (you can skip):</p>
                <div className="jo-track-dialog-list">
                  {JOB_STEP_PAUSE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      className="jo-track-dialog-option"
                      disabled={trackingSaving}
                      onClick={() => void confirmPauseStep(reason)}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <div className="jo-track-dialog-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    disabled={trackingSaving}
                    onClick={() => setTrackingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-submit"
                    disabled={trackingSaving}
                    onClick={() => void confirmPauseStep("")}
                  >
                    Pause without reason
                  </button>
                </div>
              </>
            )}

            {trackingDialog.type === "complete" && (() => {
              const step = routingSteps.find((s) => s.id === trackingDialog.stepId);
              const orderQty = formData.QtyOrdered || 0;
              const parsedQty = parseInt(completeQtyInput, 10);
              const qtyNum = Number.isNaN(parsedQty) ? null : parsedQty;
              const zeroWarn = qtyNum === 0;
              const overWarn = qtyNum != null && orderQty > 0 && qtyNum > orderQty;
              const underOrder =
                qtyNum != null && orderQty > 0 && qtyNum < orderQty;
              const meetsOrder = qtyNum != null && (orderQty <= 0 || qtyNum >= orderQty);
              return (
                <>
                  <h4>Complete operation</h4>
                  <p className="jo-track-dialog-hint">
                    {step
                      ? `Step ${step.sequence}: ${step.processName}`
                      : "Enter quantity produced for this operation."}
                  </p>
                  <div className="jo-track-qty-grid">
                    <div className="jo-track-qty-field">
                      <label>Order qty</label>
                      <div className="jo-track-qty-readonly">
                        {orderQty} {formData.Unit || ""}
                      </div>
                    </div>
                    <div className="jo-track-qty-field">
                      <label htmlFor="jo-complete-qty">Qty produced</label>
                      <input
                        id="jo-complete-qty"
                        type="number"
                        min={0}
                        className="form-input"
                        value={completeQtyInput}
                        autoFocus
                        onChange={(e) => {
                          setCompleteQtyInput(e.target.value);
                          setCompleteQtyError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void confirmCompleteStep(meetsOrder);
                          }
                        }}
                      />
                    </div>
                  </div>
                  {completeQtyError && (
                    <div className="jo-track-dialog-alert jo-track-dialog-alert--error">
                      {completeQtyError}
                    </div>
                  )}
                  {!completeQtyError && underOrder && (
                    <div className="jo-track-dialog-alert jo-track-dialog-alert--warn">
                      Qty produced is less than order qty. Saving keeps this operation open.
                      Use Complete anyway only if the operation is finished short.
                    </div>
                  )}
                  {!completeQtyError && zeroWarn && meetsOrder && (
                    <div className="jo-track-dialog-alert jo-track-dialog-alert--warn">
                      Qty produced is 0. You can still complete if this operation had no output.
                    </div>
                  )}
                  {!completeQtyError && overWarn && (
                    <div className="jo-track-dialog-alert jo-track-dialog-alert--warn">
                      Qty produced exceeds order qty. Confirm only if overbuild is intended.
                    </div>
                  )}
                  <div className="jo-track-dialog-actions jo-track-dialog-actions--wrap">
                    <button
                      type="button"
                      className="btn-cancel"
                      disabled={trackingSaving}
                      onClick={() => setTrackingDialog(null)}
                    >
                      Cancel
                    </button>
                    {underOrder ? (
                      <>
                        <button
                          type="button"
                          className="btn-submit jo-track-btn-secondary"
                          disabled={trackingSaving}
                          onClick={() => void confirmCompleteStep(false)}
                        >
                          {trackingSaving ? "Saving..." : "Save qty (keep open)"}
                        </button>
                        <button
                          type="button"
                          className="btn-submit"
                          disabled={trackingSaving}
                          onClick={() => void confirmCompleteStep(true)}
                        >
                          Complete anyway
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn-submit"
                        disabled={trackingSaving}
                        onClick={() => void confirmCompleteStep(true)}
                      >
                        {trackingSaving ? "Saving..." : "Complete"}
                      </button>
                    )}
                  </div>
                </>
              );
            })()}

            {trackingDialog.type === "reopen" && (
              <>
                <h4>Reopen operation</h4>
                <p className="jo-track-dialog-hint">
                  This will mark the operation as pending again and set the job to In Progress if
                  it was Completed. Elapsed time is kept; the clock stays stopped until you Start.
                </p>
                <div className="jo-track-dialog-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    disabled={trackingSaving}
                    onClick={() => setTrackingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-submit"
                    disabled={trackingSaving}
                    onClick={() => void confirmReopenStep()}
                  >
                    {trackingSaving ? "Saving..." : "Reopen"}
                  </button>
                </div>
              </>
            )}

            {trackingDialog.type === "stepNote" && (() => {
              const step = routingSteps.find(
                (s) => Number(s.id) === Number(trackingDialog.stepId)
              );
              const notes = step?.notes || [];
              return (
                <>
                  <h4>Step notes</h4>
                  <p className="jo-track-dialog-hint">
                    {step
                      ? `Step ${step.sequence}: ${step.processName}`
                      : "Add a shop note for this operation."}
                  </p>
                  {notes.length > 0 ? (
                    <div className="jo-step-notes-list">
                      {notes.map((n) => (
                        <div key={n.id} className="jo-step-note-item">
                          <div className="jo-step-note-text">{n.text}</div>
                          <div className="jo-step-note-meta">
                            {n.createdBy} ·{" "}
                            {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="jo-track-dialog-hint" style={{ marginTop: "-0.35rem" }}>
                      No notes on this step yet.
                    </p>
                  )}
                  <label className="jo-track-qty-field" htmlFor="jo-step-note-input" style={{ display: "block", marginBottom: "0.75rem" }}>
                    <span style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#4b5563", marginBottom: "0.3rem" }}>
                      New note
                    </span>
                    <textarea
                      id="jo-step-note-input"
                      className="form-input"
                      rows={3}
                      value={stepNoteInput}
                      autoFocus
                      placeholder="e.g. Tool wear on finish pass; check fixture clamp…"
                      onChange={(e) => setStepNoteInput(e.target.value)}
                    />
                  </label>
                  <div className="jo-track-dialog-actions">
                    <button
                      type="button"
                      className="btn-cancel"
                      disabled={trackingSaving}
                      onClick={() => setTrackingDialog(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-submit"
                      disabled={trackingSaving}
                      onClick={() => void confirmAddStepNote()}
                    >
                      {trackingSaving ? "Saving..." : "Add note"}
                    </button>
                  </div>
                </>
              );
            })()}

            {trackingDialog.type === "replaceTemplate" && trackingDialog.template && (
              <>
                <h4>Replace router steps?</h4>
                <p className="jo-track-dialog-hint">
                  This will replace the {routingSteps.length} existing router step
                  {routingSteps.length === 1 ? "" : "s"}, including any tracked progress, with
                  steps from template{" "}
                  <strong>{trackingDialog.template.templateCode}</strong>.
                </p>
                <div className="jo-track-dialog-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    disabled={applyingTemplate}
                    onClick={() => setTrackingDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-submit"
                    disabled={applyingTemplate}
                    onClick={() => {
                      const tpl = trackingDialog.template;
                      setTrackingDialog(null);
                      if (tpl) void applyJobTemplate(tpl);
                    }}
                  >
                    {applyingTemplate ? "Applying..." : "Replace steps"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step barcode / QR for shop-floor scan (PWA will consume later) */}
      {barcodeDialog && (
        <div
          className="jo-track-dialog-overlay"
          onClick={() => setBarcodeDialog(null)}
          role="presentation"
        >
          <div
            className="jo-track-dialog jo-barcode-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="jo-barcode-title"
          >
            <h4 id="jo-barcode-title">Step barcode</h4>
            <p className="jo-track-dialog-hint">{barcodeDialog.label}</p>
            <div className="jo-barcode-qr-wrap">
              <img
                src={barcodeDialog.qrDataUrl}
                alt={`QR code for ${barcodeDialog.scanCode}`}
                width={240}
                height={240}
              />
            </div>
            <code className="jo-barcode-code">{barcodeDialog.scanCode}</code>
            <p className="jo-track-dialog-hint" style={{ marginTop: "0.75rem" }}>
              Scan with a phone to open this step on the shop floor app (when enabled).
            </p>
            <div className="jo-track-dialog-actions">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setBarcodeDialog(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-submit"
                onClick={() => void copyScanCode(barcodeDialog.scanCode)}
              >
                Copy code
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deletion Impact Dialog */}
      <DeletionImpactDialog
        isOpen={showDeletionDialog}
        entityName={`Job Order #${formData.JobOrderNumber || jobOrderId}`}
        impact={deletionImpact}
        onConfirm={confirmDeletion}
        onCancel={() => {
          setShowDeletionDialog(false);
          setDeletionImpact(null);
        }}
        onRefreshImpact={refreshDeletionImpact}
        isLoading={loading}
      />

      {ncrSlideout && (
        <NonConformanceReportSlideout
          ncrId={ncrSlideout.ncrId}
          prefill={ncrSlideout.prefill}
          elevated
          onCreated={async (ncr) => {
            await handleNcrCreated(ncr);
          }}
          onClose={() => {
            closeNcrSlideoutSafely();
          }}
        />
      )}
    </div>
  );
};

// Text Editor Popup Component
interface TextEditorPopupProps {
  title: string;
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

const TextEditorPopup: React.FC<TextEditorPopupProps> = ({ title, value, onSave, onClose }) => {
  const [textValue, setTextValue] = useState(value);

  useEffect(() => {
    setTextValue(value);
  }, [value]);

  const handleSave = () => {
    onSave(textValue);
  };

  return (
    <div className="text-editor-popup-overlay" onClick={onClose}>
      <div className="text-editor-popup" onClick={(e) => e.stopPropagation()}>
        <div className="text-editor-popup-header">
          <h3>{title}</h3>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="text-editor-popup-content">
          <textarea
            className="form-input"
            style={{
              width: "100%",
              minHeight: "200px",
              resize: "vertical",
              padding: "0.75rem",
              fontFamily: "inherit",
            }}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder={`Enter ${title.toLowerCase()}`}
            autoFocus
          />
        </div>
        <div className="text-editor-popup-footer">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-submit" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default JobOrderSlideout;

