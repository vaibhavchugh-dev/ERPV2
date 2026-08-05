import Instense from "./Axios-config";

export interface JobOrderMaster {
  jobOrderID: number;
  jobOrderNumber: number;
  customerOrderID: number;
  customerOrderDetailID: number;
  customerID: number;
  customerName: string;
  customerCode: string;
  partNo: string;
  partName: string;
  qtyOrdered: number;
  unit: string;
  unitPrice: number;
  dueDate: string;
  jobNumber: string;
  jobDesc: string;
  jobPriority: number;
  status: string;
  orderDate: string;
}

export interface JobOrderMasterReq {
  JobOrderID: number;
  JobOrderNumber: number;
  CustomerOrderID: number;
  CustomerOrderDetailID: number;
  CustomerID: number;
  CustomerName: string;
  CustomerCode: string;
  JobNumber: string;
  JobDesc: string;
  PartNo: string;
  PartName: string;
  QtyOrdered: number;
  Unit: string;
  UnitPrice: number;
  DueDate: string;
  JobPriority: number;
  Status: string;
  Tenantid: number;
  UserId: number;
  UserToken: number;
  OrderDate: string;
  Attachments?: JobOrderAttachment[];
  Comments?: JobOrderComment[];
  RoutingSteps?: JobOrderRoutingStep[];
  DrawingNumber?: string;
  DrawingRevision?: string;
  JobTemplateId?: number | null;
  JobTemplateCode?: string;
  JobTemplateRevision?: number | null;
}

export interface JobOrderAttachment {
  id: number;
  name: string;
  size: number;
  fileUrl?: string;
}

export interface JobOrderComment {
  id: number;
  text: string;
  createdAt: string;
  createdBy: string;
}

export interface JobOrderRoutingStep {
  id: number;
  sequence: number;
  processName: string;
  processId?: number;
  workstationName?: string;
  workstationId?: number;
  estimatedTime?: number;
  description?: string;
  status?: string;
  // Job tracking fields
  qtyProduced?: number;
  technicianName?: string;
  technicianId?: number;
  progressState?: 'idle' | 'running' | 'paused' | 'stopped';
  startTime?: string;
  elapsedTime?: number; // in minutes
}

export class JobOrderService {
  public static GetJobOrders = async (
    request: { tenantid: number; locationId?: number }
  ): Promise<JobOrderMaster[] | null> => {
    // Use the tenantid from request if provided, otherwise fall back to localStorage
    let tenantID = request.tenantid || 0;
    
    // If still 0, try localStorage
    if (tenantID === 0) {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      tenantID = storage?.tenantID || 0;
    }
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/JobOrder/GetJobOrders`;
    const params: Record<string, number> = { tenantid: tenantID };
    if (request.locationId && request.locationId > 0) {
      params.locationId = request.locationId;
    }
    return Instense.get(url, { params }).then((response) => {
      const result = response.data.result as JobOrderMaster[];
      return result;
    });
  };

  public static GetJobOrderById = async (
    jobOrderId: number
  ): Promise<JobOrderMasterReq | null> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/JobOrder/GetJobOrderById`;
    return Instense.get(url, {
      params: { jobOrderId, tenantId: tenantID },
    }).then((response) => {
      const result = response.data.result;
      if (!result) return null;

      const formatDate = (dateStr: string | Date): string => {
        if (!dateStr) return "";
        try {
          const date = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          const year = String(date.getFullYear()).slice(-2);
          return `${month}/${day}/${year}`;
        } catch {
          return "";
        }
      };

      return {
        JobOrderID: result.jobOrderID,
        JobOrderNumber: result.jobOrderNumber,
        CustomerOrderID: result.customerOrderID,
        CustomerOrderDetailID: result.customerOrderDetailID,
        CustomerID: result.customerID,
        CustomerName: result.customerName || "",
        CustomerCode: result.customerCode || "",
        JobNumber: result.jobNumber || "",
        JobDesc: result.jobDesc || "",
        PartNo: result.partNo || "",
        PartName: result.partName || "",
        QtyOrdered: result.qtyOrdered,
        Unit: result.unit || "",
        UnitPrice: result.unitPrice,
        DueDate: formatDate(result.dueDate),
        JobPriority: result.jobPriority,
        Status: result.status || "Draft",
        Tenantid: tenantID,
        UserId: result.userId || 0,
        UserToken: result.userToken || 0,
        OrderDate: formatDate(result.orderDate),
        Attachments: Array.isArray(result.attachments)
          ? result.attachments.map((a: any) => ({
              id: a.id || a.Id || 0,
              name: a.name || a.Name || "",
              size: a.size || a.Size || 0,
              fileUrl: a.fileUrl || a.FileUrl || "",
            }))
          : [],
        Comments: Array.isArray(result.comments)
          ? result.comments.map((c: any) => ({
              id: c.id || c.Id || 0,
              text: c.text || c.Text || "",
              createdAt: c.createdAt || c.CreatedAt || new Date().toISOString(),
              createdBy: c.createdBy || c.CreatedBy || "User",
            }))
          : [],
        RoutingSteps: Array.isArray(result.routingSteps)
          ? result.routingSteps.map((r: any) => ({
              id: r.id || r.Id || 0,
              sequence: r.sequence || r.Sequence || 0,
              processName: r.processName || r.ProcessName || "",
              processId: r.processId || r.ProcessId,
              workstationName: r.workstationName || r.WorkstationName,
              workstationId: r.workstationId || r.WorkstationId,
              estimatedTime: r.estimatedTime || r.EstimatedTime || 0,
              description: r.description || r.Description || "",
              status: r.status || r.Status || "Pending",
              // Job tracking fields
              qtyProduced: r.qtyProduced || r.QtyProduced || 0,
              technicianName: r.technicianName || r.TechnicianName || "",
              technicianId: r.technicianId || r.TechnicianId,
              progressState: r.progressState || r.ProgressState || "idle",
              startTime: r.startTime || r.StartTime,
              elapsedTime: r.elapsedTime || r.ElapsedTime || 0,
            }))
          : [],
        DrawingNumber: result.drawingNumber || result.DrawingNumber || "",
        DrawingRevision: result.drawingRevision || result.DrawingRevision || "",
        JobTemplateId: result.jobTemplateId ?? result.JobTemplateId ?? null,
        JobTemplateCode: result.jobTemplateCode || result.JobTemplateCode || "",
        JobTemplateRevision: result.jobTemplateRevision ?? result.JobTemplateRevision ?? null,
      };
    });
  };

  public static SaveJobOrder = async (
    request: JobOrderMasterReq
  ): Promise<{ id: number; message: string }> => {
    const url = `/JobOrder/SaveJobOrder`;
    return Instense.post(url, request).then((response) => {
      const result = response.data.result;
      if (result && result.id) {
        return { id: result.id, message: result.message || "Job order saved successfully" };
      }
      return { id: request.JobOrderID || 0, message: "Job order saved successfully" };
    });
  };

  public static CheckJobOrderDeletionImpact = async (
    jobOrderId: number
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/JobOrder/CheckJobOrderDeletionImpact`;
    return Instense.get(url, {
      params: { jobOrderId, tenantId: tenantID },
    }).then((response) => {
      return response.data;
    });
  };

  public static DeleteJobOrder = async (
    jobOrderId: number
  ): Promise<void> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }

    const url = `/JobOrder/DeleteJobOrder`;
    return Instense.delete(url, {
      params: { jobOrderId, tenantId: tenantID },
    }).then(() => {
      return;
    });
  };

  public static CreateJobOrderFromOrderDetail = async (
    orderID: number,
    orderDetailID: number
  ): Promise<{ id: number; message: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    let tenantID = storage?.tenantID || 0;
    
    // For development: if tenantID is not set, use a default value
    if (tenantID === 0 && process.env.NODE_ENV === 'development') {
      tenantID = 1; // Default tenant ID for development
    }
    const userId = storage?.userId || 0;
    const userToken = storage?.userToken || 0;

    const url = `/JobOrder/CreateJobOrderFromOrderDetail`;
    return Instense.post(url, {
      OrderID: orderID,
      OrderDetailID: orderDetailID,
      Tenantid: tenantID,
      UserId: userId,
      UserToken: userToken,
    }).then((response) => {
      const result = response.data.result;
      if (result && result.id) {
        return { id: result.id, message: result.message || "Job order created successfully" };
      }
      return { id: 0, message: "Job order created successfully" };
    });
  };
}

