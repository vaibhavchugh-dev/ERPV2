import Instense from "./Axios-config";

export interface WorkflowStageState {
  code: string;
  label: string;
  state: string;
}

export interface WorkflowJobLink {
  jobOrderId: number;
  number: string;
  partNo?: string | null;
  partName?: string | null;
  status?: string | null;
  dueDate?: string | null;
  path: string;
}

export interface WorkflowShipmentLink {
  shipmentId: number;
  number: string;
  shipmentDate?: string | null;
  path: string;
}

export interface WorkflowInvoiceLink {
  invoiceId: number;
  number: string;
  status: string;
  substage: string;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  dueDate?: string | null;
  daysOverdue?: number | null;
  path: string;
  receivablePath: string;
}

export interface WorkflowNcrLink {
  ncrId: number;
  jobOrderId?: number | null;
  number: string;
  title?: string | null;
  status?: string | null;
  severity?: string | null;
  path: string;
}

export interface WorkflowPurchaseLink {
  vendorOrderId: number;
  jobOrderId?: number | null;
  detailKey?: string | null;
  number: string;
  vendorName?: string | null;
  status?: string | null;
  qtyOrdered: number;
  qtyReceived: number;
  orderPath: string;
  receivingPath: string;
}

export interface WorkflowShortage {
  jobOrderId: number;
  jobNumber: string;
  partNo?: string | null;
  partName?: string | null;
  needed: number;
  available: number;
  reserved: number;
  issued: number;
  shortQty: number;
  requiredBy?: string | null;
}

export interface WorkflowRow {
  id: string;
  kind: string;
  customerName: string;
  reference: string;
  customerPo?: string | null;
  principalStage: string;
  principalStageLabel: string;
  indicator: string;
  isActive: boolean;
  isBlocked: boolean;
  isOverdue: boolean;
  needsAction: boolean;
  isComplete: boolean;
  isCancelled: boolean;
  ownerLabel: string;
  ownerUserId?: number | null;
  coordinationTaskId?: number | null;
  handoffStatus?: string | null;
  rejectionNote?: string | null;
  manualBlocker?: string | null;
  createdByName?: string | null;
  documentDate?: string | null;
  dueDate?: string | null;
  ageDays: number;
  blockerReason?: string | null;
  nextAction: string;
  quotationPath?: string | null;
  orderPath?: string | null;
  stages: WorkflowStageState[];
  jobs: WorkflowJobLink[];
  shipments: WorkflowShipmentLink[];
  invoices: WorkflowInvoiceLink[];
  ncrs: WorkflowNcrLink[];
  purchases: WorkflowPurchaseLink[];
  shortages: WorkflowShortage[];
  searchText: string;
  customerOrderId?: number | null;
  quotationId?: number | null;
  instanceId?: number | null;
  instanceStatus?: string | null;
  storedTasks?: WorkflowStoredTask[];
  recentEvents?: WorkflowStoredEvent[];
}

export interface WorkflowStoredTask {
  taskId: number;
  taskType: string;
  label: string;
  stageCode: string;
  stageLabel: string;
  status: string;
  priority: string;
  ownerUserId?: number | null;
  ownerLabel: string;
  dueDate?: string | null;
  blocker?: string | null;
  nextAction: string;
}

export interface WorkflowStoredEvent {
  eventType: string;
  summary: string;
  createdAt: string;
}

export interface WorkflowAction {
  id: string;
  workflowId: string;
  kind: string;
  rank: number;
  priorityLabel: string;
  title: string;
  detail?: string | null;
  customerName: string;
  reference: string;
  orderPath?: string | null;
  linkText?: string | null;
  stageCode: string;
  stageLabel: string;
  ownerLabel: string;
  dueDate?: string | null;
  ageDays: number;
  blockerReason?: string | null;
  nextAction: string;
  linkPath?: string | null;
  linkLabel: string;
}

export interface WorkflowCollectionCard {
  id: string;
  workflowId: string;
  lane: string;
  substage: string;
  rank: number;
  customerName: string;
  orderNumber: string;
  orderPath?: string | null;
  jobNumbers: string[];
  invoiceNumber?: string | null;
  invoicePath?: string | null;
  receivablePath: string;
  ownerLabel: string;
  ageDays: number;
  invoiceAmount?: number | null;
  paidAmount?: number | null;
  outstanding?: number | null;
  dueDate?: string | null;
  blockerReason?: string | null;
  nextAction: string;
  isOverdue: boolean;
  isBlocked: boolean;
  searchText: string;
}

export interface WorkflowStageCount {
  code: string;
  label: string;
  activeCount: number;
  blockedCount: number;
  overdueCount: number;
  oldestAgeDays?: number | null;
}

export interface WorkflowOverview {
  generatedAt: string;
  limitation: string;
  summary: {
    active: number;
    needsAction: number;
    blocked: number;
    overdue: number;
  };
  stages: WorkflowStageCount[];
  workflows: WorkflowRow[];
  actions: WorkflowAction[];
  collection: WorkflowCollectionCard[];
}

export interface WorkflowAssignee {
  userId: number;
  name: string;
}

const tenantId = () => {
  const storage = JSON.parse(localStorage.getItem("storage") || "{}");
  return storage?.tenantID || 0;
};

export class WorkflowService {
  public static GetOverview = async (locationId?: number): Promise<WorkflowOverview> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const response = await Instense.get("/Workflow/GetOverview", {
      params: {
        tenantId: tenantID,
        ...(locationId != null ? { locationId } : {}),
      },
    });
    return response.data.result as WorkflowOverview;
  };

  public static GetAssignees = async (workflowId: string): Promise<WorkflowAssignee[]> => {
    const response = await Instense.get("/Workflow/GetAssignees", {
      params: { tenantId: tenantId(), workflowId },
    });
    return (response.data.result || []) as WorkflowAssignee[];
  };

  public static Assign = async (workflowId: string, assigneeUserId: number, coordinationTaskId?: number | null): Promise<void> => {
    await Instense.post("/Workflow/Assign", { workflowId, assigneeUserId, coordinationTaskId, tenantId: tenantId() });
  };

  public static Acknowledge = async (workflowId: string, coordinationTaskId?: number | null): Promise<void> => {
    await Instense.post("/Workflow/Acknowledge", { workflowId, coordinationTaskId, tenantId: tenantId() });
  };

  public static Reject = async (workflowId: string, coordinationTaskId?: number | null): Promise<void> => {
    await Instense.post("/Workflow/Reject", { workflowId, coordinationTaskId, tenantId: tenantId() });
  };

  public static SaveBlockerNote = async (workflowId: string, note: string, coordinationTaskId?: number | null): Promise<void> => {
    await Instense.post("/Workflow/ResolveBlocker", { workflowId, note, coordinationTaskId, tenantId: tenantId() });
  };
}
