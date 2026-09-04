import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toast } from "react-toastify";
import { QuotationService } from "../../Common/Services/QuotationService";
import { deriveOrderMaterialType, lineTypeFromQuotationType } from "../../Common/Constants/vendorOrderLineTypes";
import { VendorOrderService } from "../../Common/Services/VendorOrderService";
import type { VendorOrderMasterReq } from "../../Common/Services/VendorOrderService";
import { toDateOnlyApiString } from "../../Common/Utils/Formatting";
import { useFormatting } from "../../Common/Hooks/useFormatting";
import VendorQuotationSlideout from "./VendorQuotationSlideout";
import "./VendorQuotationComparison.scss";

interface VendorQuotationComparisonProps {
  parentQuotationId: number;
  onClose: (refreshList?: boolean) => void;
  onQuotationSelected?: (quotationId: number) => void;
}

interface QuotationData {
  orderID: number;
  quotationNumber: number;
  vendorID: number;
  vendorCode: string;
  vendorName: string;
  orderDate: string;
  totalAmount: number;
  status: string;
  isSent: boolean;
  sentDate: string | null;
  isConverted: number;
  convertedOrderId: number | null;
  quotationType: string;
  additionalNotes?: string;
  parentQuotationID?: number | null;
}

interface DetailData {
  orderID: number;
  itemNo: number;
  partName: string;
  partNo: string;
  qtyOrdered: number;
  unit: string;
  unitPrice: number;
  discount: number;
  dueDate: string;
  notes: string;
  glcode?: string;
  lineType?: string;
  rawMaterialId?: number;
  attachments?: Array<{id: number; name: string; size: number; fileUrl?: string}>;
}

const VendorQuotationComparison: React.FC<VendorQuotationComparisonProps> = ({
  parentQuotationId,
  onClose,
  onQuotationSelected,
}) => {
  const { formatCurrency } = useFormatting();
  const listNeedsRefreshRef = useRef(false);
  const [quotations, setQuotations] = useState<QuotationData[]>([]);
  const [details, setDetails] = useState<DetailData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);
  const [showSlideout, setShowSlideout] = useState(false);
  const [isViewingQuotation, setIsViewingQuotation] = useState(false);
  // Track per-line-item vendor selections: key = `${itemNo}-${partNo}`, value = quotation.orderID
  const [lineItemSelections, setLineItemSelections] = useState<Map<string, number>>(new Map());
  const [creatingOrders, setCreatingOrders] = useState(false);
  const [convertingQuotationId, setConvertingQuotationId] = useState<number | null>(null);
  // Default to card view
  const [viewMode, setViewMode] = useState<'table' | 'compact' | 'card'>(() => {
    return 'card';
  });

  useEffect(() => {
    loadComparisonData();
  }, [parentQuotationId]);

  const loadComparisonData = async () => {
    setLoading(true);
    try {
      const result = await QuotationService.GetVendorQuotationComparison(parentQuotationId);
      if (result) {
        setQuotations(result.quotations || []);
        
        // Map details and ensure attachments are properly formatted
        const mappedDetails: DetailData[] = (result.details || []).map((d: any) => {
          // Handle attachments - check both camelCase and PascalCase
          let attachments: Array<{id: number; name: string; size: number; fileUrl?: string}> | null = null;
          if (d.attachments) {
            attachments = Array.isArray(d.attachments) ? d.attachments.map((a: any) => ({
              id: a.id || a.Id || 0,
              name: a.name || a.Name || "",
              size: a.size || a.Size || 0,
              fileUrl: a.fileUrl || a.FileUrl || ""
            })) : null;
          } else if (d.Attachments) {
            attachments = Array.isArray(d.Attachments) ? d.Attachments.map((a: any) => ({
              id: a.id || a.Id || 0,
              name: a.name || a.Name || "",
              size: a.size || a.Size || 0,
              fileUrl: a.fileUrl || a.FileUrl || ""
            })) : null;
          }
          
          return {
            orderID: d.orderID || d.orderId || 0,
            itemNo: d.itemNo || d.ItemNo || 0,
            partName: d.partName || d.PartName || "",
            partNo: d.partNo || d.PartNo || "",
            qtyOrdered: d.qtyOrdered || d.QtyOrdered || 0,
            unit: d.unit || d.Unit || "EA",
            unitPrice: d.unitPrice || d.UnitPrice || 0,
            discount: d.discount || d.Discount || 0,
            dueDate: d.dueDate || d.DueDate || "",
            notes: d.notes || d.Notes || "",
            glcode: d.glcode || d.Glcode || "",
            lineType: d.lineType || d.LineType || "",
            rawMaterialId: d.rawMaterialId || d.RawMaterialId,
            attachments: attachments && attachments.length > 0 ? attachments : undefined
          };
        });
        
        setDetails(mappedDetails);
        
        // Auto-switch to compact view if 4+ vendors for better UX
        const quotationCount = result.quotations?.length || 0;
        if (quotationCount >= 4) {
          setViewMode('compact');
        }
        console.log("VendorQuotationComparison: Loaded quotations:", result.quotations?.length || 0);
        console.log("VendorQuotationComparison: Loaded details:", mappedDetails.length);
        console.log("VendorQuotationComparison: Raw API response details sample:", result.details?.slice(0, 2));
        console.log("VendorQuotationComparison: Details with attachments:", mappedDetails.filter(d => d.attachments && d.attachments.length > 0).length);
        const detailsWithAtts = mappedDetails.filter(d => d.attachments && d.attachments.length > 0);
        if (detailsWithAtts.length > 0) {
          console.log("VendorQuotationComparison: Sample detail with attachments:", detailsWithAtts[0]);
        } else {
          console.log("VendorQuotationComparison: No details with attachments found. Checking raw data...");
          const rawDetailsWithAtts = (result.details || []).filter((d: any) => d.attachments && (Array.isArray(d.attachments) ? d.attachments.length > 0 : true));
          console.log("VendorQuotationComparison: Raw details with attachments property:", rawDetailsWithAtts.length);
          if (rawDetailsWithAtts.length > 0) {
            console.log("VendorQuotationComparison: Sample raw detail:", rawDetailsWithAtts[0]);
          }
        }
        console.log("VendorQuotationComparison: Details breakdown by orderID:", 
          mappedDetails.reduce((acc: any, d: any) => {
            acc[d.orderID] = (acc[d.orderID] || 0) + 1;
            return acc;
          }, {}) || {}
        );
      }
    } catch (error: any) {
      console.error("Error loading comparison data:", error);
      toast.error(`Error loading comparison: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const year = String(date.getFullYear());
      return `${month}/${day}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const formatQuotationNumber = (number: number): string => {
    const displayNumber = number < 1000 ? number + 999 : number;
    return `VQ#${displayNumber}`;
  };

  const getStatusBadge = (status: string) => {
    if (!status || status.trim() === "") {
      return <span className="badge badge-secondary">-</span>;
    }
    const statusLower = status.toLowerCase().trim();

    if (statusLower === "converted" || statusLower.includes("convert")) {
      return <span className="badge badge-primary">Converted</span>;
    } else if (statusLower === "draft") {
      return <span className="badge badge-warning">Draft</span>;
    } else if (statusLower === "sent" || statusLower === "active") {
      return <span className="badge badge-success">Sent</span>;
    } else if (statusLower === "responded") {
      return <span className="badge badge-info">Responded</span>;
    } else if (statusLower === "accepted") {
      return <span className="badge badge-info">Accepted</span>;
    } else if (statusLower === "rejected" || statusLower === "cancelled") {
      return <span className="badge badge-danger">Rejected</span>;
    }

    return <span className="badge badge-secondary">{status}</span>;
  };

  // Group details by quotation ID
  const detailsByQuotation = details.reduce((acc, detail) => {
    if (!acc[detail.orderID]) {
      acc[detail.orderID] = [];
    }
    acc[detail.orderID].push(detail);
    return acc;
  }, {} as Record<number, DetailData[]>);

  // Find the master quotation (the one with orderID matching parentQuotationId)
  const masterQuotation = quotations.find(q => q.orderID === parentQuotationId) || quotations[0];
  
  // Get all line items from the master quotation - these are the definitive rows to display
  const masterDetails = details
    .filter(d => d.orderID === masterQuotation?.orderID)
    .sort((a, b) => a.itemNo - b.itemNo);
  
  // Use master quotation's line items as the base rows
  // This ensures we show all line items from the master quotation
  const uniqueLineItems: DetailData[] = masterDetails;
  
  console.log("VendorQuotationComparison: Master quotation orderID:", masterQuotation?.orderID);
  console.log("VendorQuotationComparison: Master details count:", masterDetails.length);
  console.log("VendorQuotationComparison: Master details:", masterDetails.map(d => ({
    itemNo: d.itemNo,
    partNo: d.partNo,
    partName: d.partName,
    qtyOrdered: d.qtyOrdered
  })));

  // Helper function to match a vendor detail to a master line item (must be defined before useMemo)
  const matchVendorDetailToMaster = useCallback((
    masterItem: DetailData,
    vendorDetails: DetailData[],
    lineIndex: number
  ): DetailData | undefined => {
    // Priority 1: Match by itemNo (most reliable - works for duplicated quotations)
    let matched = vendorDetails.find(d => d.itemNo === masterItem.itemNo);
    
    // Priority 2: Match by position (same index in sorted list) + partNo+qtyOrdered
    if (!matched && lineIndex < vendorDetails.length) {
      const vendorDetailAtPosition = vendorDetails[lineIndex];
      if (vendorDetailAtPosition &&
          vendorDetailAtPosition.partNo === masterItem.partNo &&
          vendorDetailAtPosition.qtyOrdered === masterItem.qtyOrdered) {
        matched = vendorDetailAtPosition;
      }
    }
    
    // Priority 3: Match by partNo + qtyOrdered + partName (more specific match)
    if (!matched) {
      matched = vendorDetails.find(d => 
        d.partNo === masterItem.partNo && 
        d.qtyOrdered === masterItem.qtyOrdered &&
        d.partName === masterItem.partName
      );
    }
    
    // Priority 4: Match by partNo + qtyOrdered (fallback - least reliable)
    if (!matched) {
      matched = vendorDetails.find(d => 
        d.partNo === masterItem.partNo && 
        d.qtyOrdered === masterItem.qtyOrdered
      );
    }
    
    return matched;
  }, []);

  // Calculate selection summary (must be before early returns for React Hooks rules)
  const selectionSummary = useMemo(() => {
    if (quotations.length === 0 || uniqueLineItems.length === 0) {
      return [];
    }
    
    const summary = new Map<number, {vendorName: string; items: Array<{lineItem: DetailData, detail: DetailData}>; total: number}>();
    
    uniqueLineItems.forEach((lineItem, lineIndex) => {
      const lineItemKey = `${lineItem.itemNo}-${lineItem.partNo}`;
      const selectedQuotationId = lineItemSelections.get(lineItemKey);
      
      if (selectedQuotationId) {
        const quotation = quotations.find(q => q.orderID === selectedQuotationId);
        if (!quotation) return;

        const vendorDetails = details
          .filter(d => d.orderID === selectedQuotationId)
          .sort((a, b) => a.itemNo - b.itemNo);
        const matchedDetail = matchVendorDetailToMaster(lineItem, vendorDetails, lineIndex);
        
        if (matchedDetail) {
          if (!summary.has(selectedQuotationId)) {
            summary.set(selectedQuotationId, {
              vendorName: quotation.vendorName,
              items: [],
              total: 0
            });
          }
          const entry = summary.get(selectedQuotationId)!;
          entry.items.push({lineItem, detail: matchedDetail});
          entry.total += (matchedDetail.qtyOrdered * matchedDetail.unitPrice - matchedDetail.discount);
        }
      }
    });
    
    return Array.from(summary.values());
  }, [lineItemSelections, uniqueLineItems, quotations, details, matchVendorDetailToMaster]);

  // Find best price for a specific master line item by matching vendor details correctly
  const getBestPriceForItem = (
    masterItem: DetailData,
    lineIndex: number
  ): { orderID: number; price: number; detail: DetailData } | null => {
    // Get all matched vendor details for this master line item
    const matchedDetails: Array<{ orderID: number; detail: DetailData; total: number }> = [];
    
    quotations.forEach((quotation) => {
      const vendorDetails = details
        .filter(d => d.orderID === quotation.orderID)
        .sort((a, b) => a.itemNo - b.itemNo);
      
      const matched = matchVendorDetailToMaster(masterItem, vendorDetails, lineIndex);
      
      if (matched && matched.unitPrice > 0) {
        const total = (matched.qtyOrdered * matched.unitPrice) - matched.discount;
        matchedDetails.push({
          orderID: quotation.orderID,
          detail: matched,
          total: total
        });
      }
    });
    
    if (matchedDetails.length === 0) return null;
    
    // Find the best (lowest) total price
    const best = matchedDetails.reduce((best, current) => 
      current.total < best.total ? current : best
    );
    
    return {
      orderID: best.orderID,
      price: best.total,
      detail: best.detail
    };
  };

  const handleViewQuotation = (quotationId: number) => {
    setSelectedQuotationId(quotationId);
    setIsViewingQuotation(true); // Hide comparison overlay
    setShowSlideout(true);
  };

  const handleLineItemVendorSelect = (lineItemKey: string, quotationId: number) => {
    setLineItemSelections(prev => {
      const newMap = new Map(prev);
      newMap.set(lineItemKey, quotationId);
      return newMap;
    });
  };

  const handleCloseSlideout = (refreshList = false) => {
    setShowSlideout(false);
    setSelectedQuotationId(null);
    setIsViewingQuotation(false); // Show comparison overlay again
    if (refreshList) {
      listNeedsRefreshRef.current = true;
      loadComparisonData();
    }
  };

  const handleCloseComparison = () => {
    onClose(listNeedsRefreshRef.current);
  };

  const handleConvertQuotationToOrder = async (quotationId: number) => {
    const quotation = quotations.find(q => q.orderID === quotationId);
    if (!quotation) {
      toast.error("Quotation not found");
      return;
    }

    if (quotation.isConverted > 0 || quotation.status === "Converted") {
      toast.warning("This quotation has already been converted to an order");
      return;
    }

    if (!window.confirm("Convert this vendor quotation to an order?")) {
      return;
    }

    setConvertingQuotationId(quotationId);
    try {
      // Get the full quotation data
      const quotationData = await QuotationService.GetVendorQuotationById(quotationId);
      if (!quotationData) {
        toast.error("Failed to load quotation data");
        return;
      }

      // Function to convert date string to date-only API format (no UTC day-shift)
      const convertDateToISO = (dateStr: string): string => toDateOnlyApiString(dateStr);

      // Find master quotation to use its quotation number for order reference
      // If this is a response-only quotation, use the master quotation number
      const masterQuotationId = quotation.parentQuotationID || quotation.orderID;
      const masterQuotation = quotations.find(q => q.orderID === masterQuotationId) || quotation;
      
      // Use master quotation number for order reference (always reference the master, not the response-only quotation)
      const masterQuotationNumber = masterQuotation.quotationNumber < 1000
        ? `VQ#${masterQuotation.quotationNumber + 999}`
        : `VQ#${masterQuotation.quotationNumber}`;

      // Use today's date for order date (date of conversion) - format as YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];

      // Convert quotation data to vendor order format
      const vendorOrderData = {
        OrderID: 0, // New order
        Tenantid: quotationData.Tenantid,
        VendorID: quotationData.VendorID,
        VendorCode: quotationData.VendorCode,
        PONumber: 0, // Will be auto-generated
        VendorName: quotationData.VendorName,
        Address: quotationData.Address,
        VendorPoNumber: quotationData.VendorPoNumber,
        OrderDate: today, // Use today's date (date of conversion) in YYYY-MM-DD format
        TotalAmount: quotationData.TotalAmount,
        UserId: quotationData.UserId,
        UserToken: quotationData.UserToken,
        Status: "Draft", // Start as draft
        ShippingInstructions: quotationData.ShippingInstructions,
        ExternalVendorPO: quotationData.ExternalVendorPO || "",
        ExternalOrderDate: quotationData.ExternalOrderDate ? convertDateToISO(quotationData.ExternalOrderDate) : undefined,
        BuyerName: quotationData.BuyerName || "",
        VendorRefNo: quotationData.VendorRefNo || "",
        OrderType: "Vendor",
        MaterialType: deriveOrderMaterialType(
          (quotationData.Details || []).map(
            (d) => d.LineType || lineTypeFromQuotationType(quotationData.QuotationType)
          )
        ),
        QuotationId: quotation.orderID, // Link to the actual converted quotation (portal/child row)
        QuotationNo: masterQuotationNumber, // Always use master quotation number for reference
        Details: quotationData.Details.map(detail => {
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
            LineType: detail.LineType || lineTypeFromQuotationType(quotationData.QuotationType),
            RawMaterialId: detail.RawMaterialId,
            DueDate: convertDateToISO(detail.DueDate),
            JobNumber: detail.JobNumber || "",
            JobDesc: detail.JobDesc || "",
            QtyOrdered: detail.QtyOrdered,
            Unit: detail.Unit || "EA",
            UnitPrice: detail.UnitPrice,
            JobPriority: detail.JobPriority || 0,
            Discount: detail.Discount || 0,
            ProductId: detail.ProductId,
            LeadTime: detail.LeadTime || "",
            Notes: detail.Notes || "",
            ShippedQty: 0,
            ShippingStatus: "",
            InvoicedQty: 0,
            InvoiceStatus: "",
            glcode: detail.glcode || "",
            Received: "No", // Required field
          };
        }),
        Attachments: quotationData.Attachments || [],
        Comments: quotationData.Comments || [],
      };

      // Call the conversion service
      const result = await QuotationService.ConvertVendorQuotationToOrder(quotationId, vendorOrderData);
      
      if (result && result.id) {
        toast.success(`Successfully converted quotation to order (Order #${result.poNumber || result.PONumber || result.id})`);
        // Refresh data to show updated status
        listNeedsRefreshRef.current = true;
        loadComparisonData();
      } else {
        toast.error("Failed to convert quotation to order");
      }
    } catch (error: any) {
      console.error("Error converting quotation to order:", error);
      toast.error(`Error converting quotation to order: ${error.message || "Unknown error"}`);
    } finally {
      setConvertingQuotationId(null);
    }
  };

  const handleCreateOrders = async () => {
    if (lineItemSelections.size === 0) {
      toast.warning("Please select vendors for at least one line item");
      return;
    }

    setCreatingOrders(true);
    try {
      // Group selections by vendor
      const ordersByVendor = new Map<number, Array<{lineItem: DetailData, detail: DetailData, lineIndex: number}>>();
      
      uniqueLineItems.forEach((lineItem, lineIndex) => {
        const lineItemKey = `${lineItem.itemNo}-${lineItem.partNo}`;
        const selectedQuotationId = lineItemSelections.get(lineItemKey);
        
        if (selectedQuotationId) {
          const vendorDetails = details
            .filter(d => d.orderID === selectedQuotationId)
            .sort((a, b) => a.itemNo - b.itemNo);
          const matchedDetail = matchVendorDetailToMaster(lineItem, vendorDetails, lineIndex);
          
          if (matchedDetail) {
            if (!ordersByVendor.has(selectedQuotationId)) {
              ordersByVendor.set(selectedQuotationId, []);
            }
            ordersByVendor.get(selectedQuotationId)!.push({
              lineItem,
              detail: matchedDetail,
              lineIndex
            });
          }
        }
      });

      // Create orders for each vendor
      const createdOrders: number[] = [];
      for (const [quotationId, items] of Array.from(ordersByVendor.entries())) {
        const quotation = quotations.find(q => q.orderID === quotationId);
        if (!quotation) {
          console.error(`[VendorQuotationComparison] Quotation ${quotationId} not found in quotations array`);
          continue;
        }

        // Get the full quotation data
        const quotationData = await QuotationService.GetVendorQuotationById(quotationId);
        if (!quotationData) {
          console.error(`[VendorQuotationComparison] Failed to load quotation data for ${quotationId}`);
          toast.error(`Failed to load quotation data for ${quotation.vendorName}`);
          continue;
        }

        // Function to convert date string to date-only API format (no UTC day-shift)
        const convertDateToISO = (dateStr: string): string => toDateOnlyApiString(dateStr);

        // Format date for display (MM/DD/YY)
        const formatDateForDetail = (dateStr: string): string => {
          if (!dateStr) return "";
          try {
            const date = new Date(dateStr);
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            return `${month}/${day}/${year}`;
          } catch {
            return "";
          }
        };

        // Calculate total amount from selected items
        const totalAmount = items.reduce((sum, item) => 
          sum + (item.detail.qtyOrdered * item.detail.unitPrice - item.detail.discount), 0
        );

        // Find master quotation to use its quotation number for order reference
        const masterQuotationId = quotation.parentQuotationID || quotation.orderID;
        const masterQuotation = quotations.find(q => q.orderID === masterQuotationId) || quotation;
        
        // Use master quotation number for order reference (always reference the master, not the response-only quotation)
        const masterQuotationNumber = masterQuotation.quotationNumber < 1000
          ? `VQ#${masterQuotation.quotationNumber + 999}`
          : `VQ#${masterQuotation.quotationNumber}`;

        // Use today's date for order date (date of conversion) - format as YYYY-MM-DD
        const today = new Date().toISOString().split('T')[0];

        // Create vendor order request with selected line items only
        const orderRequest: VendorOrderMasterReq = {
          OrderID: 0, // New order
          Tenantid: quotationData.Tenantid,
          VendorID: quotationData.VendorID,
          VendorCode: quotationData.VendorCode,
          PONumber: 0, // Will be auto-generated
          VendorName: quotationData.VendorName,
          Address: quotationData.Address,
          VendorPoNumber: quotationData.VendorPoNumber,
          OrderDate: today, // Use today's date (date of conversion) in YYYY-MM-DD format
          TotalAmount: totalAmount,
          UserId: quotationData.UserId,
          UserToken: quotationData.UserToken,
          Status: "Draft", // Start as draft
          ShippingInstructions: quotationData.ShippingInstructions,
          ExternalVendorPO: quotationData.ExternalVendorPO || "",
          ExternalOrderDate: quotationData.ExternalOrderDate ? formatDateForDetail(quotationData.ExternalOrderDate) : undefined,
          BuyerName: quotationData.BuyerName || "",
          VendorRefNo: quotationData.VendorRefNo || "",
          OrderType: "Vendor",
          MaterialType: deriveOrderMaterialType(
            items.map(
              (item) =>
                item.detail.lineType ||
                lineTypeFromQuotationType(quotationData.QuotationType)
            )
          ),
          QuotationId: quotation.orderID, // Link to the actual converted quotation (portal/child row)
          QuotationNo: masterQuotationNumber, // Always use master quotation number for reference
          Details: items.map((item, idx) => {
            // Extract JobId from JobNumber if possible (e.g., "JO#1001" -> 1001)
            let jobId = 0;
            if (item.detail.partNo) {
              // Try to extract from partNo or jobNumber if available
              const jobNumber = item.lineItem.partNo || "";
              const match = jobNumber.match(/JO#?(\d+)/i);
              if (match && match[1]) {
                jobId = parseInt(match[1], 10) || 0;
              }
            }
            
            return {
              ID: 0, // New detail
              ItemNo: idx + 1,
              JobId: jobId, // Required field - extract from JobNumber or use 0
              PartName: item.detail.partName,
              PartNo: item.detail.partNo,
              LineType: item.detail.lineType || lineTypeFromQuotationType(quotationData.QuotationType),
              RawMaterialId: item.detail.rawMaterialId,
              DueDate: formatDateForDetail(item.detail.dueDate),
              JobNumber: item.lineItem.partNo || "", // Use partNo as job number if available
              JobDesc: "",
              QtyOrdered: item.detail.qtyOrdered,
              Unit: item.detail.unit || "EA",
              UnitPrice: item.detail.unitPrice,
              JobPriority: 0,
              Discount: item.detail.discount || 0,
              ProductId: undefined,
              LeadTime: "",
              Notes: item.detail.notes || "",
              ShippedQty: 0,
              ShippingStatus: "Not Started",
              InvoicedQty: 0,
              InvoiceStatus: "Not Invoiced",
              glcode: item.detail.glcode || "",
              Received: "No", // Required field
            };
          }),
          Attachments: [], // Don't copy attachments when creating from selected items
          Comments: [], // Don't copy comments
        };

        // Use VendorOrderService to create the order directly
        const result = await VendorOrderService.SaveVendorOrder(orderRequest);
        if (result && result.id) {
          createdOrders.push(result.id);
          console.log(`[VendorQuotationComparison] Created order ${result.id} for vendor ${quotation.vendorName}`);
        } else {
          console.error(`[VendorQuotationComparison] Failed to create order for vendor ${quotation.vendorName}`);
          toast.error(`Failed to create order for ${quotation.vendorName}`);
        }
      }

      if (createdOrders.length > 0) {
        toast.success(`Successfully created ${createdOrders.length} order(s)`);
        // Clear selections
        setLineItemSelections(new Map());
        // Refresh data
        listNeedsRefreshRef.current = true;
        loadComparisonData();
      } else {
        toast.error("Failed to create orders");
      }
    } catch (error: any) {
      console.error("Error creating orders:", error);
      toast.error(`Error creating orders: ${error.message || "Unknown error"}`);
    } finally {
      setCreatingOrders(false);
    }
  };

  if (loading) {
    return (
      <div className="comparison-overlay">
        <div className="comparison-container">
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading comparison data...</div>
        </div>
      </div>
    );
  }

  if (quotations.length === 0) {
    return (
      <div className="comparison-overlay">
        <div className="comparison-container">
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <p style={{ fontSize: "1rem", color: "#6b7280", marginBottom: "0.5rem" }}>
              No quotations found for comparison.
            </p>
            <p style={{ fontSize: "0.875rem", color: "#9ca3af", marginBottom: "1rem" }}>
              {parentQuotationId ? 
                "All quotations in this group have been converted to orders." : 
                "This quotation may have been converted or deleted."}
            </p>
            <button onClick={handleCloseComparison} className="btn-cancel" style={{ marginTop: "1rem" }}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {!isViewingQuotation && (
        <div className="comparison-overlay" onClick={handleCloseComparison}>
        <div className="comparison-container" onClick={(e) => e.stopPropagation()}>
          <div className="comparison-header">
            <h2>Compare Vendor Quotations - {formatQuotationNumber(quotations[0]?.quotationNumber || 0)}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div className="view-toggle" style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={viewMode === 'card' ? 'btn-toggle-active' : 'btn-toggle'}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.875rem",
                    fontWeight: viewMode === 'card' ? 600 : 400,
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    backgroundColor: viewMode === 'card' ? "#6366f1" : "white",
                    color: viewMode === 'card' ? "white" : "#374151",
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                >
                  Card View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('compact')}
                  className={viewMode === 'compact' ? 'btn-toggle-active' : 'btn-toggle'}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.875rem",
                    fontWeight: viewMode === 'compact' ? 600 : 400,
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    backgroundColor: viewMode === 'compact' ? "#6366f1" : "white",
                    color: viewMode === 'compact' ? "white" : "#374151",
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                >
                  Compact View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={viewMode === 'table' ? 'btn-toggle-active' : 'btn-toggle'}
                  style={{
                    padding: "0.5rem 1rem",
                    fontSize: "0.875rem",
                    fontWeight: viewMode === 'table' ? 600 : 400,
                    border: "1px solid #d1d5db",
                    borderRadius: "0.375rem",
                    backgroundColor: viewMode === 'table' ? "#6366f1" : "white",
                    color: viewMode === 'table' ? "white" : "#374151",
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                >
                  Table View
                </button>
              </div>
              <button type="button" className="btn-close" onClick={handleCloseComparison}>
                ×
              </button>
            </div>
          </div>

          <div className="comparison-content">
            {/* Summary Table */}
            <div className="comparison-section">
              <h3>Summary</h3>
              <div className="comparison-table-wrapper">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Quotation #</th>
                      <th>Sent Date</th>
                      <th>Total Amount</th>
                      <th>Notes</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotations.map((quotation) => (
                      <tr
                        key={quotation.orderID}
                        className={selectedQuotationId === quotation.orderID ? "selected-row" : ""}
                      >
                        <td>{quotation.vendorName}</td>
                        <td>{formatQuotationNumber(quotation.quotationNumber)}</td>
                        <td>{quotation.sentDate ? formatDate(quotation.sentDate) : "-"}</td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(quotation.totalAmount)}</td>
                        <td style={{ maxWidth: "300px", whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.875rem" }}>
                          {quotation.additionalNotes ? (
                            <div style={{ color: "#1f2937", fontStyle: "italic" }}>
                              {quotation.additionalNotes}
                            </div>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>-</span>
                          )}
                        </td>
                        <td>{getStatusBadge(quotation.status)}</td>
                        <td>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                            <button
                              type="button"
                              className="btn-view"
                              onClick={() => handleViewQuotation(quotation.orderID)}
                              style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem" }}
                            >
                              View
                            </button>
                            {quotation.isConverted === 0 && quotation.status !== "Converted" && (
                              <button
                                type="button"
                                className="btn-submit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConvertQuotationToOrder(quotation.orderID);
                                }}
                                disabled={convertingQuotationId === quotation.orderID}
                                style={{
                                  padding: "0.25rem 0.5rem",
                                  fontSize: "0.875rem",
                                  backgroundColor: convertingQuotationId === quotation.orderID ? "#9ca3af" : "#10b981",
                                  color: "white",
                                  border: "none",
                                  borderRadius: "0.25rem",
                                  cursor: convertingQuotationId === quotation.orderID ? "not-allowed" : "pointer",
                                  fontWeight: 500,
                                }}
                                title="Convert to Order"
                              >
                                {convertingQuotationId === quotation.orderID ? "Converting..." : "Convert to Order"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Line Items Comparison */}
            <div className="comparison-section">
              <h3>Line Items Comparison</h3>
              {viewMode === 'card' ? (
                // Card View - Each line item is a card with vendors in table format, one card per row
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  {uniqueLineItems.map((lineItem, lineIndex) => {
                    // Get best price using the same matching logic as display
                    const bestPrice = getBestPriceForItem(lineItem, lineIndex);
                    const lineItemKey = `${lineItem.itemNo}-${lineItem.partNo}`;
                    
                    return (
                      <div
                        key={`${lineItem.orderID}-${lineItem.itemNo}-${lineIndex}`}
                        style={{
                          backgroundColor: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "0.5rem",
                          padding: "1.25rem",
                          boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)"
                        }}
                      >
                        {/* Line Item Header */}
                        <div style={{ marginBottom: "1rem", paddingBottom: "0.75rem", borderBottom: "2px solid #6366f1" }}>
                          <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#1f2937" }}>
                            Item #{lineItem.itemNo}
                          </h4>
                          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.875rem", color: "#6b7280" }}>
                            {lineItem.partName}
                          </p>
                          {lineItem.partNo && (
                            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "#9ca3af" }}>
                              Part No: {lineItem.partNo}
                            </p>
                          )}
                        </div>

                        {/* Vendors Table */}
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", tableLayout: "fixed" }}>
                            <thead>
                              <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #d1d5db" }}>
                                <th style={{ padding: "0.75rem", textAlign: "center", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", width: "50px" }}>Select</th>
                                <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", width: "15%" }}>Vendor</th>
                                <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", width: "10%" }}>Qty</th>
                                <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", width: "12%" }}>Unit Price</th>
                                <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", width: "12%" }}>Discount</th>
                                <th style={{ padding: "0.75rem", textAlign: "right", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", width: "12%" }}>Total</th>
                                <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", width: "15%" }}>Notes</th>
                                <th style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "#6b7280", width: "14%" }}>Attachments</th>
                              </tr>
                            </thead>
                            <tbody>
                              {quotations.map((quotation) => {
                                // Get all details for this vendor quotation, sorted by itemNo
                                const vendorDetails = details
                                  .filter(d => d.orderID === quotation.orderID)
                                  .sort((a, b) => a.itemNo - b.itemNo);
                                
                                // Use the same matching function as getBestPriceForItem
                                const quotationDetail = matchVendorDetailToMaster(lineItem, vendorDetails, lineIndex);
                                
                                // Debug: Log attachments for this detail in card view
                                if (quotationDetail) {
                                  console.log(`Card View: Vendor ${quotation.vendorName}, Item ${lineItem.itemNo}, has attachments:`, quotationDetail.attachments, "Type:", typeof quotationDetail.attachments, "IsArray:", Array.isArray(quotationDetail.attachments));
                                }
                                
                                const isBest = bestPrice && bestPrice.orderID === quotation.orderID;
                                const lineTotal = quotationDetail
                                  ? quotationDetail.qtyOrdered * quotationDetail.unitPrice - quotationDetail.discount
                                  : 0;

                                const isSelected = lineItemSelections.get(lineItemKey) === quotation.orderID;

                                return (
                                  <tr
                                    key={quotation.orderID}
                                    style={{
                                      backgroundColor: isSelected ? "#dbeafe" : isBest ? "#d1fae5" : "transparent",
                                      borderBottom: "1px solid #e5e7eb",
                                      transition: "all 0.15s"
                                    }}
                                  >
                                    {/* Select Column */}
                                    <td style={{ padding: "0.75rem", textAlign: "center", verticalAlign: "middle", width: "50px" }}>
                                      <input
                                        type="radio"
                                        name={`lineItem-${lineItemKey}`}
                                        checked={isSelected}
                                        onChange={() => handleLineItemVendorSelect(lineItemKey, quotation.orderID)}
                                        disabled={!quotationDetail || quotation.isConverted > 0}
                                        style={{ 
                                          cursor: (!quotationDetail || quotation.isConverted > 0) ? "not-allowed" : "pointer",
                                          width: "18px",
                                          height: "18px"
                                        }}
                                      />
                                    </td>

                                    {/* Vendor Name Column */}
                                    <td style={{ padding: "0.75rem", verticalAlign: "middle", width: "15%" }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                        <span style={{ fontWeight: 600, color: "#1f2937" }}>
                                          {quotation.vendorName}
                                        </span>
                                        {isSelected && (
                                          <span style={{ 
                                            fontSize: "0.75rem", 
                                            color: "#1e40af", 
                                            backgroundColor: "#bfdbfe", 
                                            padding: "0.125rem 0.5rem", 
                                            borderRadius: "0.25rem",
                                            fontWeight: 500
                                          }}>
                                            Selected
                                          </span>
                                        )}
                                        {isBest && !isSelected && (
                                          <span style={{ 
                                            fontSize: "0.75rem", 
                                            color: "#065f46", 
                                            backgroundColor: "#a7f3d0", 
                                            padding: "0.125rem 0.5rem", 
                                            borderRadius: "0.25rem",
                                            fontWeight: 500
                                          }}>
                                            Best Price
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* Quantity Column */}
                                    <td style={{ padding: "0.75rem", textAlign: "right", verticalAlign: "middle", color: "#1f2937", width: "10%" }}>
                                      {quotationDetail ? `${quotationDetail.qtyOrdered} ${quotationDetail.unit}` : "-"}
                                    </td>

                                    {/* Unit Price Column */}
                                    <td style={{ padding: "0.75rem", textAlign: "right", verticalAlign: "middle", color: "#1f2937", width: "12%" }}>
                                      {quotationDetail ? formatCurrency(quotationDetail.unitPrice) : "-"}
                                    </td>

                                    {/* Discount Column */}
                                    <td style={{ padding: "0.75rem", textAlign: "right", verticalAlign: "middle", color: "#1f2937", width: "12%" }}>
                                      {quotationDetail && quotationDetail.discount > 0 ? formatCurrency(quotationDetail.discount) : "-"}
                                    </td>

                                    {/* Total Column */}
                                    <td style={{ 
                                      padding: "0.75rem", 
                                      textAlign: "right", 
                                      verticalAlign: "middle",
                                      color: isSelected ? "#1e40af" : isBest ? "#10b981" : "#1f2937",
                                      fontWeight: 600,
                                      width: "12%"
                                    }}>
                                      {quotationDetail ? formatCurrency(lineTotal) : "-"}
                                    </td>

                                    {/* Notes Column */}
                                    <td style={{ padding: "0.75rem", verticalAlign: "top", width: "15%" }}>
                                      {quotationDetail?.notes ? (
                                        <div style={{ 
                                          color: "#1f2937", 
                                          whiteSpace: "pre-wrap", 
                                          wordBreak: "break-word",
                                          fontStyle: "italic",
                                          fontSize: "0.8125rem"
                                        }}>
                                          {quotationDetail.notes}
                                        </div>
                                      ) : "-"}
                                    </td>

                                    {/* Attachments Column */}
                                    <td style={{ padding: "0.75rem", verticalAlign: "top", width: "14%" }}>
                                      {(() => {
                                        const atts = quotationDetail?.attachments;
                                        const hasAttachments = atts && Array.isArray(atts) && atts.length > 0;
                                        if (!hasAttachments) {
                                          return "-";
                                        }
                                        return (
                                          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                            {atts.map((att) => (
                                              <div key={att.id || Math.random()}>
                                                {att.fileUrl ? (
                                                  <a 
                                                    href={att.fileUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    style={{ 
                                                      color: "#6366f1", 
                                                      textDecoration: "none",
                                                      display: "flex",
                                                      alignItems: "center",
                                                      gap: "0.25rem",
                                                      fontSize: "0.8125rem"
                                                    }}
                                                  >
                                                    <span>📎</span>
                                                    <span>{att.name || "Unnamed"}</span>
                                                  </a>
                                                ) : (
                                                  <span style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.8125rem" }}>
                                                    <span>📎</span>
                                                    <span>{att.name || "Unnamed"}</span>
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        );
                                      })()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === 'table' ? (
                // Table View (original layout - good for 2-3 vendors)
                <div className="comparison-table-wrapper" style={{ overflowX: "auto" }}>
                  <table className="comparison-table comparison-table-wide">
                    <thead>
                      <tr>
                        <th rowSpan={2} style={{ position: "sticky", left: 0, zIndex: 10, backgroundColor: "#f3f4f6" }}>
                          Item
                        </th>
                        {quotations.map((quotation) => (
                          <th key={quotation.orderID} colSpan={6} style={{ textAlign: "center" }}>
                            {quotation.vendorName}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {quotations.map((quotation) => (
                          <React.Fragment key={quotation.orderID}>
                            <th style={{ width: "40px", textAlign: "center" }}>Select</th>
                            <th>Qty</th>
                            <th>Unit Price</th>
                            <th>Total</th>
                            <th>Notes</th>
                            <th>Attachments</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueLineItems.map((lineItem, lineIndex) => {
                        // Get best price using the same matching logic as display
                        const bestPrice = getBestPriceForItem(lineItem, lineIndex);
                        // Use a unique key that includes itemNo and index to handle duplicate partNo+qtyOrdered combinations
                        const uniqueKey = `${lineItem.orderID}-${lineItem.itemNo}-${lineIndex}`;
                        return (
                          <tr key={uniqueKey}>
                            <td style={{ position: "sticky", left: 0, backgroundColor: "#ffffff", fontWeight: 600 }}>
                              Item #{lineItem.itemNo}
                              <div style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 400 }}>
                                {lineItem.partName}
                              </div>
                            </td>
                            {quotations.map((quotation) => {
                              // Find this quotation's pricing for this specific line item
                              // lineItem is from masterDetails (master quotation), so we need to match vendor's detail to it
                              
                              // Get all details for this vendor quotation, sorted by itemNo
                              const vendorDetails = details
                                .filter(d => d.orderID === quotation.orderID)
                                .sort((a, b) => a.itemNo - b.itemNo);
                              
                              // Use the same matching function as getBestPriceForItem
                              const quotationDetail = matchVendorDetailToMaster(lineItem, vendorDetails, lineIndex);
                              
                              const isBest = bestPrice && bestPrice.orderID === quotation.orderID;
                              const lineTotal = quotationDetail
                                ? quotationDetail.qtyOrdered * quotationDetail.unitPrice - quotationDetail.discount
                                : 0;

                              const lineItemKey = `${lineItem.itemNo}-${lineItem.partNo}`;
                              const isSelected = lineItemSelections.get(lineItemKey) === quotation.orderID;

                              return (
                                <React.Fragment key={quotation.orderID}>
                                  <td style={{ textAlign: "center", backgroundColor: isSelected ? "#dbeafe" : "transparent" }}>
                                    <input
                                      type="radio"
                                      name={`lineItem-${lineItemKey}`}
                                      checked={isSelected}
                                      onChange={() => handleLineItemVendorSelect(lineItemKey, quotation.orderID)}
                                      disabled={!quotationDetail || quotation.isConverted > 0}
                                      style={{ cursor: (!quotationDetail || quotation.isConverted > 0) ? "not-allowed" : "pointer" }}
                                    />
                                  </td>
                                  <td>{quotationDetail ? `${quotationDetail.qtyOrdered} ${quotationDetail.unit}` : "-"}</td>
                                  <td>{quotationDetail ? formatCurrency(quotationDetail.unitPrice) : "-"}</td>
                                  <td
                                    style={{
                                      fontWeight: 600,
                                      color: isBest ? "#10b981" : isSelected ? "#1e40af" : quotationDetail ? "#1f2937" : "#9ca3af",
                                      backgroundColor: isBest ? "#d1fae5" : isSelected ? "#dbeafe" : "transparent",
                                    }}
                                  >
                                    {quotationDetail ? formatCurrency(lineTotal) : "-"}
                                    {isBest && !isSelected && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>✓ Best</span>}
                                    {isSelected && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>✓ Selected</span>}
                                  </td>
                                  <td style={{ fontSize: "0.75rem", color: "#6b7280", maxWidth: "200px", padding: "0.5rem" }}>
                                    {quotationDetail?.notes ? (
                                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                        {quotationDetail.notes}
                                      </div>
                                    ) : "-"}
                                  </td>
                                  <td style={{ fontSize: "0.75rem", color: "#6b7280", maxWidth: "200px", padding: "0.5rem", verticalAlign: "top" }}>
                                    {(() => {
                                      const atts = quotationDetail?.attachments;
                                      const hasAttachments = atts && Array.isArray(atts) && atts.length > 0;
                                      if (!hasAttachments) {
                                        return "-";
                                      }
                                      return (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                        {atts.map((att) => (
                                          <div key={att.id || Math.random()}>
                                            {att.fileUrl ? (
                                              <a 
                                                href={att.fileUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                style={{ 
                                                  color: "#6366f1", 
                                                  textDecoration: "none",
                                                  display: "flex",
                                                  alignItems: "center",
                                                  gap: "0.25rem",
                                                  fontSize: "0.75rem"
                                                }}
                                              >
                                                <span>📎</span>
                                                <span>{att.name || "Unnamed"}</span>
                                              </a>
                                            ) : (
                                              <span style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem" }}>
                                                <span>📎</span>
                                                <span>{att.name || "Unnamed"}</span>
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                      );
                                    })()}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                        <td style={{ position: "sticky", left: 0, backgroundColor: "#f9fafb" }}>Total</td>
                        {quotations.map((quotation) => (
                          <React.Fragment key={quotation.orderID}>
                            <td></td>
                            <td></td>
                            <td></td>
                            <td style={{ fontSize: "1.125rem", color: "#6366f1" }}>
                              {formatCurrency(quotation.totalAmount)}
                            </td>
                            <td></td>
                            <td></td>
                          </React.Fragment>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                // Compact View (1 column per vendor - good for 5+ vendors)
                <div className="comparison-table-wrapper" style={{ overflowX: "auto" }}>
                  <table className="comparison-table comparison-table-compact">
                    <thead>
                      <tr>
                        <th style={{ position: "sticky", left: 0, zIndex: 10, backgroundColor: "#f3f4f6" }}>
                          Item
                        </th>
                        {quotations.map((quotation) => (
                          <th key={quotation.orderID} style={{ textAlign: "center", minWidth: "160px" }}>
                            <div>{quotation.vendorName}</div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 400, marginTop: "0.25rem" }}>Select</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueLineItems.map((lineItem, lineIndex) => {
                        // Get best price using the same matching logic as display
                        const bestPrice = getBestPriceForItem(lineItem, lineIndex);
                        // Use a unique key that includes itemNo and index to handle duplicate partNo+qtyOrdered combinations
                        const uniqueKey = `${lineItem.orderID}-${lineItem.itemNo}-${lineIndex}`;
                        return (
                          <tr key={uniqueKey}>
                            <td style={{ position: "sticky", left: 0, backgroundColor: "#ffffff", fontWeight: 600 }}>
                              Item #{lineItem.itemNo}
                              <div style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: 400 }}>
                                {lineItem.partName}
                              </div>
                            </td>
                            {quotations.map((quotation) => {
                              // Find this quotation's pricing for this specific line item
                              // lineItem is from masterDetails (master quotation), so we need to match vendor's detail to it
                              
                              // Get all details for this vendor quotation, sorted by itemNo
                              const vendorDetails = details
                                .filter(d => d.orderID === quotation.orderID)
                                .sort((a, b) => a.itemNo - b.itemNo);
                              
                              // Use the same matching function as getBestPriceForItem
                              const quotationDetail = matchVendorDetailToMaster(lineItem, vendorDetails, lineIndex);
                              
                              const isBest = bestPrice && bestPrice.orderID === quotation.orderID;
                              const lineTotal = quotationDetail
                                ? quotationDetail.qtyOrdered * quotationDetail.unitPrice - quotationDetail.discount
                                : 0;

                              const lineItemKey = `${lineItem.itemNo}-${lineItem.partNo}`;
                              const isSelected = lineItemSelections.get(lineItemKey) === quotation.orderID;

                              return (
                                <td
                                  key={quotation.orderID}
                                  style={{
                                    padding: "0.75rem",
                                    verticalAlign: "top",
                                    backgroundColor: isSelected ? "#dbeafe" : isBest ? "#d1fae5" : "transparent",
                                  }}
                                >
                                  {quotationDetail ? (
                                    <div style={{ fontSize: "0.875rem", lineHeight: "1.6" }}>
                                      <div style={{ marginBottom: "0.5rem", textAlign: "center" }}>
                                        <input
                                          type="radio"
                                          name={`lineItem-${lineItemKey}`}
                                          checked={isSelected}
                                          onChange={() => handleLineItemVendorSelect(lineItemKey, quotation.orderID)}
                                          disabled={quotation.isConverted > 0}
                                          style={{ cursor: quotation.isConverted > 0 ? "not-allowed" : "pointer" }}
                                        />
                                      </div>
                                      <div style={{ color: "#6b7280", fontSize: "0.75rem" }}>
                                        Qty: {quotationDetail.qtyOrdered} {quotationDetail.unit}
                                      </div>
                                      <div style={{ color: "#6b7280", fontSize: "0.75rem" }}>
                                        Unit Price: {formatCurrency(quotationDetail.unitPrice)}
                                      </div>
                                      <div
                                        style={{
                                          fontWeight: 600,
                                          fontSize: "0.9375rem",
                                          color: isSelected ? "#1e40af" : isBest ? "#10b981" : "#1f2937",
                                          marginTop: "0.25rem",
                                          paddingTop: "0.25rem",
                                          borderTop: "1px solid #e5e7eb"
                                        }}
                                      >
                                        Total: {formatCurrency(lineTotal)}
                                        {isSelected && (
                                          <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>✓ Selected</span>
                                        )}
                                        {isBest && !isSelected && (
                                          <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem" }}>✓ Best</span>
                                        )}
                                      </div>
                                      {quotationDetail.notes && (
                                        <div style={{ color: "#6b7280", fontSize: "0.75rem", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #e5e7eb", fontStyle: "italic", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                          Notes: {quotationDetail.notes}
                                        </div>
                                      )}
                                      {(() => {
                                        const atts = quotationDetail?.attachments;
                                        const hasAttachments = atts && Array.isArray(atts) && atts.length > 0;
                                        if (!hasAttachments) {
                                          return null;
                                        }
                                        return (
                                          <div style={{ color: "#6b7280", fontSize: "0.75rem", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid #e5e7eb" }}>
                                            <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>Attachments:</div>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                              {atts.map((att) => (
                                                <div key={att.id || Math.random()}>
                                                  {att.fileUrl ? (
                                                    <a 
                                                      href={att.fileUrl} 
                                                      target="_blank" 
                                                      rel="noopener noreferrer" 
                                                      style={{ 
                                                        color: "#6366f1", 
                                                        textDecoration: "none",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: "0.25rem",
                                                        fontSize: "0.75rem"
                                                      }}
                                                    >
                                                      <span>📎</span>
                                                      <span>{att.name || "Unnamed"}</span>
                                                    </a>
                                                  ) : (
                                                    <span style={{ color: "#6b7280", display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem" }}>
                                                      <span>📎</span>
                                                      <span>{att.name || "Unnamed"}</span>
                                                    </span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  ) : (
                                    <div style={{ color: "#9ca3af", fontSize: "0.875rem", textAlign: "center" }}>
                                      <input
                                        type="radio"
                                        name={`lineItem-${lineItemKey}`}
                                        disabled
                                        style={{ cursor: "not-allowed" }}
                                      />
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                        <td style={{ position: "sticky", left: 0, backgroundColor: "#f9fafb" }}>Total</td>
                        {quotations.map((quotation) => (
                          <td key={quotation.orderID} style={{ fontSize: "1.125rem", color: "#6366f1", textAlign: "center" }}>
                            {formatCurrency(quotation.totalAmount)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Selection Summary */}
          {selectionSummary.length > 0 && (
            <div className="comparison-section" style={{ backgroundColor: "#f0f9ff", padding: "1rem", borderRadius: "0.375rem", marginTop: "1rem" }}>
              <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "1rem", fontWeight: 600 }}>Order Summary</h4>
              {selectionSummary.map((summary, idx) => (
                <div key={idx} style={{ marginBottom: "0.5rem", padding: "0.5rem", backgroundColor: "white", borderRadius: "0.25rem" }}>
                  <strong>{summary.vendorName}</strong>: {summary.items.length} item(s) - {formatCurrency(summary.total)}
                </div>
              ))}
            </div>
          )}

          <div className="comparison-footer">
            <button type="button" className="btn-cancel" onClick={handleCloseComparison}>
              Close
            </button>
            {lineItemSelections.size > 0 && (
              <button
                type="button"
                className="btn-submit"
                onClick={handleCreateOrders}
                disabled={creatingOrders}
                style={{
                  backgroundColor: creatingOrders ? "#9ca3af" : "#10b981",
                  cursor: creatingOrders ? "not-allowed" : "pointer"
                }}
              >
                {creatingOrders ? "Creating Orders..." : `Create Orders (${selectionSummary.length} vendor${selectionSummary.length !== 1 ? 's' : ''})`}
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      {showSlideout && selectedQuotationId && (
        <VendorQuotationSlideout quotationId={selectedQuotationId} onClose={handleCloseSlideout} />
      )}
    </>
  );
};

export default VendorQuotationComparison;

