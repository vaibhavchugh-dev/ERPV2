import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  QuotationService,
  VendorQuotationMasterReq,
  QuotationDetailReq,
  DiscountType,
} from "../../Common/Services/QuotationService";
import { VendorService } from "../../Common/Services/VendorService";
import { JobOrderService, JobOrderMaster } from "../../Common/Services/JobOrderService";
import { VendorOrderService } from "../../Common/Services/VendorOrderService";
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
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { PdfService } from "../../Common/Services/PdfService";
import {
  VendorPartCombobox,
  formatPartHistoryHint,
  looksLikeJobPartNo,
} from "../../Common/Components/CustomerPartCombobox";
import "./VendorQuotationSlideout.scss";

interface VendorQuotationSlideoutProps {
  quotationId: number;
  onClose: (refreshList?: boolean) => void;
}

const VendorQuotationSlideout: React.FC<VendorQuotationSlideoutProps> = ({
  quotationId,
  onClose,
}) => {

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
    Details: [],
  });

  const [vendors, setVendors] = useState<Array<{ vendor_id: number; company_name: string; vendorcode: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [savingAction, setSavingAction] = useState<"draft" | "submit" | null>(null);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [attachments, setAttachments] = useState<Array<{ id: number; name: string; size: number; fileUrl?: string }>>([]);
  const [showMultiVendorDialog, setShowMultiVendorDialog] = useState(false);
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<number>>(new Set());
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [attachmentIdCounter, setAttachmentIdCounter] = useState(1);
  const [comments, setComments] = useState<Array<{ id: number; text: string; createdAt: string; createdBy: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [commentIdCounter, setCommentIdCounter] = useState(1);
  const [showTextEditorPopup, setShowTextEditorPopup] = useState(false);
  const [editingField, setEditingField] = useState<{ index: number; field: "PartName"; value: string } | null>(null);
  const [jobOrders, setJobOrders] = useState<JobOrderMaster[]>([]);
  const [jobOrderDropdownOpen, setJobOrderDropdownOpen] = useState<Map<number, boolean>>(new Map());
  const [jobOrderDropdownPositions, setJobOrderDropdownPositions] = useState<Map<number, { top: number; left: number; width: number }>>(new Map());
  const [selectedJobOrders, setSelectedJobOrders] = useState<Map<number, Set<number>>>(new Map()); // Map of detail index to Set of jobOrderIDs
  const [partHistoryByRow, setPartHistoryByRow] = useState<Map<number, CustomerPartOption | null>>(new Map());
  const [coaAccounts, setCoaAccounts] = useState<ChartofAccountMaster[]>([]);
  const [companyDefaultExpenseGlcode, setCompanyDefaultExpenseGlcode] = useState("");
  const [defaultExpenseGlcode, setDefaultExpenseGlcode] = useState("");
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
      loadQuotation();
    } else {
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
        const formDataWithDetails = {
          ...result,
          Details: normalizedDetails,
          QuotationType: result.QuotationType || "Material",
        };
        setFormData(formDataWithDetails);
        setPartHistoryByRow(new Map());
        if (formDataWithDetails.VendorID && formDataWithDetails.VendorID > 0) {
          try {
            const vendor = await VendorService.GetVendorById(formDataWithDetails.VendorID);
            const vendorGl =
              accountIdToGlcode((vendor as any)?.defaultExpenseAccountId) ||
              companyDefaultExpenseGlcode;
            setDefaultExpenseGlcode(vendorGl);
          } catch {
            /* keep company default */
          }
        }
        if (result.Attachments && Array.isArray(result.Attachments) && result.Attachments.length > 0) {
          const cleanedAttachments = result.Attachments.map(a => ({
            id: a.id || 0,
            name: a.name || "",
            size: a.size || 0,
            fileUrl: a.fileUrl || ""
          }));
          setAttachments(cleanedAttachments);
          const maxId = Math.max(...cleanedAttachments.map(a => a.id), 0);
          setAttachmentIdCounter(maxId + 1);
        } else {
          setAttachments([]);
          setAttachmentIdCounter(1);
        }
        if (result.Comments && Array.isArray(result.Comments) && result.Comments.length > 0) {
          const cleanedComments = result.Comments.map(c => ({
            id: c.id || 0,
            text: c.text || "",
            createdAt: c.createdAt || new Date().toISOString(),
            createdBy: c.createdBy || "User"
          }));
          setComments(cleanedComments);
          const maxId = Math.max(...cleanedComments.map(c => c.id), 0);
          setCommentIdCounter(maxId + 1);
        } else {
          setComments([]);
          setCommentIdCounter(1);
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
      toast.error("Error loading quotation");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const initializeNewQuotation = () => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const today = new Date().toISOString().split('T')[0];

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
    setFormData(prev => ({ ...prev, [field]: value }));
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
      
      const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
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
    if (!formData.VendorID || !formData.Details || formData.Details.length === 0) {
      toast.error("Please ensure the quotation has a vendor and at least one line item before printing");
      return;
    }
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
      toast.success('Vendor quotation PDF generated successfully');
    } catch (error: any) {
      console.error('Error generating vendor quotation PDF:', error);
      toast.error(error.response?.data?.error || 'Failed to generate vendor quotation PDF');
    }
  };

  const handleDuplicate = async () => {
    if (quotationId > 0) {
      setLoading(true);
      try {
        const quotation = await QuotationService.GetVendorQuotationById(quotationId);
        if (quotation) {
          const duplicatedQuotation: VendorQuotationMasterReq = {
            ...quotation,
            OrderID: 0,
            PONumber: 0,
            Status: "Draft",
            VendorRefNo: "",
          };
          await QuotationService.SaveVendorQuotation(duplicatedQuotation);
          toast.success("Quotation duplicated successfully");
          onClose(true);
        }
      } catch (error: any) {
        console.error("Error duplicating quotation:", error);
        toast.error("Error duplicating quotation");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleConvertToOrder = async () => {
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
    if (formData.Status === "Converted") {
      toast.warning("This quotation has already been converted to an order");
      return;
    }

    setLoading(true);
    try {
      // Function to convert MM/DD/YY date string to ISO format
      const convertDateToISO = (dateStr: string): string => {
        if (!dateStr) return new Date().toISOString();

        // Handle MM/DD/YY format (e.g., "12/25/24")
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const month = parseInt(parts[0]) - 1; // JS months are 0-based
          const day = parseInt(parts[1]);
          const year = 2000 + parseInt(parts[2]); // Convert YY to YYYY
          return new Date(year, month, day).toISOString();
        }

        // If already in ISO format or other format, try to parse
        try {
          return new Date(dateStr).toISOString();
        } catch {
          return new Date().toISOString();
        }
      };

      // Convert quotation data to vendor order format
      const quotationNumber = formData.PONumber < 1000
        ? `VQ#${formData.PONumber + 999}`
        : `VQ#${formData.PONumber}`;

      console.log("[VendorQuotationSlideout] Quotation number calculation:", {
        formDataPONumber: formData.PONumber,
        calculatedQuotationNumber: quotationNumber
      });

      // Use today's date for order date (date of conversion) - format as YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];
      
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
        TotalAmount: formData.TotalAmount,
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
          (formData.Details || [])
            .filter((d) => !isBlankQuoteOrOrderLine(d))
            .map((d) => d.LineType || lineTypeFromQuotationType(formData.QuotationType))
        ),
        QuotationId: quotationId, // Link to original quotation (use prop, not formData.OrderID)
        QuotationNo: quotationNumber, // Quotation number for reference
        Details: formData.Details.map(detail => {
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
        Attachments: (attachments || []).map(a => ({
          id: 0, // Reset ID for new attachments
          name: a.name || "",
          size: a.size || 0,
          fileUrl: a.fileUrl || ""
        })), // Copy attachments from state, reset IDs for new order
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

      // Backend SaveVendorOrder already updates quotation status and convertedOrderId with PONumber
      // DO NOT call SaveVendorQuotation here as it may overwrite the correct value set by backend
      // The backend update happens in OrderController.SaveVendorOrder at line 1144-1146
      console.log("[VendorQuotationSlideout] Order created - Backend should have already updated quotation:", {
        orderID: result.id,
        poNumber: result.poNumber,
        message: "Backend sets quotation.convertedOrderId = order.PONumber automatically"
      });
      
      if (result.poNumber === null || result.poNumber === undefined) {
        console.error("[VendorQuotationSlideout] ERROR: Backend did not return poNumber! This indicates a backend issue.");
        console.error("[VendorQuotationSlideout] The quotation may not have been updated correctly by backend.");
      }

      toast.success("Quotation converted to vendor order successfully");

      // Close the slideout after successful conversion
      onClose(true);
    } catch (error: any) {
      console.error("Error converting quotation to vendor order:", error);
      toast.error(`Error converting quotation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
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

  const handleSendToMultipleVendors = () => {
    if (quotationId === 0) {
      toast.error("Please save the quotation first before sending to multiple vendors");
      return;
    }
    if (formData.Details.length === 0) {
      toast.error("Please add at least one line item before sending to multiple vendors");
      return;
    }
    // Pre-select the master quotation's vendor (will be reset to blank pricing along with others)
    const initialSelection = new Set<number>();
    if (formData.VendorID > 0) {
      initialSelection.add(formData.VendorID);
    }
    setSelectedVendorIds(initialSelection);
    setShowMultiVendorDialog(true);
  };

  const handleMultiVendorSave = async () => {
    // Include ALL selected vendors (including the master vendor) - the API will handle resetting master pricing
    const allSelectedVendors = Array.from(selectedVendorIds);

    if (allSelectedVendors.length < 2) {
      toast.error("Please select at least one additional vendor");
      return;
    }

    setLoading(true);
    try {
      const result = await QuotationService.DuplicateVendorQuotationForVendors(
        quotationId,
        allSelectedVendors,
        includeAttachments
      );
      toast.success(`Quotation sent to ${allSelectedVendors.length} vendor(s) for competitive bidding. All vendors start with blank pricing for fair comparison.`);
      setShowMultiVendorDialog(false);
      setSelectedVendorIds(new Set());
      setIncludeAttachments(true); // Reset to default
      onClose(true); // Close slideout to refresh the list
    } catch (error: any) {
      console.error("Error sending to multiple vendors:", error);
      toast.error(`Error: ${error.message || "Failed to send quotation"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (isStateChanged) {
      if (window.confirm("You have unsaved changes. Are you sure you want to close?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const resolveSaveStatus = (mode: "draft" | "submit"): string => {
    if (mode === "draft") {
      return "Draft";
    }
    const current = (formData.Status || "").trim();
    if (
      current === "Sent" ||
      current === "Responded" ||
      current === "Accepted" ||
      current === "Converted" ||
      current === "Rejected"
    ) {
      return current;
    }
    return "Sent";
  };

  const handleSave = async (mode: "draft" | "submit") => {
    if (!formData.VendorID || formData.VendorID <= 0) {
      toast.error("Vendor is required");
      return;
    }

    if (!formData.OrderDate) {
      toast.error("Quotation date is required");
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
      const dataToSave: VendorQuotationMasterReq = {
        ...formData,
        Status: status,
        QuotationType: deriveOrderMaterialType(
          filledDetails.map(
            (d) => d.LineType || defaultLineTypeForOrder(formData.QuotationType)
          )
        ),
        Details: filledDetails,
        Attachments: attachments || [],
        Comments: comments || [],
      };

      const result = await QuotationService.SaveVendorQuotation(dataToSave);

      if (mode === "draft") {
        toast.success(quotationId > 0 ? "Quotation saved as draft" : "Quotation created as draft");
      } else if (status === "Sent" && formData.Status !== "Sent") {
        toast.success("Quotation marked as Sent");
      } else {
        toast.success(result.message || (quotationId > 0 ? "Quotation updated successfully" : "Quotation created successfully"));
      }
      setIsStateChanged(false);

      if (formData.OrderID === 0 && result.id > 0) {
        setFormData((prev) => ({
          ...prev,
          OrderID: result.id,
          Status: status,
        }));
      }

      onClose(true);
    } catch (error: any) {
      toast.error(`Error saving quotation: ${error.message || "Unknown error"}`);
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
      <div className="vendor-quotation-slideout-card" onClick={(e) => e.stopPropagation()}>
        <div className="vendor-quotation-slideout-header">
          <div>
            <h2>{quotationId > 0 ? "Edit Quotation" : "New Quotation"}</h2>
            {quotationId > 0 && formData.PONumber > 0 && (
              <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                Quotation Number: {formData.PONumber < 1000 ? `VQ#${formData.PONumber + 999}` : `VQ#${formData.PONumber}`}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {quotationId > 0 && (
              <>
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
                <button
                  type="button"
                  className="btn-icon"
                  onClick={handleConvertToOrder}
                  title={formData.Status === "Converted" ? "Already Converted" : "Convert to Order"}
                  style={{ 
                    color: quotationId === 0 || formData.Status === "Converted" ? "#9ca3af" : "#10b981",
                    cursor: quotationId === 0 || formData.Status === "Converted" ? "not-allowed" : "pointer",
                    opacity: quotationId === 0 || formData.Status === "Converted" ? 0.5 : 1
                  }}
                  disabled={quotationId === 0 || formData.Status === "Converted"}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4"></path>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                  </svg>
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
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                  <option value="Responded">Responded</option>
                  <option value="Accepted">Accepted</option>
                  <option value="Rejected">Rejected</option>
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
              
              {formData.Details && formData.Details.length > 0 && (
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
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, width: "140px" }}>Discount % / $</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Total</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, minWidth: "180px" }}>Account</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Notes</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.Details.map((detail, index) => {
                        const lineTotal = calculateLineTotal(detail);
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
                          <tr style={{ borderBottom: historyHint ? "none" : "1px solid #e5e7eb", verticalAlign: "middle" }}>
                            <td style={{ padding: "0.75rem" }}>{detail.ItemNo}</td>
                            <td style={{ padding: "0.75rem" }}>
                              <select
                                className={`form-input vo-line-type-select ${lineTypeAccentClass(lineType)}`}
                                title="Line type is copied to the vendor PO on convert. Check this before saving."
                                value={lineType}
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
                                  setEditingField({ index, field: "PartName", value: detail.PartName || "" });
                                  setShowTextEditorPopup(true);
                                }}
                                placeholder="Click to edit item name"
                                readOnly
                                title={detail.PartName || "Click to edit item name"}
                              />
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <div style={{ position: "relative" }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ width: "100%", minWidth: "150px", cursor: "pointer" }}
                                  value={displayText}
                                  ref={(el) => {
                                    if (el) {
                                      jobOrderInputRefs.current.set(index, el);
                                    } else {
                                      jobOrderInputRefs.current.delete(index);
                                    }
                                  }}
                                  onClick={() => {
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
                                    {jobOrders.map((jobOrder) => {
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
                                style={{ 
                                  width: "100%",
                                  minWidth: "80px"
                                }}
                                value={numericDisplayValues.get(`qty-${index}`) ?? (detail.QtyOrdered === 0 ? "" : detail.QtyOrdered.toString())}
                                onChange={(e) => {
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
                                style={{ 
                                  width: "100%",
                                  minWidth: "100px"
                                }}
                                value={numericDisplayValues.get(`price-${index}`) ?? (detail.UnitPrice === 0 ? "" : detail.UnitPrice.toString())}
                                onChange={(e) => {
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
                                  <option value="Amount">$</option>
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
                              ${lineTotal.toFixed(2)}
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
                                style={{ width: "100%", minWidth: "150px" }}
                                value={detail.Notes}
                                onChange={(e) => handleDetailChange(index, "Notes", e.target.value)}
                                placeholder="Notes"
                              />
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteDetail(index)}
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
                          ${formData.TotalAmount.toFixed(2)}
                        </td>
                        <td colSpan={2} style={{ padding: "0.75rem" }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
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
                          <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{attachment.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            {(attachment.size / 1024).toFixed(2)} KB
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
                          setIsStateChanged(true);
                        }}
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
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <label
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
                <input
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    files.forEach((file) => {
                      setAttachmentIdCounter((prev) => {
                        const newId = prev;
                        const newAttachment = {
                          id: newId,
                          name: file.name,
                          size: file.size,
                        };
                        setAttachments((prevAttachments) => [...prevAttachments, newAttachment]);
                        setIsStateChanged(true);
                        return newId + 1;
                      });
                    });
                  }}
                />
                + Add Attachment
              </label>
            </div>

            {/* Comments Section */}
            <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
              <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600 }}>Comments</h3>
              
              <div style={{ marginBottom: "1.5rem" }}>
                <textarea
                  className="form-input"
                  style={{
                    width: "100%",
                    minHeight: "100px",
                    padding: "0.75rem",
                    fontSize: "0.875rem",
                    resize: "vertical",
                    marginBottom: "0.75rem",
                  }}
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newComment.trim()) {
                      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
                      setCommentIdCounter((prev) => {
                        const newId = prev;
                        const newCommentObj = {
                          id: newId,
                          text: newComment.trim(),
                          createdAt: new Date().toISOString(),
                          createdBy: storage?.userName || "User",
                        };
                        setComments((prevComments) => [...prevComments, newCommentObj]);
                        setNewComment("");
                        setIsStateChanged(true);
                        return newId + 1;
                      });
                    }
                  }}
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
                  Add Comment
                </button>
              </div>

              {comments.length === 0 ? (
                <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem" }}>No comments added</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      style={{
                        padding: "1rem",
                        backgroundColor: "#ffffff",
                        borderRadius: "0.375rem",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                            {comment.createdBy}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            {new Date(comment.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setComments((prev) => prev.filter((c) => c.id !== comment.id));
                            setIsStateChanged(true);
                          }}
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
                      <div style={{ fontSize: "0.875rem", color: "#374151", whiteSpace: "pre-wrap" }}>
                        {comment.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-draft"
              disabled={loading}
              onClick={() => handleSave("draft")}
            >
              {savingAction === "draft" ? "Saving..." : "Save as Draft"}
            </button>
            <button
              type="button"
              className="btn-submit"
              disabled={loading}
              onClick={() => handleSave("submit")}
            >
              {savingAction === "submit" ? "Saving..." : "Sent"}
            </button>
          </div>
        </form>
      </div>

      {/* Text Editor Popup */}
      {showTextEditorPopup && editingField && (
        <TextEditorPopup
          title="Item Name"
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
      {showMultiVendorDialog && (
        <div className="text-editor-popup-overlay" onClick={() => setShowMultiVendorDialog(false)}>
          <div className="text-editor-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "600px" }}>
            <div className="text-editor-popup-header">
              <h3>Send to Multiple Vendors</h3>
              <button type="button" className="btn-close" onClick={() => setShowMultiVendorDialog(false)}>
                ×
              </button>
            </div>
            <div style={{ padding: "1.5rem" }}>
              <p style={{ marginBottom: "1rem", color: "#6b7280" }}>
                Select additional vendors to send this quotation to. The current vendor ({formData.VendorName}) is already included in the comparison.
              </p>
              
              {/* Attachment Toggle */}
              <div style={{ 
                marginBottom: "1rem", 
                padding: "0.75rem 1rem", 
                backgroundColor: "#f9fafb", 
                border: "1px solid #e5e7eb", 
                borderRadius: "0.375rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem"
              }}>
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
              
              {/* Show master vendor as already included */}
              {formData.VendorID > 0 && (
                <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "0.375rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      style={{ cursor: "not-allowed", opacity: 0.6 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.875rem", color: "#0369a1" }}>
                        {formData.VendorName} (Current - Will be reset to blank pricing)
                      </div>
                      {formData.VendorCode && (
                        <div style={{ fontSize: "0.75rem", color: "#0284c7" }}>{formData.VendorCode}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ maxHeight: "400px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.375rem" }}>
                {vendors
                  .filter((v) => v.vendor_id !== formData.VendorID) // Exclude current vendor
                  .map((vendor) => {
                    const isSelected = selectedVendorIds.has(vendor.vendor_id);
                    return (
                      <div
                        key={vendor.vendor_id}
                        onClick={() => {
                          const newSet = new Set(selectedVendorIds);
                          if (isSelected) {
                            newSet.delete(vendor.vendor_id);
                          } else {
                            newSet.add(vendor.vendor_id);
                          }
                          setSelectedVendorIds(newSet);
                        }}
                        style={{
                          padding: "0.75rem 1rem",
                          cursor: "pointer",
                          backgroundColor: isSelected ? "#e0e7ff" : "white",
                          borderBottom: "1px solid #f3f4f6",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          transition: "background-color 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = "#f9fafb";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = "white";
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          style={{ cursor: "pointer" }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{vendor.company_name}</div>
                          {vendor.vendorcode && (
                            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>{vendor.vendorcode}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                {vendors.filter((v) => v.vendor_id !== formData.VendorID).length === 0 && (
                  <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
                    No other vendors available
                  </div>
                )}
              </div>
              <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setShowMultiVendorDialog(false);
                    setSelectedVendorIds(new Set());
                    setIncludeAttachments(true); // Reset to default
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleMultiVendorSave}
                  disabled={selectedVendorIds.size === 0 || loading}
                >
                  {loading ? "Creating..." : `Send to ${Array.from(selectedVendorIds).filter(id => id !== formData.VendorID).length} Additional Vendor(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

export default VendorQuotationSlideout;
