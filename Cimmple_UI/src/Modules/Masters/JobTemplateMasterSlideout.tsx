import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  JobTemplateService,
  JobTemplateReq,
  JobTemplateOperation,
  JobTemplateAttachment,
  JOB_TEMPLATE_ATTACHMENT_TYPES,
  JOB_TEMPLATE_INSPECTION_TYPES,
} from "../../Common/Services/JobTemplateService";
import { ProcessService, ProcessMaster } from "../../Common/Services/ProcessService";
import {
  WorkstationService,
  WorkstationMaster,
} from "../../Common/Services/WorkstationService";
import {
  CategoryService,
  CategoryType,
  CategoryValue,
} from "../../Common/Services/CategoryService";
import CategoryTagInput from "../../Common/Components/CategoryTagInput";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import DeletionImpactDialog, {
  DeletionImpactResult,
} from "../../Common/Components/DeletionImpactDialog";
import "./JobTemplateMasterSlideout.scss";

interface JobTemplateMasterSlideoutProps {
  jobTemplateId: number;
  onClose: (refreshList?: boolean) => void;
}

type TabId =
  | "general"
  | "manufacturing"
  | "material"
  | "operations"
  | "tooling"
  | "inspection"
  | "categories"
  | "attachments";

const TABS: { id: TabId; label: string }[] = [
  { id: "general", label: "General" },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "material", label: "Material" },
  { id: "operations", label: "Operations" },
  { id: "tooling", label: "Tooling" },
  { id: "inspection", label: "Inspection" },
  { id: "categories", label: "Categories" },
  { id: "attachments", label: "Attachments" },
];

const emptyForm = (): JobTemplateReq => ({
  Id: 0,
  Tenantid: 0,
  TemplateCode: "",
  TemplateName: "",
  Description: "",
  Status: "Active",
  Revision: 1,
  EffectiveFrom: null,
  EffectiveTo: null,
  PrimaryProcessId: null,
  WorkstationId: null,
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
  Operations: [],
  CategoryValueIds: [],
  IsSystem: false,
});

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const toNumberOrNull = (value: string): number | null =>
  value === "" ? null : parseFloat(value);

const JobTemplateMasterSlideout: React.FC<JobTemplateMasterSlideoutProps> = ({
  jobTemplateId,
  onClose,
}) => {
  const [formData, setFormData] = useState<JobTemplateReq>(emptyForm());
  const [processes, setProcesses] = useState<ProcessMaster[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationMaster[]>([]);
  const [categoryTypes, setCategoryTypes] = useState<CategoryType[]>([]);
  const [attachments, setAttachments] = useState<JobTemplateAttachment[]>([]);

  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<string>("Drawing");
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [operationErrors, setOperationErrors] = useState<{ [index: number]: string }>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({ ...prev, Tenantid: storage?.tenantID || 0 }));

    loadLookups();

    if (jobTemplateId > 0) {
      loadTemplate();
    }
  }, [jobTemplateId]);

  const loadLookups = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      let tenantID = storage?.tenantID || 0;
      if (tenantID === 0 && process.env.NODE_ENV === "development") {
        tenantID = 1;
      }

      const [processList, workstationList, types] = await Promise.all([
        ProcessService.GetProcesses({ tenantid: tenantID }),
        WorkstationService.GetWorkstations({ tenantid: tenantID }),
        CategoryService.GetCategoryTypes(true),
      ]);

      if (processList && Array.isArray(processList)) {
        setProcesses(processList.filter((p) => p.status !== 0));
      }
      if (workstationList && Array.isArray(workstationList)) {
        setWorkstations(workstationList.filter((w) => w.isActive !== false));
      }
      setCategoryTypes((types || []).filter((t) => t.isActive));
    } catch (error) {
      console.error("[JobTemplateSlideout] Error loading lookups:", error);
    }
  };

  const loadTemplate = async () => {
    setLoading(true);
    try {
      const template = await JobTemplateService.GetJobTemplateById(jobTemplateId);
      if (template) {
        setFormData({ ...emptyForm(), ...template });
        setAttachments(template.Attachments || []);
      }
    } catch (error: any) {
      console.error("[JobTemplateSlideout] Error loading job template:", error);
      toast.error(`Error loading job template: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof JobTemplateReq, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsStateChanged(true);

    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // ---- Operations grid ----

  const updateOperations = (operations: JobTemplateOperation[]) => {
    setFormData((prev) => ({ ...prev, Operations: operations }));
    setIsStateChanged(true);
    setOperationErrors({});
  };

  const handleOperationChange = (
    index: number,
    field: keyof JobTemplateOperation,
    value: any
  ) => {
    const operations = formData.Operations.map((op, i) =>
      i === index ? { ...op, [field]: value } : op
    );
    updateOperations(operations);
  };

  const handleOperationProcessChange = (index: number, processId: number | null) => {
    const selected = processes.find((p) => p.id === processId);
    const defaultWorkstationId = selected?.defaultWorkstationId ?? null;

    const operations = formData.Operations.map((op, i) => {
      if (i !== index) return op;
      return {
        ...op,
        ProcessId: processId,
        ProcessName: selected?.processName || "",
        // Carry the process defaults across only where the user has not typed a value
        WorkstationId: op.WorkstationId ?? defaultWorkstationId,
        CycleTimeMinutes:
          op.CycleTimeMinutes ?? (selected?.defaultEstimatedTimeMinutes ?? null),
      };
    });
    updateOperations(operations);
  };

  const handleAddOperation = () => {
    const nextSequence =
      formData.Operations.length > 0
        ? Math.max(...formData.Operations.map((o) => o.SequenceNumber || 0)) + 10
        : 10;

    const operation: JobTemplateOperation = {
      Id: 0,
      SequenceNumber: nextSequence,
      ProcessId: null,
      ProcessName: "",
      WorkstationId: null,
      WorkstationName: "",
      SetupTimeMinutes: null,
      CycleTimeMinutes: null,
      Instructions: "",
      IsMandatory: true,
      QualityCheckRequired: false,
    };

    updateOperations([...formData.Operations, operation]);
  };

  const handleRemoveOperation = (index: number) => {
    updateOperations(formData.Operations.filter((_, i) => i !== index));
  };

  /**
   * No drag-and-drop library is available in this project, so ordering is done with
   * move buttons. Sequence numbers are rewritten in steps of ten to leave room for
   * manual insertions.
   */
  const handleMoveOperation = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= formData.Operations.length) return;

    const operations = [...formData.Operations];
    [operations[index], operations[target]] = [operations[target], operations[index]];

    updateOperations(
      operations.map((op, i) => ({ ...op, SequenceNumber: (i + 1) * 10 }))
    );
  };

  const handleResequence = () => {
    const operations = [...formData.Operations]
      .sort((a, b) => (a.SequenceNumber || 0) - (b.SequenceNumber || 0))
      .map((op, i) => ({ ...op, SequenceNumber: (i + 1) * 10 }));
    updateOperations(operations);
  };

  const totals = useMemo(() => {
    const setup = formData.Operations.reduce(
      (sum, op) => sum + (op.SetupTimeMinutes || 0),
      0
    );
    const cycle = formData.Operations.reduce(
      (sum, op) => sum + (op.CycleTimeMinutes || 0),
      0
    );
    return { setup, cycle, total: setup + cycle };
  }, [formData.Operations]);

  // ---- Categories ----

  const handleCategoryValueCreated = (created: CategoryValue) => {
    setCategoryTypes((prev) =>
      prev.map((type) =>
        type.id === created.categoryTypeId
          ? { ...type, values: [...type.values, created] }
          : type
      )
    );
  };

  const handleCategoriesChange = (ids: number[]) => {
    setFormData((prev) => ({ ...prev, CategoryValueIds: ids }));
    setIsStateChanged(true);
  };

  // ---- Attachments ----

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;

    setUploading(true);
    try {
      const uploaded = await JobTemplateService.UploadAttachment(
        jobTemplateId,
        uploadType,
        file
      );
      setAttachments((prev) => [...prev, uploaded]);
      toast.success("Attachment uploaded");
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(`Error uploading attachment: ${message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!window.confirm("Remove this attachment?")) return;

    try {
      await JobTemplateService.DeleteAttachment(attachmentId);
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
      toast.success("Attachment removed");
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(`Error removing attachment: ${message}`);
    }
  };

  // ---- Validation & save ----

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const newOperationErrors: { [index: number]: string } = {};

    if (!formData.TemplateCode || formData.TemplateCode.trim() === "") {
      newErrors.TemplateCode = "Template code is required";
    }

    if (!formData.TemplateName || formData.TemplateName.trim() === "") {
      newErrors.TemplateName = "Template name is required";
    }

    if (!formData.Revision || formData.Revision < 1) {
      newErrors.Revision = "Revision must be a positive number";
    }

    if (
      formData.EffectiveFrom &&
      formData.EffectiveTo &&
      formData.EffectiveTo < formData.EffectiveFrom
    ) {
      newErrors.EffectiveTo = "Effective To must be on or after Effective From";
    }

    if (formData.Operations.length === 0) {
      newErrors.Operations = "At least one operation is required";
    }

    const seenSequences = new Set<number>();
    formData.Operations.forEach((operation, index) => {
      if (!operation.ProcessId || operation.ProcessId <= 0) {
        newOperationErrors[index] = "Select a process";
      } else if (!operation.SequenceNumber || operation.SequenceNumber <= 0) {
        newOperationErrors[index] = "Sequence must be positive";
      } else if (seenSequences.has(operation.SequenceNumber)) {
        newOperationErrors[index] = `Sequence ${operation.SequenceNumber} is duplicated`;
      }
      seenSequences.add(operation.SequenceNumber);
    });

    setErrors(newErrors);
    setOperationErrors(newOperationErrors);

    if (newErrors.TemplateCode || newErrors.TemplateName || newErrors.Revision || newErrors.EffectiveTo) {
      setActiveTab("general");
    } else if (newErrors.Operations || Object.keys(newOperationErrors).length > 0) {
      setActiveTab("operations");
    }

    return (
      Object.keys(newErrors).length === 0 &&
      Object.keys(newOperationErrors).length === 0
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setSaving(true);
    try {
      const saved = await JobTemplateService.SaveJobTemplate({
        ...formData,
        Operations: [...formData.Operations].sort(
          (a, b) => a.SequenceNumber - b.SequenceNumber
        ),
      });

      toast.success(
        jobTemplateId > 0
          ? "Job template updated successfully"
          : "Job template created successfully"
      );
      setIsStateChanged(false);

      if (jobTemplateId === 0 && saved?.id) {
        // Attachments need a persisted template, so keep the form open on the
        // Attachments tab rather than making the user reopen the record.
        toast.info("You can now attach drawings and documents to this template");
      }

      onClose(true);
    } catch (error: any) {
      console.error("[JobTemplateSlideout] Error saving job template:", error);
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(`Error saving job template: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleClone = async () => {
    const newCode = window.prompt(
      "New template code for the copy:",
      `${formData.TemplateCode}-COPY`
    );
    if (!newCode || !newCode.trim()) return;

    setSaving(true);
    try {
      await JobTemplateService.CloneJobTemplate(
        jobTemplateId,
        newCode.trim(),
        `${formData.TemplateName} (Copy)`
      );
      toast.success("Job template cloned successfully");
      onClose(true);
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || "Unknown error";
      toast.error(`Error cloning job template: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (jobTemplateId === 0) return;

    setSaving(true);
    try {
      const response = await JobTemplateService.CheckJobTemplateDeletionImpact(
        jobTemplateId
      );
      setDeletionImpact(response.result as DeletionImpactResult);
      setShowDeletionDialog(true);
    } catch (error: any) {
      console.error("[JobTemplateSlideout] Error checking deletion impact:", error);
      toast.error(`Error checking deletion impact: ${error.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeletion = async () => {
    if (jobTemplateId === 0 || !deletionImpact?.canDelete) return;

    setSaving(true);
    try {
      await JobTemplateService.DeleteJobTemplate(jobTemplateId);
      toast.success("Job template deleted successfully");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      console.error("[JobTemplateSlideout] Error deleting job template:", error);
      toast.error(`Error deleting job template: ${error.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (jobTemplateId === 0) return;

    try {
      const response = await JobTemplateService.CheckJobTemplateDeletionImpact(
        jobTemplateId
      );
      setDeletionImpact(response.result as DeletionImpactResult);
    } catch (error: any) {
      console.error("[JobTemplateSlideout] Error refreshing deletion impact:", error);
    }
  };

  const handleDeleteDependency = async () => {
    toast.info("Dependency deletion not applicable for job templates");
  };

  const handleDeleteAll = async () => {
    if (deletionImpact?.canDelete) {
      await confirmDeletion();
    }
  };

  const handleCancel = () => {
    if (isStateChanged) {
      if (window.confirm("You have unsaved changes. Are you sure you want to cancel?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (loading && jobTemplateId > 0) {
    return (
      <div className="slideout-overlay">
        <div className="form-card">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const tabClass = (tab: TabId) => `tab-content ${activeTab !== tab ? "tab-hidden" : ""}`;

  return (
    <div className="slideout-overlay" onClick={handleCancel}>
      <div
        className="form-card"
        style={{ maxWidth: "1100px", width: "95vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-header">
          <h2>{jobTemplateId > 0 ? "Edit Job Template" : "Add Job Template"}</h2>
          <button type="button" className="btn-close" onClick={handleCancel}>
            ×
          </button>
        </div>

        <form className="airframe-form" onSubmit={handleSubmit}>
          <div className="form-tabs">
            <div className="form-tabs-left">
              {TABS.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  className={`form-tab ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.id === "operations" && formData.Operations.length > 0
                    ? ` (${formData.Operations.length})`
                    : ""}
                  {tab.id === "categories" && formData.CategoryValueIds.length > 0
                    ? ` (${formData.CategoryValueIds.length})`
                    : ""}
                  {tab.id === "attachments" && attachments.length > 0
                    ? ` (${attachments.length})`
                    : ""}
                </button>
              ))}
            </div>
            <div className="form-tabs-right">
              <div className="status-field-inline">
                <div
                  className={`input-group ${
                    formData.Status === "Active"
                      ? "status-active-group"
                      : "status-inactive-group"
                  }`}
                  style={{ maxWidth: "150px" }}
                >
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                      </svg>
                    </span>
                  </div>
                  <select
                    id="Status"
                    name="Status"
                    className={`form-input ${
                      formData.Status === "Active" ? "status-active" : "status-inactive"
                    }`}
                    value={formData.Status}
                    onChange={(e) => handleInputChange("Status", e.target.value)}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- General ---------- */}
          <div className={tabClass("general")}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="TemplateCode">
                  Template Code <span className="required">*</span>
                </label>
                <div className={`input-group ${errors.TemplateCode ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="TemplateCode"
                    className={`form-input ${errors.TemplateCode ? "error" : ""}`}
                    placeholder="e.g. JT-MILL-BRK-001"
                    value={formData.TemplateCode}
                    onChange={(e) => handleInputChange("TemplateCode", e.target.value)}
                    maxLength={50}
                  />
                </div>
                {errors.TemplateCode && (
                  <span className="error-message">{errors.TemplateCode}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="TemplateName">
                  Template Name <span className="required">*</span>
                </label>
                <div className={`input-group ${errors.TemplateName ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="TemplateName"
                    className={`form-input ${errors.TemplateName ? "error" : ""}`}
                    placeholder="e.g. CNC Milling Aluminium Bracket"
                    value={formData.TemplateName}
                    onChange={(e) => handleInputChange("TemplateName", e.target.value)}
                    maxLength={200}
                  />
                </div>
                {errors.TemplateName && (
                  <span className="error-message">{errors.TemplateName}</span>
                )}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="Description">Description</label>
              <div className="input-group">
                <div className="input-group-prepend">
                  <span className="input-group-icon">{Icons.Document}</span>
                </div>
                <input
                  type="text"
                  id="Description"
                  className="form-input"
                  placeholder="What this template standardises"
                  value={formData.Description}
                  onChange={(e) => handleInputChange("Description", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Revision">
                  Revision <span className="required">*</span>
                </label>
                <div className={`input-group ${errors.Revision ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="number"
                    id="Revision"
                    className={`form-input no-spinner ${errors.Revision ? "error" : ""}`}
                    min={1}
                    value={formData.Revision}
                    onChange={(e) =>
                      handleInputChange(
                        "Revision",
                        e.target.value === "" ? 1 : parseInt(e.target.value, 10)
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
                {errors.Revision && (
                  <span className="error-message">{errors.Revision}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="EffectiveFrom">Effective From</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="date"
                    id="EffectiveFrom"
                    className="form-input"
                    value={formData.EffectiveFrom || ""}
                    onChange={(e) =>
                      handleInputChange("EffectiveFrom", e.target.value || null)
                    }
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="EffectiveTo">Effective To</label>
                <div className={`input-group ${errors.EffectiveTo ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="date"
                    id="EffectiveTo"
                    className={`form-input ${errors.EffectiveTo ? "error" : ""}`}
                    value={formData.EffectiveTo || ""}
                    onChange={(e) =>
                      handleInputChange("EffectiveTo", e.target.value || null)
                    }
                  />
                </div>
                {errors.EffectiveTo && (
                  <span className="error-message">{errors.EffectiveTo}</span>
                )}
              </div>
              <div className="form-group"></div>
            </div>
          </div>

          {/* ---------- Manufacturing ---------- */}
          <div className={tabClass("manufacturing")}>
            <div className="jt-summary">
              <div>
                <span className="jt-summary-label">Operations</span>
                <span className="jt-summary-value">{formData.Operations.length}</span>
              </div>
              <div>
                <span className="jt-summary-label">Routing Setup</span>
                <span className="jt-summary-value">{totals.setup} min</span>
              </div>
              <div>
                <span className="jt-summary-label">Routing Cycle</span>
                <span className="jt-summary-value">{totals.cycle} min</span>
              </div>
              <div>
                <span className="jt-summary-label">Routing Total</span>
                <span className="jt-summary-value">{totals.total} min</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="PrimaryProcessId">Primary Process</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <select
                    id="PrimaryProcessId"
                    className="form-input"
                    value={formData.PrimaryProcessId ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "PrimaryProcessId",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                  >
                    <option value="">Select process...</option>
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.processCode ? `${p.processCode} — ${p.processName}` : p.processName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="WorkstationId">Workstation</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <select
                    id="WorkstationId"
                    className="form-input"
                    value={formData.WorkstationId ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "WorkstationId",
                        e.target.value === "" ? null : parseInt(e.target.value, 10)
                      )
                    }
                  >
                    <option value="">Select workstation...</option>
                    {workstations.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.workstationName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="EstimatedSetupTimeMinutes">Estimated Setup Time (min)</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="number"
                    id="EstimatedSetupTimeMinutes"
                    className="form-input no-spinner"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 30"
                    value={formData.EstimatedSetupTimeMinutes ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "EstimatedSetupTimeMinutes",
                        toNumberOrNull(e.target.value)
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="EstimatedCycleTimeMinutes">Estimated Cycle Time (min)</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="number"
                    id="EstimatedCycleTimeMinutes"
                    className="form-input no-spinner"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 12.5"
                    value={formData.EstimatedCycleTimeMinutes ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "EstimatedCycleTimeMinutes",
                        toNumberOrNull(e.target.value)
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="EstimatedLabourTimeMinutes">Estimated Labour Time (min)</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="number"
                    id="EstimatedLabourTimeMinutes"
                    className="form-input no-spinner"
                    min={0}
                    step="0.01"
                    value={formData.EstimatedLabourTimeMinutes ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "EstimatedLabourTimeMinutes",
                        toNumberOrNull(e.target.value)
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="EstimatedMachineTimeMinutes">Estimated Machine Time (min)</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="number"
                    id="EstimatedMachineTimeMinutes"
                    className="form-input no-spinner"
                    min={0}
                    step="0.01"
                    value={formData.EstimatedMachineTimeMinutes ?? ""}
                    onChange={(e) =>
                      handleInputChange(
                        "EstimatedMachineTimeMinutes",
                        toNumberOrNull(e.target.value)
                      )
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ---------- Material ---------- */}
          <div className={tabClass("material")}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="DefaultMaterial">Default Material</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="DefaultMaterial"
                    className="form-input"
                    placeholder="e.g. Aluminium 6061"
                    value={formData.DefaultMaterial}
                    onChange={(e) => handleInputChange("DefaultMaterial", e.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="MaterialGrade">Material Grade</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="MaterialGrade"
                    className="form-input"
                    placeholder="e.g. T6"
                    value={formData.MaterialGrade}
                    onChange={(e) => handleInputChange("MaterialGrade", e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="RawMaterialSize">Raw Material Size</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="RawMaterialSize"
                    className="form-input"
                    placeholder='e.g. 6" x 4" x 1" plate'
                    value={formData.RawMaterialSize}
                    onChange={(e) => handleInputChange("RawMaterialSize", e.target.value)}
                    maxLength={100}
                  />
                </div>
              </div>
              <div className="form-group"></div>
            </div>

            <div className="form-group">
              <label htmlFor="MaterialNotes">Material Notes</label>
              <textarea
                id="MaterialNotes"
                className="form-input"
                rows={4}
                placeholder="Stock preparation, certifications, substitutions..."
                value={formData.MaterialNotes}
                onChange={(e) => handleInputChange("MaterialNotes", e.target.value)}
              />
            </div>
          </div>

          {/* ---------- Operations ---------- */}
          <div className={tabClass("operations")}>
            <div className="jt-section-header">
              <div>
                <p className="jt-section-title">Standard routing</p>
                <p className="jt-section-hint">
                  Edit any cell directly. Use the arrows to reorder — sequence numbers are
                  renumbered in tens so you can insert steps later.
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={handleResequence}
                  disabled={formData.Operations.length === 0}
                >
                  Renumber
                </button>
                <button type="button" className="jt-add-button" onClick={handleAddOperation}>
                  + Add Operation
                </button>
              </div>
            </div>

            {errors.Operations && (
              <span className="error-message" style={{ display: "block", marginBottom: "0.5rem" }}>
                {errors.Operations}
              </span>
            )}

            {formData.Operations.length === 0 ? (
              <div className="jt-empty-block">
                <p>No operations defined</p>
                <small>A template needs at least one operation before it can be saved</small>
              </div>
            ) : (
              <div className="jt-operations">
                <div className="jt-operations-scroll">
                  <table className="jt-operations-table">
                    <thead>
                      <tr>
                        <th style={{ width: "5rem" }}>Seq</th>
                        <th style={{ width: "13rem" }}>Process *</th>
                        <th style={{ width: "11rem" }}>Workstation</th>
                        <th style={{ width: "6rem" }}>Setup</th>
                        <th style={{ width: "6rem" }}>Cycle</th>
                        <th>Instructions</th>
                        <th style={{ width: "5rem" }} className="jt-cell-center">
                          Mand.
                        </th>
                        <th style={{ width: "4rem" }} className="jt-cell-center">
                          QC
                        </th>
                        <th style={{ width: "7rem" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.Operations.map((operation, index) => (
                        <tr key={index} className={operationErrors[index] ? "has-error" : ""}>
                          <td>
                            <input
                              type="number"
                              min={1}
                              value={operation.SequenceNumber}
                              onChange={(e) =>
                                handleOperationChange(
                                  index,
                                  "SequenceNumber",
                                  e.target.value === "" ? 0 : parseInt(e.target.value, 10)
                                )
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                            />
                          </td>
                          <td>
                            <select
                              value={operation.ProcessId ?? ""}
                              onChange={(e) =>
                                handleOperationProcessChange(
                                  index,
                                  e.target.value === "" ? null : parseInt(e.target.value, 10)
                                )
                              }
                            >
                              <option value="">Select...</option>
                              {processes.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.processCode
                                    ? `${p.processCode} — ${p.processName}`
                                    : p.processName}
                                </option>
                              ))}
                            </select>
                            {operationErrors[index] && (
                              <span className="error-message">{operationErrors[index]}</span>
                            )}
                          </td>
                          <td>
                            <select
                              value={operation.WorkstationId ?? ""}
                              onChange={(e) =>
                                handleOperationChange(
                                  index,
                                  "WorkstationId",
                                  e.target.value === "" ? null : parseInt(e.target.value, 10)
                                )
                              }
                            >
                              <option value="">None</option>
                              {workstations.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.workstationName}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="min"
                              value={operation.SetupTimeMinutes ?? ""}
                              onChange={(e) =>
                                handleOperationChange(
                                  index,
                                  "SetupTimeMinutes",
                                  toNumberOrNull(e.target.value)
                                )
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="min"
                              value={operation.CycleTimeMinutes ?? ""}
                              onChange={(e) =>
                                handleOperationChange(
                                  index,
                                  "CycleTimeMinutes",
                                  toNumberOrNull(e.target.value)
                                )
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                            />
                          </td>
                          <td>
                            <input
                              type="text"
                              placeholder="Operator instructions"
                              value={operation.Instructions}
                              onChange={(e) =>
                                handleOperationChange(index, "Instructions", e.target.value)
                              }
                            />
                          </td>
                          <td className="jt-cell-center">
                            <input
                              type="checkbox"
                              checked={operation.IsMandatory}
                              onChange={(e) =>
                                handleOperationChange(index, "IsMandatory", e.target.checked)
                              }
                            />
                          </td>
                          <td className="jt-cell-center">
                            <input
                              type="checkbox"
                              checked={operation.QualityCheckRequired}
                              onChange={(e) =>
                                handleOperationChange(
                                  index,
                                  "QualityCheckRequired",
                                  e.target.checked
                                )
                              }
                            />
                          </td>
                          <td>
                            <div className="jt-row-actions">
                              <button
                                type="button"
                                className="jt-icon-button"
                                title="Move up"
                                disabled={index === 0}
                                onClick={() => handleMoveOperation(index, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="jt-icon-button"
                                title="Move down"
                                disabled={index === formData.Operations.length - 1}
                                onClick={() => handleMoveOperation(index, 1)}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="jt-icon-button is-danger"
                                title="Delete operation"
                                onClick={() => handleRemoveOperation(index)}
                              >
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ---------- Tooling ---------- */}
          <div className={tabClass("tooling")}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Tool">Tool</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="Tool"
                    className="form-input"
                    placeholder='e.g. 1/2" 4-flute carbide end mill'
                    value={formData.Tool}
                    onChange={(e) => handleInputChange("Tool", e.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="Fixture">Fixture</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="Fixture"
                    className="form-input"
                    placeholder="e.g. FIX-BRK-02"
                    value={formData.Fixture}
                    onChange={(e) => handleInputChange("Fixture", e.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Workholding">Workholding</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="Workholding"
                    className="form-input"
                    placeholder="e.g. 6in Kurt vise, soft jaws"
                    value={formData.Workholding}
                    onChange={(e) => handleInputChange("Workholding", e.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="Gauge">Gauge</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="Gauge"
                    className="form-input"
                    placeholder="e.g. Bore gauge 20-30mm"
                    value={formData.Gauge}
                    onChange={(e) => handleInputChange("Gauge", e.target.value)}
                    maxLength={200}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="ToolingNotes">Tooling Notes</label>
              <textarea
                id="ToolingNotes"
                className="form-input"
                rows={4}
                placeholder="Speeds and feeds, tool life, setup cautions..."
                value={formData.ToolingNotes}
                onChange={(e) => handleInputChange("ToolingNotes", e.target.value)}
              />
            </div>
          </div>

          {/* ---------- Inspection ---------- */}
          <div className={tabClass("inspection")}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="InspectionType">Inspection Type</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <select
                    id="InspectionType"
                    className="form-input"
                    value={formData.InspectionType}
                    onChange={(e) => handleInputChange("InspectionType", e.target.value)}
                  >
                    <option value="">Select type...</option>
                    {JOB_TEMPLATE_INSPECTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group"></div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label
                  htmlFor="FirstArticleRequired"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    id="FirstArticleRequired"
                    checked={formData.FirstArticleRequired}
                    onChange={(e) =>
                      handleInputChange("FirstArticleRequired", e.target.checked)
                    }
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <span>First Article Required</span>
                </label>
              </div>
              <div className="form-group">
                <label
                  htmlFor="InProcessInspection"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    id="InProcessInspection"
                    checked={formData.InProcessInspection}
                    onChange={(e) =>
                      handleInputChange("InProcessInspection", e.target.checked)
                    }
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <span>In-process Inspection</span>
                </label>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label
                  htmlFor="FinalInspection"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    id="FinalInspection"
                    checked={formData.FinalInspection}
                    onChange={(e) => handleInputChange("FinalInspection", e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <span>Final Inspection</span>
                </label>
              </div>
              <div className="form-group">
                <label
                  htmlFor="CmmRequired"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    id="CmmRequired"
                    checked={formData.CmmRequired}
                    onChange={(e) => handleInputChange("CmmRequired", e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <span>CMM Required</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="InspectionNotes">Inspection Notes</label>
              <textarea
                id="InspectionNotes"
                className="form-input"
                rows={4}
                placeholder="Critical dimensions, sampling plan, reporting requirements..."
                value={formData.InspectionNotes}
                onChange={(e) => handleInputChange("InspectionNotes", e.target.value)}
              />
            </div>
          </div>

          {/* ---------- Categories ---------- */}
          <div className={tabClass("categories")}>
            <div className="jt-section-header">
              <div>
                <p className="jt-section-title">Categorisation</p>
                <p className="jt-section-hint">
                  A template can carry any number of values from any number of category
                  types. These drive the filters on the listing page.
                </p>
              </div>
            </div>

            <CategoryTagInput
              categoryTypes={categoryTypes}
              selectedValueIds={formData.CategoryValueIds}
              onChange={handleCategoriesChange}
              onValueCreated={handleCategoryValueCreated}
              emptyMessage="No category types configured yet. Add them in Category Master, then reopen this template."
            />
          </div>

          {/* ---------- Attachments ---------- */}
          <div className={tabClass("attachments")}>
            <div className="jt-section-header">
              <div>
                <p className="jt-section-title">Drawings & documents</p>
                <p className="jt-section-hint">
                  Drawings, SOPs, setup sheets, images and PDFs up to 25 MB each.
                </p>
              </div>
            </div>

            {jobTemplateId === 0 ? (
              <div className="jt-empty-block">
                <p>Save the template first</p>
                <small>Files can be attached once the template has been created</small>
              </div>
            ) : (
              <>
                <div className="jt-upload-bar">
                  <select
                    className="jt-upload-select"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value)}
                  >
                    {JOB_TEMPLATE_ATTACHMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <label className={`jt-upload-label ${uploading ? "is-disabled" : ""}`}>
                    {uploading ? "Uploading..." : "Choose File"}
                    <input
                      type="file"
                      style={{ display: "none" }}
                      disabled={uploading}
                      onChange={(e) => {
                        handleUpload(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>

                {attachments.length === 0 ? (
                  <div className="jt-empty-block">
                    <p>No attachments yet</p>
                    <small>Attach the drawing and setup sheet so the shop floor has them</small>
                  </div>
                ) : (
                  <div className="jt-attachments">
                    {attachments.map((attachment) => (
                      <div className="jt-attachment" key={attachment.id}>
                        <span className="jt-attachment-icon">📎</span>
                        <div className="jt-attachment-body">
                          <a
                            className="jt-attachment-name"
                            href={attachment.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {attachment.fileName}
                          </a>
                          <span className="jt-attachment-meta">
                            {attachment.attachmentType} · {formatBytes(attachment.fileSize)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="jt-icon-button is-danger"
                          title="Remove attachment"
                          onClick={() => handleDeleteAttachment(attachment.id)}
                        >
                          🗑
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="form-actions" style={{ flexShrink: 0 }}>
            {jobTemplateId > 0 && (
              <button
                type="button"
                className="btn-cancel"
                onClick={handleClone}
                disabled={saving}
              >
                Clone
              </button>
            )}
            {jobTemplateId > 0 && !formData.IsSystem && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: "#dc2626",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete
              </button>
            )}
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={saving}>
              {saving ? "Saving..." : jobTemplateId > 0 ? "Update" : "Save"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Job Template ${formData.TemplateCode || `#${jobTemplateId}`}`}
          impact={deletionImpact}
          onConfirm={confirmDeletion}
          onCancel={() => {
            setShowDeletionDialog(false);
            setDeletionImpact(null);
          }}
          onDeleteDependency={handleDeleteDependency}
          onRefreshImpact={refreshDeletionImpact}
          onDeleteAll={handleDeleteAll}
          isLoading={saving}
        />
      </div>
    </div>
  );
};

export default JobTemplateMasterSlideout;
