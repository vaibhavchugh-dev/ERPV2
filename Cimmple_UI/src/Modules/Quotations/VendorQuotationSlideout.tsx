import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import { duplicateResultNotes } from "../../Common/Utils/documentDuplication";
import { confirmDiscardChanges } from "../../Common/Utils/dismissGuard";
import {
  QuotationService,
  VendorQuotationMasterReq,
  QuotationDetailReq,
  DiscountType,
} from "../../Common/Services/QuotationService";
import { VendorService } from "../../Common/Services/VendorService";
import { JobOrderService, JobOrderMaster } from "../../Common/Services/JobOrderService";
import { VendorOrderService } from "../../Common/Services/VendorOrderService";
import VendorOrderSlideout from "../Purchasing/VendorOrderSlideout";
import {
  VENDOR_ORDER_LINE_TYPES,
  DEFAULT_VENDOR_ORDER_LINE_TYPE,
  defaultLineTypeForOrder,
  deriveOrderMaterialType,
  lineTypeAccentClass,
  isBlankQuoteOrOrderLine,
  lineTypeFromQuotationType,
} from "../../Common/Constants/vendorOrderLineTypes";
import RawMaterialCombobox from "../../Common/Components/RawMaterialCombobox";
import ProductMasterCombobox from "../../Common/Components/ProductMasterCombobox";
import {
  CustomerPartOption,
  ProductMaster,
} from "../../Common/Services/ProductMasterService";
import { RawMaterial } from "../../Common/Services/InventoryService";
import { ChartofAccountsService, ChartofAccountMaster } from "../../Common/Services/ChartofAccountsService";
import { AccountingService } from "../../Common/Services/AccountingService";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import DeleteIconButton from "../../Common/Components/DeleteIconButton";
import AttachmentUploadSection, { ModuleAttachment } from "../../Common/Components/AttachmentUploadSection";
import CommentsSection, { EntityComment } from "../../Common/Components/CommentsSection";
import DocumentViewerWorkspace, { DocumentViewerFile } from "../../Common/Components/DocumentViewerWorkspace";
import AttachmentDocumentCache from "../../Common/Services/AttachmentDocumentCache";
import {
  getPendingFiles,
  revokeLocalAttachmentUrls,
  getApiErrorMessage,
  isApiForbidden,
  clearOpenQueryFromUrl,
} from "../../Common/Services/FileUploadHelper";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { PdfService } from "../../Common/Services/PdfService";
import SendDocumentEmailDialog from "../../Common/Components/SendDocumentEmailDialog";
import {
  toDateOnlyApiString,
  toHtmlDateInputValue,
  todayDateOnlyDisplay,
  todayIsoInTenantTimezone,
} from "../../Common/Utils/Formatting";
import {
  VendorPartCombobox,
  formatPartHistoryHint,
  looksLikeJobPartNo,
} from "../../Common/Components/CustomerPartCombobox";
import "./VendorQuotationSlideout.scss";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import { usePagePermissions } from "../../Common/Hooks/usePagePermissions";
import SlideoutHydratingOverlay from "../../Common/Components/SlideoutHydratingOverlay";

const PAGE_PATH = "/quotations/vendor";

/** Statuses that saving must keep; "Save" must not drop these back to Draft. */
const SENT_OR_LATER_STATUSES = [
  "Sent",
  "Responded",
  "Accepted",
  "Rejected",
  "Partially Converted",
  "Converted",
];
/** Once the vendor has responded or the quote is converted, it cannot be reverted to Draft. */
const DRAFT_LOCKED_STATUSES = [
  "Responded",
  "Accepted",
  "Rejected",
  "Partially Converted",
  "Converted",
];

interface VendorQuotationSlideoutProps {
  quotationId: number;
  onClose: (refreshList?: boolean) => void;
  onSaved?: (quotationId: number) => void;
}

const VendorQuotationSlideout: React.FC<VendorQuotationSlideoutProps> = ({
  quotationId,
  onClose,
  onSaved,
}) => {
  const { formatCurrency, currencySymbol, discountColumnLabel } = useFormatting();
  const {
    canEdit,
    canDelete,
    canPrint,
    canSend,
    canConvert,
    canDuplicate,
    canAdd,
    ensure,
  } = usePagePermissions(PAGE_PATH);
  const isNew = quotationId <= 0;
  const canSave = isNew ? canAdd : canEdit;

  const [formData, setFormData] = useState<VendorQuotationMasterReq & { QuotationType?: string }>({
    OrderID: 0,
    Tenantid: 0,
    VendorID: 0,
    VendorCode: "",
    PONumber: 0,
    VendorName: "",
    Address: "",
    VendorPoNumber: "",
    OrderDate: "",
    TotalAmount: 0,
    UserId: 0,
    UserToken: 0,
    Status: "Draft",
    ShippingInstructions: "",
    ExternalVendorPO: "",
    BuyerName: "",
    VendorRefNo: "",
    QuotationType: "Material",
    Details: [
      {
        ID: 0,
        ItemNo: 1,
        PartName: "",
        PartNo: "",
        LineType: DEFAULT_VENDOR_ORDER_LINE_TYPE,
        DueDate: "",
        JobNumber: "",
        JobDesc: "",
        QtyOrdered: 1,
        Unit: "EA",
        UnitPrice: 0,
        JobPriority: 0,
        Discount: 0,
        DiscountType: "Percent",
        ProductId: undefined,
        RawMaterialId: undefined,
        LeadTime: "",
        Notes: "",
        glcode: "",
      },
    ],
  });

  const [vendors, setVendors] = useState<
    Array<{
      vendor_id: number;
      company_name: string;
      vendorcode: string;
      portalAccessEnabled?: boolean;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [isHydrating, setIsHydrating] = useState(quotationId > 0);
  const [savingAction, setSavingAction] = useState<"draft" | "submit" | null>(null);
  const [savedStatus, setSavedStatus] = useState("");
  const [isStateChanged, setIsStateChanged] = useState(false);
  const listNeedsRefreshRef = useRef(false);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [attachments, setAttachments] = useState<ModuleAttachment[]>([]);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<number[]>([]);
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [viewerDocuments, setViewerDocuments] = useState<DocumentViewerFile[]>([]);
  const [activeViewerIndex, setActiveViewerIndex] = useState(0);
  /** Session cache for lazily loaded attachment blobs; cleared when slideout closes. */
  const documentCacheRef = useRef(new AttachmentDocumentCache());
  const [showMultiVendorDialog, setShowMultiVendorDialog] = useState(false);
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<number>>(new Set());
  const [alreadySentVendorIds, setAlreadySentVendorIds] = useState<Set<number>>(new Set());
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [comments, setComments] = useState<EntityComment[]>([]);
  const [showTextEditorPopup, setShowTextEditorPopup] = useState(false);
  const [editingField, setEditingField] = useState<{ index: number; field: "PartName" | "Notes"; value: string } | null>(null);
  const [jobOrders, setJobOrders] = useState<JobOrderMaster[]>([]);
  const [jobOrderDropdownOpen, setJobOrderDropdownOpen] = useState<Map<number, boolean>>(new Map());
  const [jobOrderDropdownPositions, setJobOrderDropdownPositions] = useState<Map<number, { top: number; left: number; width: number }>>(new Map());
  const [selectedJobOrders, setSelectedJobOrders] = useState<Map<number, Set<number>>>(new Map()); // Map of detail index to Set of jobOrderIDs
  const [partHistoryByRow, setPartHistoryByRow] = useState<Map<number, CustomerPartOption | null>>(new Map());
  const [coaAccounts, setCoaAccounts] = useState<ChartofAccountMaster[]>([]);
  const [companyDefaultExpenseGlcode, setCompanyDefaultExpenseGlcode] = useState("");
  const [defaultExpenseGlcode, setDefaultExpenseGlcode] = useState("");
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [vendorEmail, setVendorEmail] = useState("");
  const [showConvertToOrderDialog, setShowConvertToOrderDialog] = useState(false);
  const [convertingToOrder, setConvertingToOrder] = useState(false);
  const [selectedLineItems, setSelectedLineItems] = useState<Set<number>>(new Set());
  const [selectedAttachments, setSelectedAttachments] = useState<Set<number>>(new Set());
  const [showOrderSlideout, setShowOrderSlideout] = useState(false);
  const [orderSlideoutId, setOrderSlideoutId] = useState<number>(0);
  // Refs for job order input fields
  const jobOrderInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  // Store display values for numeric fields (as strings) to allow clearing
  const [numericDisplayValues, setNumericDisplayValues] = useState<Map<string, string>>(new Map());
  
  // Default unit options for combobox
  const defaultUnitOptions = [
    "EA", "PC", "PCS", "SET", "PKG", "BOX", "PALLET",
    "LB", "KG", "OZ", "FT", "IN", "M", "YD", "CM",
    "GAL", "L", "QT", "HR", "DAY", "ROLL", "REEL", "BAG"
  ];
  
  // Function to get all available units (defaults + units from current quotation's line items)
  const getAllUnitOptions = (): string[] => {
    // Extract unique units from current quotation's line items
    const usedUnits = formData.Details
      .map(d => d.Unit)
      .filter(unit => unit && unit.trim() !== "")
      .map(unit => unit.trim().toUpperCase())
      .filter((unit, index, self) => self.indexOf(unit) === index); // Unique only
    
    // Combine with defaults and deduplicate using Array.from
    const allUnits = Array.from(new Set([...defaultUnitOptions, ...usedUnits]));
    return allUnits.sort();
  };
  
  // State for unit combobox dropdown visibility per row
  const [unitDropdownOpen, setUnitDropdownOpen] = useState<Map<number, boolean>>(new Map());
  // State for unit dropdown positions (for fixed positioning)
  const [unitDropdownPositions, setUnitDropdownPositions] = useState<Map<number, { top: number; left: number; width: number }>>(new Map());
  // Refs for unit input fields
  const unitInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Function to update dropdown position based on input field
  const updateUnitDropdownPosition = (index: number) => {
    const input = unitInputRefs.current.get(index);
    if (input) {
      const rect = input.getBoundingClientRect();
      setUnitDropdownPositions(prev => {
        const newMap = new Map(prev);
        newMap.set(index, {
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width
        });
        return newMap;
      });
    }
  };

  // Function to update job order dropdown position based on input field
  const updateJobOrderDropdownPosition = (index: number) => {
    const input = jobOrderInputRefs.current.get(index);
    if (input) {
      const rect = input.getBoundingClientRect();
      setJobOrderDropdownPositions(prev => {
        const newMap = new Map(prev);
        newMap.set(index, {
          top: rect.bottom + 4,
          left: rect.left,
          width: rect.width
        });
        return newMap;
      });
    }
  };

  // Effect to handle scroll and resize events to update dropdown positions
  useEffect(() => {
    if (unitDropdownOpen.size === 0 && jobOrderDropdownOpen.size === 0) return;

    const handleScrollOrResize = () => {
      unitDropdownOpen.forEach((isOpen, index) => {
        if (isOpen) {
          const input = unitInputRefs.current.get(index);
          if (input) {
            const rect = input.getBoundingClientRect();
            setUnitDropdownPositions(prev => {
              const newMap = new Map(prev);
              newMap.set(index, {
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width
              });
              return newMap;
            });
          }
        }
      });
      jobOrderDropdownOpen.forEach((isOpen, index) => {
        if (isOpen) {
          const input = jobOrderInputRefs.current.get(index);
          if (input) {
            const rect = input.getBoundingClientRect();
            setJobOrderDropdownPositions(prev => {
              const newMap = new Map(prev);
              newMap.set(index, {
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width
              });
              return newMap;
            });
          }
        }
      });
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [unitDropdownOpen, jobOrderDropdownOpen]);

  useEffect(() => {
    loadVendors();
    loadJobOrders();
    loadCoaDefaults();
    if (quotationId > 0) {
      setIsHydrating(true);
      // Show Line Items table immediately with a blank row while the API loads.
      const today = new Date().toISOString().split("T")[0];
      setFormData((prev) => ({
        ...prev,
        Details: [
          {
            ID: 0,
            ItemNo: 1,
            PartName: "",
            PartNo: "",
            LineType: DEFAULT_VENDOR_ORDER_LINE_TYPE,
            DueDate: today,
            JobNumber: "",
            JobDesc: "",
            QtyOrdered: 1,
            Unit: "EA",
            UnitPrice: 0,
            JobPriority: 0,
            Discount: 0,
            DiscountType: "Percent",
            ProductId: undefined,
            RawMaterialId: undefined,
            LeadTime: today,
            Notes: "",
            glcode: defaultExpenseGlcode || companyDefaultExpenseGlcode,
          },
        ],
      }));
      loadQuotation();
    } else {
      setIsHydrating(false);
      initializeNewQuotation();
    }
  }, [quotationId]);

  // Close job order dropdown when clicking outside (handled by blur/onMouseDown in dropdown items)

  const loadVendors = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await VendorService.GetVendorlist({ tenantid: tenantID });

      if (result && Array.isArray(result)) {
        setVendors(result);
      }
    } catch (error: any) {
      console.error("Error loading vendors:", error);
      toast.error("Error loading vendors");
    }
  };

  const loadJobOrders = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await JobOrderService.GetJobOrders({ tenantid: tenantID });

      if (result && Array.isArray(result)) {
        setJobOrders(result);
      }
    } catch (error: any) {
      console.error("Error loading job orders:", error);
      // Don't show error toast as job orders might not be critical
    }
  };

  const accountIdToGlcode = (accountId?: number | null): string =>
    accountId && accountId > 0 ? String(accountId) : "";

  const loadCoaDefaults = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const [accounts, settings] = await Promise.all([
        ChartofAccountsService.GetChartofAccounts({ tenantid: tenantID }),
        AccountingService.GetAccountingSettings(),
      ]);
      setCoaAccounts((accounts || []).filter((a) => a.isActive !== false));
      const companyGl = accountIdToGlcode(settings?.defaultExpenseAccountId);
      setCompanyDefaultExpenseGlcode(companyGl);
      setDefaultExpenseGlcode((prev) => prev || companyGl);
    } catch (error) {
      console.error("Error loading COA defaults:", error);
    }
  };

  const getFirstLine = (text: string): string => {
    if (!text) return "";
    // Get the first line (split by newline and take first part)
    const firstLine = text.split(/\r?\n/)[0];
    return firstLine;
  };

  const loadQuotation = async () => {
    setLoading(true);
    setIsHydrating(true);
    try {
      // Load job orders first to ensure we have them for matching
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const jobOrdersData = await JobOrderService.GetJobOrders({ tenantid: tenantID });
      const availableJobOrders = jobOrdersData && Array.isArray(jobOrdersData) ? jobOrdersData : [];
      setJobOrders(availableJobOrders); // Update the state as well

      const result = await QuotationService.GetVendorQuotationById(quotationId);
      if (result) {
        console.log("[VendorQuotationSlideout] Loaded quotation data:", {
          quotationId,
          PONumber: result.PONumber,
          orderID: result.OrderID,
          quotationNumber: result.PONumber
        });

        // Ensure Details is always an array; migrate legacy JO# values from PartNo → JobNumber
        const normalizedDetails = (result.Details || []).map((detail: any) => {
          const partNo = detail.PartNo || "";
          const jobNumber = detail.JobNumber || "";
          if (looksLikeJobPartNo(partNo) && !jobNumber.trim()) {
            return { ...detail, JobNumber: partNo, PartNo: "" };
          }
          if (looksLikeJobPartNo(partNo) && jobNumber.trim()) {
            return { ...detail, PartNo: "" };
          }
          return detail;
        });
        const resAny = result as any;
        const rawExtDate = result.ExternalOrderDate || resAny.externalOrderDate || resAny.DueDate || resAny.dueDate;
        const formDataWithDetails = {
          ...result,
          ExternalOrderDate: rawExtDate || "",
          Details:
            normalizedDetails.length > 0
              ? normalizedDetails
              : [
                  {
                    ID: 0,
                    ItemNo: 1,
                    PartName: "",
                    PartNo: "",
                    LineType: DEFAULT_VENDOR_ORDER_LINE_TYPE,
                    DueDate: new Date().toISOString().split("T")[0],
                    JobNumber: "",
                    JobDesc: "",
                    QtyOrdered: 1,
                    Unit: "EA",
                    UnitPrice: 0,
                    JobPriority: 0,
                    Discount: 0,
                    DiscountType: "Percent" as const,
                    ProductId: undefined,
                    RawMaterialId: undefined,
                    LeadTime: new Date().toISOString().split("T")[0],
                    Notes: "",
                    glcode: defaultExpenseGlcode || companyDefaultExpenseGlcode,
                  },
                ],
          QuotationType: result.QuotationType || "Material",
        };
        setFormData(formDataWithDetails);
        setSavedStatus((formDataWithDetails.Status || "").trim());
        setPartHistoryByRow(new Map());
        if (formDataWithDetails.VendorID && formDataWithDetails.VendorID > 0) {
          try {
            const vendor = await VendorService.GetVendorById(formDataWithDetails.VendorID);
            const vendorGl =
              accountIdToGlcode((vendor as any)?.defaultExpenseAccountId) ||
              companyDefaultExpenseGlcode;
            setDefaultExpenseGlcode(vendorGl);
            const contactEmail =
              vendor?.VendorContact?.find((c) => c.isDefault)?.email ||
              vendor?.VendorContact?.[0]?.email ||
              vendor?.email ||
              "";
            setVendorEmail(contactEmail.trim());
          } catch {
            /* keep company default */
          }
        } else {
          setVendorEmail("");
        }
        if (result.Attachments && Array.isArray(result.Attachments) && result.Attachments.length > 0) {
          const cleanedAttachments: ModuleAttachment[] = result.Attachments.map((a: any) => ({
            id: a.id || 0,
            name: a.name || "",
            size: a.size || 0,
            fileUrl: a.fileUrl || a.uploadFile || "",
            fileUniqueno: a.fileUniqueno || 0,
            uploadFile: a.uploadFile || a.fileUrl || "",
            pageNo: a.pageNo || "0",
            createdBy: a.createdBy || 0,
            isPending: false,
          }));
          setAttachments(cleanedAttachments);
        } else {
          setAttachments([]);
        }
        setDeletedAttachmentIds([]);
        if (result.Comments && Array.isArray(result.Comments) && result.Comments.length > 0) {
          const cleanedComments = result.Comments.map(c => ({
            id: c.id || 0,
            text: c.text || "",
            createdAt: c.createdAt || new Date().toISOString(),
            createdBy: c.createdBy || "User"
          }));
          setComments(cleanedComments);
        } else {
          setComments([]);
        }

        // Initialize selectedJobOrders from JobNumber (or legacy PartNo JO refs)
        const newSelectedJobOrders = new Map<number, Set<number>>();
        normalizedDetails.forEach((detail: any, index: number) => {
          const jobSource = (detail.JobNumber || "").trim() || (looksLikeJobPartNo(detail.PartNo) ? (detail.PartNo || "").trim() : "");
          if (!jobSource) return;

          const jobNumbers = jobSource.split(",").map((s: string) => s.trim()).filter(Boolean);
          const selectedIds = new Set<number>();
          jobNumbers.forEach((jobNum: string) => {
            const matchingJobOrder = availableJobOrders.find(jo => {
              return jo.jobNumber === jobNum ||
                     `JO#${jo.jobOrderNumber}` === jobNum ||
                     jo.jobOrderNumber?.toString() === jobNum.replace(/^JO#?/i, "");
            });
            if (matchingJobOrder) {
              selectedIds.add(matchingJobOrder.jobOrderID);
            }
          });

          if (selectedIds.size > 0) {
            newSelectedJobOrders.set(index, selectedIds);
          }
        });
        setSelectedJobOrders(newSelectedJobOrders);
      }
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, "Error loading quotation"));
      console.error(error);
      if (isApiForbidden(error)) {
        clearOpenQueryFromUrl();
        onClose();
        return;
      }
    } finally {
      setLoading(false);
      setIsHydrating(false);
    }
  };

  const initializeNewQuotation = () => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const today = new Date().toISOString().split('T')[0];

    setAttachments([]);
    setDeletedAttachmentIds([]);

    setFormData(prev => ({
      ...prev,
      OrderDate: today,
      UserId: storage?.userId || 0,
      UserToken: storage?.userToken || 0,
      Tenantid: storage?.tenantID || 0,
      Details:
        prev.Details && prev.Details.length > 0
          ? prev.Details
          : [
              {
                ID: 0,
                ItemNo: 1,
                PartName: "",
                PartNo: "",
                LineType: DEFAULT_VENDOR_ORDER_LINE_TYPE,
                DueDate: today,
                JobNumber: "",
                JobDesc: "",
                QtyOrdered: 1,
                Unit: "EA",
                UnitPrice: 0,
                JobPriority: 0,
                Discount: 0,
                DiscountType: "Percent",
                ProductId: undefined,
                RawMaterialId: undefined,
                LeadTime: today,
                Notes: "",
                glcode: defaultExpenseGlcode || companyDefaultExpenseGlcode,
              },
            ],
    }));
  };

  const handleVendorChange = async (vendorId: number) => {
    const selectedVendor = vendors.find(v => v.vendor_id === vendorId);
    if (selectedVendor) {
      // Update basic vendor information first
      setFormData(prev => ({
        ...prev,
        VendorID: selectedVendor.vendor_id,
        VendorCode: selectedVendor.vendorcode,
        VendorName: selectedVendor.company_name,
      }));

      // Fetch full vendor details to get default contact person
      try {
        const fullVendorDetails = await VendorService.GetVendorById(vendorId);
        if (fullVendorDetails) {
          // Find default contact person from VendorContact array
          let defaultContactPerson = "";
          if (fullVendorDetails.VendorContact && fullVendorDetails.VendorContact.length > 0) {
            const defaultContact = fullVendorDetails.VendorContact.find(contact => contact.isDefault);
            if (defaultContact) {
              // Format as "FirstName LastName" or just use first name if no last name
              defaultContactPerson = `${defaultContact.firstname} ${defaultContact.lastname || ""}`.trim();
            } else if (fullVendorDetails.VendorContact.length > 0) {
              // If no default is set, use the first contact
              const firstContact = fullVendorDetails.VendorContact[0];
              defaultContactPerson = `${firstContact.firstname} ${firstContact.lastname || ""}`.trim();
            }
          }

          // Update form data with default contact person and expense defaults
          const vendorExpenseGl =
            accountIdToGlcode((fullVendorDetails as any).defaultExpenseAccountId) ||
            companyDefaultExpenseGlcode;
          setDefaultExpenseGlcode(vendorExpenseGl);
          const contactEmail =
            fullVendorDetails.VendorContact?.find((c) => c.isDefault)?.email ||
            fullVendorDetails.VendorContact?.[0]?.email ||
            fullVendorDetails.email ||
            "";
          setVendorEmail(contactEmail.trim());
          setFormData(prev => ({
            ...prev,
            BuyerName: defaultContactPerson,
            Details: (prev.Details || []).map((d) =>
              !d.glcode || !String(d.glcode).trim()
                ? { ...d, glcode: vendorExpenseGl }
                : d
            ),
          }));
        }
      } catch (error) {
        console.error("Error fetching vendor details:", error);
        // Don't show error toast for this - it's not critical
      }
    }
    setIsStateChanged(true);
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const next: any = { ...prev, [field]: value };
      if (field === "OrderDate") {
        const orderDate = toHtmlDateInputValue(value || "");
        const dueDate = toHtmlDateInputValue(prev.ExternalOrderDate || "");
        if (orderDate && dueDate && dueDate < orderDate) {
          next.ExternalOrderDate = orderDate;
        }
      }
      return next;
    });
    setIsStateChanged(true);

    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const calculateLineTotal = (detail: QuotationDetailReq): number => {
    const qty = Number(detail.QtyOrdered) || 0;
    const unitPrice = Number(detail.UnitPrice) || 0;
    const discount = Number(detail.Discount) || 0;
    const subtotal = qty * unitPrice;
    if (subtotal <= 0) return 0;
    const discountAmount =
      detail.DiscountType === "Amount"
        ? Math.min(Math.max(discount, 0), subtotal)
        : subtotal * (Math.min(Math.max(discount, 0), 100) / 100);
    return Math.max(0, subtotal - discountAmount);
  };

  const handleAddDetail = () => {
    setFormData((prev) => {
      const details = prev.Details || [];
      const newItemNo = details.length > 0 
        ? Math.max(...details.map(d => d.ItemNo)) + 1 
        : 1;
      
      const today = todayDateOnlyDisplay();
      const newDetail: QuotationDetailReq = {
        ID: 0,
        ItemNo: newItemNo,
        PartName: "",
        PartNo: "",
        LineType:
          details[details.length - 1]?.LineType ||
          DEFAULT_VENDOR_ORDER_LINE_TYPE,
        DueDate: today,
        JobNumber: "",
        JobDesc: "",
        QtyOrdered: 1,
        Unit: "EA",
        UnitPrice: 0,
        JobPriority: 0,
        Discount: 0,
        DiscountType: "Percent",
        ProductId: undefined,
        RawMaterialId: undefined,
        LeadTime: today,
        Notes: "",
        glcode: defaultExpenseGlcode || companyDefaultExpenseGlcode,
      };

      const total = [...details, newDetail].reduce((sum, detail) => sum + calculateLineTotal(detail), 0);

      return {
        ...prev,
        Details: [...details, newDetail],
        TotalAmount: total,
      };
    });
    setIsStateChanged(true);
  };

  const handleDetailChange = (index: number, field: keyof QuotationDetailReq, value: any) => {
    setFormData((prev) => {
      const newDetails = [...(prev.Details || [])];
      const current = { ...newDetails[index], [field]: value };

      if (field === "LineType") {
        const nextType = String(value || "");
        if (nextType === "RawMaterial") {
          current.ProductId = undefined;
        } else if (nextType === "FinishedProduct") {
          current.RawMaterialId = undefined;
        } else {
          current.ProductId = undefined;
          current.RawMaterialId = undefined;
        }
      }

      newDetails[index] = current;
      
      const total = newDetails.reduce((sum, detail) => sum + calculateLineTotal(detail), 0);

      return {
        ...prev,
        Details: newDetails,
        TotalAmount: total,
      };
    });
    setIsStateChanged(true);
  };

  const applyVendorPart = (index: number, part: CustomerPartOption) => {
    setFormData((prev) => {
      const details = [...(prev.Details || [])];
      const current = details[index];
      if (!current) return prev;
      details[index] = {
        ...current,
        PartNo: part.partNo,
        PartName: part.partName || current.PartName,
        Unit: part.unit || current.Unit || "EA",
        UnitPrice: part.unitPrice > 0 ? part.unitPrice : current.UnitPrice,
        ProductId: part.productId ?? current.ProductId,
        RawMaterialId: undefined,
        QtyOrdered:
          part.suggestedQty && part.suggestedQty > 0
            ? part.suggestedQty
            : current.QtyOrdered || 1,
      };
      const total = details.reduce((sum, d) => sum + calculateLineTotal(d), 0);
      return { ...prev, Details: details, TotalAmount: total };
    });
    setPartHistoryByRow((prev) => {
      const next = new Map(prev);
      const itemNo = formData.Details?.[index]?.ItemNo;
      if (itemNo != null) next.set(itemNo, part);
      return next;
    });
    setIsStateChanged(true);
  };

  const applyFinishedProduct = (index: number, product: ProductMaster) => {
    setFormData((prev) => {
      const details = [...(prev.Details || [])];
      const current = details[index];
      if (!current) return prev;
      details[index] = {
        ...current,
        PartNo: product.partNo || "",
        PartName: product.partName || current.PartName,
        Unit: product.unit || current.Unit || "EA",
        UnitPrice:
          product.avgUnitPrice > 0 ? product.avgUnitPrice : current.UnitPrice,
        ProductId: product.productId,
        RawMaterialId: undefined,
        LineType: "FinishedProduct",
      };
      const total = details.reduce((sum, d) => sum + calculateLineTotal(d), 0);
      return { ...prev, Details: details, TotalAmount: total };
    });
    setPartHistoryByRow((prev) => {
      const next = new Map(prev);
      const itemNo = formData.Details?.[index]?.ItemNo;
      if (itemNo != null) next.delete(itemNo);
      return next;
    });
    setIsStateChanged(true);
  };

  const applyRawMaterial = (index: number, material: RawMaterial) => {
    setFormData((prev) => {
      const details = [...(prev.Details || [])];
      const current = details[index];
      if (!current) return prev;
      details[index] = {
        ...current,
        PartNo: material.partNo || "",
        PartName: material.partName || current.PartName,
        Unit: material.unit || current.Unit || "EA",
        UnitPrice:
          material.unitCost > 0 ? material.unitCost : current.UnitPrice,
        RawMaterialId: material.id,
        ProductId: undefined,
        LineType: "RawMaterial",
      };
      const total = details.reduce((sum, d) => sum + calculateLineTotal(d), 0);
      return { ...prev, Details: details, TotalAmount: total };
    });
    setPartHistoryByRow((prev) => {
      const next = new Map(prev);
      const itemNo = formData.Details?.[index]?.ItemNo;
      if (itemNo != null) next.delete(itemNo);
      return next;
    });
    setIsStateChanged(true);
  };

  const handleDeleteDetail = (index: number) => {
    const removed = formData.Details?.[index];
    setFormData((prev) => {
      const newDetails = (prev.Details || []).filter((_, i) => i !== index);
      const total = newDetails.reduce((sum, detail) => sum + calculateLineTotal(detail), 0);

      return {
        ...prev,
        Details: newDetails,
        TotalAmount: total,
      };
    });
    if (removed) {
      setPartHistoryByRow((prev) => {
        const next = new Map(prev);
        next.delete(removed.ItemNo);
        return next;
      });
    }
    setIsStateChanged(true);
  };

  const handlePrint = async () => {
    if (!ensure("Print")) return;
    if (!formData.VendorID || !formData.Details || formData.Details.length === 0) {
      toast.error("Please ensure the quotation has a vendor and at least one line item before printing");
      return;
    }
    const toastId = toast.info("Generating Vendor Quotation PDF… this may take a moment.", {
      autoClose: false,
    });
    try {
      const blob = await PdfService.GenerateVendorQuotation(quotationId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `VendorQuotation_VQ${formData.PONumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.update(toastId, {
        render: "Vendor quotation PDF generated successfully",
        type: "success",
        autoClose: 3000,
      });
    } catch (error: any) {
      console.error('Error generating vendor quotation PDF:', error);
      toast.update(toastId, {
        render: error.response?.data?.error || "Failed to generate vendor quotation PDF",
        type: "error",
        autoClose: 5000,
      });
    }
  };

  const handleDuplicate = async () => {
    if (!ensure("Duplicate")) return;
    if (quotationId <= 0) return;
    const confirmText =
      "Create a Draft copy of this quotation dated today?\n\n" +
      "Prices and discounts are cleared so the vendor can quote again. Due dates move forward by the same lead time. " +
      "Vendor references, job links and comments are not copied." +
      (isStateChanged ? "\n\nUnsaved changes on this quotation are not included." : "");
    if (!window.confirm(confirmText)) return;

    setLoading(true);
    try {
      const result = await QuotationService.DuplicateVendorQuotation(quotationId);
      listNeedsRefreshRef.current = true;
      const notes = duplicateResultNotes(result);
      if (notes.length > 0) {
        toast.warning(`Quotation duplicated. ${notes.join(" ")}`, { autoClose: 8000 });
      } else {
        toast.success("Quotation duplicated. You are now viewing the copy.");
      }
      if (result.id > 0 && onSaved) {
        setIsStateChanged(false);
        onSaved(result.id);
      } else {
        onClose(true);
      }
    } catch (error: any) {
      console.error("Error duplicating quotation:", error);
      toast.error(error.response?.data?.message || error.response?.data?.error || "Error duplicating quotation");
    } finally {
      setLoading(false);
    }
  };

  /** Only uploaded attachments can be copied to the vendor order. */
  const convertibleAttachments = attachments.filter((a) => !a.isPending && a.id > 0);

  const isLineAlreadyConverted = (d: QuotationDetailReq) =>
    !!(d.ConvertedVendorOrderId && d.ConvertedVendorOrderId > 0);

  const unconvertedDetails = (formData.Details || []).filter(
    (d) => !isBlankQuoteOrOrderLine(d) && !isLineAlreadyConverted(d)
  );

  // Slideout Convert: hide only when this quotation's lines are all on POs.
  const isFullyConverted =
    formData.allLinesConverted === true ||
    (unconvertedDetails.length === 0 &&
      (formData.Details || []).some((d) => !isBlankQuoteOrOrderLine(d))) ||
    (formData.Status === "Converted" && unconvertedDetails.length === 0);

  const convertedOrderChips =
    formData.convertedOrders && formData.convertedOrders.length > 0
      ? formData.convertedOrders
      : formData.convertedOrderId && formData.convertedOrderId > 0
        ? [
            {
              orderId: formData.convertedOrderOrderId || 0,
              poNumber: formData.convertedOrderId,
              displayNumber:
                formData.convertedOrderId < 1000
                  ? formData.convertedOrderId + 999
                  : formData.convertedOrderId,
            },
          ]
        : [];

  const openConvertedOrder = (orderId: number) => {
    if (!orderId) return;
    setOrderSlideoutId(orderId);
    setShowOrderSlideout(true);
  };

  const handleConvertToOrder = async () => {
    if (!ensure("Convert")) return;
    if (!quotationId || quotationId <= 0) {
      toast.error("Invalid quotation ID. Please refresh and try again.");
      return;
    }
    if (!formData.VendorID || formData.VendorID <= 0) {
      toast.error("Vendor is required to convert quotation to order");
      return;
    }
    if (!formData.Details || formData.Details.length === 0) {
      toast.error("At least one line item is required to convert quotation to order");
      return;
    }
    if (isFullyConverted || unconvertedDetails.length === 0) {
      toast.warning("All line items on this quotation are already converted to orders");
      return;
    }

    // Pre-select only lines that are not yet on a PO
    setSelectedLineItems(new Set(unconvertedDetails.map((d) => d.ItemNo)));
    setSelectedAttachments(new Set(convertibleAttachments.map((a) => a.id)));
    setShowConvertToOrderDialog(true);
  };

  const getDetailLineTotal = (detail: QuotationDetailReq): number => {
    const subtotal = (detail.QtyOrdered || 0) * (detail.UnitPrice || 0);
    const discountAmount =
      detail.DiscountType === "Amount"
        ? Math.min(detail.Discount || 0, subtotal)
        : (subtotal * (detail.Discount || 0)) / 100;
    return subtotal - discountAmount;
  };

  const performConvertToOrder = async () => {
    if (convertingToOrder) return;
    if (selectedLineItems.size === 0) {
      toast.error("Please select at least one line item to convert");
      return;
    }

    setConvertingToOrder(true);
    try {
      const convertDateToISO = (dateStr: string): string => toDateOnlyApiString(dateStr);
      const selectedDetails = formData.Details.filter(
        (d) => selectedLineItems.has(d.ItemNo) && !isLineAlreadyConverted(d)
      );
      if (selectedDetails.length === 0) {
        toast.error("Select at least one unconverted line item");
        return;
      }

      // Convert quotation data to vendor order format
      const quotationNumber = formData.PONumber < 1000
        ? `VQ#${formData.PONumber + 999}`
        : `VQ#${formData.PONumber}`;

      console.log("[VendorQuotationSlideout] Quotation number calculation:", {
        formDataPONumber: formData.PONumber,
        calculatedQuotationNumber: quotationNumber
      });

      // Use today's date for order date (date of conversion) - format as YYYY-MM-DD
      const today = todayIsoInTenantTimezone();
      
      const vendorOrderData = {
        OrderID: 0, // New order
        Tenantid: formData.Tenantid,
        VendorID: formData.VendorID,
        VendorCode: formData.VendorCode,
        PONumber: 0, // Will be auto-generated
        VendorName: formData.VendorName,
        Address: formData.Address,
        VendorPoNumber: formData.VendorPoNumber,
        OrderDate: today, // Use today's date (date of conversion) in YYYY-MM-DD format
        TotalAmount: selectedDetails.reduce((sum, d) => sum + getDetailLineTotal(d), 0),
        UserId: formData.UserId,
        UserToken: formData.UserToken,
        Status: "Draft", // Start as draft
        ShippingInstructions: formData.ShippingInstructions,
        ExternalVendorPO: formData.ExternalVendorPO,
        ExternalOrderDate: formData.ExternalOrderDate ? convertDateToISO(formData.ExternalOrderDate) : undefined,
        BuyerName: formData.BuyerName,
        VendorRefNo: formData.VendorRefNo,
        OrderType: "Vendor",
        MaterialType: deriveOrderMaterialType(
          selectedDetails
            .filter((d) => !isBlankQuoteOrOrderLine(d))
            .map((d) => d.LineType || lineTypeFromQuotationType(formData.QuotationType))
        ),
        QuotationId: quotationId, // Link to original quotation (use prop, not formData.OrderID)
        QuotationNo: quotationNumber, // Quotation number for reference
        Details: selectedDetails.map(detail => {
          // Extract JobId from JobNumber if possible (e.g., "JO#1001" -> 1001)
          let jobId = 0;
          if (detail.JobNumber) {
            const match = detail.JobNumber.match(/JO#?(\d+)/i);
            if (match && match[1]) {
              jobId = parseInt(match[1], 10) || 0;
            }
          }
          
          return {
            ID: 0, // New detail
            ItemNo: detail.ItemNo,
            JobId: jobId, // Required field - extract from JobNumber or use 0
            PartName: detail.PartName,
            PartNo: detail.PartNo,
            LineType: detail.LineType || lineTypeFromQuotationType(formData.QuotationType),
            RawMaterialId: detail.RawMaterialId,
            DueDate: convertDateToISO(detail.DueDate),
            JobNumber: detail.JobNumber,
            JobDesc: detail.JobDesc,
            QtyOrdered: detail.QtyOrdered,
            Unit: detail.Unit,
            UnitPrice: detail.UnitPrice,
            JobPriority: detail.JobPriority,
            Discount: detail.Discount,
            DiscountType: (detail.DiscountType === "Amount" ? "Amount" : "Percent") as "Percent" | "Amount",
            ProductId: detail.ProductId,
            LeadTime: detail.LeadTime,
            Notes: detail.Notes,
            ShippedQty: 0,
            ShippingStatus: "",
            InvoicedQty: 0,
            InvoiceStatus: "",
            glcode: detail.glcode || "", // Expense account for PO / bill posting
            Received: "No", // Required field - default to "No"
          };
        }),
        Attachments: [], // Files are copied via CopyAttachmentsToVendorOrder after order is created
        Comments: [], // Don't copy comments
      };

      // Ensure quotation information is properly set
      if (!quotationId || quotationId <= 0) {
        console.error("[VendorQuotationSlideout] quotationId prop is missing or invalid:", quotationId);
        toast.error("Unable to link quotation to order. Please try again.");
        return;
      }

      if (!vendorOrderData.QuotationNo || vendorOrderData.QuotationNo.trim() === "") {
        console.error("[VendorQuotationSlideout] QuotationNo is missing or empty:", vendorOrderData.QuotationNo);
        toast.error("Unable to set quotation number. Please try again.");
        return;
      }

      console.log("[VendorQuotationSlideout] vendorOrderData object keys:", Object.keys(vendorOrderData));
      console.log("[VendorQuotationSlideout] vendorOrderData before save:", {
        quotationIdProp: quotationId,
        OrderID: vendorOrderData.OrderID,
        Tenantid: vendorOrderData.Tenantid,
        VendorID: vendorOrderData.VendorID,
        QuotationId: vendorOrderData.QuotationId,
        QuotationNo: vendorOrderData.QuotationNo,
        quotationNumber: quotationNumber,
        formDataOrderID: formData.OrderID,
        formDataPONumber: formData.PONumber
      });

      const result = await VendorOrderService.SaveVendorOrder(vendorOrderData);

      if (result && result.id > 0) {
        const selectedAttachmentIdList = Array.from(selectedAttachments).filter((id) => id > 0);
        if (selectedAttachmentIdList.length > 0) {
          try {
            await QuotationService.CopyAttachmentsToVendorOrder(
              quotationId,
              result.id,
              selectedAttachmentIdList
            );
          } catch (copyErr: any) {
            console.error("Error copying attachments to vendor order:", copyErr);
            toast.warning("Order created, but some attachments could not be copied");
          }
        }

        // Backend SaveVendorOrder already updates quotation status and convertedOrderId (PONumber).
        // Do not call SaveVendorQuotation here; reload instead.
        listNeedsRefreshRef.current = true;
        await loadQuotation();

        const poNumber = result.poNumber ?? result.id;
        const orderNumber = poNumber < 1000 ? `VO#${poNumber + 999}` : `VO#${poNumber}`;
        setShowConvertToOrderDialog(false);
        toast.success(`Quotation converted to vendor order successfully! Order Number: ${orderNumber}`, {
          autoClose: 5000,
        });
      } else {
        toast.error("Failed to create vendor order");
      }
    } catch (error: any) {
      console.error("Error converting quotation to vendor order:", error);
      toast.error(`Error converting quotation: ${error?.response?.data?.error || error?.message || "Unknown error"}`);
    } finally {
      setConvertingToOrder(false);
    }
  };

  const refreshDeletionImpact = async () => {
    try {
      const response = await QuotationService.CheckVendorQuotationDeletionImpact(quotationId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    try {
      if (deleteEndpoint.includes('/Order/DeleteVendorOrder')) {
        await VendorOrderService.DeleteVendorOrder(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        const tenantID = storage?.tenantID || 0;
        const url = `/api${deleteEndpoint}`;
        await fetch(url, { method: 'DELETE' });
        toast.success(`${dependencyType} deleted successfully`);
      }
    } catch (error: any) {
      console.error(`Error deleting ${dependencyType}:`, error);
      toast.error(`Error deleting ${dependencyType}: ${error.message || "Unknown error"}`);
      throw error;
    }
  };

  const handleDeleteAll = async () => {
    if (!deletionImpact || !deletionImpact.blockingDependencies) {
      return;
    }

    setLoading(true);
    try {
      const allDependencies: Array<{ type: string; id: number; name: string; endpoint: string }> = [];
      
      deletionImpact.blockingDependencies.forEach(dependency => {
        dependency.items.forEach(item => {
          allDependencies.push({
            type: dependency.entityType,
            id: item.id,
            name: item.name,
            endpoint: item.deleteEndpoint
          });
        });
      });

      for (const dep of allDependencies) {
        try {
          await handleDeleteDependency(dep.type, dep.id, dep.endpoint);
        } catch (error: any) {
          console.error(`Error deleting ${dep.name}:`, error);
          toast.error(`Failed to delete ${dep.name}. Stopping deletion process.`);
          setLoading(false);
          await refreshDeletionImpact();
          return;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      await refreshDeletionImpact();

      const updatedResponse = await QuotationService.CheckVendorQuotationDeletionImpact(quotationId);
      const updatedImpact = updatedResponse.result as DeletionImpactResult;

      if (updatedImpact.canDelete) {
        await QuotationService.DeleteVendorQuotation(quotationId);
        toast.success("All dependencies and quotation deleted successfully");
        setShowDeletionDialog(false);
        onClose(true);
      } else {
        setDeletionImpact(updatedImpact);
        toast.warning("Some dependencies could not be deleted. Please try again.");
      }
    } catch (error: any) {
      console.error("Error in delete all process:", error);
      toast.error(`Error during deletion: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!ensure("Delete")) return;
    setLoading(true);
    try {
      const response = await QuotationService.CheckVendorQuotationDeletionImpact(quotationId);
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
      await QuotationService.DeleteVendorQuotation(quotationId);
      toast.success("Quotation deleted successfully");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting quotation:", error);
      toast.error(`Error deleting quotation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendToMultipleVendors = async () => {
    if (!ensure("Send")) return;
    if (quotationId === 0) {
      toast.error("Please save the quotation first before sending to multiple vendors");
      return;
    }
    if (formData.Details.length === 0) {
      toast.error("Please add at least one line item before sending to multiple vendors");
      return;
    }
    // Always pre-select the master quotation's vendor (master pricing is kept)
    const initialSelection = new Set<number>();
    if (formData.VendorID > 0) {
      initialSelection.add(formData.VendorID);
    }
    setSelectedVendorIds(initialSelection);

    // Load vendors that already have a child RFQ so we don't re-send duplicates
    const alreadySent = new Set<number>();
    try {
      const comparison = await QuotationService.GetVendorQuotationComparison(quotationId);
      (comparison?.quotations || []).forEach((q: any) => {
        const vendorId = Number(q.vendorID ?? q.VendorID ?? 0);
        const orderId = Number(q.orderID ?? q.OrderID ?? 0);
        if (vendorId > 0 && orderId !== quotationId && orderId !== (formData.OrderID || quotationId)) {
          alreadySent.add(vendorId);
        }
      });
    } catch {
      // Non-fatal — API still skips duplicates on save
    }
    setAlreadySentVendorIds(alreadySent);
    setShowMultiVendorDialog(true);
  };

  const handleMultiVendorSave = async () => {
    const masterId = formData.VendorID;
    const masterHasPortal = !!vendors.find((v) => v.vendor_id === masterId)?.portalAccessEnabled;
    if (!masterHasPortal) {
      toast.error(
        "Current vendor has no Vendor Portal access. Enable portal access in Vendor Master before sending."
      );
      return;
    }

    // Master is always included; additional vendors must have portal access.
    const additional = Array.from(selectedVendorIds).filter((id) => {
      if (id === masterId) return false;
      return !!vendors.find((v) => v.vendor_id === id)?.portalAccessEnabled;
    });

    if (additional.length < 1) {
      toast.error("Please select at least one additional vendor that has Vendor Portal access");
      return;
    }

    const sendable = [masterId, ...additional];

    setLoading(true);
    try {
      const result = await QuotationService.DuplicateVendorQuotationForVendors(
        quotationId,
        sendable,
        includeAttachments
      );
      const baseMsg =
        result?.message ||
        `Quotation sent to ${sendable.length} vendor(s). Master pricing kept; additional vendors start with blank pricing for bidding.`;
      toast.success(baseMsg);
      setShowMultiVendorDialog(false);
      setSelectedVendorIds(new Set());
      setAlreadySentVendorIds(new Set());
      setIncludeAttachments(true); // Reset to default
      onClose(true); // Close slideout to refresh the list
    } catch (error: any) {
      console.error("Error sending to multiple vendors:", error);
      toast.error(
        `Error: ${error?.response?.data?.error || error.message || "Failed to send quotation"}`
      );
    } finally {
      setLoading(false);
    }
  };

  const closeDocumentViewer = () => {
    setDocumentViewerOpen(false);
    setViewerDocuments([]);
    setActiveViewerIndex(0);
  };

  const handleOpenDocumentViewer = (
    _attachment: ModuleAttachment,
    index: number,
    documents: DocumentViewerFile[]
  ) => {
    const hydrated = documents.map((doc) => {
      if (doc.localUrl) return doc;
      const cached = documentCacheRef.current.get({
        id: doc.id,
        fileUniqueno: doc.fileUniqueno,
        isPending: doc.isPending,
        localUrl: doc.localUrl,
      });
      if (!cached) return doc;
      return {
        ...doc,
        localUrl: cached.blobUrl,
        contentType: cached.contentType || doc.contentType,
        size: cached.size || doc.size,
      };
    });
    setViewerDocuments(hydrated);
    setActiveViewerIndex(index);
    setDocumentViewerOpen(true);
  };

  const loadAttachmentIntoCache = useCallback(
    async (
      file: DocumentViewerFile,
      signal?: AbortSignal
    ): Promise<{ url: string; contentType?: string } | null> => {
      if (file.localUrl) {
        return { url: file.localUrl, contentType: file.contentType };
      }
      if (file.isPending) {
        return file.localUrl
          ? { url: file.localUrl, contentType: file.contentType }
          : null;
      }
      if (!file.fileUniqueno || formData.OrderID <= 0) {
        throw new Error("Attachment is not available for viewing yet");
      }

      const entry = await documentCacheRef.current.getOrLoad(
        { id: file.id, fileUniqueno: file.fileUniqueno },
        async () => {
          const { blob, contentType } = await QuotationService.VendorQuotationGetFile({
            orderId: formData.OrderID,
            fileUniqueno: file.fileUniqueno!,
            signal,
          });
          const blobUrl = URL.createObjectURL(blob);
          return {
            attachmentId: file.id,
            fileUniqueno: file.fileUniqueno,
            name: file.name,
            size: file.size || blob.size,
            contentType,
            blobUrl,
            ownsUrl: true,
          };
        }
      );

      setViewerDocuments((prev) =>
        prev.map((d) =>
          String(d.id) === String(file.id) ||
          (file.fileUniqueno && d.fileUniqueno === file.fileUniqueno)
            ? {
                ...d,
                localUrl: entry.blobUrl,
                contentType: entry.contentType || d.contentType,
                size: entry.size || d.size,
              }
            : d
        )
      );

      return { url: entry.blobUrl, contentType: entry.contentType };
    },
    [formData.OrderID]
  );

  const handleNeedDocument = useCallback(
    (file: DocumentViewerFile, _index: number, signal: AbortSignal) =>
      loadAttachmentIntoCache(file, signal),
    [loadAttachmentIntoCache]
  );

  const handlePrefetchDocument = useCallback(
    (file: DocumentViewerFile) => {
      if (file.localUrl || file.isPending || !file.fileUniqueno || formData.OrderID <= 0) {
        return;
      }
      if (
        documentCacheRef.current.has({
          id: file.id,
          fileUniqueno: file.fileUniqueno,
        })
      ) {
        return;
      }
      loadAttachmentIntoCache(file).catch(() => {});
    },
    [formData.OrderID, loadAttachmentIntoCache]
  );

  const handleViewerDownload = async (file: DocumentViewerFile) => {
    const match = attachments.find(
      (a) => String(a.id) === String(file.id) || a.name === file.name
    );
    if (!match) return;

    if (match.isPending && match.localUrl) {
      const link = document.createElement("a");
      link.href = match.localUrl;
      link.download = match.name;
      link.click();
      return;
    }

    if (!match.fileUniqueno || formData.OrderID <= 0) {
      toast.error("Attachment is not available for download yet");
      return;
    }

    const cached = documentCacheRef.current.get({
      id: match.id,
      fileUniqueno: match.fileUniqueno,
    });

    await QuotationService.DownloadVendorQuotationAttachment({
      orderId: formData.OrderID,
      fileUniqueno: match.fileUniqueno,
      name: match.name,
      uploadFile: match.uploadFile,
      cachedBlobUrl: cached?.blobUrl,
    });
  };

  useEffect(() => {
    return () => {
      documentCacheRef.current.clear();
    };
  }, []);

  const handleCancel = () => {
    if (isStateChanged) {
      if (window.confirm("You have unsaved changes. Are you sure you want to close?")) {
        closeDocumentViewer();
        documentCacheRef.current.clear();
        onClose(listNeedsRefreshRef.current);
      }
    } else {
      closeDocumentViewer();
      documentCacheRef.current.clear();
      onClose(listNeedsRefreshRef.current);
    }
  };

  const isSentOrLater = SENT_OR_LATER_STATUSES.includes((formData.Status || "").trim());
  const isDraftLocked =
    DRAFT_LOCKED_STATUSES.includes(savedStatus) || Number(formData.convertedOrderId || 0) > 0;

  const resolveSaveStatus = (mode: "draft" | "submit"): string => {
    const current = (formData.Status || "").trim();
    if (SENT_OR_LATER_STATUSES.includes(current)) {
      return current;
    }
    if (isDraftLocked) {
      return savedStatus;
    }
    return mode === "draft" ? "Draft" : "Sent";
  };

  const handleSave = async (mode: "draft" | "submit") => {
    if (!ensure(isNew ? "Add" : "Edit")) return;
    if (!formData.VendorID || formData.VendorID <= 0) {
      toast.error("Vendor is required");
      return;
    }

    if (!formData.OrderDate) {
      toast.error("Quotation date is required");
      return;
    }

    const orderDateHtml = toHtmlDateInputValue(formData.OrderDate);
    const dueDateHtml = toHtmlDateInputValue(formData.ExternalOrderDate || "");
    if (dueDateHtml && orderDateHtml && dueDateHtml < orderDateHtml) {
      toast.error("Due date cannot be before quotation date");
      return;
    }

    const filledDetails = (formData.Details || []).filter(
      (d) => !isBlankQuoteOrOrderLine(d)
    );
    if (filledDetails.length === 0) {
      toast.error("At least one line item is required");
      return;
    }

    const status = resolveSaveStatus(mode);
    setLoading(true);
    setSavingAction(mode);
    try {
      const pendingFiles = getPendingFiles(attachments);
      const persistedAttachments = (attachments || [])
        .filter((a) => !a.isPending)
        .map((a) => ({
          id: a.id,
          name: a.name,
          size: a.size,
          fileUrl: a.fileUrl || a.uploadFile || "",
          fileUniqueno: a.fileUniqueno || 0,
          uploadFile: a.uploadFile || a.fileUrl || "",
          pageNo: a.pageNo || "0",
          createdBy: a.createdBy || 0,
        }));

      const dataToSave: VendorQuotationMasterReq = {
        ...formData,
        Status: status,
        QuotationType: deriveOrderMaterialType(
          filledDetails.map(
            (d) => d.LineType || defaultLineTypeForOrder(formData.QuotationType)
          )
        ),
        Details: filledDetails,
        Attachments: persistedAttachments,
        DeletedAttachmentIds: deletedAttachmentIds,
        Comments: comments || [],
      };

      const result = await QuotationService.SaveVendorQuotation(dataToSave);

      const savedId = result.id > 0 ? result.id : formData.OrderID;
      if (savedId > 0 && pendingFiles.length > 0) {
        await QuotationService.VendorQuotationSaveFile(savedId, pendingFiles);
      }

      revokeLocalAttachmentUrls(attachments.filter((a) => a.isPending && a.localUrl));
      setDeletedAttachmentIds([]);

      if (status === "Draft") {
        toast.success(quotationId > 0 ? "Quotation saved as draft" : "Quotation created as draft");
      } else if (status === "Sent" && formData.Status !== "Sent") {
        toast.success("Quotation marked as Sent");
      } else {
        toast.success(result.message || (quotationId > 0 ? "Quotation updated successfully" : "Quotation created successfully"));
      }
      setIsStateChanged(false);

      if (savedId > 0) {
        listNeedsRefreshRef.current = true;
        const wasNew = quotationId === 0;
        setFormData((prev) => ({
          ...prev,
          OrderID: savedId,
          Status: status,
        }));
        setSavedStatus(status);
        if (wasNew) {
          onSaved?.(savedId);
        }
      }

      // Don't close the slideout - keep it open for further editing
    } catch (error: any) {
      toast.error(`Error saving quotation: ${getApiErrorMessage(error, "Unknown error")}`);
      console.error("Error saving quotation:", error);
    } finally {
      setLoading(false);
      setSavingAction(null);
    }
  };

  return (
    <div
      className="vendor-quotation-slideout-overlay"
      onClick={handleCancel}
    >
      {documentViewerOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10050,
              background: "rgba(15, 23, 42, 0.55)",
              display: "flex",
              alignItems: "stretch",
              justifyContent: "center",
              padding: "1.5rem",
            }}
            onClick={(e) => {
              e.stopPropagation();
              closeDocumentViewer();
            }}
          >
            <div
              style={{
                flex: 1,
                maxWidth: "1100px",
                background: "#fff",
                borderRadius: "0.5rem",
                overflow: "hidden",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <DocumentViewerWorkspace
                documents={viewerDocuments}
                activeIndex={activeViewerIndex}
                onActiveIndexChange={setActiveViewerIndex}
                onClose={closeDocumentViewer}
                onNeedDocument={handleNeedDocument}
                onPrefetchDocument={handlePrefetchDocument}
                onDownload={(file) => {
                  handleViewerDownload(file).catch((error: any) => {
                    toast.error(error?.message || "Failed to download attachment");
                  });
                }}
                mode="view"
              />
            </div>
          </div>,
          document.body
        )}
      <div className="vendor-quotation-slideout-card" onClick={(e) => e.stopPropagation()}>
        <SlideoutHydratingOverlay show={isHydrating} label="Loading quotation…" />
        <div className="vendor-quotation-slideout-header">
          <div>
            <h2>{quotationId > 0 ? "Edit Quotation" : "New Quotation"}</h2>
            {quotationId > 0 && formData.PONumber > 0 && (
              <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                Quotation Number: {formData.PONumber < 1000 ? `VQ#${formData.PONumber + 999}` : `VQ#${formData.PONumber}`}
                {convertedOrderChips.length > 0 ? (
                  <span style={{ marginLeft: "1rem", color: "#10b981", fontWeight: 500 }}>
                    → Converted to Order{convertedOrderChips.length > 1 ? "s" : ""}:{" "}
                    {convertedOrderChips.map((o, i) => (
                      <span key={`${o.orderId}-${o.poNumber}`}>
                        {i > 0 ? ", " : ""}
                        <span
                          style={{
                            cursor: o.orderId ? "pointer" : "default",
                            textDecoration: o.orderId ? "underline" : "none",
                          }}
                          onClick={() => openConvertedOrder(o.orderId)}
                          title={o.orderId ? "Click to view order" : undefined}
                        >
                          VO#{o.displayNumber || o.poNumber}
                        </span>
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {quotationId > 0 && (
              <>
                {canPrint && (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={handlePrint}
                  title="Print"
                  style={{ color: "#6366f1" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                  </svg>
                </button>
                )}
                {canSend && (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setShowEmailDialog(true)}
                  title="Email"
                  style={{ color: "#6366f1" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </button>
                )}
                {canDuplicate && (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={handleDuplicate}
                  title="Duplicate"
                  style={{ color: "#6366f1" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
                )}
                {canConvert && (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={handleConvertToOrder}
                  title={
                    isFullyConverted
                      ? "All lines already converted"
                      : unconvertedDetails.length < (formData.Details?.length || 0)
                        ? "Convert remaining lines to order"
                        : "Convert to Order"
                  }
                  style={{ 
                    color: quotationId === 0 || isFullyConverted ? "#9ca3af" : "#10b981",
                    cursor: quotationId === 0 || isFullyConverted ? "not-allowed" : "pointer",
                    opacity: quotationId === 0 || isFullyConverted ? 0.5 : 1
                  }}
                  disabled={quotationId === 0 || isFullyConverted}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
                </button>
                )}
                {canDelete && (
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
                )}
                {canSend && (
                <button
                  type="button"
                  className="btn-icon"
                  onClick={handleSendToMultipleVendors}
                  title="Send to Multiple Vendors"
                  style={{ 
                    color: quotationId === 0 ? "#9ca3af" : "#6366f1",
                    cursor: quotationId === 0 ? "not-allowed" : "pointer",
                    opacity: quotationId === 0 ? 0.5 : 1
                  }}
                  disabled={quotationId === 0}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </button>
                )}
              </>
            )}
            <div className="status-field-inline">
              <div className={`input-group ${formData.Status === "Active" || formData.Status === "Sent" || formData.Status === "Responded" || formData.Status === "Accepted" || formData.Status === "Converted" ? "status-active-group" : "status-inactive-group"}`} style={{ maxWidth: "150px" }}>
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                  </span>
                </div>
                <select
                  className={`form-input ${formData.Status === "Active" || formData.Status === "Sent" || formData.Status === "Responded" || formData.Status === "Accepted" || formData.Status === "Converted" ? "status-active" : "status-inactive"}`}
                  value={formData.Status}
                  onChange={(e) => handleInputChange("Status", e.target.value)}
                >
                  <option
                    value="Draft"
                    disabled={isDraftLocked && formData.Status !== "Draft"}
                    title={
                      isDraftLocked
                        ? "The vendor has responded or the quotation is converted"
                        : undefined
                    }
                  >
                    Draft
                  </option>
                  <option value="Sent">Sent</option>
                  <option value="Responded">Responded</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Partially Converted">Partially Converted</option>
                  <option value="Converted">Converted</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={handleCancel}>
              ×
            </button>
          </div>
        </div>

        <form className="vendor-quotation-slideout-form" onSubmit={(e) => e.preventDefault()}>
          <div className="vendor-quotation-slideout-content">
            {/* Basic Information */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="VendorID">Vendor <span className="required">*</span></label>
                <div className={`input-group ${errors.VendorID ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">🏢</span>
                  </div>
                  <select
                    id="VendorID"
                    name="VendorID"
                    className={`form-input ${errors.VendorID ? "error" : ""}`}
                    value={formData.VendorID}
                    onChange={(e) => handleVendorChange(Number(e.target.value))}
                    required
                  >
                    <option value="0">Select Vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.vendor_id} value={vendor.vendor_id}>
                        {vendor.company_name} ({vendor.vendorcode})
                      </option>
                    ))}
                  </select>
                </div>
                {errors.VendorID && <span className="error-message">{errors.VendorID}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="OrderDate">Quotation Date <span className="required">*</span></label>
                <div className={`input-group ${errors.OrderDate ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">📅</span>
                  </div>
                  <input
                    type="date"
                    id="OrderDate"
                    name="OrderDate"
                    className={`form-input ${errors.OrderDate ? "error" : ""}`}
                    value={formData.OrderDate}
                    onChange={(e) => handleInputChange("OrderDate", e.target.value)}
                    required
                  />
                </div>
                {errors.OrderDate && <span className="error-message">{errors.OrderDate}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="BuyerName">Contact Person</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">👤</span>
                  </div>
                  <input
                    type="text"
                    id="BuyerName"
                    name="BuyerName"
                    className="form-input"
                    placeholder="Contact person (auto-filled from vendor)"
                    value={formData.BuyerName}
                    onChange={(e) => handleInputChange("BuyerName", e.target.value)}
                    readOnly
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="ExternalOrderDate">Due Date</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">📅</span>
                  </div>
                  <input
                    type="date"
                    id="ExternalOrderDate"
                    name="ExternalOrderDate"
                    className="form-input"
                    min={toHtmlDateInputValue(formData.OrderDate)}
                    value={formData.ExternalOrderDate || ""}
                    onChange={(e) => handleInputChange("ExternalOrderDate", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Additional form fields */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="VendorPoNumber">Vendor PO Number</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">📄</span>
                  </div>
                  <input
                    type="text"
                    id="VendorPoNumber"
                    name="VendorPoNumber"
                    className="form-input"
                    placeholder="Vendor purchase order number"
                    value={formData.VendorPoNumber}
                    onChange={(e) => handleInputChange("VendorPoNumber", e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="ShippingInstructions">Shipping Instructions</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">🚚</span>
                  </div>
                  <input
                    type="text"
                    id="ShippingInstructions"
                    name="ShippingInstructions"
                    className="form-input"
                    placeholder="Special shipping instructions"
                    value={formData.ShippingInstructions}
                    onChange={(e) => handleInputChange("ShippingInstructions", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div style={{ marginTop: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Line Items</h3>
                <button
                  type="button"
                  onClick={handleAddDetail}
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
                  + Add Item
                </button>
              </div>
              
              {formData.Details && (
                <div className="line-items-table-container" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Item #</th>
                        <th className="vo-line-type-col" style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, minWidth: "148px" }}>
                          Line type <span className="required">*</span>
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Part No</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Description</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Job No</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, width: "100px" }}>Qty</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, width: "80px" }}>Unit</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, width: "120px" }}>Unit Price</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, width: "140px" }}>{discountColumnLabel}</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Total</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, minWidth: "180px" }}>Account</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Notes</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.Details.map((detail, index) => {
                        const lineTotal = calculateLineTotal(detail);
                        const lineLocked = isLineAlreadyConverted(detail);
                        const selectedJobOrderIds = selectedJobOrders.get(index) || new Set<number>();
                        const isJobOrderDropdownOpen = jobOrderDropdownOpen.get(index) || false;
                        const selectedJobOrdersList = Array.from(selectedJobOrderIds)
                          .map(id => jobOrders.find(jo => jo.jobOrderID === id))
                          .filter(Boolean) as JobOrderMaster[];
                        const displayText = selectedJobOrdersList.length > 0
                          ? selectedJobOrdersList.map(jo => jo.jobNumber || `JO#${jo.jobOrderNumber}`).join(", ")
                          : detail.JobNumber || (looksLikeJobPartNo(detail.PartNo) ? detail.PartNo : "");
                        const historyHint = formatPartHistoryHint(partHistoryByRow.get(detail.ItemNo));
                        const lineType =
                          detail.LineType ||
                          defaultLineTypeForOrder(formData.QuotationType);

                        return (
                          <React.Fragment key={detail.ItemNo}>
                          <tr
                            style={{
                              borderBottom: historyHint ? "none" : "1px solid #e5e7eb",
                              verticalAlign: "middle",
                            }}
                          >
                            <td style={{ padding: "0.75rem" }}>
                              {detail.ItemNo}
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <select
                                className={`form-input vo-line-type-select ${lineTypeAccentClass(lineType)}`}
                                title={
                                  lineLocked
                                    ? "Line already converted to a vendor order"
                                    : "Line type is copied to the vendor PO on convert. Check this before saving."
                                }
                                value={lineType}
                                disabled={lineLocked}
                                onChange={(e) =>
                                  handleDetailChange(index, "LineType", e.target.value)
                                }
                              >
                                {VENDOR_ORDER_LINE_TYPES.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              {lineType === "RawMaterial" ? (
                                <RawMaterialCombobox
                                  value={looksLikeJobPartNo(detail.PartNo) ? "" : (detail.PartNo || "")}
                                  rawMaterialId={detail.RawMaterialId}
                                  suggestedPartName={detail.PartName}
                                  suggestedUnit={detail.Unit}
                                  suggestedUnitCost={detail.UnitPrice}
                                  vendorId={formData.VendorID}
                                  vendorSelected={!!formData.VendorID && formData.VendorID > 0}
                                  disabled={lineLocked}
                                  scrollContainerSelector=".vendor-quotation-slideout-content"
                                  onChange={(partNo) => {
                                    setFormData((prev) => {
                                      const details = [...(prev.Details || [])];
                                      if (!details[index]) return prev;
                                      details[index] = {
                                        ...details[index],
                                        PartNo: partNo,
                                        RawMaterialId: undefined,
                                      };
                                      return { ...prev, Details: details };
                                    });
                                    setIsStateChanged(true);
                                  }}
                                  onSelect={(material) => applyRawMaterial(index, material)}
                                />
                              ) : lineType === "FinishedProduct" ? (
                                <ProductMasterCombobox
                                  value={looksLikeJobPartNo(detail.PartNo) ? "" : (detail.PartNo || "")}
                                  productId={detail.ProductId}
                                  disabled={lineLocked}
                                  scrollContainerSelector=".vendor-quotation-slideout-content"
                                  onChange={(partNo) => {
                                    setFormData((prev) => {
                                      const details = [...(prev.Details || [])];
                                      if (!details[index]) return prev;
                                      details[index] = {
                                        ...details[index],
                                        PartNo: partNo,
                                        ProductId: undefined,
                                      };
                                      return { ...prev, Details: details };
                                    });
                                    setIsStateChanged(true);
                                  }}
                                  onSelect={(product) => applyFinishedProduct(index, product)}
                                />
                              ) : (
                              <VendorPartCombobox
                                value={looksLikeJobPartNo(detail.PartNo) ? "" : (detail.PartNo || "")}
                                vendorId={formData.VendorID}
                                vendorSelected={!!formData.VendorID && formData.VendorID > 0}
                                lineType={lineType}
                                excludeQuotationId={formData.OrderID > 0 ? formData.OrderID : quotationId}
                                disabled={lineLocked}
                                scrollContainerSelector=".vendor-quotation-slideout-content"
                                onChange={(partNo) => handleDetailChange(index, "PartNo", partNo)}
                                onSelectPart={(part) => applyVendorPart(index, part)}
                                onHistoryMatch={(part) => {
                                  setPartHistoryByRow((prev) => {
                                    const next = new Map(prev);
                                    next.set(detail.ItemNo, part);
                                    return next;
                                  });
                                }}
                              />
                              )}
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <input
                                type="text"
                                className="form-input"
                                style={{
                                  width: "100%",
                                  minWidth: "150px",
                                  cursor: "pointer",
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                  whiteSpace: "nowrap"
                                }}
                                value={getFirstLine(detail.PartName || "")}
                                onClick={() => {
                                  if (lineLocked) return;
                                  setEditingField({ index, field: "PartName", value: detail.PartName || "" });
                                  setShowTextEditorPopup(true);
                                }}
                                placeholder="Click to edit item name"
                                readOnly
                                disabled={lineLocked}
                                title={
                                  lineLocked
                                    ? "Line already converted to a vendor order"
                                    : detail.PartName || "Click to edit item name"
                                }
                              />
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <div style={{ position: "relative" }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ width: "100%", minWidth: "150px", cursor: lineLocked ? "not-allowed" : "pointer" }}
                                  value={displayText}
                                  title={lineLocked ? "Line already converted to a vendor order" : displayText}
                                  disabled={lineLocked}
                                  ref={(el) => {
                                    if (el) {
                                      jobOrderInputRefs.current.set(index, el);
                                    } else {
                                      jobOrderInputRefs.current.delete(index);
                                    }
                                  }}
                                  onClick={() => {
                                    if (lineLocked) return;
                                    updateJobOrderDropdownPosition(index);
                                    setJobOrderDropdownOpen(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(index, !isJobOrderDropdownOpen);
                                      return newMap;
                                    });
                                  }}
                                  onBlur={(e) => {
                                    // Delay closing to allow clicking on dropdown items
                                    setTimeout(() => {
                                      setJobOrderDropdownOpen(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(index, false);
                                        return newMap;
                                      });
                                    }, 200);
                                  }}
                                  placeholder="Select job orders"
                                  readOnly
                                />
                                {isJobOrderDropdownOpen && jobOrderDropdownPositions.get(index) && 
                                  createPortal(
                                    <div
                                      style={{
                                        position: "fixed",
                                        top: `${jobOrderDropdownPositions.get(index)!.top}px`,
                                        left: `${jobOrderDropdownPositions.get(index)!.left}px`,
                                        width: `${jobOrderDropdownPositions.get(index)!.width}px`,
                                        backgroundColor: "white",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "0.375rem",
                                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                                        zIndex: 9999,
                                        maxHeight: "300px",
                                        overflowY: "auto",
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                    {[...jobOrders]
                                      .sort((a, b) => {
                                        const aSel = selectedJobOrderIds.has(a.jobOrderID) ? 0 : 1;
                                        const bSel = selectedJobOrderIds.has(b.jobOrderID) ? 0 : 1;
                                        return aSel - bSel;
                                      })
                                      .map((jobOrder) => {
                                      const isSelected = selectedJobOrderIds.has(jobOrder.jobOrderID);
                                      return (
                                        <div
                                          key={jobOrder.jobOrderID}
                                            onMouseDown={(e) => {
                                            // Use onMouseDown instead of onClick to prevent blur from firing first
                                            e.preventDefault();
                                            const newSet = new Set(selectedJobOrderIds);
                                            if (isSelected) {
                                              newSet.delete(jobOrder.jobOrderID);
                                            } else {
                                              newSet.add(jobOrder.jobOrderID);
                                            }
                                            setSelectedJobOrders(prev => {
                                              const newMap = new Map(prev);
                                              newMap.set(index, newSet);
                                              return newMap;
                                            });
                                            // Persist job refs on JobNumber (Part No stays free for part history)
                                            const jobNumbers = Array.from(newSet)
                                              .map(id => jobOrders.find(jo => jo.jobOrderID === id))
                                              .filter((jo): jo is JobOrderMaster => jo !== undefined)
                                              .map(jo => jo.jobNumber || `JO#${jo.jobOrderNumber}`)
                                              .join(", ");
                                            handleDetailChange(index, "JobNumber", jobNumbers);
                                            setIsStateChanged(true);
                                          }}
                                          style={{
                                            padding: "0.5rem 0.75rem",
                                            cursor: "pointer",
                                            backgroundColor: isSelected ? "#e0e7ff" : "white",
                                            borderBottom: "1px solid #f3f4f6"
                                          }}
                                          onMouseEnter={(e) => {
                                            if (!isSelected) e.currentTarget.style.backgroundColor = "#f9fafb";
                                          }}
                                          onMouseLeave={(e) => {
                                            if (!isSelected) e.currentTarget.style.backgroundColor = "white";
                                          }}
                                        >
                                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              readOnly
                                              style={{ cursor: "pointer" }}
                                            />
                                            <div>
                                              <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                                                {jobOrder.jobNumber || `JO#${jobOrder.jobOrderNumber}`}
                                              </div>
                                              {jobOrder.partName && (
                                                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                                  {jobOrder.partName}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {jobOrders.length === 0 && (
                                      <div style={{ padding: "1rem", textAlign: "center", color: "#6b7280" }}>
                                        No job orders available
                                      </div>
                                    )}
                                  </div>,
                                  document.body
                                )
                                }
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", width: "100px" }}>
                              <input
                                type="text"
                                inputMode="numeric"
                                className="form-input no-spinner"
                                disabled={lineLocked}
                                style={{ 
                                  width: "100%",
                                  minWidth: "80px"
                                }}
                                value={numericDisplayValues.get(`qty-${index}`) ?? (detail.QtyOrdered === 0 ? "" : detail.QtyOrdered.toString())}
                                onChange={(e) => {
                                  if (lineLocked) return;
                                  const inputVal = e.target.value.replace(/[^0-9]/g, '');
                                  setNumericDisplayValues(prev => {
                                    const newMap = new Map(prev);
                                    if (inputVal === "") {
                                      newMap.set(`qty-${index}`, "");
                                      handleDetailChange(index, "QtyOrdered", 0);
                                    } else {
                                      newMap.set(`qty-${index}`, inputVal);
                                      const val = parseInt(inputVal);
                                      if (!isNaN(val) && val >= 0) {
                                        handleDetailChange(index, "QtyOrdered", val);
                                      }
                                    }
                                    return newMap;
                                  });
                                }}
                                onBlur={(e) => {
                                  if (lineLocked) return;
                                  const val = e.target.value === "" ? 1 : parseInt(e.target.value) || 1;
                                  handleDetailChange(index, "QtyOrdered", val);
                                  setNumericDisplayValues(prev => {
                                    const newMap = new Map(prev);
                                    newMap.delete(`qty-${index}`);
                                    return newMap;
                                  });
                                }}
                              />
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative", width: "80px" }}>
                              <div style={{ position: "relative" }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ 
                                    width: "100%", 
                                    minWidth: "80px", 
                                    paddingRight: "2rem"
                                  }}
                                  value={detail.Unit || ""}
                                  onChange={(e) => {
                                    handleDetailChange(index, "Unit", e.target.value);
                                    // Filter options as user types
                                    setUnitDropdownOpen(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(index, true);
                                      return newMap;
                                    });
                                  }}
                                  ref={(el) => {
                                    if (el) {
                                      unitInputRefs.current.set(index, el);
                                    } else {
                                      unitInputRefs.current.delete(index);
                                    }
                                  }}
                                  onFocus={(e) => {
                                    updateUnitDropdownPosition(index);
                                    setUnitDropdownOpen(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(index, true);
                                      return newMap;
                                    });
                                  }}
                                  onBlur={(e) => {
                                    // Delay closing to allow clicking on dropdown items
                                    setTimeout(() => {
                                      setUnitDropdownOpen(prev => {
                                        const newMap = new Map(prev);
                                        newMap.set(index, false);
                                        return newMap;
                                      });
                                    }, 200);
                                  }}
                                  placeholder="Unit"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    updateUnitDropdownPosition(index);
                                    setUnitDropdownOpen(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(index, !newMap.get(index));
                                      return newMap;
                                    });
                                  }}
                                  style={{
                                    position: "absolute",
                                    right: "0.5rem",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    color: "#6b7280",
                                    padding: "0.25rem",
                                  }}
                                >
                                  ▼
                                </button>
                                {unitDropdownOpen.get(index) && unitDropdownPositions.get(index) && 
                                  createPortal(
                                    <div
                                      style={{
                                        position: "fixed",
                                        top: `${unitDropdownPositions.get(index)!.top}px`,
                                        left: `${unitDropdownPositions.get(index)!.left}px`,
                                        width: `${unitDropdownPositions.get(index)!.width}px`,
                                        backgroundColor: "#ffffff",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: "0.375rem",
                                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
                                        maxHeight: "200px",
                                        overflowY: "auto",
                                        zIndex: 9999,
                                      }}
                                    >
                                      {getAllUnitOptions()
                                        .filter(unit => 
                                          !detail.Unit || 
                                          unit.toLowerCase().includes(detail.Unit.toLowerCase())
                                        )
                                        .map((unit) => (
                                          <div
                                            key={unit}
                                            onMouseDown={(e) => {
                                              // Use onMouseDown instead of onClick to prevent blur from firing first
                                              e.preventDefault();
                                              handleDetailChange(index, "Unit", unit);
                                              setUnitDropdownOpen(prev => {
                                                const newMap = new Map(prev);
                                                newMap.set(index, false);
                                                return newMap;
                                              });
                                            }}
                                            style={{
                                              padding: "0.5rem 0.75rem",
                                              cursor: "pointer",
                                              fontSize: "0.875rem",
                                              borderBottom: "1px solid #f3f4f6",
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.backgroundColor = "#f3f4f6";
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.backgroundColor = "#ffffff";
                                            }}
                                          >
                                            {unit}
                                          </div>
                                        ))}
                                      {getAllUnitOptions().filter(unit => 
                                        !detail.Unit || 
                                        unit.toLowerCase().includes(detail.Unit.toLowerCase())
                                      ).length === 0 && (
                                        <div
                                          style={{
                                            padding: "0.5rem 0.75rem",
                                            fontSize: "0.875rem",
                                            color: "#6b7280",
                                            fontStyle: "italic",
                                          }}
                                        >
                                          No matches. Press Enter to use custom value.
                                        </div>
                                      )}
                                    </div>,
                                    document.body
                                  )
                                }
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", width: "120px" }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="form-input no-spinner"
                                disabled={lineLocked}
                                style={{ 
                                  width: "100%",
                                  minWidth: "100px"
                                }}
                                value={numericDisplayValues.get(`price-${index}`) ?? (detail.UnitPrice === 0 ? "" : detail.UnitPrice.toString())}
                                onChange={(e) => {
                                  if (lineLocked) return;
                                  const inputVal = e.target.value.replace(/[^0-9.]/g, '').replace(/\./g, (match, offset, string) => {
                                    return string.indexOf('.') === offset ? match : '';
                                  });
                                  setNumericDisplayValues(prev => {
                                    const newMap = new Map(prev);
                                    if (inputVal === "" || inputVal === ".") {
                                      newMap.set(`price-${index}`, inputVal);
                                      handleDetailChange(index, "UnitPrice", 0);
                                    } else {
                                      newMap.set(`price-${index}`, inputVal);
                                      const val = parseFloat(inputVal);
                                      if (!isNaN(val) && val >= 0) {
                                        handleDetailChange(index, "UnitPrice", val);
                                      }
                                    }
                                    return newMap;
                                  });
                                }}
                                onBlur={(e) => {
                                  if (lineLocked) return;
                                  const val = e.target.value === "" || e.target.value === "." ? 0 : parseFloat(e.target.value) || 0;
                                  handleDetailChange(index, "UnitPrice", val);
                                  setNumericDisplayValues(prev => {
                                    const newMap = new Map(prev);
                                    newMap.delete(`price-${index}`);
                                    return newMap;
                                  });
                                }}
                              />
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", minWidth: "140px" }}>
                                <select
                                  className="form-input"
                                  style={{ width: "52px", padding: "0.35rem", flexShrink: 0 }}
                                  value={detail.DiscountType === "Amount" ? "Amount" : "Percent"}
                                  onChange={(e) =>
                                    handleDetailChange(
                                      index,
                                      "DiscountType",
                                      (e.target.value === "Amount" ? "Amount" : "Percent") as DiscountType
                                    )
                                  }
                                  title="Discount type"
                                >
                                  <option value="Percent">%</option>
                                  <option value="Amount">{currencySymbol}</option>
                                </select>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  className="form-input no-spinner"
                                  style={{ width: "100%", minWidth: "70px" }}
                                  value={numericDisplayValues.get(`discount-${index}`) ?? (detail.Discount === 0 ? "" : detail.Discount.toString())}
                                  onChange={(e) => {
                                    const inputVal = e.target.value.replace(/[^0-9.]/g, '').replace(/\./g, (match, offset, string) => {
                                      return string.indexOf('.') === offset ? match : '';
                                    });
                                    setNumericDisplayValues(prev => {
                                      const newMap = new Map(prev);
                                      if (inputVal === "" || inputVal === ".") {
                                        newMap.set(`discount-${index}`, inputVal);
                                        handleDetailChange(index, "Discount", 0);
                                      } else {
                                        newMap.set(`discount-${index}`, inputVal);
                                        const val = parseFloat(inputVal);
                                        if (!isNaN(val) && val >= 0) {
                                          handleDetailChange(index, "Discount", val);
                                        }
                                      }
                                      return newMap;
                                    });
                                  }}
                                  onBlur={(e) => {
                                    const val = e.target.value === "" || e.target.value === "." ? 0 : parseFloat(e.target.value) || 0;
                                    handleDetailChange(index, "Discount", val);
                                    setNumericDisplayValues(prev => {
                                      const newMap = new Map(prev);
                                      newMap.delete(`discount-${index}`);
                                      return newMap;
                                    });
                                  }}
                                />
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", fontWeight: 600 }}>
                              {formatCurrency(lineTotal)}
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <select
                                className="form-input"
                                style={{ minWidth: "170px", fontSize: "0.8125rem", padding: "0.35rem 0.5rem" }}
                                value={detail.glcode || ""}
                                onChange={(e) => handleDetailChange(index, "glcode", e.target.value)}
                                title="Expense account for vendor bill posting"
                              >
                                <option value="">Company / vendor default</option>
                                {coaAccounts.map((coa) => (
                                  <option key={`vq-coa-${index}-${coa.accountID}`} value={String(coa.accountID)}>
                                    {coa.accountCode} - {coa.accountName}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <input
                                type="text"
                                className="form-input"
                                style={{
                                  width: "100%",
                                  minWidth: "120px",
                                  cursor: "pointer",
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                  whiteSpace: "nowrap"
                                }}
                                value={getFirstLine(detail.Notes || "")}
                                onClick={() => {
                                  setEditingField({ index, field: "Notes", value: detail.Notes || "" });
                                  setShowTextEditorPopup(true);
                                }}
                                placeholder="Click to edit notes"
                                readOnly
                                title={detail.Notes || "Click to edit notes"}
                              />
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "center" }}>
                              {canEdit && (
                              <DeleteIconButton
                                label={lineLocked ? "Line already converted — cannot delete" : "Delete line"}
                                onClick={() => {
                                  if (lineLocked) {
                                    toast.warning("This line is already on a vendor order and cannot be removed");
                                    return;
                                  }
                                  handleDeleteDetail(index);
                                }}
                              />
                              )}
                            </td>
                          </tr>
                          {historyHint ? (
                            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                              <td style={{ padding: 0, border: "none" }} />
                              <td
                                colSpan={11}
                                style={{
                                  padding: "0 0.75rem 0.5rem",
                                  fontSize: "0.6875rem",
                                  color: "#6b7280",
                                  lineHeight: 1.3,
                                }}
                                title={historyHint}
                              >
                                {historyHint}
                              </td>
                            </tr>
                          ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                        <td colSpan={8} style={{ padding: "0.75rem", textAlign: "right" }}>Total Amount:</td>
                        <td style={{ padding: "0.75rem", fontWeight: 600 }}>
                          {formatCurrency(formData.TotalAmount)}
                        </td>
                        <td colSpan={2} style={{ padding: "0.75rem" }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Attachments Section */}
            <AttachmentUploadSection
              attachments={attachments}
              orderId={formData.OrderID}
              disabled={loading}
              deferUploadUntilSave
              onAttachmentsChange={(next) => {
                setAttachments(next);
                setIsStateChanged(true);
              }}
              onDeleteAttachment={async (attachment) => {
                if (attachment.isPending || !attachment.id || attachment.id <= 0 || !attachment.fileUniqueno) {
                  if (attachment.localUrl) {
                    URL.revokeObjectURL(attachment.localUrl);
                  }
                  setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
                  setIsStateChanged(true);
                  return;
                }

                documentCacheRef.current.remove({
                  id: attachment.id,
                  fileUniqueno: attachment.fileUniqueno,
                });
                setDeletedAttachmentIds((prev) =>
                  prev.includes(attachment.id) ? prev : [...prev, attachment.id]
                );
                setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
                setIsStateChanged(true);
                toast.info("Attachment will be removed when you save the quotation");
              }}
              onDownloadAttachment={async (attachment) => {
                if (!attachment.fileUniqueno || formData.OrderID <= 0) {
                  throw new Error("Attachment is not available for download yet");
                }
                const cached = documentCacheRef.current.get({
                  id: attachment.id,
                  fileUniqueno: attachment.fileUniqueno,
                });
                await QuotationService.DownloadVendorQuotationAttachment({
                  orderId: formData.OrderID,
                  fileUniqueno: attachment.fileUniqueno,
                  name: attachment.name,
                  uploadFile: attachment.uploadFile,
                  cachedBlobUrl: cached?.blobUrl,
                });
              }}
              onViewAttachment={handleOpenDocumentViewer}
            />

            <CommentsSection
              comments={comments}
              onChange={(next) => {
                setComments(next);
                const id = formData.OrderID > 0 ? formData.OrderID : quotationId;
                if (!(id > 0)) setIsStateChanged(true);
              }}
              persistContext={(() => {
                const id = formData.OrderID > 0 ? formData.OrderID : quotationId;
                if (!(id > 0)) return null;
                return {
                  entityType: "VendorQuotation",
                  entityId: id,
                  entityLabel:
                    formData.PONumber > 0
                      ? `Vendor Quotation VQ-${formData.PONumber}`
                      : `Vendor Quotation #${id}`,
                  linkPath: `/quotations/vendor?open=${id}`,
                };
              })()}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            {canSave && (
            <>
            <button
              type="button"
              className="btn-draft"
              disabled={loading}
              onClick={() => handleSave("draft")}
            >
              {savingAction === "draft" ? "Saving..." : isSentOrLater ? "Save" : "Save as Draft"}
            </button>
            <button
              type="button"
              className="btn-submit"
              disabled={loading}
              onClick={() => handleSave("submit")}
            >
              {savingAction === "submit" ? "Saving..." : "Mark as Sent"}
            </button>
            </>
            )}
          </div>
        </form>
      </div>

      {/* Text Editor Popup */}
      {showTextEditorPopup && editingField && (
        <TextEditorPopup
          title={editingField.field === "PartName" ? "Item Name" : "Notes"}
          value={editingField.value}
          onSave={(value) => {
            handleDetailChange(editingField.index, editingField.field, value);
            setShowTextEditorPopup(false);
            setEditingField(null);
          }}
          onClose={() => {
            setShowTextEditorPopup(false);
            setEditingField(null);
          }}
        />
      )}

      {/* Multi-Vendor Selection Dialog */}
      {showMultiVendorDialog &&
        createPortal(
          <div
            className="text-editor-popup-overlay multi-vendor-dialog-overlay"
            onClick={() => setShowMultiVendorDialog(false)}
          >
            <div
              className="text-editor-popup multi-vendor-dialog"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-editor-popup-header">
                <h3>Send to Multiple Vendors</h3>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowMultiVendorDialog(false)}
                >
                  ×
                </button>
              </div>
              <div className="text-editor-popup-content">
                <p className="multi-vendor-dialog-intro">
                  Select additional vendors to send this quotation to. RFQs appear in the Vendor
                  Portal — vendors without portal access cannot be selected. The current vendor (
                  {formData.VendorName}) is already included in the comparison.
                </p>

                <div className="multi-vendor-dialog-attachments">
                  <input
                    type="checkbox"
                    id="includeAttachments"
                    checked={includeAttachments}
                    onChange={(e) => setIncludeAttachments(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  <label
                    htmlFor="includeAttachments"
                    style={{ cursor: "pointer", flex: 1, fontSize: "0.875rem", margin: 0 }}
                  >
                    Include attachments from master quotation
                  </label>
                </div>

                {formData.VendorID > 0 && (() => {
                  const masterVendor = vendors.find((v) => v.vendor_id === formData.VendorID);
                  const masterHasPortal = !!masterVendor?.portalAccessEnabled;
                  return (
                    <div className="multi-vendor-dialog-current">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        <input
                          type="checkbox"
                          checked={true}
                          disabled
                          style={{ cursor: "not-allowed", opacity: 0.6 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 500,
                              fontSize: "0.875rem",
                              color: masterHasPortal ? "#0369a1" : "#92400e",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <span>{formData.VendorName} (Current — master pricing kept)</span>
                            {!masterHasPortal && (
                              <span
                                className="multi-vendor-portal-badge"
                                title="Enable Vendor Portal access in Vendor Master to send RFQs"
                              >
                                No portal
                              </span>
                            )}
                          </div>
                          {formData.VendorCode && (
                            <div style={{ fontSize: "0.75rem", color: masterHasPortal ? "#0284c7" : "#b45309" }}>
                              {formData.VendorCode}
                            </div>
                          )}
                          {!masterHasPortal && (
                            <div style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "0.25rem" }}>
                              Enable portal access for this vendor before sending.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="multi-vendor-dialog-list">
                  {vendors
                    .filter((v) => v.vendor_id !== formData.VendorID)
                    .map((vendor) => {
                      const isAlreadySent = alreadySentVendorIds.has(vendor.vendor_id);
                      const hasPortal = !!vendor.portalAccessEnabled;
                      const isBlocked = isAlreadySent || !hasPortal;
                      const isSelected = selectedVendorIds.has(vendor.vendor_id);
                      return (
                        <div
                          key={vendor.vendor_id}
                          className={`multi-vendor-dialog-list-item${isSelected ? " is-selected" : ""}${!hasPortal ? " is-no-portal" : ""}`}
                          style={isBlocked ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                          onClick={() => {
                            if (isBlocked) return;
                            const newSet = new Set(selectedVendorIds);
                            if (isSelected) {
                              newSet.delete(vendor.vendor_id);
                            } else {
                              newSet.add(vendor.vendor_id);
                            }
                            setSelectedVendorIds(newSet);
                          }}
                          title={
                            isAlreadySent
                              ? "Already sent — a quotation copy exists for this vendor"
                              : !hasPortal
                                ? "Enable Vendor Portal access in Vendor Master before sending RFQs"
                                : undefined
                          }
                        >
                          <input
                            type="checkbox"
                            checked={isSelected || isAlreadySent}
                            disabled={isBlocked}
                            readOnly
                            style={{ cursor: isBlocked ? "not-allowed" : "pointer" }}
                          />
                          <div style={{ flex: 1 }}>
                            <div
                              style={{
                                fontWeight: 500,
                                fontSize: "0.875rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <span>
                                {vendor.company_name}
                                {isAlreadySent ? " (Already sent)" : ""}
                              </span>
                              {!hasPortal && (
                                <span className="multi-vendor-portal-badge" title="Enable Vendor Portal access in Vendor Master">
                                  No portal
                                </span>
                              )}
                            </div>
                            {vendor.vendorcode && (
                              <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                {vendor.vendorcode}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {vendors.filter((v) => v.vendor_id !== formData.VendorID).length === 0 && (
                    <div className="multi-vendor-dialog-list-empty">No other vendors available</div>
                  )}
                </div>
              </div>
              <div className="text-editor-popup-footer">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setShowMultiVendorDialog(false);
                    setSelectedVendorIds(new Set());
                    setAlreadySentVendorIds(new Set());
                    setIncludeAttachments(true);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleMultiVendorSave}
                  title={
                    formData.VendorID > 0 &&
                    !vendors.find((v) => v.vendor_id === formData.VendorID)?.portalAccessEnabled
                      ? "Current vendor has no portal access"
                      : undefined
                  }
                  disabled={
                    loading ||
                    (formData.VendorID > 0 &&
                      !vendors.find((v) => v.vendor_id === formData.VendorID)?.portalAccessEnabled) ||
                    Array.from(selectedVendorIds).filter((id) => {
                      if (id === formData.VendorID) return false;
                      return !!vendors.find((v) => v.vendor_id === id)?.portalAccessEnabled;
                    }).length < 1
                  }
                >
                  {loading
                    ? "Creating..."
                    : (() => {
                        const masterHasPortal =
                          formData.VendorID > 0 &&
                          !!vendors.find((v) => v.vendor_id === formData.VendorID)
                            ?.portalAccessEnabled;
                        if (!masterHasPortal) {
                          return "Current vendor has no portal";
                        }
                        const additionalCount = Array.from(selectedVendorIds).filter((id) => {
                          if (id === formData.VendorID) return false;
                          return !!vendors.find((v) => v.vendor_id === id)?.portalAccessEnabled;
                        }).length;
                        if (additionalCount === 0) {
                          return "Select additional vendor(s)";
                        }
                        return `Send to ${additionalCount} Additional Vendor(s)`;
                      })()}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Convert to Order Selection Dialog */}
      {showConvertToOrderDialog &&
        createPortal(
          <div
            className="text-editor-popup-overlay multi-vendor-dialog-overlay"
            onClick={(e) => {
              e.stopPropagation();
              if (!convertingToOrder) setShowConvertToOrderDialog(false);
            }}
          >
            <div className="text-editor-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "800px" }}>
              <div className="text-editor-popup-header">
                <h3>Convert Quotation to Order - Select Items & Attachments</h3>
                <button type="button" className="btn-close" disabled={convertingToOrder} onClick={() => setShowConvertToOrderDialog(false)}>
                  ×
                </button>
              </div>
              <div className="text-editor-popup-content">
                <p style={{ marginBottom: "1rem", color: "#6b7280" }}>
                  Select which line items and attachments to include in the order. All items are selected by default.
                </p>

                <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setSelectedLineItems(new Set(formData.Details.map((d) => d.ItemNo)))}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: "#6366f1",
                      color: "white",
                      border: "none",
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedLineItems(new Set())}
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: "#6b7280",
                      color: "white",
                      border: "none",
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    Deselect All
                  </button>
                  <span style={{ marginLeft: "auto", fontSize: "0.875rem", color: "#6b7280" }}>
                    {selectedLineItems.size} of {unconvertedDetails.length} unconverted items selected
                  </span>
                </div>

                <div style={{ maxHeight: "400px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, width: "50px" }}>
                          <input
                            type="checkbox"
                            checked={
                              unconvertedDetails.length > 0 &&
                              selectedLineItems.size === unconvertedDetails.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLineItems(
                                  new Set(unconvertedDetails.map((d) => d.ItemNo))
                                );
                              } else {
                                setSelectedLineItems(new Set());
                              }
                            }}
                            style={{ cursor: "pointer" }}
                          />
                        </th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Item #</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Part No</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Description</th>
                        <th style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 600 }}>Qty</th>
                        <th style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 600 }}>Unit Price</th>
                        <th style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 600 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.Details.map((detail, index) => {
                        const alreadyConverted = isLineAlreadyConverted(detail);
                        const isSelected = selectedLineItems.has(detail.ItemNo);
                        return (
                          <tr
                            key={index}
                            style={{
                              borderBottom: "1px solid #e5e7eb",
                              backgroundColor: isSelected ? "#f0f9ff" : "transparent",
                            }}
                          >
                            <td style={{ padding: "0.75rem" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={alreadyConverted}
                                onChange={(e) => {
                                  if (alreadyConverted) return;
                                  const newSelection = new Set(selectedLineItems);
                                  if (e.target.checked) {
                                    newSelection.add(detail.ItemNo);
                                  } else {
                                    newSelection.delete(detail.ItemNo);
                                  }
                                  setSelectedLineItems(newSelection);
                                }}
                                style={{ cursor: alreadyConverted ? "not-allowed" : "pointer" }}
                              />
                            </td>
                            <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>
                              {detail.ItemNo}
                            </td>
                            <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{detail.PartNo || "-"}</td>
                            <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{getFirstLine(detail.PartName || "") || "-"}</td>
                            <td style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem" }}>{detail.QtyOrdered}</td>
                            <td style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem" }}>
                              {formatCurrency(detail.UnitPrice)}
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 600 }}>
                              {formatCurrency(getDetailLineTotal(detail))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600, borderTop: "2px solid #e5e7eb" }}>
                        <td colSpan={6} style={{ padding: "0.75rem", textAlign: "right" }}>Selected Items Total:</td>
                        <td style={{ padding: "0.75rem", textAlign: "right" }}>
                          {formatCurrency(
                            formData.Details
                              .filter((d) => selectedLineItems.has(d.ItemNo))
                              .reduce((sum, d) => sum + getDetailLineTotal(d), 0)
                          )}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Attachments Section */}
                {convertibleAttachments.length > 0 && (
                  <>
                    <div style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>
                      <h4 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>
                        Attachments
                      </h4>
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                        <button
                          type="button"
                          onClick={() => setSelectedAttachments(new Set(convertibleAttachments.map((a) => a.id)))}
                          style={{
                            padding: "0.5rem 1rem",
                            backgroundColor: "#6366f1",
                            color: "white",
                            border: "none",
                            borderRadius: "0.375rem",
                            fontSize: "0.875rem",
                            cursor: "pointer",
                          }}
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedAttachments(new Set())}
                          style={{
                            padding: "0.5rem 1rem",
                            backgroundColor: "#6b7280",
                            color: "white",
                            border: "none",
                            borderRadius: "0.375rem",
                            fontSize: "0.875rem",
                            cursor: "pointer",
                          }}
                        >
                          Deselect All
                        </button>
                        <span style={{ marginLeft: "auto", fontSize: "0.875rem", color: "#6b7280" }}>
                          {selectedAttachments.size} of {convertibleAttachments.length} attachments selected
                        </span>
                      </div>
                    </div>

                    <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.75rem" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {convertibleAttachments.map((attachment) => {
                          const isSelected = selectedAttachments.has(attachment.id);
                          const toggle = () => {
                            const newSelection = new Set(selectedAttachments);
                            if (isSelected) {
                              newSelection.delete(attachment.id);
                            } else {
                              newSelection.add(attachment.id);
                            }
                            setSelectedAttachments(newSelection);
                          };
                          return (
                            <div
                              key={attachment.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.75rem",
                                padding: "0.5rem",
                                backgroundColor: isSelected ? "#f0f9ff" : "transparent",
                                borderRadius: "0.375rem",
                                cursor: "pointer",
                              }}
                              onClick={toggle}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={toggle}
                                onClick={(e) => e.stopPropagation()}
                                style={{ cursor: "pointer" }}
                              />
                              <span style={{ fontSize: "1.25rem" }}>📎</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#374151" }}>
                                  {attachment.name}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                  {((attachment.size || 0) / 1024).toFixed(2)} KB
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="text-editor-popup-footer">
                <button type="button" className="btn-cancel" disabled={convertingToOrder} onClick={() => setShowConvertToOrderDialog(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-submit"
                  onClick={performConvertToOrder}
                  disabled={selectedLineItems.size === 0 || convertingToOrder}
                >
                  {convertingToOrder
                    ? "Converting…"
                    : `Convert to Order (${selectedLineItems.size} items)`}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Converted Vendor Order Slideout */}
      {showOrderSlideout && orderSlideoutId > 0 ? (
        <div onClick={(e) => e.stopPropagation()}>
          <VendorOrderSlideout
            orderId={orderSlideoutId}
            onClose={() => {
              setShowOrderSlideout(false);
              setOrderSlideoutId(0);
            }}
          />
        </div>
      ) : null}

      {/* Deletion Impact Dialog */}
      <DeletionImpactDialog
        isOpen={showDeletionDialog}
        entityName={`Vendor Quotation #${formData.PONumber || quotationId}`}
        impact={deletionImpact}
        onConfirm={confirmDeletion}
        onCancel={() => {
          setShowDeletionDialog(false);
          setDeletionImpact(null);
        }}
        onDeleteDependency={handleDeleteDependency}
        onRefreshImpact={refreshDeletionImpact}
        onDeleteAll={handleDeleteAll}
        isLoading={loading}
      />

      <SendDocumentEmailDialog
        open={showEmailDialog}
        kind="vendorQuotation"
        documentId={quotationId}
        defaultToEmail={vendorEmail}
        documentLabel={
          formData.PONumber > 0
            ? formData.PONumber < 1000
              ? `VQ#${formData.PONumber + 999}`
              : `VQ#${formData.PONumber}`
            : undefined
        }
        onClose={() => setShowEmailDialog(false)}
      />
    </div>
  );
};

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

  const handleDismiss = () => {
    if (confirmDiscardChanges(textValue !== value)) onClose();
  };

  return (
    <div className="text-editor-popup-overlay" onClick={(e) => { e.stopPropagation(); handleDismiss(); }}>
      <div className="text-editor-popup" onClick={(e) => e.stopPropagation()}>
        <div className="text-editor-popup-header">
          <h3>{title}</h3>
          <button type="button" className="btn-close" onClick={handleDismiss}>
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
          <button type="button" className="btn-cancel" onClick={handleDismiss}>
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

export default VendorQuotationSlideout;
