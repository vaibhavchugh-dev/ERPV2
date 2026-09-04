import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  VendorOrderService,
  VendorOrderMasterReq,
  VendorOrderDetailReq,
} from "../../Common/Services/VendorOrderService";
import { DiscountType } from "../../Common/Services/QuotationService";
import { VendorService } from "../../Common/Services/VendorService";
import { JobOrderService, JobOrderMaster } from "../../Common/Services/JobOrderService";
import { VendorInvoiceService, InvoiceableItemForVendor, VendorInvoice } from "../../Common/Services/VendorInvoiceService";
import { ChartofAccountsService, ChartofAccountMaster } from "../../Common/Services/ChartofAccountsService";
import { AccountingService } from "../../Common/Services/AccountingService";
import VendorInvoiceModal from "./VendorInvoiceModal";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { PdfService } from "../../Common/Services/PdfService";
import {
  VENDOR_ORDER_LINE_TYPES,
  DEFAULT_VENDOR_ORDER_LINE_TYPE,
  defaultLineTypeForOrder,
  deriveOrderMaterialType,
  lineTypeAccentClass,
  isBlankQuoteOrOrderLine,
} from "../../Common/Constants/vendorOrderLineTypes";
import {
  VendorPartCombobox,
  formatPartHistoryHint,
  looksLikeJobPartNo,
} from "../../Common/Components/CustomerPartCombobox";
import RawMaterialCombobox from "../../Common/Components/RawMaterialCombobox";
import ProductMasterCombobox from "../../Common/Components/ProductMasterCombobox";
import {
  CustomerPartOption,
  ProductMaster,
} from "../../Common/Services/ProductMasterService";
import { RawMaterial } from "../../Common/Services/InventoryService";
import { toHtmlDateInputValue } from "../../Common/Utils/Formatting";
import "./VendorOrderSlideout.scss";
import { useFormatting } from "../../Common/Hooks/useFormatting";

interface VendorOrderSlideoutProps {
  orderId: number;
  onClose: (refreshList?: boolean) => void;
}

const VendorOrderSlideout: React.FC<VendorOrderSlideoutProps> = ({
  orderId,
  onClose,
}) => {
  const { formatCurrency, currencySymbol, discountColumnLabel, settings } = useFormatting();

  const [formData, setFormData] = useState<VendorOrderMasterReq & { MaterialType?: string }>({
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
    OrderType: "Vendor", // Always "Vendor" for vendor orders
    MaterialType: "Material", // Material/Service type for the order
    QuotationId: 0,
    QuotationNo: "",
    Details: [],
  });

  const [vendors, setVendors] = useState<Array<{ vendor_id: number; company_name: string; vendorcode: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [savingAction, setSavingAction] = useState<"draft" | "submit" | null>(null);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const [attachments, setAttachments] = useState<Array<{ id: number; name: string; size: number; fileUrl?: string }>>([]);
  const [attachmentIdCounter, setAttachmentIdCounter] = useState(1);
  const [comments, setComments] = useState<Array<{ id: number; text: string; createdAt: string; createdBy: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [commentIdCounter, setCommentIdCounter] = useState(1);
  const [showTextEditorPopup, setShowTextEditorPopup] = useState(false);
  const [editingField, setEditingField] = useState<{ index: number; field: "PartName" | "Notes"; value: string } | null>(null);
  const [jobOrders, setJobOrders] = useState<JobOrderMaster[]>([]);
  const [jobOrderDropdownOpen, setJobOrderDropdownOpen] = useState<Map<number, boolean>>(new Map());
  const [jobOrderDropdownPositions, setJobOrderDropdownPositions] = useState<Map<number, { top: number; left: number; width: number }>>(new Map());
  const [selectedJobOrders, setSelectedJobOrders] = useState<Map<number, Set<number>>>(new Map());
  const [partHistoryByRow, setPartHistoryByRow] = useState<Map<number, CustomerPartOption | null>>(new Map());
  const jobOrderInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());
  const [numericDisplayValues, setNumericDisplayValues] = useState<Map<string, string>>(new Map());

  // Invoice state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceableItems, setInvoiceableItems] = useState<InvoiceableItemForVendor[]>([]);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceableItemForVendor[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoices, setInvoices] = useState<VendorInvoice[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<ChartofAccountMaster[]>([]);
  const [companyDefaultExpenseGlcode, setCompanyDefaultExpenseGlcode] = useState("");
  const [defaultExpenseGlcode, setDefaultExpenseGlcode] = useState("");

  // Print modal state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [selectedInvoiceForPrint, setSelectedInvoiceForPrint] = useState<VendorInvoice | null>(null);

  // Default unit options for combobox
  const defaultUnitOptions = [
    "EA", "PC", "PCS", "SET", "PKG", "BOX", "PALLET",
    "LB", "KG", "OZ", "FT", "IN", "M", "YD", "CM",
    "GAL", "L", "QT", "HR", "DAY", "ROLL", "REEL", "BAG"
  ];

  const getAllUnitOptions = (): string[] => {
    const usedUnits = formData.Details
      .map(d => d.Unit)
      .filter(unit => unit && unit.trim() !== "")
      .map(unit => unit.trim().toUpperCase())
      .filter((unit, index, self) => self.indexOf(unit) === index);

    return Array.from(new Set([...defaultUnitOptions, ...usedUnits])).sort();
  };

  const [unitDropdownOpen, setUnitDropdownOpen] = useState<Map<number, boolean>>(new Map());
  const [unitDropdownPositions, setUnitDropdownPositions] = useState<Map<number, { top: number; left: number; width: number }>>(new Map());
  const unitInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

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
    if (orderId > 0) {
      loadOrder();
      loadInvoiceData();
    } else {
      initializeNewOrder();
    }
  }, [orderId]);

  const loadInvoiceData = async () => {
    if (orderId <= 0) return;
    
    try {
      setInvoiceLoading(true);
      
      // Load invoiceable items
      const invoiceable = await VendorInvoiceService.GetInvoiceableItems(orderId);
      if (invoiceable) {
        setInvoiceableItems(invoiceable);
      }

      // Load invoices
      const invoicesData = await VendorInvoiceService.GetVendorInvoices(orderId);
      if (invoicesData) {
        setInvoices(invoicesData);
      } else {
        setInvoices([]);
      }
    } catch (error) {
      console.error("Error loading invoice data:", error);
    } finally {
      setInvoiceLoading(false);
    }
  };

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
    const firstLine = text.split(/\r?\n/)[0];
    return firstLine;
  };

  const loadOrder = async () => {
    setLoading(true);
    try {
      const result = await VendorOrderService.GetVendorOrderById(orderId);
      if (result) {
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
          OrderDate: toHtmlDateInputValue(result.OrderDate || resAny.orderDate || ""),
          ExternalOrderDate: toHtmlDateInputValue(rawExtDate || ""),
          Details: normalizedDetails,
          OrderType: "Vendor", // Always "Vendor" for vendor orders
          MaterialType:
            result.MaterialType === "Service" || result.MaterialType === "Mixed"
              ? result.MaterialType
              : result.MaterialType || "Material",
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
        if (result.Attachments && Array.isArray(result.Attachments)) {
          setAttachments(result.Attachments.map(a => ({
            id: a.id || 0,
            name: a.name || "",
            size: a.size || 0,
            fileUrl: a.fileUrl || ""
          })));
          const maxId = Math.max(...result.Attachments.map((a: any) => a.id), 0);
          setAttachmentIdCounter(maxId + 1);
        }

        if (result.Comments && Array.isArray(result.Comments)) {
          setComments(result.Comments.map(c => ({
            id: c.id || 0,
            text: c.text || "",
            createdAt: c.createdAt || new Date().toISOString(),
            createdBy: c.createdBy || "User"
          })));
          const maxId = Math.max(...result.Comments.map((c: any) => c.id), 0);
          setCommentIdCounter(maxId + 1);
        }

        const newSelectedJobOrders = new Map<number, Set<number>>();
        normalizedDetails.forEach((detail: any, index: number) => {
          const jobSource = (detail.JobNumber || "").trim() || (looksLikeJobPartNo(detail.PartNo) ? (detail.PartNo || "").trim() : "");
          if (!jobSource) return;
          const jobNumbers = jobSource.split(",").map((s: string) => s.trim()).filter(Boolean);
          const selectedIds = new Set<number>();
          jobNumbers.forEach((jobNum: string) => {
            const matchingJobOrder = jobOrders.find(jo => {
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
      toast.error("Error loading order");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const initializeNewOrder = () => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const today = new Date().toISOString().split('T')[0];

    setFormData(prev => ({
      ...prev,
      OrderDate: today,
      UserId: storage?.userId || 0,
      UserToken: storage?.userToken || 0,
      Tenantid: storage?.tenantID || 0,
      OrderType: "Vendor",
      MaterialType: "Material",
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
                ShippedQty: 0,
                ShippingStatus: "",
                InvoicedQty: 0,
                InvoiceStatus: "",
                glcode: defaultExpenseGlcode || companyDefaultExpenseGlcode,
              },
            ],
    }));
  };

  const handleVendorChange = async (vendorId: number) => {
    const selectedVendor = vendors.find(v => v.vendor_id === vendorId);
    if (selectedVendor) {
      setFormData(prev => ({
        ...prev,
        VendorID: selectedVendor.vendor_id,
        VendorCode: selectedVendor.vendorcode,
        VendorName: selectedVendor.company_name,
      }));

      try {
        const fullVendorDetails = await VendorService.GetVendorById(vendorId);
        if (fullVendorDetails) {
          let defaultContactPerson = "";
          if (fullVendorDetails.VendorContact && fullVendorDetails.VendorContact.length > 0) {
            const defaultContact = fullVendorDetails.VendorContact.find(contact => contact.isDefault);
            if (defaultContact) {
              defaultContactPerson = `${defaultContact.firstname} ${defaultContact.lastname || ""}`.trim();
            } else if (fullVendorDetails.VendorContact.length > 0) {
              const firstContact = fullVendorDetails.VendorContact[0];
              defaultContactPerson = `${firstContact.firstname} ${firstContact.lastname || ""}`.trim();
            }
          }
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

  const calculateLineTotal = (detail: VendorOrderDetailReq): number => {
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
      const newDetail: VendorOrderDetailReq = {
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
        ShippedQty: 0,
        ShippingStatus: "",
        InvoicedQty: 0,
        InvoiceStatus: "",
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

  const isDetailInvoiced = (d: any): boolean => {
    if (!d) return false;
    const qty = Number(d.InvoicedQty ?? d.invoicedQty ?? 0);
    if (qty > 0) return true;
    const status = String(d.InvoiceStatus ?? d.invoiceStatus ?? "").toLowerCase().trim();
    return status === "fully invoiced" || status === "partially invoiced" || status === "invoiced";
  };

  const handleDetailChange = (index: number, field: keyof VendorOrderDetailReq, value: any) => {
    const detailToEdit = formData.Details?.[index];
    const isItemInvoiced = isDetailInvoiced(detailToEdit);
    if (isItemInvoiced) {
      toast.error("Invoiced line items cannot be edited");
      return;
    }

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

  const handleDeleteDetail = (index: number) => {
    const removed = formData.Details?.[index];
    const isInvoiced = isDetailInvoiced(removed);
    if (isInvoiced) {
      toast.error("Invoiced line items cannot be removed from the order");
      return;
    }

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
      toast.error("Please ensure the order has a vendor and at least one line item before printing");
      return;
    }
    try {
      const blob = await PdfService.GenerateVendorOrder(orderId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `VendorOrder_VO${formData.PONumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Vendor order PDF generated successfully');
    } catch (error: any) {
      console.error('Error generating vendor order PDF:', error);
      toast.error(error.response?.data?.error || 'Failed to generate vendor order PDF');
    }
  };

  const handleDuplicate = async () => {
    if (orderId > 0) {
      setLoading(true);
      try {
        const order = await VendorOrderService.GetVendorOrderById(orderId);
        if (order) {
          const duplicatedOrder: VendorOrderMasterReq = {
            ...order,
            OrderID: 0,
            PONumber: 0,
            Status: "Draft",
            VendorRefNo: "",
            ParentQuotationID: undefined, // Clear parent quotation reference
          };
          await VendorOrderService.SaveVendorOrder(duplicatedOrder);
          toast.success("Order duplicated successfully");
          onClose(true);
        }
      } catch (error: any) {
        console.error("Error duplicating order:", error);
        toast.error("Error duplicating order");
      } finally {
        setLoading(false);
      }
    }
  };

  const refreshDeletionImpact = async () => {
    try {
      const response = await VendorOrderService.CheckVendorOrderDeletionImpact(orderId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDelete = async () => {
    if (orderId > 0) {
      setLoading(true);
      try {
        const response = await VendorOrderService.CheckVendorOrderDeletionImpact(orderId);
        const impact = response.result as DeletionImpactResult;
        setDeletionImpact(impact);
        setShowDeletionDialog(true);
      } catch (error: any) {
        console.error("Error checking deletion impact:", error);
        toast.error(`Error checking deletion impact: ${error.message || "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    try {
      if (deleteEndpoint.includes('/VendorInvoice/DeleteVendorInvoice')) {
        await VendorInvoiceService.DeleteVendorInvoice(itemId);
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

      const updatedResponse = await VendorOrderService.CheckVendorOrderDeletionImpact(orderId);
      const updatedImpact = updatedResponse.result as DeletionImpactResult;

      if (updatedImpact.canDelete) {
        await VendorOrderService.DeleteVendorOrder(orderId);
        toast.success("All dependencies and order deleted successfully");
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

  const confirmDeletion = async () => {
    setLoading(true);
    try {
      await VendorOrderService.DeleteVendorOrder(orderId);
      toast.success("Order deleted successfully");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting order:", error);
      toast.error(`Error deleting order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  // Invoice functions
  const handleInvoiceItem = (item: InvoiceableItemForVendor) => {
    if (item.availableQty <= 0) {
      toast.warning(`No available quantity to invoice for ${item.partNo}`);
      return;
    }
    setSelectedInvoiceItems([item]);
    setShowInvoiceModal(true);
  };

  const handleBatchInvoice = () => {
    const readyItems = invoiceableItems.filter(item => item.availableQty > 0);
    if (readyItems.length === 0) {
      toast.warning("No items are ready to invoice. No items have available quantity to invoice.");
      return;
    }
    setSelectedInvoiceItems(readyItems);
    setShowInvoiceModal(true);
  };

  const handleInvoiceCreated = async () => {
    // Refresh invoiceable items, invoices, and reload order data
    try {
      const invoiceable = await VendorInvoiceService.GetInvoiceableItems(orderId);
      if (invoiceable) {
        setInvoiceableItems(invoiceable);
      }

      const invoicesData = await VendorInvoiceService.GetVendorInvoices(orderId);
      if (invoicesData) {
        setInvoices(invoicesData);
      } else {
        setInvoices([]);
      }

      // Reload the order to get updated invoiced quantities
      await loadOrder();
      toast.success("Order updated with new invoice information");
    } catch (error) {
      console.error("Error refreshing data after invoice:", error);
      toast.error("Invoice created but failed to refresh data");
    }
  };

  const handlePrintInvoice = (invoice: VendorInvoice) => {
    setSelectedInvoiceForPrint(invoice);
    setShowPrintModal(true);
  };

  const handleClosePrintModal = () => {
    setShowPrintModal(false);
    setSelectedInvoiceForPrint(null);
  };

  const handleDeleteInvoice = async (invoiceId: number) => {
    if (!invoiceId || invoiceId <= 0) return;
    if (!window.confirm("Delete this vendor invoice? Related AP bill journal entries will be reversed.")) {
      return;
    }
    setLoading(true);
    try {
      await VendorInvoiceService.DeleteVendorInvoice(invoiceId);
      toast.success("Vendor invoice deleted successfully");
      try {
        const invoiceable = await VendorInvoiceService.GetInvoiceableItems(orderId);
        setInvoiceableItems(invoiceable || []);
        const invoicesData = await VendorInvoiceService.GetVendorInvoices(orderId);
        setInvoices(invoicesData || []);
        if (orderId > 0) {
          await loadOrder();
        }
      } catch (refreshError) {
        console.error("Error refreshing data after invoice delete:", refreshError);
        toast.warning("Invoice deleted, but failed to refresh order data");
      }
    } catch (error: any) {
      console.error("Error deleting vendor invoice:", error);
      toast.error(error.message || "Failed to delete vendor invoice");
    } finally {
      setLoading(false);
    }
  };

  const handlePrintInvoiceModal = () => {
    window.print();
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
      current === "Partially Received" ||
      current === "Fully Received" ||
      current === "Receiving" ||
      current === "Completed"
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
      toast.error("Order date is required");
      return;
    }

    const orderDateHtml = toHtmlDateInputValue(formData.OrderDate);
    const dueDateHtml = toHtmlDateInputValue(formData.ExternalOrderDate || "");
    if (dueDateHtml && orderDateHtml && dueDateHtml < orderDateHtml) {
      toast.error("Due date cannot be before order date");
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
      const dataToSave: VendorOrderMasterReq = {
        ...formData,
        Status: status,
        MaterialType: deriveOrderMaterialType(
          filledDetails.map(
            (d) => d.LineType || defaultLineTypeForOrder(formData.MaterialType)
          )
        ),
        Details: filledDetails,
        Attachments: attachments || [],
        Comments: comments || [],
      };

      const result = await VendorOrderService.SaveVendorOrder(dataToSave);

      const invoicedLineCount = filledDetails.filter(
        (d) => (d.InvoicedQty || 0) > 0 ||
          (d.InvoiceStatus && d.InvoiceStatus !== "Not Invoiced")
      ).length;

      if (mode === "draft") {
        toast.success(orderId > 0 ? "Order saved as draft" : "Order created as draft");
      } else if (status === "Sent" && formData.Status !== "Sent") {
        toast.success("Order marked as Sent — available in Receiving");
      } else {
        toast.success(result.message || (orderId > 0 ? "Order updated successfully" : "Order created successfully"));
      }
      if (invoicedLineCount > 0) {
        toast.info(
          `${invoicedLineCount} invoiced line${invoicedLineCount === 1 ? "" : "s"} left unchanged (qty/price locked after invoicing).`
        );
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
      toast.error(`Error saving order: ${error.message || "Unknown error"}`);
      console.error("Error saving order:", error);
    } finally {
      setLoading(false);
      setSavingAction(null);
    }
  };

  return (
    <div
      className="vendor-order-slideout-overlay"
      onClick={handleCancel}
    >
      <div className="vendor-order-slideout-card" onClick={(e) => e.stopPropagation()}>
        <div className="vendor-order-slideout-header">
          <div>
            <h2>{orderId > 0 ? "Edit Order" : "New Order"}</h2>
            {orderId > 0 && formData.PONumber > 0 && (
              <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                Order Number: {formData.PONumber < 1000 ? `VO#${formData.PONumber + 999}` : `VO#${formData.PONumber}`}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {orderId > 0 && (
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
            <div className="status-field-inline">
              <div className={`input-group ${formData.Status === "Sent" || formData.Status === "Receiving" || formData.Status === "Partially Received" || formData.Status === "Fully Received" || formData.Status === "Completed" ? "status-active-group" : "status-inactive-group"}`} style={{ maxWidth: "200px", minWidth: "180px" }}>
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                  </span>
                </div>
                <select
                  className={`form-input ${formData.Status === "Sent" || formData.Status === "Receiving" || formData.Status === "Partially Received" || formData.Status === "Fully Received" || formData.Status === "Completed" ? "status-active" : "status-inactive"}`}
                  value={formData.Status}
                  onChange={(e) => handleInputChange("Status", e.target.value)}
                >
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
                  <option value="Partially Received">Partially Received</option>
                  <option value="Fully Received">Fully Received</option>
                  <option value="Receiving">Receiving</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={handleCancel}>
              ×
            </button>
          </div>
        </div>

        <form className="vendor-order-slideout-form" onSubmit={(e) => e.preventDefault()}>
          <div className="vendor-order-slideout-content">
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
                <label htmlFor="OrderDate">Order Date <span className="required">*</span></label>
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

            {/* Line Items - Same structure as VendorQuotationSlideout */}
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
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, width: "140px" }}>{discountColumnLabel}</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Total</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, minWidth: "180px" }}>Account</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Notes</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600, minWidth: "90px" }}>Action</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600, minWidth: "110px" }}></th>
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
                          defaultLineTypeForOrder(formData.MaterialType);

                        return (
                          <React.Fragment key={detail.ItemNo}>
                          {(() => {
                            const isInvoiced = isDetailInvoiced(detail);
                            return (
                          <tr style={{ borderBottom: historyHint ? "none" : "1px solid #e5e7eb", verticalAlign: "middle" }}>
                            <td style={{ padding: "0.75rem" }}>{detail.ItemNo}</td>
                            <td style={{ padding: "0.75rem" }}>
                              <select
                                className={`form-input vo-line-type-select ${lineTypeAccentClass(lineType)}`}
                                title={isInvoiced ? "Line type locked: item has been invoiced" : "Line type controls receiving and inventory. Check this before saving."}
                                value={lineType}
                                disabled={isInvoiced}
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
                              {(lineType === "RawMaterial") ? (
                                <RawMaterialCombobox
                                  value={
                                    looksLikeJobPartNo(detail.PartNo)
                                      ? ""
                                      : detail.PartNo || ""
                                  }
                                  rawMaterialId={detail.RawMaterialId}
                                  suggestedPartName={detail.PartName}
                                  suggestedUnit={detail.Unit}
                                  suggestedUnitCost={detail.UnitPrice}
                                  vendorId={formData.VendorID}
                                  disabled={isInvoiced}
                                  scrollContainerSelector=".vendor-order-slideout-content"
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
                                  onSelect={(material) =>
                                    applyRawMaterial(index, material)
                                  }
                                />
                              ) : lineType === "FinishedProduct" ? (
                                <ProductMasterCombobox
                                  value={
                                    looksLikeJobPartNo(detail.PartNo)
                                      ? ""
                                      : detail.PartNo || ""
                                  }
                                  productId={detail.ProductId}
                                  disabled={isInvoiced}
                                  scrollContainerSelector=".vendor-order-slideout-content"
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
                                  onSelect={(product) =>
                                    applyFinishedProduct(index, product)
                                  }
                                />
                              ) : (
                                <VendorPartCombobox
                                  value={
                                    looksLikeJobPartNo(detail.PartNo)
                                      ? ""
                                      : detail.PartNo || ""
                                  }
                                  vendorId={formData.VendorID}
                                  vendorSelected={
                                    !!formData.VendorID && formData.VendorID > 0
                                  }
                                  disabled={isInvoiced}
                                  scrollContainerSelector=".vendor-order-slideout-content"
                                  onChange={(partNo) =>
                                    handleDetailChange(index, "PartNo", partNo)
                                  }
                                  onSelectPart={(part) =>
                                    applyVendorPart(index, part)
                                  }
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
                                disabled={isInvoiced}
                                style={{
                                  width: "100%",
                                  minWidth: "150px",
                                  cursor: isInvoiced ? "not-allowed" : "pointer",
                                  backgroundColor: isInvoiced ? "#f3f4f6" : undefined,
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                  whiteSpace: "nowrap"
                                }}
                                value={getFirstLine(detail.PartName || "")}
                                onClick={() => {
                                  if (isInvoiced) return;
                                  setEditingField({ index, field: "PartName", value: detail.PartName || "" });
                                  setShowTextEditorPopup(true);
                                }}
                                placeholder="Click to edit item name"
                                readOnly
                                title={isInvoiced ? "Item name locked: item has been invoiced" : (detail.PartName || "Click to edit item name")}
                              />
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <div style={{ position: "relative" }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  disabled={isInvoiced}
                                  style={{
                                    width: "100%",
                                    minWidth: "150px",
                                    cursor: isInvoiced ? "not-allowed" : "pointer",
                                    backgroundColor: isInvoiced ? "#f3f4f6" : undefined,
                                  }}
                                  value={displayText}
                                  title={displayText}
                                  ref={(el) => {
                                    if (el) {
                                      jobOrderInputRefs.current.set(index, el);
                                    } else {
                                      jobOrderInputRefs.current.delete(index);
                                    }
                                  }}
                                  onClick={() => {
                                    if (isInvoiced) return;
                                    updateJobOrderDropdownPosition(index);
                                    setJobOrderDropdownOpen(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(index, !isJobOrderDropdownOpen);
                                      return newMap;
                                    });
                                  }}
                                  onBlur={(e) => {
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
                            {/* Qty, Unit, Unit Price, Discount, Total, Notes, Action columns - Same as VendorQuotationSlideout */}
                            <td style={{ padding: "0.75rem", width: "100px" }}>
                              {(() => {
                                const isInvoiced =
                                  (detail.InvoicedQty || 0) > 0 ||
                                  (!!detail.InvoiceStatus && detail.InvoiceStatus !== "Not Invoiced");
                                return (
                              <input
                                type="text"
                                inputMode="numeric"
                                className="form-input no-spinner"
                                disabled={isInvoiced}
                                title={isInvoiced ? "Quantity locked: this line item has been invoiced." : undefined}
                                style={{
                                  width: "100%",
                                  minWidth: "80px",
                                  backgroundColor: isInvoiced ? "#f3f4f6" : undefined,
                                  cursor: isInvoiced ? "not-allowed" : undefined,
                                }}
                                value={numericDisplayValues.get(`qty-${index}`) ?? (detail.QtyOrdered === 0 ? "" : detail.QtyOrdered.toString())}
                                onChange={(e) => {
                                  if (isInvoiced) return;
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
                                  if (isInvoiced) return;
                                  const val = e.target.value === "" ? 1 : parseInt(e.target.value) || 1;
                                  handleDetailChange(index, "QtyOrdered", val);
                                  setNumericDisplayValues(prev => {
                                    const newMap = new Map(prev);
                                    newMap.delete(`qty-${index}`);
                                    return newMap;
                                  });
                                }}
                              />
                                );
                              })()}
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative", width: "80px" }}>
                              <div style={{ position: "relative" }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  disabled={isInvoiced}
                                  style={{
                                    width: "100%",
                                    minWidth: "80px",
                                    paddingRight: "2rem",
                                    backgroundColor: isInvoiced ? "#f3f4f6" : undefined,
                                    cursor: isInvoiced ? "not-allowed" : undefined,
                                  }}
                                  value={detail.Unit || ""}
                                  onChange={(e) => {
                                    handleDetailChange(index, "Unit", e.target.value);
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
                                    if (isInvoiced) return;
                                    updateUnitDropdownPosition(index);
                                    setUnitDropdownOpen(prev => {
                                      const newMap = new Map(prev);
                                      newMap.set(index, true);
                                      return newMap;
                                    });
                                  }}
                                  onBlur={(e) => {
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
                                  disabled={isInvoiced}
                                  onClick={(e) => {
                                    if (isInvoiced) return;
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
                                    cursor: isInvoiced ? "not-allowed" : "pointer",
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
                                disabled={isInvoiced}
                                title={isInvoiced ? "Price locked: item has been invoiced." : undefined}
                                style={{
                                  width: "100%",
                                  minWidth: "100px",
                                  backgroundColor: isInvoiced ? "#f3f4f6" : undefined,
                                  cursor: isInvoiced ? "not-allowed" : undefined,
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
                                  disabled={isInvoiced}
                                  style={{ width: "52px", padding: "0.35rem", flexShrink: 0, backgroundColor: isInvoiced ? "#f3f4f6" : undefined, cursor: isInvoiced ? "not-allowed" : undefined }}
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
                                  disabled={isInvoiced}
                                  title={isInvoiced ? "Discount locked: item has been invoiced." : undefined}
                                  style={{ width: "100%", minWidth: "70px", backgroundColor: isInvoiced ? "#f3f4f6" : undefined, cursor: isInvoiced ? "not-allowed" : undefined }}
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
                                disabled={isInvoiced}
                                style={{ minWidth: "170px", fontSize: "0.8125rem", padding: "0.35rem 0.5rem", backgroundColor: isInvoiced ? "#f3f4f6" : undefined, cursor: isInvoiced ? "not-allowed" : undefined }}
                                value={detail.glcode || ""}
                                onChange={(e) => handleDetailChange(index, "glcode", e.target.value)}
                                title={isInvoiced ? "Expense account locked: item has been invoiced" : "Expense account for vendor bill posting"}
                              >
                                <option value="">Company / vendor default</option>
                                {coaAccounts.map((coa) => (
                                  <option key={`po-coa-${index}-${coa.accountID}`} value={String(coa.accountID)}>
                                    {coa.accountCode} - {coa.accountName}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <input
                                type="text"
                                className="form-input"
                                disabled={isInvoiced}
                                style={{
                                  width: "100%",
                                  minWidth: "120px",
                                  cursor: isInvoiced ? "not-allowed" : "pointer",
                                  backgroundColor: isInvoiced ? "#f3f4f6" : undefined,
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                  whiteSpace: "nowrap"
                                }}
                                value={getFirstLine(detail.Notes || "")}
                                onClick={() => {
                                  if (isInvoiced) return;
                                  setEditingField({ index, field: "Notes", value: detail.Notes || "" });
                                  setShowTextEditorPopup(true);
                                }}
                                placeholder="Click to edit notes"
                                readOnly
                                title={detail.Notes || "Click to edit notes"}
                              />
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleDeleteDetail(index)}
                                disabled={isInvoiced}
                                title={isInvoiced ? "Invoiced items cannot be deleted" : "Delete"}
                                style={{
                                  padding: "0.25rem 0.5rem",
                                  backgroundColor: isInvoiced ? "#9ca3af" : "#ef4444",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "0.25rem",
                                  cursor: isInvoiced ? "not-allowed" : "pointer",
                                  fontSize: "0.75rem",
                                }}
                              >
                                Delete
                              </button>
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "center" }}>
                              {isInvoiced ? (
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#92400e",
                                    backgroundColor: "#fef3c7",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "0.25rem",
                                    whiteSpace: "nowrap",
                                    fontWeight: 500,
                                    display: "inline-block"
                                  }}
                                  title="Item locked because it has been invoiced"
                                >
                                  🔒 Invoiced ({detail.InvoicedQty || (detail as any)?.invoicedQty || 0})
                                </span>
                              ) : (
                                <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>—</span>
                              )}
                            </td>
                          </tr>
                          );
                        })()}
                          {historyHint ? (
                            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                              <td colSpan={2} style={{ padding: 0, border: "none" }} />
                              <td
                                colSpan={12}
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
                        <td colSpan={9} style={{ padding: "0.75rem", textAlign: "right" }}>Total Amount:</td>
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

            {/* Attachments Section - Same as VendorQuotationSlideout */}
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

            {/* Invoice History Section */}
            {orderId > 0 && (
              <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600 }}>💰 Invoice History</h3>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleBatchInvoice}
                    disabled={loading || invoiceableItems.filter(item => item.availableQty > 0).length === 0}
                    title="Create a new vendor invoice for ready-to-invoice items"
                    style={{
                      padding: "0.5rem 1rem",
                      backgroundColor: invoiceableItems.filter(item => item.availableQty > 0).length > 0 ? "#8b5cf6" : "#9ca3af",
                      color: "white",
                      border: "none",
                      borderRadius: "0.375rem",
                      cursor: invoiceableItems.filter(item => item.availableQty > 0).length > 0 ? "pointer" : "not-allowed",
                      fontSize: "0.875rem",
                      fontWeight: "500"
                    }}
                  >
                    Create Invoice
                  </button>
                </div>

                {invoices.length === 0 ? (
                  <p style={{ margin: "0", color: "#6b7280", fontSize: "0.875rem" }}>
                    No vendor invoices created yet. Items will appear here once invoiced.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {invoices.map((invoice) => (
                      <div key={invoice.id} style={{
                        padding: "1rem",
                        backgroundColor: "#ffffff",
                        borderRadius: "0.375rem",
                        border: "1px solid #e5e7eb",
                        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                          <div>
                            <div style={{ fontWeight: "600", fontSize: "0.875rem", color: "#1f2937" }}>
                              Invoice #{invoice.invoiceNo}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                              {new Date(invoice.invoiceDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })} • Due: {new Date(invoice.dueDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                            <div style={{ fontSize: "0.75rem", fontWeight: "500", color: invoice.status === "Paid" ? "#10b981" : invoice.status === "Overdue" ? "#ef4444" : "#f59e0b" }}>
                              Status: {invoice.status}
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.5rem" }}>
                            <div style={{ fontSize: "0.875rem", color: "#374151", fontWeight: "500" }}>
                              Amount: {formatCurrency(invoice.totalAmount)}
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                type="button"
                                onClick={() => handlePrintInvoice(invoice)}
                                title="Print Invoice"
                                style={{
                                  padding: "0.25rem 0.5rem",
                                  backgroundColor: "#3b82f6",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "0.25rem",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  whiteSpace: "nowrap"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#2563eb"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#3b82f6"}
                              >
                                🖨️ Print
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteInvoice(invoice.id)}
                                title="Delete invoice"
                                style={{
                                  padding: "0.25rem 0.5rem",
                                  backgroundColor: "#ef4444",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "0.25rem",
                                  cursor: "pointer",
                                  fontSize: "0.75rem",
                                  fontWeight: "500",
                                  whiteSpace: "nowrap"
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#dc2626"}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ef4444"}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>

                        <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.75rem" }}>
                          <div style={{ fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem", color: "#374151" }}>
                            Items Invoiced ({invoice.items.reduce((sum, item) => sum + item.qtyInvoiced, 0)} units total):
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                            {invoice.items.map((item, index) => (
                              <span key={index} style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.25rem 0.75rem",
                                backgroundColor: "#f3f4f6",
                                borderRadius: "0.25rem",
                                fontSize: "0.75rem",
                                fontWeight: "500",
                                color: "#374151"
                              }}>
                                {item.description}: {item.qtyInvoiced} units ({formatCurrency(item.amount)})
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Comments Section - Same as VendorQuotationSlideout */}
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

        {/* Vendor Invoice Modal */}
        {showInvoiceModal && (
          <VendorInvoiceModal
            isOpen={showInvoiceModal}
            onClose={() => {
              setShowInvoiceModal(false);
              setSelectedInvoiceItems([]);
            }}
            orderId={orderId}
            invoiceableItems={invoiceableItems}
            selectedItems={selectedInvoiceItems}
            onInvoiceCreated={handleInvoiceCreated}
          />
        )}

        {/* Print Invoice Modal */}
        {showPrintModal && selectedInvoiceForPrint && (
          <div className="vendor-invoice-print-overlay" onClick={handleClosePrintModal}>
            <div className="vendor-invoice-print-modal" onClick={(e) => e.stopPropagation()}>
              <div className="print-header">
                <h2>Vendor Invoice</h2>
                <div className="print-actions">
                  <button
                    type="button"
                    onClick={handlePrintInvoiceModal}
                    className="btn-primary"
                    style={{ marginRight: "0.5rem" }}
                  >
                    🖨️ Print
                  </button>
                  <button
                    type="button"
                    onClick={handleClosePrintModal}
                    className="btn-secondary"
                  >
                    ✕ Close
                  </button>
                </div>
              </div>

              <div className="invoice-content">
                {/* Company Header */}
                <div className="company-header">
                  <div className="company-info">
                    <h3>Cimmple ERP</h3>
                    <p>123 Business Street<br />
                    Business City, BC 12345<br />
                    Phone: (555) 123-4567<br />
                    Email: info@cimmple.com</p>
                  </div>
                  <div className="invoice-details">
                    <h3>INVOICE</h3>
                    <p><strong>Invoice #:</strong> {selectedInvoiceForPrint.invoiceNo}</p>
                    <p><strong>Date:</strong> {new Date(selectedInvoiceForPrint.invoiceDate).toLocaleDateString('en-US')}</p>
                    <p><strong>Due Date:</strong> {new Date(selectedInvoiceForPrint.dueDate).toLocaleDateString('en-US')}</p>
                    <p><strong>Status:</strong> {selectedInvoiceForPrint.status}</p>
                  </div>
                </div>

                {/* Vendor Information */}
                <div className="billing-section">
                  <div className="bill-to">
                    <h4>Bill To:</h4>
                    <p><strong>{formData.VendorName}</strong></p>
                    <p>{formData.Address}</p>
                    <p><strong>Vendor PO:</strong> {formData.VendorPoNumber}</p>
                    <p><strong>Order #:</strong> {formData.PONumber < 1000 ? `VO#${formData.PONumber + 999}` : `VO#${formData.PONumber}`}</p>
                  </div>
                </div>

                {/* Invoice Items */}
                <div className="invoice-items">
                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Quantity</th>
                        <th>Unit Price</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoiceForPrint.items.map((item, index) => (
                        <tr key={index}>
                          <td>{item.description}</td>
                          <td>{item.qtyInvoiced}</td>
                          <td>{formatCurrency(item.amount / item.qtyInvoiced)}</td>
                          <td>{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>Total Amount:</td>
                        <td style={{ fontWeight: 'bold' }}>{formatCurrency(selectedInvoiceForPrint.totalAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Footer */}
                <div className="invoice-footer">
                  <p><strong>Payment Terms:</strong> Net 30 days</p>
                  <p><strong>Currency:</strong> {settings.defaultCurrency}</p>
                  <p><strong>Please make checks payable to:</strong> Cimmple ERP</p>
                  <p>Thank you for your business!</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Text Editor Popup - Same as VendorQuotationSlideout */}
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

        {/* Deletion Impact Dialog */}
        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Vendor Order #${formData.PONumber || orderId}`}
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
    </div>
  );
};

// Text Editor Popup Component - Same as VendorQuotationSlideout
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

export default VendorOrderSlideout;





