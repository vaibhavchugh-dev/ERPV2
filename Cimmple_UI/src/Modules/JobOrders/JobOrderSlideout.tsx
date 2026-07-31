import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  JobOrderService,
  JobOrderMasterReq,
  JobOrderRoutingStep,
} from "../../Common/Services/JobOrderService";
import { OrderService, OrderMasterReq } from "../../Common/Services/OrderService";
import { ProcessService, ProcessMaster } from "../../Common/Services/ProcessService";
import { WorkstationService, WorkstationMaster } from "../../Common/Services/WorkstationService";
import { EmployeeService, EmployeeMaster } from "../../Common/Services/EmployeeService";
import CustomerOrderSlideout from "../Orders/CustomerOrderSlideout";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { PdfService } from "../../Common/Services/PdfService";
import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "./JobOrderSlideout.scss";

interface JobOrderSlideoutProps {
  jobOrderId: number;
  onClose: () => void;
}

const JobOrderSlideout: React.FC<JobOrderSlideoutProps> = ({
  jobOrderId,
  onClose,
}) => {
  const [formData, setFormData] = useState<JobOrderMasterReq>({
    JobOrderID: 0,
    JobOrderNumber: 0,
    CustomerOrderID: 0,
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
  });

  const [loading, setLoading] = useState(false);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [attachments, setAttachments] = useState<Array<{ id: number; name: string; size: number; fileUrl?: string }>>([]);
  const [attachmentIdCounter, setAttachmentIdCounter] = useState(1);
  const [comments, setComments] = useState<Array<{ id: number; text: string; createdAt: string; createdBy: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [commentIdCounter, setCommentIdCounter] = useState(1);
  const [customerOrderNumber, setCustomerOrderNumber] = useState<string>("");
  const [customerOrderDetails, setCustomerOrderDetails] = useState<OrderMasterReq | null>(null);
  const [routingSteps, setRoutingSteps] = useState<JobOrderRoutingStep[]>([]);
  const [newRoutingStep, setNewRoutingStep] = useState<Partial<JobOrderRoutingStep>>({
    sequence: 1,
    processName: "",
    estimatedTime: 0,
  });
  const [showCustomerOrderSlideout, setShowCustomerOrderSlideout] = useState(false);
  const [enableJobTracking, setEnableJobTracking] = useState(false);
  const [stepTimers, setStepTimers] = useState<Map<number, NodeJS.Timeout>>(new Map());
  const [showTextEditorPopup, setShowTextEditorPopup] = useState(false);
  const [editingPartDesc, setEditingPartDesc] = useState<string>("");
  const [processes, setProcesses] = useState<ProcessMaster[]>([]);
  const [workstations, setWorkstations] = useState<WorkstationMaster[]>([]);
  const [employees, setEmployees] = useState<EmployeeMaster[]>([]);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      Tenantid: storage?.tenantID || 0,
      UserId: storage?.userId || 0,
      UserToken: storage?.userToken || 0,
    }));

    if (jobOrderId > 0) {
      loadJobOrder();
    }

    // Load processes from Process Master
    loadProcesses();
    // Load workstations and employees
    loadWorkstations();
    loadEmployees();
  }, [jobOrderId]);

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

  // Auto-complete job when all steps are completed
  useEffect(() => {
    if (routingSteps.length > 0 && !enableJobTracking) {
      const allCompleted = routingSteps.every(step => step.status === "Completed");
      if (allCompleted) {
        setFormData((prev) => {
          if (prev.Status !== "Completed" && prev.Status !== "Cancelled") {
            toast.info("All steps completed. Job automatically marked as completed.");
            return { ...prev, Status: "Completed" };
          }
          return prev;
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routingSteps, enableJobTracking]);

  const loadJobOrder = async () => {
    setLoading(true);
    try {
      const jobOrder = await JobOrderService.GetJobOrderById(jobOrderId);
      if (jobOrder) {
        setFormData(jobOrder);
        setAttachments(jobOrder.Attachments || []);
        setComments(jobOrder.Comments || []);
        setRoutingSteps(jobOrder.RoutingSteps || []);
        
        // Load customer order details
        if (jobOrder.CustomerOrderID > 0) {
          try {
            const order = await OrderService.GetOrderById(jobOrder.CustomerOrderID);
            if (order) {
              setCustomerOrderDetails(order);
              const orderNum = order.PONumber < 1000 ? order.PONumber + 999 : order.PONumber;
              setCustomerOrderNumber(`CO#${orderNum}`);
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
      const result = await JobOrderService.SaveJobOrder(formData);
      if (result && result.id > 0) {
        toast.success("Job order saved successfully");
        onClose();
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
      onClose();
    } catch (error: any) {
      console.error("Error deleting job order:", error);
      toast.error(`Error deleting job order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onClose();
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

  const handleAddRoutingStep = () => {
    if (!newRoutingStep.processId || !newRoutingStep.processName?.trim()) {
      toast.error("Please select a process/operation name");
      return;
    }

    const step: JobOrderRoutingStep = {
      id: routingSteps.length > 0 ? Math.max(...routingSteps.map(s => s.id)) + 1 : 1,
      sequence: newRoutingStep.sequence || routingSteps.length + 1,
      processName: newRoutingStep.processName || "",
      processId: newRoutingStep.processId,
      workstationName: newRoutingStep.workstationName,
      workstationId: newRoutingStep.workstationId,
      estimatedTime: newRoutingStep.estimatedTime || 0,
      description: newRoutingStep.description,
      status: "Pending",
      progressState: 'idle',
      qtyProduced: 0,
      elapsedTime: 0,
    };

    const updatedSteps = [...routingSteps, step].sort((a, b) => a.sequence - b.sequence);
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));
    
    // Reset form
    setNewRoutingStep({
      sequence: updatedSteps.length + 1,
      processName: "",
      processId: undefined,
      estimatedTime: 0,
    });
  };

  const handleDeleteRoutingStep = (id: number) => {
    // Stop timer if running
    const timer = stepTimers.get(id);
    if (timer) {
      clearInterval(timer);
      setStepTimers((prev) => {
        const newTimers = new Map(prev);
        newTimers.delete(id);
        return newTimers;
      });
    }
    
    const updatedSteps = routingSteps.filter((s) => s.id !== id);
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));
  };

  // Job tracking handlers
  const handleStartStep = (stepId: number) => {
    const step = routingSteps.find(s => s.id === stepId);
    if (!step) return;

    const updatedSteps = routingSteps.map(s => 
      s.id === stepId 
        ? { 
            ...s, 
            progressState: 'running' as const,
            startTime: new Date().toISOString(),
            elapsedTime: s.elapsedTime || 0,
            status: 'In Progress'
          }
        : s
    );
    
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));

    // Start timer
    const timer = setInterval(() => {
      setRoutingSteps((prevSteps) => {
        return prevSteps.map(s => {
          if (s.id === stepId && s.progressState === 'running') {
            return { ...s, elapsedTime: (s.elapsedTime || 0) + 1 };
          }
          return s;
        });
      });
    }, 60000); // Update every minute

    setStepTimers((prev) => new Map(prev).set(stepId, timer));
  };

  const handlePauseStep = (stepId: number) => {
    const timer = stepTimers.get(stepId);
    if (timer) {
      clearInterval(timer);
      setStepTimers((prev) => {
        const newTimers = new Map(prev);
        newTimers.delete(stepId);
        return newTimers;
      });
    }

    const updatedSteps = routingSteps.map(s => 
      s.id === stepId 
        ? { ...s, progressState: 'paused' as const }
        : s
    );
    
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));
  };

  const handleResumeStep = (stepId: number) => {
    handleStartStep(stepId);
  };

  const handleStopStep = (stepId: number) => {
    const timer = stepTimers.get(stepId);
    if (timer) {
      clearInterval(timer);
      setStepTimers((prev) => {
        const newTimers = new Map(prev);
        newTimers.delete(stepId);
        return newTimers;
      });
    }

    const updatedSteps = routingSteps.map(s => 
      s.id === stepId 
        ? { 
            ...s, 
            progressState: 'stopped' as const,
            status: 'Completed'
          }
        : s
    );
    
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));
  };

  const handleUpdateQtyProduced = (stepId: number, qty: number) => {
    const updatedSteps = routingSteps.map(s => 
      s.id === stepId ? { ...s, qtyProduced: qty } : s
    );
    
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));
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
    
    setRoutingSteps(updatedSteps);
    setFormData((prev) => ({
      ...prev,
      RoutingSteps: updatedSteps,
    }));

    toast.success(`Step ${newStatus === "Completed" ? "marked as completed" : "reopened"}`);
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      stepTimers.forEach((timer) => clearInterval(timer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      toast.success('Job Order PDF generated successfully');
    } catch (error: any) {
      console.error('Error generating job order PDF:', error);
      toast.error(error.response?.data?.error || 'Failed to generate job order PDF');
    }
  };

  return (
    <div className="job-order-slideout-overlay" onClick={handleCancel}>
      <div className="job-order-slideout-card" onClick={(e) => e.stopPropagation()}>
        <div className="job-order-slideout-header">
          <div>
            <h2>{jobOrderId > 0 ? "Edit Job Order" : "New Job Order"}</h2>
            {jobOrderId > 0 && formData.JobOrderNumber > 0 && (
              <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                Job Order Number: {formData.JobOrderNumber < 1000 ? `JO#${formData.JobOrderNumber + 999}` : `JO#${formData.JobOrderNumber}`}
                {customerOrderNumber && (
                  <span style={{ marginLeft: "1rem", color: "#6366f1" }}>
                    → From Order: {customerOrderNumber}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {jobOrderId > 0 && (
              <>
                <button
                  onClick={handlePrintJobOrder}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <FontAwesomeIcon icon={faPrint} />
                  Print
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
              {formData.Status !== "Completed" && (
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
              {/* Customer Order Details Section - Left Column */}
              {customerOrderDetails && (
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
                          color: "#6366f1",
                          cursor: "pointer",
                          textDecoration: "underline",
                          border: "none",
                          minHeight: "2.5rem",
                          display: "flex",
                          alignItems: "center",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCustomerOrderSlideout(true);
                        }}
                        title="Click to view customer order"
                      >
                        {customerOrderNumber || `CO#${customerOrderDetails.PONumber < 1000 ? customerOrderDetails.PONumber + 999 : customerOrderDetails.PONumber}`}
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
                        {customerOrderDetails.OrderDate || "-"}
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
                        {customerOrderDetails.CustomerName || "-"}
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
                        {customerOrderDetails.QuotationNo || customerOrderDetails.CustomerPoNumber || "-"}
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
                <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>Job Router - Manufacturing Steps</h3>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontSize: "0.875rem" }}>
                  <input
                    type="checkbox"
                    checked={enableJobTracking}
                    onChange={(e) => setEnableJobTracking(e.target.checked)}
                    style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
                  />
                  <span>Enable Job Tracking</span>
                </label>
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
                          <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Progress</th>
                        </>
                      )}
                      {!enableJobTracking && (
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Progress</th>
                      )}
                      <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Status</th>
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
                              <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                  <div style={{ display: "flex", gap: "0.25rem" }}>
                                    {(step.progressState === 'idle' || step.progressState === 'stopped' || !step.progressState) ? (
                                      <button
                                        type="button"
                                        onClick={() => handleStartStep(step.id)}
                                        style={{
                                          padding: "0.25rem 0.5rem",
                                          backgroundColor: "#10b981",
                                          color: "white",
                                          border: "none",
                                          borderRadius: "0.25rem",
                                          cursor: "pointer",
                                          fontSize: "0.75rem",
                                          fontWeight: 500,
                                        }}
                                      >
                                        ▶ Start
                                      </button>
                                    ) : step.progressState === 'running' ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handlePauseStep(step.id)}
                                          style={{
                                            padding: "0.25rem 0.5rem",
                                            backgroundColor: "#f59e0b",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "0.25rem",
                                            cursor: "pointer",
                                            fontSize: "0.75rem",
                                            fontWeight: 500,
                                          }}
                                        >
                                          ⏸ Pause
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleStopStep(step.id)}
                                          style={{
                                            padding: "0.25rem 0.5rem",
                                            backgroundColor: "#ef4444",
                                            color: "white",
                                            border: "none",
                                            borderRadius: "0.25rem",
                                            cursor: "pointer",
                                            fontSize: "0.75rem",
                                            fontWeight: 500,
                                          }}
                                        >
                                          ⏹ Stop
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleResumeStep(step.id)}
                                        style={{
                                          padding: "0.25rem 0.5rem",
                                          backgroundColor: "#10b981",
                                          color: "white",
                                          border: "none",
                                          borderRadius: "0.25rem",
                                          cursor: "pointer",
                                          fontSize: "0.75rem",
                                          fontWeight: 500,
                                        }}
                                      >
                                        ▶ Resume
                                      </button>
                                    )}
                                  </div>
                                  {step.progressState === 'running' && (
                                    <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.25rem" }}>
                                      Elapsed: {step.elapsedTime || 0} min
                                    </div>
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
                          colSpan={enableJobTracking ? 8 : 7} 
                          style={{ 
                            padding: "2rem", 
                            textAlign: "center", 
                            color: "#6b7280", 
                            fontSize: "0.875rem" 
                          }}
                        >
                          No routing steps added yet. Use the form below to add manufacturing steps.
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

