import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  QuotationService,
  QuotationMasterReq,
  QuotationDetailReq,
  PriceBreakdownMatrix,
} from "../../Common/Services/QuotationService";
import { PdfService } from "../../Common/Services/PdfService";
import { OrderService, OrderMasterReq, OrderDetailReq } from "../../Common/Services/OrderService";
import { CustomerService } from "../../Common/Services/CustomerService";
import { PriceBreakdownService, PriceBreakdownMaster } from "../../Common/Services/PriceBreakdownService";
import CustomerOrderSlideout from "../Orders/CustomerOrderSlideout";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import "./CustomerQuotationSlideout.scss";

interface CustomerQuotationSlideoutProps {
  quotationId: number;
  onClose: () => void;
}

const CustomerQuotationSlideout: React.FC<CustomerQuotationSlideoutProps> = ({
  quotationId,
  onClose,
}) => {
  const [formData, setFormData] = useState<QuotationMasterReq>({
    OrderID: 0,
    Tenantid: 0,
    CustomerID: 0,
    CustomerCode: "",
    PONumber: 0,
    CustomerName: "",
    Address: "",
    CustomerPoNumber: "",
    OrderDate: "",
    TotalAmount: 0,
    UserId: 0,
    UserToken: 0,
    Status: "Draft",
    ShippingInstructions: "",
    ExternalCustomerPO: "",
    ExternalOrderDate: undefined,
    BuyerName: "",
    CustomerRefNo: "",
    Details: [],
  });

  const [customers, setCustomers] = useState<Array<{ customer_id: number; company_name: string; customercode: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  // State for line item validation errors: Map of item index to field errors
  const [lineItemErrors, setLineItemErrors] = useState<Map<number, { [field: string]: string }>>(new Map());
  const [showPriceBreakdownPopup, setShowPriceBreakdownPopup] = useState(false);
  const [selectedDetailIndex, setSelectedDetailIndex] = useState<number>(-1);
  const [showTextEditorPopup, setShowTextEditorPopup] = useState(false);
  const [editingField, setEditingField] = useState<{ index: number; field: "PartName" | "Notes"; value: string } | null>(null);
  const [priceBreakdownMatrixData, setPriceBreakdownMatrixData] = useState<Map<number, PriceBreakdownMatrix>>(new Map()); // Map of ItemNo to price breakdown matrix
  const [showConvertToOrderDialog, setShowConvertToOrderDialog] = useState(false);
  const [selectedLineItems, setSelectedLineItems] = useState<Set<number>>(new Set()); // Set of ItemNo values
  const [selectedAttachments, setSelectedAttachments] = useState<Set<number>>(new Set()); // Set of attachment IDs
  const [showOrderSlideout, setShowOrderSlideout] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(0);
  const [attachments, setAttachments] = useState<Array<{ id: number; name: string; size: number; fileUrl?: string }>>([]);
  const [attachmentIdCounter, setAttachmentIdCounter] = useState(1);
  const [comments, setComments] = useState<Array<{ id: number; text: string; createdAt: string; createdBy: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [commentIdCounter, setCommentIdCounter] = useState(1);
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
          top: rect.bottom + 4, // Use viewport coordinates (no scroll offset for fixed positioning)
          left: rect.left,
          width: rect.width
        });
        return newMap;
      });
    }
  };

  // Effect to handle scroll and resize events to update dropdown positions
  useEffect(() => {
    if (unitDropdownOpen.size === 0) return; // No dropdowns open, no need to listen

    const handleScrollOrResize = () => {
      // Update positions for all open dropdowns
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
    };

    // Add event listeners to window and all scrollable containers
    window.addEventListener('scroll', handleScrollOrResize, true); // Use capture phase to catch all scroll events
    window.addEventListener('resize', handleScrollOrResize);
    
    // Also listen to scroll events on the slideout content area
    const slideoutContent = document.querySelector('.customer-quotation-slideout-content');
    if (slideoutContent) {
      slideoutContent.addEventListener('scroll', handleScrollOrResize, true);
    }

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      if (slideoutContent) {
        slideoutContent.removeEventListener('scroll', handleScrollOrResize, true);
      }
    };
  }, [unitDropdownOpen]);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
    
    setFormData((prev) => {
      // If it's a new quotation (quotationId === 0) and no details exist, add one default line item
      const defaultDetail: QuotationDetailReq = {
        ID: 0,
        ItemNo: 1,
        PartName: "",
        PartNo: "",
        DueDate: today,
        JobNumber: "",
        JobDesc: "",
        QtyOrdered: 1,
        Unit: "EA",
        UnitPrice: 0,
        JobPriority: 0,
        Discount: 0,
        ProductId: undefined,
        LeadTime: today,
        Notes: "",
      };

      return {
        ...prev,
        Tenantid: storage?.tenantID || 0,
        UserId: storage?.userId || 0,
        UserToken: storage?.userToken || 0,
        OrderDate: today,
        // Add default line item only for new quotations
        Details: quotationId === 0 && prev.Details.length === 0 ? [defaultDetail] : prev.Details,
      };
    });

    loadCustomers();

    if (quotationId > 0) {
      loadQuotation();
    }
  }, [quotationId]);

  const loadCustomers = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await CustomerService.GetCustomerlist({ tenantid: tenantID });
      if (result) {
        setCustomers(result.map(c => ({
          customer_id: c.customer_id,
          company_name: c.company_name,
          customercode: c.customercode
        })));
      }
    } catch (error) {
      console.error("Error loading customers:", error);
    }
  };

  const loadQuotation = async () => {
    setLoading(true);
    try {
      const quotation = await QuotationService.GetQuotationById(quotationId);
      if (quotation) {
        console.log("[CustomerQuotationSlideout] Loaded quotation:", {
          orderID: quotation.OrderID,
          status: quotation.Status,
          convertedOrderId: quotation.convertedOrderId
        });
        setFormData(quotation);
        
        // Load price breakdown matrix for each detail
        const matrixMap = new Map<number, PriceBreakdownMatrix>();
        quotation.Details.forEach((detail) => {
          if (detail.PriceBreakdownMatrix) {
            matrixMap.set(detail.ItemNo, detail.PriceBreakdownMatrix);
          }
        });
        setPriceBreakdownMatrixData(matrixMap);
        
        // Load attachments and comments if available
        console.log("Loading quotation attachments:", quotation.Attachments);
        console.log("Attachments type:", typeof quotation.Attachments, "Is array:", Array.isArray(quotation.Attachments));
        if (quotation.Attachments && Array.isArray(quotation.Attachments) && quotation.Attachments.length > 0) {
          // Ensure all IDs are integers within int32 range (max: 2,147,483,647)
          const cleanedAttachments = quotation.Attachments.map(a => {
            let id = Math.floor(a.id || 0);
            // Ensure ID is within int32 range (max: 2,147,483,647)
            const MAX_INT32 = 2147483647;
            if (id > MAX_INT32) {
              id = id % MAX_INT32; // Use modulo to bring it within range
            }
            return {
              id: id,
              name: a.name || "",
              size: a.size || 0,
              fileUrl: a.fileUrl || ""
            };
          });
          console.log("Cleaned attachments:", cleanedAttachments);
          setAttachments(cleanedAttachments);
          // Set counter to max ID + 1 to avoid conflicts
          const maxId = Math.max(...cleanedAttachments.map(a => a.id), 0);
          setAttachmentIdCounter(maxId + 1);
        } else {
          console.log("No attachments found or empty array");
          setAttachments([]);
          setAttachmentIdCounter(1);
        }
        console.log("Loading quotation comments:", quotation.Comments);
        if (quotation.Comments && Array.isArray(quotation.Comments) && quotation.Comments.length > 0) {
          // Ensure all IDs are integers within int32 range
          const cleanedComments = quotation.Comments.map(c => {
            let id = Math.floor(c.id || 0);
            // Ensure ID is within int32 range (max: 2,147,483,647)
            const MAX_INT32 = 2147483647;
            if (id > MAX_INT32) {
              id = id % MAX_INT32; // Use modulo to bring it within range
            }
            return {
              id: id,
              text: c.text || "",
              createdAt: c.createdAt || new Date().toISOString(),
              createdBy: c.createdBy || "User"
            };
          });
          console.log("Cleaned comments:", cleanedComments);
          setComments(cleanedComments);
          // Set counter to max ID + 1 to avoid conflicts
          const maxId = Math.max(...cleanedComments.map(c => c.id), 0);
          setCommentIdCounter(maxId + 1);
        } else {
          console.log("No comments found or empty array");
          setComments([]);
          setCommentIdCounter(1);
        }
        
        setIsStateChanged(false);
      }
    } catch (error: any) {
      console.error("Error loading quotation:", error);
      toast.error(`Error loading quotation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof QuotationMasterReq, value: any) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value };
      setIsStateChanged(true);
      return newData;
    });

    // Clear error for this field
    if (errors[field as string]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field as string];
        return newErrors;
      });
    }
  };

  const handleCustomerChange = async (customerId: number) => {
    const customer = customers.find(c => c.customer_id === customerId);
    if (customer) {
      // Load customer details to get default contact person
      try {
        const customerDetails = await CustomerService.GetCustomerById(customerId);
        if (customerDetails) {
          const defaultContact = customerDetails.CustomerContact?.find(c => c.isDefault) || 
                                 customerDetails.customerContact?.find(c => c.isDefault);
          const buyerName = defaultContact 
            ? `${defaultContact.firstname} ${defaultContact.lastname}`.trim()
            : "";
          
          setFormData((prev) => ({
            ...prev,
            CustomerID: customerId,
            CustomerCode: customer.customercode,
            CustomerName: customer.company_name,
            BuyerName: buyerName,
          }));
          setIsStateChanged(true);
        } else {
          setFormData((prev) => ({
            ...prev,
            CustomerID: customerId,
            CustomerCode: customer.customercode,
            CustomerName: customer.company_name,
          }));
          setIsStateChanged(true);
        }
      } catch (error) {
        console.error("Error loading customer details:", error);
        setFormData((prev) => ({
          ...prev,
          CustomerID: customerId,
          CustomerCode: customer.customercode,
          CustomerName: customer.company_name,
        }));
        setIsStateChanged(true);
      }
    }
  };

  const handleDetailChange = (index: number, field: keyof QuotationDetailReq, value: any) => {
    setFormData((prev) => {
      const newDetails = [...prev.Details];
      newDetails[index] = { ...newDetails[index], [field]: value };
      
      // Calculate line total
      if (field === "QtyOrdered" || field === "UnitPrice" || field === "Discount") {
        const qty = field === "QtyOrdered" ? value : newDetails[index].QtyOrdered;
        const price = field === "UnitPrice" ? value : newDetails[index].UnitPrice;
        const discount = field === "Discount" ? value : newDetails[index].Discount;
        const lineTotal = (qty * price) - discount;
        // Note: We don't store lineTotal, but we can calculate it for display
      }

      // Recalculate total using effective prices from tiers
      const total = newDetails.reduce((sum, detail) => {
        return sum + calculateLineTotal(detail);
      }, 0);

      // Clear validation errors for this field when user makes changes
      setLineItemErrors((prev) => {
        const newMap = new Map(prev);
        const itemErrors = newMap.get(index);
        if (itemErrors) {
          // Clear errors for the changed field and related fields
          if (field === "PartNo" || field === "PartName") {
            delete itemErrors.PartNo;
            delete itemErrors.PartName;
          } else if (field === "LeadTime" || field === "DueDate") {
            // Clear DueDate error when either LeadTime or DueDate is changed
            delete itemErrors.DueDate;
          } else {
            delete itemErrors[field];
          }
          
          // If no errors left for this item, remove it from the map
          if (Object.keys(itemErrors).length === 0) {
            newMap.delete(index);
          } else {
            newMap.set(index, itemErrors);
          }
        }
        return newMap;
      });

      setIsStateChanged(true);
      return {
        ...prev,
        Details: newDetails,
        TotalAmount: total,
      };
    });
  };

  const handleAddDetail = () => {
    setFormData((prev) => {
      const newItemNo = prev.Details.length > 0 
        ? Math.max(...prev.Details.map(d => d.ItemNo)) + 1 
        : 1;
      
      const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
      const newDetail: QuotationDetailReq = {
        ID: 0,
        ItemNo: newItemNo,
        PartName: "",
        PartNo: "",
        DueDate: today,
        JobNumber: "",
        JobDesc: "",
        QtyOrdered: 1,
        Unit: "EA",
        UnitPrice: 0,
        JobPriority: 0,
        Discount: 0,
        ProductId: undefined,
        LeadTime: today,
        Notes: "",
      };

      return {
        ...prev,
        Details: [...prev.Details, newDetail],
      };
    });
    setIsStateChanged(true);
  };

  const handleDeleteDetail = (index: number) => {
    setFormData((prev) => {
      const newDetails = prev.Details.filter((_, i) => i !== index);
      
      // Recalculate total using effective prices from tiers
      const total = newDetails.reduce((sum, detail) => {
        return sum + calculateLineTotal(detail);
      }, 0);

      return {
        ...prev,
        Details: newDetails,
        TotalAmount: total,
      };
    });
    setIsStateChanged(true);
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const newLineItemErrors = new Map<number, { [field: string]: string }>();

    // Validate header fields
    if (!formData.CustomerID || formData.CustomerID <= 0) {
      newErrors.CustomerID = "Customer is required";
    }

    if (!formData.OrderDate) {
      newErrors.OrderDate = "Quotation date is required";
    }

    // Validate line items
    if (formData.Details.length === 0) {
      newErrors.Details = "At least one line item is required";
    } else {
      formData.Details.forEach((detail, index) => {
        const itemErrors: { [field: string]: string } = {};

        // PartNo OR PartName must be filled (at least one)
        if (!detail.PartNo?.trim() && !detail.PartName?.trim()) {
          itemErrors.PartNo = "Part Number or Part Description is required";
          itemErrors.PartName = "Part Number or Part Description is required";
        }

        // QtyOrdered must be > 0
        if (!detail.QtyOrdered || detail.QtyOrdered <= 0) {
          itemErrors.QtyOrdered = "Quantity must be greater than 0";
        }

        // Unit must be filled
        if (!detail.Unit?.trim()) {
          itemErrors.Unit = "Unit is required";
        }

        // UnitPrice must be >= 0
        if (detail.UnitPrice === undefined || detail.UnitPrice === null || detail.UnitPrice < 0) {
          itemErrors.UnitPrice = "Unit price must be 0 or greater";
        }

        // DueDate/LeadTime must not be earlier than today
        const estDate = detail.LeadTime || detail.DueDate;
        if (estDate) {
          try {
            const dateValue = new Date(estDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
            dateValue.setHours(0, 0, 0, 0);
            if (dateValue < today) {
              itemErrors.DueDate = "Est Date cannot be earlier than today";
            }
          } catch (e) {
            // Invalid date format - ignore for now, or add validation if needed
          }
        }

        if (Object.keys(itemErrors).length > 0) {
          newLineItemErrors.set(index, itemErrors);
        }
      });
    }

    setErrors(newErrors);
    setLineItemErrors(newLineItemErrors);
    return Object.keys(newErrors).length === 0 && newLineItemErrors.size === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      // Count line item errors
      const lineItemErrorCount = lineItemErrors.size;
      if (lineItemErrorCount > 0) {
        toast.error(`Please fix validation errors in ${lineItemErrorCount} line item(s)`);
      } else {
        toast.error("Please fix the errors in the form");
      }
      // Scroll to first error if possible
      const firstErrorIndex = Array.from(lineItemErrors.keys())[0];
      if (firstErrorIndex !== undefined) {
        const errorRow = document.querySelector(`tr:nth-child(${firstErrorIndex + 2})`); // +2 for header row
        if (errorRow) {
          errorRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
      return;
    }

    setLoading(true);
    try {
      // Include price breakdown matrix, attachments, and comments in details before saving
      console.log("Saving quotation with attachments:", attachments);
      console.log("Saving quotation with comments:", comments);
      console.log("Form data before save:", formData);
      
      const formDataWithMatrix: QuotationMasterReq = {
        ...formData,
        Details: formData.Details.map((detail) => ({
          ...detail,
          PriceBreakdownMatrix: priceBreakdownMatrixData.get(detail.ItemNo) || undefined,
        })),
        Attachments: attachments || [],
        Comments: comments || [],
      };
      
      // Validate that we have the minimum required data
      if (!formDataWithMatrix.CustomerID || formDataWithMatrix.CustomerID <= 0) {
        toast.error("Customer is required");
        setLoading(false);
        return;
      }
      
      if (!formDataWithMatrix.OrderDate) {
        toast.error("Quotation date is required");
        setLoading(false);
        return;
      }
      
      console.log("Sending quotation data:", formDataWithMatrix);
      const result = await QuotationService.SaveQuotation(formDataWithMatrix);
      toast.success("Quotation saved successfully");
      
      // Update the OrderID in formData if it was a new quotation
      if (formData.OrderID === 0 && result.id > 0) {
        setFormData(prev => ({
          ...prev,
          OrderID: result.id
        }));
      }
      
      setIsStateChanged(false);
      // Don't close the slideout - keep it open for further editing
    } catch (error: any) {
      console.error("Error saving quotation:", error);
      toast.error(`Error saving quotation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
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

  const handlePrint = async () => {
    if (!formData.CustomerID || formData.Details.length === 0) {
      toast.error("Please ensure the quotation has a customer and at least one line item before printing");
      return;
    }

    try {
      const quotationNumber = formData.PONumber < 1000 
        ? `CQ#${formData.PONumber + 999}` 
        : `CQ#${formData.PONumber}`;

      // Generate PDF using API
      const blob = await PdfService.GenerateQuotation(quotationId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Quotation_${quotationNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      toast.success("Quotation PDF generated successfully");
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast.error(`Error generating PDF: ${error.message || "Unknown error"}`);
    }
  };

  const refreshDeletionImpact = async () => {
    try {
      const response = await QuotationService.CheckQuotationDeletionImpact(quotationId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    try {
      if (deleteEndpoint.includes('/Order/DeleteOrder')) {
        await OrderService.DeleteOrder(itemId);
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

      const updatedResponse = await QuotationService.CheckQuotationDeletionImpact(quotationId);
      const updatedImpact = updatedResponse.result as DeletionImpactResult;

      if (updatedImpact.canDelete) {
        await QuotationService.DeleteQuotation(quotationId);
        toast.success("All dependencies and quotation deleted successfully");
        setShowDeletionDialog(false);
        onClose();
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
      const response = await QuotationService.CheckQuotationDeletionImpact(quotationId);
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
      await QuotationService.DeleteQuotation(quotationId);
      toast.success("Quotation deleted successfully");
      setShowDeletionDialog(false);
      onClose();
    } catch (error: any) {
      console.error("Error deleting quotation:", error);
      toast.error(`Error deleting quotation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async () => {
    if (quotationId > 0) {
      setLoading(true);
      try {
        const quotation = await QuotationService.GetQuotationById(quotationId);
        if (quotation) {
          // Create a new quotation with copied data
          const duplicatedQuotation: QuotationMasterReq = {
            ...quotation,
            OrderID: 0,
            PONumber: 0,
            Status: "Draft",
            CustomerRefNo: "",
          };
          
          // Save as new quotation
          await QuotationService.SaveQuotation(duplicatedQuotation);
          toast.success("Quotation duplicated successfully");
          onClose();
        }
      } catch (error: any) {
        console.error("Error duplicating quotation:", error);
        toast.error(`Error duplicating quotation: ${error.message || "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleConvertToOrder = async () => {
    // Validation
    if (!formData.CustomerID || formData.CustomerID <= 0) {
      toast.error("Customer is required to convert quotation to order");
      return;
    }

    if (formData.Details.length === 0) {
      toast.error("At least one line item is required to convert quotation to order");
      return;
    }

    // Check if already converted
    if (formData.Status === "Converted") {
      toast.warning("This quotation has already been converted to an order");
      return;
    }

    // Initialize selection: all items and attachments selected by default
    const allItemNos = new Set(formData.Details.map(d => d.ItemNo));
    setSelectedLineItems(allItemNos);
    const allAttachmentIds = new Set(attachments.map(a => a.id));
    setSelectedAttachments(allAttachmentIds);
    setShowConvertToOrderDialog(true);
  };

  const performConvertToOrder = async () => {
    if (selectedLineItems.size === 0) {
      toast.error("Please select at least one line item to convert");
      return;
    }

    setLoading(true);
    setShowConvertToOrderDialog(false);
    
    try {
      // Format quotation number
      const quotationNumber = formData.PONumber < 1000 
        ? `CQ#${formData.PONumber + 999}` 
        : `CQ#${formData.PONumber}`;

      // Convert only selected quotation details to order details
      // Use UnitPrice and QtyOrdered directly from line item (not price breakdown)
      const orderDetails: OrderDetailReq[] = formData.Details
        .filter(detail => selectedLineItems.has(detail.ItemNo)) // Only selected items
        .map((detail) => {
          return {
            ID: 0, // New detail
            ItemNo: detail.ItemNo,
            PartName: detail.PartName,
            PartNo: detail.PartNo,
            DueDate: detail.DueDate,
            JobNumber: detail.JobNumber,
            JobDesc: detail.JobDesc,
            QtyOrdered: detail.QtyOrdered, // Use qty from line item
            Unit: detail.Unit,
            UnitPrice: detail.UnitPrice, // Use unit price from line item (not price breakdown)
            JobPriority: detail.JobPriority,
            Discount: detail.Discount,
            ProductId: detail.ProductId,
            LeadTime: detail.LeadTime,
            Notes: detail.Notes,
            ShippedQty: 0,
            ShippingStatus: "Not Started",
            InvoicedQty: 0,
            InvoiceStatus: "Not Invoiced"
          };
        });

      // Calculate total using line item prices (not price breakdown)
      const totalAmount = orderDetails.reduce((sum, detail) => {
        const subtotal = detail.QtyOrdered * detail.UnitPrice;
        const discountAmount = (subtotal * detail.Discount) / 100;
        return sum + (subtotal - discountAmount);
      }, 0);

      // Create order request
      const orderRequest: OrderMasterReq = {
        OrderID: 0, // New order
        Tenantid: formData.Tenantid,
        CustomerID: formData.CustomerID,
        CustomerCode: formData.CustomerCode,
        PONumber: 0, // Will be auto-generated by backend
        CustomerName: formData.CustomerName,
        Address: formData.Address,
        CustomerPoNumber: formData.CustomerPoNumber,
        OrderDate: new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }),
        TotalAmount: totalAmount,
        UserId: formData.UserId,
        UserToken: formData.UserToken,
        Status: "Draft",
        ShippingInstructions: formData.ShippingInstructions,
        ExternalCustomerPO: formData.ExternalCustomerPO,
        ExternalOrderDate: formData.ExternalOrderDate,
        BuyerName: formData.BuyerName,
        QuotationId: quotationId, // Link to source quotation
        QuotationNo: quotationNumber,
        LocationId: formData.LocationId,
        Details: orderDetails,
        Attachments: attachments.filter(a => selectedAttachments.has(a.id)) || [], // Only selected attachments
        Comments: [] // Comments are not carried over - they are native to each slideout
      };

      // Save the order
      const result = await OrderService.SaveOrder(orderRequest);
      
      if (result && result.id > 0) {
        // Backend automatically updates quotation status and convertedOrderId
        // Reload quotation to get updated data
        const updatedQuotation = await QuotationService.GetQuotationById(quotationId);
        if (updatedQuotation) {
          setFormData(updatedQuotation);
        }
        
        // Format order number for display
        const orderNumber = result.id < 1000 
          ? `CO#${result.id + 999}` 
          : `CO#${result.id}`;
        
        toast.success(`Quotation converted to order successfully! Order Number: ${orderNumber}`, {
          autoClose: 5000
        });
      } else {
        toast.error("Failed to create order");
      }
    } catch (error: any) {
      console.error("Error converting quotation to order:", error);
      toast.error(`Error converting quotation to order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

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

  const getFirstLine = (text: string): string => {
    if (!text) return "";
    // Get the first line (split by newline and take first part)
    const firstLine = text.split(/\r?\n/)[0];
    return firstLine;
  };

  // Get effective unit price based on price breakdown matrix
  const getEffectiveUnitPrice = (detail: QuotationDetailReq): number => {
    const matrix = priceBreakdownMatrixData.get(detail.ItemNo);
    if (!matrix || !matrix.quantities || matrix.quantities.length === 0) {
      return detail.UnitPrice; // Use default unit price
    }
    
    // Find the closest quantity that matches or is less than the ordered quantity
    const sortedQuantities = [...matrix.quantities].sort((a, b) => b - a); // Descending order
    const matchingQuantityIndex = sortedQuantities.findIndex(qty => detail.QtyOrdered >= qty);
    
    if (matchingQuantityIndex === -1) {
      // Ordered quantity is less than all defined quantities, use the smallest quantity column
      const smallestQtyIndex = matrix.quantities.indexOf(Math.min(...matrix.quantities));
      const totalPrice = matrix.breakdownPrices.reduce((sum, bp) => {
        return sum + (bp.prices[smallestQtyIndex] || 0);
      }, 0);
      return totalPrice > 0 ? totalPrice : detail.UnitPrice;
    }
    
    // Use the matching quantity column
    const matchingQty = sortedQuantities[matchingQuantityIndex];
    const quantityIndex = matrix.quantities.indexOf(matchingQty);
    
    // Calculate total price from breakdown prices for this quantity column
    const totalPrice = matrix.breakdownPrices.reduce((sum, bp) => {
      return sum + (bp.prices[quantityIndex] || 0);
    }, 0);
    
    return totalPrice > 0 ? totalPrice : detail.UnitPrice;
  };

  // Calculate line total using effective unit price
  const calculateLineTotal = (detail: QuotationDetailReq): number => {
    const effectivePrice = getEffectiveUnitPrice(detail);
    const subtotal = detail.QtyOrdered * effectivePrice;
    const discountAmount = (subtotal * detail.Discount) / 100;
    return subtotal - discountAmount;
  };

  return (
    <div className="customer-quotation-slideout-overlay" onClick={handleCancel}>
      <div className="customer-quotation-slideout-card" onClick={(e) => e.stopPropagation()}>
        <div className="customer-quotation-slideout-header">
          <div>
            <h2>{quotationId > 0 ? "Edit Quotation" : "New Quotation"}</h2>
            {quotationId > 0 && formData.PONumber > 0 && (
              <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                Quotation Number: {formData.PONumber < 1000 ? `CQ#${formData.PONumber + 999}` : `CQ#${formData.PONumber}`}
                {formData.convertedOrderId && (
                  <span style={{ marginLeft: "1rem", color: "#10b981", fontWeight: 500 }}>
                    → Converted to Order:{" "}
                    <span
                      style={{
                        cursor: "pointer",
                        textDecoration: "underline",
                      }}
                      onClick={() => {
                        setSelectedOrderId(formData.convertedOrderId!);
                        setShowOrderSlideout(true);
                      }}
                      title="Click to view order"
                    >
                      {formData.convertedOrderId < 1000 ? `CO#${formData.convertedOrderId + 999}` : `CO#${formData.convertedOrderId}`}
                    </span>
                  </span>
                )}
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
              </>
            )}
            <div className="status-field-inline">
              <div className={`input-group ${formData.Status === "Active" || formData.Status === "Sent" || formData.Status === "Accepted" || formData.Status === "Converted" ? "status-active-group" : "status-inactive-group"}`} style={{ maxWidth: "150px" }}>
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                  </span>
                </div>
                <select
                  className={`form-input ${formData.Status === "Active" || formData.Status === "Sent" || formData.Status === "Accepted" || formData.Status === "Converted" ? "status-active" : "status-inactive"}`}
                  value={formData.Status}
                  onChange={(e) => handleInputChange("Status", e.target.value)}
                >
                  <option value="Draft">Draft</option>
                  <option value="Sent">Sent</option>
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

        <form className="customer-quotation-slideout-form" onSubmit={handleSubmit}>
          <div className="customer-quotation-slideout-content">
            {/* Basic Information */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="CustomerID">Customer <span className="required">*</span></label>
                <div className={`input-group ${errors.CustomerID ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">🏢</span>
                  </div>
                  <select
                    id="CustomerID"
                    name="CustomerID"
                    className={`form-input ${errors.CustomerID ? "error" : ""}`}
                    value={formData.CustomerID}
                    onChange={(e) => handleCustomerChange(parseInt(e.target.value))}
                    required
                  >
                    <option value="0">Select Customer</option>
                    {customers.map((customer) => (
                      <option key={customer.customer_id} value={customer.customer_id}>
                        {customer.company_name} ({customer.customercode})
                      </option>
                    ))}
                  </select>
                </div>
                {errors.CustomerID && <span className="error-message">{errors.CustomerID}</span>}
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
                    value={convertToDateInputFormat(formData.OrderDate)}
                    onChange={(e) => handleInputChange("OrderDate", convertFromDateInputFormat(e.target.value))}
                    required
                  />
                </div>
                {errors.OrderDate && <span className="error-message">{errors.OrderDate}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="BuyerName">Buyer Name</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">👤</span>
                  </div>
                  <input
                    type="text"
                    id="BuyerName"
                    name="BuyerName"
                    className="form-input"
                    placeholder="Buyer name from default contact"
                    value={formData.BuyerName}
                    onChange={(e) => handleInputChange("BuyerName", e.target.value)}
                    readOnly
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="CustomerRefNo">Customer Ref #</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">📄</span>
                  </div>
                  <input
                    type="text"
                    id="CustomerRefNo"
                    name="CustomerRefNo"
                    className="form-input"
                    placeholder="Enter customer reference number"
                    value={formData.CustomerRefNo}
                    onChange={(e) => handleInputChange("CustomerRefNo", e.target.value)}
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
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#4f46e5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#6366f1";
                  }}
                >
                  + Add Item
                </button>
              </div>
              {errors.Details && <span className="error-message">{errors.Details}</span>}
              
              {formData.Details.length > 0 && (
                <div className="line-items-table-container" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Item #</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Part No</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Part Description</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Est Date</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Unit</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Qty</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Unit Price</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Discount</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Total</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Notes</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Price Breakdown</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.Details.map((detail, index) => {
                        const lineTotal = calculateLineTotal(detail);
                        const itemErrors = lineItemErrors.get(index) || {};
                        const hasPartError = !!(itemErrors.PartNo || itemErrors.PartName);
                        return (
                          <tr key={index} style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <td style={{ padding: "0.75rem" }}>{detail.ItemNo}</td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <input
                                type="text"
                                className="form-input"
                                style={{ 
                                  width: "100%", 
                                  minWidth: "100px",
                                  borderColor: hasPartError ? "#ef4444" : undefined,
                                  borderWidth: hasPartError ? "2px" : "1px"
                                }}
                                value={detail.PartNo}
                                onChange={(e) => handleDetailChange(index, "PartNo", e.target.value)}
                                placeholder="Part number"
                              />
                              {itemErrors.PartNo && (
                                <div style={{ 
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  fontSize: "0.75rem", 
                                  color: "#ef4444", 
                                  marginTop: "0.25rem",
                                  backgroundColor: "#ffffff",
                                  zIndex: 10,
                                  padding: "0.25rem",
                                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                                }}>
                                  {itemErrors.PartNo}
                                </div>
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
                                  whiteSpace: "nowrap",
                                  borderColor: hasPartError ? "#ef4444" : undefined,
                                  borderWidth: hasPartError ? "2px" : "1px"
                                }}
                                value={getFirstLine(detail.PartName || "")}
                                onClick={() => {
                                  setEditingField({ index, field: "PartName", value: detail.PartName });
                                  setShowTextEditorPopup(true);
                                }}
                                placeholder="Click to edit description"
                                readOnly
                                title={detail.PartName || "Click to edit description"}
                              />
                              {itemErrors.PartName && (
                                <div style={{ 
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  fontSize: "0.75rem", 
                                  color: "#ef4444", 
                                  marginTop: "0.25rem",
                                  backgroundColor: "#ffffff",
                                  zIndex: 10,
                                  padding: "0.25rem",
                                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                                }}>
                                  {itemErrors.PartName}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <input
                                type="date"
                                className="form-input"
                                style={{ 
                                  width: "100%", 
                                  minWidth: "120px",
                                  borderColor: itemErrors.DueDate ? "#ef4444" : undefined,
                                  borderWidth: itemErrors.DueDate ? "2px" : "1px"
                                }}
                                value={convertToDateInputFormat(detail.LeadTime || detail.DueDate)}
                                onChange={(e) => {
                                  const estDate = convertFromDateInputFormat(e.target.value);
                                  handleDetailChange(index, "LeadTime", estDate);
                                  handleDetailChange(index, "DueDate", estDate);
                                }}
                              />
                              {itemErrors.DueDate && (
                                <div style={{ 
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  fontSize: "0.75rem", 
                                  color: "#ef4444", 
                                  marginTop: "0.25rem",
                                  backgroundColor: "#ffffff",
                                  zIndex: 10,
                                  padding: "0.25rem",
                                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                                }}>
                                  {itemErrors.DueDate}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative", zIndex: 1 }}>
                              <div style={{ position: "relative", zIndex: 1 }}>
                                <input
                                  type="text"
                                  className="form-input"
                                  style={{ 
                                    width: "100%", 
                                    minWidth: "80px", 
                                    paddingRight: "2rem",
                                    borderColor: itemErrors.Unit ? "#ef4444" : undefined,
                                    borderWidth: itemErrors.Unit ? "2px" : "1px"
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
                                {itemErrors.Unit && (
                                  <div style={{ 
                                    position: "absolute",
                                    top: "100%",
                                    left: 0,
                                    right: 0,
                                    fontSize: "0.75rem", 
                                    color: "#ef4444", 
                                    marginTop: "0.25rem",
                                    backgroundColor: "#ffffff",
                                    zIndex: 10,
                                    padding: "0.25rem",
                                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                                  }}>
                                    {itemErrors.Unit}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <input
                                type="text"
                                inputMode="numeric"
                                className="form-input no-spinner"
                                style={{ 
                                  width: "100%", 
                                  minWidth: "80px",
                                  borderColor: itemErrors.QtyOrdered ? "#ef4444" : undefined,
                                  borderWidth: itemErrors.QtyOrdered ? "2px" : "1px"
                                }}
                                value={numericDisplayValues.get(`qty-${index}`) ?? (detail.QtyOrdered === 0 ? "" : detail.QtyOrdered.toString())}
                                onChange={(e) => {
                                  const inputVal = e.target.value.replace(/[^0-9]/g, '');
                                  // Update display value immediately
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
                                  // Convert empty to 1 (default) only on blur and clear display value
                                  const val = e.target.value === "" ? 1 : parseInt(e.target.value) || 1;
                                  handleDetailChange(index, "QtyOrdered", val);
                                  setNumericDisplayValues(prev => {
                                    const newMap = new Map(prev);
                                    newMap.delete(`qty-${index}`);
                                    return newMap;
                                  });
                                }}
                              />
                              {itemErrors.QtyOrdered && (
                                <div style={{ 
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  fontSize: "0.75rem", 
                                  color: "#ef4444", 
                                  marginTop: "0.25rem",
                                  backgroundColor: "#ffffff",
                                  zIndex: 10,
                                  padding: "0.25rem",
                                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                                }}>
                                  {itemErrors.QtyOrdered}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="form-input no-spinner"
                                style={{ 
                                  width: "100%", 
                                  minWidth: "100px",
                                  borderColor: itemErrors.UnitPrice ? "#ef4444" : undefined,
                                  borderWidth: itemErrors.UnitPrice ? "2px" : "1px"
                                }}
                                value={numericDisplayValues.get(`price-${index}`) ?? (detail.UnitPrice === 0 ? "" : detail.UnitPrice.toString())}
                                onChange={(e) => {
                                  const inputVal = e.target.value.replace(/[^0-9.]/g, '').replace(/\./g, (match, offset, string) => {
                                    return string.indexOf('.') === offset ? match : '';
                                  });
                                  // Update display value immediately
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
                                  // Convert empty to 0 only on blur and clear display value
                                  const val = e.target.value === "" || e.target.value === "." ? 0 : parseFloat(e.target.value) || 0;
                                  handleDetailChange(index, "UnitPrice", val);
                                  setNumericDisplayValues(prev => {
                                    const newMap = new Map(prev);
                                    newMap.delete(`price-${index}`);
                                    return newMap;
                                  });
                                }}
                              />
                              {itemErrors.UnitPrice && (
                                <div style={{ 
                                  position: "absolute",
                                  top: "100%",
                                  left: 0,
                                  right: 0,
                                  fontSize: "0.75rem", 
                                  color: "#ef4444", 
                                  marginTop: "0.25rem",
                                  backgroundColor: "#ffffff",
                                  zIndex: 10,
                                  padding: "0.25rem",
                                  boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
                                }}>
                                  {itemErrors.UnitPrice}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "0.75rem" }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="form-input no-spinner"
                                style={{ width: "100%", minWidth: "100px" }}
                                value={numericDisplayValues.get(`discount-${index}`) ?? (detail.Discount === 0 ? "" : detail.Discount.toString())}
                                onChange={(e) => {
                                  const inputVal = e.target.value.replace(/[^0-9.]/g, '').replace(/\./g, (match, offset, string) => {
                                    return string.indexOf('.') === offset ? match : '';
                                  });
                                  // Update display value immediately
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
                                  // Convert empty to 0 only on blur and clear display value
                                  const val = e.target.value === "" || e.target.value === "." ? 0 : parseFloat(e.target.value) || 0;
                                  handleDetailChange(index, "Discount", val);
                                  setNumericDisplayValues(prev => {
                                    const newMap = new Map(prev);
                                    newMap.delete(`discount-${index}`);
                                    return newMap;
                                  });
                                }}
                              />
                            </td>
                            <td style={{ padding: "0.75rem", fontWeight: 600 }}>
                              ${lineTotal.toFixed(2)}
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
                                  setEditingField({ index, field: "Notes", value: detail.Notes });
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
                                onClick={() => {
                                  setSelectedDetailIndex(index);
                                  setShowPriceBreakdownPopup(true);
                                }}
                                style={{
                                  padding: "0.5rem 1rem",
                                  minWidth: "100px",
                                  cursor: "pointer",
                                  textAlign: "center",
                                  backgroundColor: priceBreakdownMatrixData.get(detail.ItemNo) ? "#10b981" : "#6366f1",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "0.375rem",
                                  fontSize: "0.875rem",
                                  fontWeight: 500,
                                  transition: "all 0.2s ease",
                                  boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = priceBreakdownMatrixData.get(detail.ItemNo) ? "#059669" : "#4f46e5";
                                  e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)";
                                  e.currentTarget.style.transform = "translateY(-1px)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = priceBreakdownMatrixData.get(detail.ItemNo) ? "#10b981" : "#6366f1";
                                  e.currentTarget.style.boxShadow = "0 1px 2px 0 rgba(0, 0, 0, 0.05)";
                                  e.currentTarget.style.transform = "translateY(0)";
                                }}
                              >
                                {priceBreakdownMatrixData.get(detail.ItemNo) ? "Edit" : "Add"}
                              </button>
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "center" }}>
                              <button
                                type="button"
                                className="btn-icon btn-icon-danger"
                                onClick={() => handleDeleteDetail(index)}
                                title="Delete"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                        <td colSpan={8} style={{ padding: "0.75rem", textAlign: "right" }}>Total Amount:</td>
                        <td style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600 }}>
                          ${formData.TotalAmount.toFixed(2)}
                        </td>
                        <td colSpan={4} style={{ padding: "0.75rem" }}></td>
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
              
              {/* Add Attachment Button - Bottom Left */}
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
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#4f46e5";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#6366f1";
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
                          id: newId, // Use sequential ID to ensure it's within int32 range
                          name: file.name,
                          size: file.size,
                        };
                        setAttachments((prevAttachments) => [...prevAttachments, newAttachment]);
                        setIsStateChanged(true);
                        return newId + 1; // Increment for next attachment
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
              
              {/* Add New Comment */}
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
                          id: newId, // Use sequential ID to ensure it's within int32 range
                          text: newComment.trim(),
                          createdAt: new Date().toISOString(),
                          createdBy: storage?.userName || "User",
                        };
                        setComments((prevComments) => [...prevComments, newCommentObj]);
                        setNewComment("");
                        setIsStateChanged(true);
                        return newId + 1; // Increment for next comment
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
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#4f46e5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#6366f1";
                  }}
                >
                  Add Comment
                </button>
              </div>

              {/* Comments List */}
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
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>

      {/* Combined Price Breakdown Matrix Popup */}
      {showPriceBreakdownPopup && selectedDetailIndex >= 0 && formData.Details[selectedDetailIndex] && (
        <PriceBreakdownMatrixPopup
          detailIndex={selectedDetailIndex}
          detail={formData.Details[selectedDetailIndex]}
          matrix={priceBreakdownMatrixData.get(formData.Details[selectedDetailIndex].ItemNo)}
          onSave={(matrix) => {
            const itemNo = formData.Details[selectedDetailIndex].ItemNo;
            setPriceBreakdownMatrixData((prev) => {
              const newMap = new Map(prev);
              if (matrix) {
                newMap.set(itemNo, matrix);
              } else {
                newMap.delete(itemNo);
              }
              return newMap;
            });
            // Recalculate total
            setFormData((prev) => {
              const total = prev.Details.reduce((sum, detail) => {
                return sum + calculateLineTotal(detail);
              }, 0);
              return { ...prev, TotalAmount: total };
            });
            setShowPriceBreakdownPopup(false);
            setSelectedDetailIndex(-1);
          }}
          onClose={() => {
            setShowPriceBreakdownPopup(false);
            setSelectedDetailIndex(-1);
          }}
        />
      )}

      {/* Text Editor Popup */}
      {showTextEditorPopup && editingField && (
        <TextEditorPopup
          title={editingField.field === "PartName" ? "Part Description" : "Notes"}
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

      {/* Convert to Order Selection Dialog */}
      {showConvertToOrderDialog && (
        <div className="text-editor-popup-overlay" onClick={() => setShowConvertToOrderDialog(false)}>
          <div className="text-editor-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "800px" }}>
            <div className="text-editor-popup-header">
              <h3>Convert Quotation to Order - Select Items & Attachments</h3>
              <button type="button" className="btn-close" onClick={() => setShowConvertToOrderDialog(false)}>
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
                  onClick={() => {
                    const allItemNos = new Set(formData.Details.map(d => d.ItemNo));
                    setSelectedLineItems(allItemNos);
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#6366f1",
                    color: "white",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                    cursor: "pointer"
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
                    cursor: "pointer"
                  }}
                >
                  Deselect All
                </button>
                <span style={{ marginLeft: "auto", fontSize: "0.875rem", color: "#6b7280" }}>
                  {selectedLineItems.size} of {formData.Details.length} items selected
                </span>
              </div>

              <div style={{ maxHeight: "400px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, width: "50px" }}>
                        <input
                          type="checkbox"
                          checked={selectedLineItems.size === formData.Details.length && formData.Details.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              const allItemNos = new Set(formData.Details.map(d => d.ItemNo));
                              setSelectedLineItems(allItemNos);
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
                      const isSelected = selectedLineItems.has(detail.ItemNo);
                      const subtotal = detail.QtyOrdered * detail.UnitPrice;
                      const discountAmount = (subtotal * detail.Discount) / 100;
                      const lineTotal = subtotal - discountAmount;
                      
                      return (
                        <tr 
                          key={index} 
                          style={{ 
                            borderBottom: "1px solid #e5e7eb",
                            backgroundColor: isSelected ? "#f0f9ff" : "transparent"
                          }}
                        >
                          <td style={{ padding: "0.75rem" }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const newSelection = new Set(selectedLineItems);
                                if (e.target.checked) {
                                  newSelection.add(detail.ItemNo);
                                } else {
                                  newSelection.delete(detail.ItemNo);
                                }
                                setSelectedLineItems(newSelection);
                              }}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{detail.ItemNo}</td>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{detail.PartNo || "-"}</td>
                          <td style={{ padding: "0.75rem", fontSize: "0.875rem" }}>{getFirstLine(detail.PartName) || "-"}</td>
                          <td style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem" }}>{detail.QtyOrdered}</td>
                          <td style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem" }}>
                            ${detail.UnitPrice.toFixed(2)}
                          </td>
                          <td style={{ padding: "0.75rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 600 }}>
                            ${lineTotal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600, borderTop: "2px solid #e5e7eb" }}>
                      <td colSpan={6} style={{ padding: "0.75rem", textAlign: "right" }}>Selected Items Total:</td>
                      <td style={{ padding: "0.75rem", textAlign: "right" }}>
                        ${formData.Details
                          .filter(d => selectedLineItems.has(d.ItemNo))
                          .reduce((sum, detail) => {
                            const subtotal = detail.QtyOrdered * detail.UnitPrice;
                            const discountAmount = (subtotal * detail.Discount) / 100;
                            return sum + (subtotal - discountAmount);
                          }, 0)
                          .toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Attachments Section */}
              {attachments.length > 0 && (
                <>
                  <div style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>
                    <h4 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}>
                      Attachments
                    </h4>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={() => {
                          const allAttachmentIds = new Set(attachments.map(a => a.id));
                          setSelectedAttachments(allAttachmentIds);
                        }}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: "#6366f1",
                          color: "white",
                          border: "none",
                          borderRadius: "0.375rem",
                          fontSize: "0.875rem",
                          cursor: "pointer"
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
                          cursor: "pointer"
                        }}
                      >
                        Deselect All
                      </button>
                      <span style={{ marginLeft: "auto", fontSize: "0.875rem", color: "#6b7280" }}>
                        {selectedAttachments.size} of {attachments.length} attachments selected
                      </span>
                    </div>
                  </div>

                  <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.75rem" }}>
                    {attachments.length === 0 ? (
                      <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.875rem" }}>No attachments</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {attachments.map((attachment) => {
                          const isSelected = selectedAttachments.has(attachment.id);
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
                                cursor: "pointer"
                              }}
                              onClick={() => {
                                const newSelection = new Set(selectedAttachments);
                                if (isSelected) {
                                  newSelection.delete(attachment.id);
                                } else {
                                  newSelection.add(attachment.id);
                                }
                                setSelectedAttachments(newSelection);
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const newSelection = new Set(selectedAttachments);
                                  if (e.target.checked) {
                                    newSelection.add(attachment.id);
                                  } else {
                                    newSelection.delete(attachment.id);
                                  }
                                  setSelectedAttachments(newSelection);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ cursor: "pointer" }}
                              />
                              <span style={{ fontSize: "1.25rem" }}>📎</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#374151" }}>
                                  {attachment.name}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                                  {(attachment.size / 1024).toFixed(2)} KB
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="text-editor-popup-footer">
              <button type="button" className="btn-cancel" onClick={() => setShowConvertToOrderDialog(false)}>
                Cancel
              </button>
              <button 
                type="button" 
                className="btn-submit" 
                onClick={performConvertToOrder}
                disabled={selectedLineItems.size === 0}
              >
                Convert to Order ({selectedLineItems.size} items)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Slideout */}
      {showOrderSlideout && (
        <CustomerOrderSlideout
          orderId={selectedOrderId}
          onClose={() => {
            setShowOrderSlideout(false);
            setSelectedOrderId(0);
          }}
        />
      )}

      {/* Deletion Impact Dialog */}
      <DeletionImpactDialog
        isOpen={showDeletionDialog}
        entityName={`Quotation #${formData.PONumber || quotationId}`}
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

// Combined Price Breakdown Matrix Popup Component
interface PriceBreakdownMatrixPopupProps {
  detailIndex: number;
  detail: QuotationDetailReq;
  matrix: PriceBreakdownMatrix | undefined;
  onSave: (matrix: PriceBreakdownMatrix | null) => void;
  onClose: () => void;
}

const PriceBreakdownMatrixPopup: React.FC<PriceBreakdownMatrixPopupProps> = ({
  detailIndex,
  detail,
  matrix: initialMatrix,
  onSave,
  onClose,
}) => {
  const [priceBreakdowns, setPriceBreakdowns] = useState<PriceBreakdownMaster[]>([]);
  const [loading, setLoading] = useState(false);
  // Default quantities: [1, 3, 5, 10, 20] - first one (1) is non-editable
  const defaultQuantities = [1, 3, 5, 10, 20];
  const [quantities, setQuantities] = useState<number[]>(
    initialMatrix?.quantities && initialMatrix.quantities.length > 0 
      ? initialMatrix.quantities 
      : defaultQuantities
  );
  const [breakdownPrices, setBreakdownPrices] = useState<Array<{ priceBreakdownId: number; itemName: string; prices: number[] }>>(
    initialMatrix?.breakdownPrices || []
  );
  // Include in print flags - first column (index 0) always included, others default to true
  const [includeInPrint, setIncludeInPrint] = useState<boolean[]>(
    initialMatrix?.includeInPrint && initialMatrix.includeInPrint.length > 0
      ? initialMatrix.includeInPrint
      : quantities.map((_, idx) => idx === 0 ? true : true) // All included by default
  );
  // Store display values for numeric fields (as strings) to allow clearing
  const [numericDisplayValues, setNumericDisplayValues] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    loadPriceBreakdowns();
  }, []);

  useEffect(() => {
    if (initialMatrix) {
      // Handle both new format (quantities) and old format (quantityTiers) for backward compatibility
      let loadedQuantities: number[] = [];
      
      if (initialMatrix.quantities && initialMatrix.quantities.length > 0) {
        // New format: direct quantities array
        loadedQuantities = initialMatrix.quantities;
      } else if ((initialMatrix as any).quantityTiers && Array.isArray((initialMatrix as any).quantityTiers) && (initialMatrix as any).quantityTiers.length > 0) {
        // Old format: extract quantities from quantityTiers
        loadedQuantities = (initialMatrix as any).quantityTiers.map((tier: any) => tier.minQty || tier.MinQty || 1);
      }
      
      setQuantities(loadedQuantities.length > 0 ? loadedQuantities : defaultQuantities);
      setBreakdownPrices(initialMatrix.breakdownPrices || []);
      // Load includeInPrint flags, defaulting all to true if not present
      if (initialMatrix.includeInPrint && initialMatrix.includeInPrint.length > 0) {
        setIncludeInPrint(initialMatrix.includeInPrint);
      } else {
        setIncludeInPrint(loadedQuantities.length > 0 ? loadedQuantities.map((_, idx) => idx === 0 ? true : true) : defaultQuantities.map((_, idx) => idx === 0 ? true : true));
      }
    } else {
      // If no initial matrix, ensure default quantities are set
      if (quantities.length === 0) {
        setQuantities(defaultQuantities);
        setIncludeInPrint(defaultQuantities.map((_, idx) => idx === 0 ? true : true));
      }
    }
  }, [initialMatrix]);

  const loadPriceBreakdowns = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await PriceBreakdownService.GetPriceBreakdowns({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        const activeItems = result.filter(pb => pb.status === 1);
        setPriceBreakdowns(activeItems);
      }
    } catch (error) {
      console.error("Error loading price breakdowns:", error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize breakdown prices when price breakdowns are loaded and no matrix exists
  useEffect(() => {
    if (priceBreakdowns.length > 0 && breakdownPrices.length === 0 && !initialMatrix) {
      setBreakdownPrices(priceBreakdowns.map(item => ({
        priceBreakdownId: item.id,
        itemName: item.itemName,
        prices: quantities.map(() => 0),
      })));
    } else if (priceBreakdowns.length > 0 && breakdownPrices.length > 0) {
      // Ensure all price breakdown items are included
      const existingIds = new Set(breakdownPrices.map(bp => bp.priceBreakdownId));
      const missingItems = priceBreakdowns.filter(item => !existingIds.has(item.id));
      if (missingItems.length > 0) {
        setBreakdownPrices((prev) => [
          ...prev,
          ...missingItems.map(item => ({
            priceBreakdownId: item.id,
            itemName: item.itemName,
            prices: quantities.map(() => 0),
          })),
        ]);
      }
    }
  }, [priceBreakdowns.length, initialMatrix]);

  // Update breakdown prices when quantities change
  useEffect(() => {
    if (breakdownPrices.length > 0 && quantities.length > 0) {
      setBreakdownPrices((prev) => {
        return prev.map(bp => {
          // Adjust prices array length to match quantities
          const newPrices = [...bp.prices];
          while (newPrices.length < quantities.length) {
            newPrices.push(0);
          }
          while (newPrices.length > quantities.length) {
            newPrices.pop();
          }
          return { ...bp, prices: newPrices };
        });
      });
    }
    // Update includeInPrint array when quantities change
    if (quantities.length !== includeInPrint.length) {
      const newIncludeInPrint = [...includeInPrint];
      while (newIncludeInPrint.length < quantities.length) {
        newIncludeInPrint.push(true); // Default to included
      }
      while (newIncludeInPrint.length > quantities.length) {
        newIncludeInPrint.pop();
      }
      setIncludeInPrint(newIncludeInPrint);
    }
  }, [quantities.length, includeInPrint.length]);

  const handleAddQuantity = () => {
    const newQuantity = quantities.length > 0 ? Math.max(...quantities) + 1 : 1;
    setQuantities([...quantities, newQuantity]);
    
    // Add a zero price for this new quantity column to all breakdown items
    setBreakdownPrices((prev) => prev.map(bp => ({ ...bp, prices: [...bp.prices, 0] })));
    
    // Add includeInPrint flag for new column (default to true)
    setIncludeInPrint([...includeInPrint, true]);
  };

  const handleRemoveQuantity = (quantityIndex: number) => {
    // Only allow removing columns after the 5th (index >= 5)
    if (quantityIndex < 5) {
      return;
    }
    setQuantities(quantities.filter((_, i) => i !== quantityIndex));
    setBreakdownPrices((prev) => prev.map(bp => ({
      ...bp,
      prices: bp.prices.filter((_, i) => i !== quantityIndex),
    })));
  };

  const handleQuantityChange = (quantityIndex: number, value: number) => {
    const newQuantities = [...quantities];
    newQuantities[quantityIndex] = value >= 1 ? value : 1;
    setQuantities(newQuantities);
  };

  const handlePriceChange = (breakdownIndex: number, quantityIndex: number, value: number) => {
    const newBreakdownPrices = [...breakdownPrices];
    newBreakdownPrices[breakdownIndex] = {
      ...newBreakdownPrices[breakdownIndex],
      prices: newBreakdownPrices[breakdownIndex].prices.map((p, i) => i === quantityIndex ? value : p),
    };
    setBreakdownPrices(newBreakdownPrices);
  };

  const handleSave = () => {
    if (quantities.length === 0 && breakdownPrices.length === 0) {
      onSave(null);
      return;
    }
    
    // Create a mapping of original index to sorted index
    const sortedQuantities = [...quantities].sort((a, b) => a - b);
    const indexMap = quantities.map((qty, originalIdx) => ({
      originalIdx,
      sortedIdx: sortedQuantities.indexOf(qty),
      qty
    }));
    
    // Reorder prices arrays to match sorted quantities order
    const reorderedBreakdownPrices = breakdownPrices.map(bp => {
      const reorderedPrices = new Array(quantities.length);
      bp.prices.forEach((price, originalIdx) => {
        const mapping = indexMap.find(m => m.originalIdx === originalIdx);
        if (mapping) {
          reorderedPrices[mapping.sortedIdx] = price;
        }
      });
      return {
        ...bp,
        prices: reorderedPrices
      };
    });
    
    // Reorder includeInPrint flags to match sorted quantities
    const reorderedIncludeInPrint = new Array(quantities.length);
    includeInPrint.forEach((flag, originalIdx) => {
      const mapping = indexMap.find(m => m.originalIdx === originalIdx);
      if (mapping) {
        reorderedIncludeInPrint[mapping.sortedIdx] = flag;
      }
    });
    
    const matrix: PriceBreakdownMatrix = {
      quantities: sortedQuantities,
      breakdownPrices: reorderedBreakdownPrices,
      includeInPrint: reorderedIncludeInPrint,
    };
    
    onSave(matrix);
  };

  const handleReset = () => {
    // Clear all price values
    setBreakdownPrices((prev) => prev.map(bp => ({
      ...bp,
      prices: bp.prices.map(() => 0),
    })));
  };

  const handleTogglePrint = (columnIndex: number) => {
    // First column (index 0) cannot be toggled - always included
    if (columnIndex === 0) {
      return;
    }
    const newIncludeInPrint = [...includeInPrint];
    newIncludeInPrint[columnIndex] = !newIncludeInPrint[columnIndex];
    setIncludeInPrint(newIncludeInPrint);
  };

  // Calculate totals for each quantity column
  const getColumnTotals = (): number[] => {
    if (quantities.length === 0) return [];
    return quantities.map((_, quantityIndex) => {
      return breakdownPrices.reduce((sum, bp) => sum + (bp.prices[quantityIndex] || 0), 0);
    });
  };

  const columnTotals = getColumnTotals();

  return (
    <div className="price-breakdown-popup-overlay" onClick={onClose}>
      <div className="price-breakdown-popup" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90%", maxHeight: "90vh", overflow: "auto" }}>
        <div className="price-breakdown-popup-header">
          <h3>Price Breakdown Matrix - {detail.PartNo || `Item #${detail.ItemNo}`}</h3>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="price-breakdown-popup-content">
          <div style={{ marginBottom: "1rem", padding: "0.75rem", backgroundColor: "#f0f9ff", borderRadius: "0.5rem" }}>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              <strong>Default Unit Price:</strong> ${detail.UnitPrice.toFixed(2)} (used when no matrix is defined)
            </p>
          </div>

          {/* Quantity Columns Section - Quantities are edited directly in grid headers */}
          {quantities.length === 0 && (
            <div style={{ marginBottom: "1rem", padding: "1rem", backgroundColor: "#fef3c7", borderRadius: "0.5rem", border: "1px solid #fbbf24" }}>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "#92400e" }}>
                <strong>Note:</strong> Add quantity columns by clicking "+ Add Quantity Column" below. You can edit quantities directly in the grid column headers.
              </p>
            </div>
          )}

          {/* Price Breakdown Grid */}
          {loading ? (
            <div style={{ padding: "2rem", textAlign: "center" }}>Loading price breakdown items...</div>
          ) : priceBreakdowns.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>
              No price breakdown items available. Please create price breakdown items in the master.
            </div>
          ) : (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Price Breakdown Grid</h4>
                <button
                  type="button"
                  onClick={handleAddQuantity}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#6366f1",
                    color: "white",
                    border: "none",
                    borderRadius: "0.375rem",
                    cursor: "pointer",
                    fontSize: "0.875rem",
                  }}
                >
                  + Add Quantity Column
                </button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                      <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600, position: "sticky", left: 0, backgroundColor: "#f3f4f6" }}>
                        Price Breakdown Item
                      </th>
                      {quantities
                        .map((qty, idx) => ({ qty, idx }))
                        .sort((a, b) => a.qty - b.qty)
                        .map(({ qty: quantity, idx: originalIndex }, quantityIndex) => {
                          const isFirstColumn = quantity === 1 && quantityIndex === 0;
                          // Can remove columns after the 5th (originalIndex >= 5)
                          const canRemove = quantities.length > 5 && originalIndex >= 5;
                          return (
                            <th key={quantityIndex} style={{ padding: "0.5rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600, minWidth: "140px", position: "relative" }}>
                              {canRemove && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveQuantity(originalIndex)}
                                  style={{
                                    position: "absolute",
                                    top: "0.25rem",
                                    right: "0.25rem",
                                    width: "18px",
                                    height: "18px",
                                    padding: 0,
                                    backgroundColor: "transparent",
                                    color: "#6b7280",
                                    border: "none",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                    lineHeight: "1",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    borderRadius: "2px",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "#ef4444";
                                    e.currentTarget.style.backgroundColor = "#fee2e2";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "#6b7280";
                                    e.currentTarget.style.backgroundColor = "transparent";
                                  }}
                                  title="Remove column"
                                >
                                  ×
                                </button>
                              )}
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                                {/* Quantity input/display - all at same height */}
                                <div style={{ height: "2.5rem", display: "flex", alignItems: "center" }}>
                                  {isFirstColumn ? (
                                    <div
                                      style={{ 
                                        width: "100%", 
                                        textAlign: "right", 
                                        fontWeight: 600,
                                        padding: "0.5rem",
                                        fontSize: "0.875rem",
                                        border: "1px solid #d1d5db",
                                        borderRadius: "0.25rem",
                                        backgroundColor: "#f3f4f6",
                                        color: "#374151",
                                        minWidth: "100px",
                                        height: "2.5rem",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "flex-end"
                                      }}
                                    >
                                      {quantity}
                                    </div>
                                  ) : (
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className="form-input no-spinner"
                                      style={{ 
                                        width: "100%", 
                                        textAlign: "right", 
                                        fontWeight: 600,
                                        padding: "0.5rem",
                                        fontSize: "0.875rem",
                                        border: "1px solid #d1d5db",
                                        borderRadius: "0.25rem",
                                        minWidth: "100px",
                                        height: "2.5rem"
                                      }}
                                      value={numericDisplayValues.get(`qty-col-${originalIndex}`) ?? (quantity === 1 ? "" : quantity.toString())}
                                      onChange={(e) => {
                                        const inputVal = e.target.value.replace(/[^0-9]/g, '');
                                        // Update display value immediately
                                        setNumericDisplayValues(prev => {
                                          const newMap = new Map(prev);
                                          if (inputVal === "") {
                                            newMap.set(`qty-col-${originalIndex}`, "");
                                            handleQuantityChange(originalIndex, 1);
                                          } else {
                                            newMap.set(`qty-col-${originalIndex}`, inputVal);
                                            const val = parseInt(inputVal);
                                            if (!isNaN(val) && val >= 1) {
                                              handleQuantityChange(originalIndex, val);
                                            }
                                          }
                                          return newMap;
                                        });
                                      }}
                                      onBlur={(e) => {
                                        // Convert empty to 1 only on blur (first column minimum) and clear display value
                                        const val = e.target.value === "" ? 1 : parseInt(e.target.value) || 1;
                                        handleQuantityChange(originalIndex, val);
                                        setNumericDisplayValues(prev => {
                                          const newMap = new Map(prev);
                                          newMap.delete(`qty-col-${originalIndex}`);
                                          return newMap;
                                        });
                                      }}
                                      min="1"
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  )}
                                </div>
                                {/* Print toggle - positioned below, doesn't affect alignment */}
                                <label style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.25rem", fontSize: "0.75rem", cursor: "pointer", marginTop: "0.25rem" }}>
                                  <input
                                    type="checkbox"
                                    checked={includeInPrint[originalIndex] !== false}
                                    onChange={() => handleTogglePrint(originalIndex)}
                                    style={{ cursor: "pointer" }}
                                  />
                                  <span style={{ color: "#6b7280" }}>Include in Print</span>
                                </label>
                              </div>
                            </th>
                          );
                        })}
                    </tr>
                  </thead>
                  <tbody>
                    {priceBreakdowns.map((item) => {
                      let breakdownIndex = breakdownPrices.findIndex(bp => bp.priceBreakdownId === item.id);
                      
                      // Ensure this breakdown item exists
                      if (breakdownIndex === -1) {
                        const newBreakdown = {
                          priceBreakdownId: item.id,
                          itemName: item.itemName,
                          prices: quantities.map(() => 0),
                        };
                        setBreakdownPrices((prev) => [...prev, newBreakdown]);
                        breakdownIndex = breakdownPrices.length; // Will be updated on next render
                      }
                      
                      const currentBreakdown = breakdownIndex >= 0 ? breakdownPrices[breakdownIndex] : null;
                      const prices = currentBreakdown ? currentBreakdown.prices : quantities.map(() => 0);
                      
                      return (
                        <tr key={item.id}>
                          <td style={{ padding: "0.75rem", fontWeight: 600, position: "sticky", left: 0, backgroundColor: "#ffffff" }}>
                            {item.itemName}
                          </td>
                          {quantities
                            .map((qty, idx) => ({ qty, idx }))
                            .sort((a, b) => a.qty - b.qty)
                            .map(({ qty: quantity, idx: originalIndex }, sortedIndex) => {
                              const currentBreakdownIndex = breakdownPrices.findIndex(bp => bp.priceBreakdownId === item.id);
                              const currentPrice = currentBreakdownIndex >= 0 
                                ? (breakdownPrices[currentBreakdownIndex].prices[originalIndex] || 0)
                                : 0;
                              
                              return (
                                <td key={originalIndex} style={{ padding: "0.5rem" }}>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    className="form-input no-spinner"
                                    style={{ width: "100%", minWidth: "100px", textAlign: "right", padding: "0.5rem" }}
                                    value={numericDisplayValues.get(`price-${item.id}-${originalIndex}`) ?? (currentPrice === 0 ? "" : currentPrice.toString())}
                                    onChange={(e) => {
                                      const inputVal = e.target.value.replace(/[^0-9.]/g, '').replace(/\./g, (match, offset, string) => {
                                        return string.indexOf('.') === offset ? match : '';
                                      });
                                      // Update display value immediately
                                      setNumericDisplayValues(prev => {
                                        const newMap = new Map(prev);
                                        if (inputVal === "" || inputVal === ".") {
                                          newMap.set(`price-${item.id}-${originalIndex}`, inputVal);
                                          const val = 0;
                                          const idx = breakdownPrices.findIndex(bp => bp.priceBreakdownId === item.id);
                                          if (idx >= 0) {
                                            handlePriceChange(idx, originalIndex, val);
                                          }
                                        } else {
                                          newMap.set(`price-${item.id}-${originalIndex}`, inputVal);
                                          const val = parseFloat(inputVal);
                                          if (!isNaN(val) && val >= 0) {
                                            const idx = breakdownPrices.findIndex(bp => bp.priceBreakdownId === item.id);
                                            if (idx >= 0) {
                                              handlePriceChange(idx, originalIndex, val);
                                            } else {
                                              // Initialize this breakdown item
                                              const newBreakdown = {
                                                priceBreakdownId: item.id,
                                                itemName: item.itemName,
                                                prices: quantities.map((_, i) => i === originalIndex ? val : 0),
                                              };
                                              setBreakdownPrices((prev) => [...prev, newBreakdown]);
                                            }
                                          }
                                        }
                                        return newMap;
                                      });
                                    }}
                                    onBlur={(e) => {
                                      // Convert empty to 0 only on blur and clear display value
                                      const val = e.target.value === "" || e.target.value === "." ? 0 : parseFloat(e.target.value) || 0;
                                      const idx = breakdownPrices.findIndex(bp => bp.priceBreakdownId === item.id);
                                      if (idx >= 0) {
                                        handlePriceChange(idx, originalIndex, val);
                                      }
                                      setNumericDisplayValues(prev => {
                                        const newMap = new Map(prev);
                                        newMap.delete(`price-${item.id}-${originalIndex}`);
                                        return newMap;
                                      });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Tab" && !e.shiftKey) {
                                        // Tab: Move down to next row in same column
                                        e.preventDefault();
                                        const currentRowIndex = priceBreakdowns.findIndex(pb => pb.id === item.id);
                                        if (currentRowIndex < priceBreakdowns.length - 1) {
                                          const nextRow = priceBreakdowns[currentRowIndex + 1];
                                          const nextInput = document.querySelector(
                                            `input[data-row-id="${nextRow.id}"][data-column-index="${originalIndex}"]`
                                          ) as HTMLInputElement;
                                          if (nextInput) {
                                            nextInput.focus();
                                            nextInput.select();
                                          }
                                        }
                                      } else if (e.key === "Tab" && e.shiftKey) {
                                        // Shift+Tab: Move up to previous row in same column
                                        e.preventDefault();
                                        const currentRowIndex = priceBreakdowns.findIndex(pb => pb.id === item.id);
                                        if (currentRowIndex > 0) {
                                          const prevRow = priceBreakdowns[currentRowIndex - 1];
                                          const prevInput = document.querySelector(
                                            `input[data-row-id="${prevRow.id}"][data-column-index="${originalIndex}"]`
                                          ) as HTMLInputElement;
                                          if (prevInput) {
                                            prevInput.focus();
                                            prevInput.select();
                                          }
                                        }
                                      }
                                    }}
                                    data-row-id={item.id}
                                    data-column-index={originalIndex}
                                    placeholder="0.00"
                                  />
                                </td>
                              );
                            })}
                        </tr>
                      );
                    })}
                    {/* Total Row */}
                    <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600, borderTop: "2px solid #e5e7eb" }}>
                      <td style={{ padding: "0.75rem", position: "sticky", left: 0, backgroundColor: "#f9fafb" }}>
                        <strong>Total Unit Price</strong>
                      </td>
                      {quantities
                        .map((qty, idx) => ({ qty, idx }))
                        .sort((a, b) => a.qty - b.qty)
                        .map(({ qty: quantity, idx: originalIndex }) => {
                          return (
                            <td key={originalIndex} style={{ padding: "0.75rem", textAlign: "right", color: "#6366f1" }}>
                              <strong>${columnTotals[originalIndex]?.toFixed(2) || "0.00"}</strong>
                            </td>
                          );
                        })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="price-breakdown-popup-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button 
            type="button" 
            onClick={handleReset}
            style={{
              padding: "0.625rem 1rem",
              color: "#dc2626",
              background: "#ffffff",
              border: "1px solid #dc2626",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#fee2e2";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#ffffff";
            }}
          >
            Reset
          </button>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-submit" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
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

export default CustomerQuotationSlideout;

