import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  OrderService,
  OrderMasterReq,
  OrderDetailReq,
} from "../../Common/Services/OrderService";
import { PdfService } from "../../Common/Services/PdfService";
import { JobOrderService } from "../../Common/Services/JobOrderService";
import { CustomerService } from "../../Common/Services/CustomerService";
import { CustomerPartOption } from "../../Common/Services/ProductMasterService";
import { ShippingService, ShippableItem, Shipment } from "../../Common/Services/ShippingService";
import { InvoiceService, InvoiceableItem, Invoice } from "../../Common/Services/InvoiceService";
import JobOrderSlideout from "../JobOrders/JobOrderSlideout";
import ShippingModal from "./ShippingModal";
import InvoiceModal from "./InvoiceModal";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import CustomerPartCombobox, { formatPartHistoryHint } from "../../Common/Components/CustomerPartCombobox";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import {
  todayDateOnlyDisplay,
  toHtmlDateInputValue,
  fromHtmlDateInputValue,
} from "../../Common/Utils/Formatting";
import "./CustomerOrderSlideout.scss";

interface CustomerOrderSlideoutProps {
  orderId: number;
  onClose: (refreshList?: boolean) => void;
  onSaved?: (orderId: number) => void;
}

const CustomerOrderSlideout: React.FC<CustomerOrderSlideoutProps> = ({
  orderId,
  onClose,
  onSaved,
}) => {
  const [formData, setFormData] = useState<OrderMasterReq>({
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
    QuotationId: undefined,
    QuotationNo: "",
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
  const [showTextEditorPopup, setShowTextEditorPopup] = useState(false);
  const [editingField, setEditingField] = useState<{ index: number; field: "PartName" | "Notes"; value: string } | null>(null);
  const [attachments, setAttachments] = useState<Array<{ id: number; name: string; size: number; fileUrl?: string }>>([]);
  const [attachmentIdCounter, setAttachmentIdCounter] = useState(1);
  const [comments, setComments] = useState<Array<{ id: number; text: string; createdAt: string; createdBy: string }>>([]);
  const [newComment, setNewComment] = useState("");
  const [commentIdCounter, setCommentIdCounter] = useState(1);
  // Store display values for numeric fields (as strings) to allow clearing
  const [numericDisplayValues, setNumericDisplayValues] = useState<Map<string, string>>(new Map());
  const [partHistoryByRow, setPartHistoryByRow] = useState<Map<number, CustomerPartOption | null>>(new Map());
  const [repeatingLastOrder, setRepeatingLastOrder] = useState(false);
  const [showJobOrderSlideout, setShowJobOrderSlideout] = useState(false);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState<number>(0);
  const [jobOrderDetailIds, setJobOrderDetailIds] = useState<Map<number, number>>(new Map()); // Map of detail ID to job order ID
  const listNeedsRefreshRef = useRef(false);

  // Shipping related state
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [shippableItems, setShippableItems] = useState<ShippableItem[]>([]);
  const [selectedShippingItems, setSelectedShippingItems] = useState<ShippableItem[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shipments, setShipments] = useState<Shipment[]>([]);

  // Invoice related state
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceableItems, setInvoiceableItems] = useState<InvoiceableItem[]>([]);
  const [selectedInvoiceItems, setSelectedInvoiceItems] = useState<InvoiceableItem[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  
  // Default unit options for combobox
  const defaultUnitOptions = [
    "EA", "PC", "PCS", "SET", "PKG", "BOX", "PALLET",
    "LB", "KG", "OZ", "FT", "IN", "M", "YD", "CM",
    "GAL", "L", "QT", "HR", "DAY", "ROLL", "REEL", "BAG"
  ];
  
  // Function to get all available units (defaults + units from current order's line items)
  const getAllUnitOptions = (): string[] => {
    // Extract unique units from current order's line items
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
    const slideoutContent = document.querySelector('.customer-order-slideout-content');
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
    const today = todayDateOnlyDisplay();
    
    setFormData((prev) => {
      // If it's a new order (orderId === 0) and no details exist, add one default line item
      const defaultDetail: OrderDetailReq = {
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
        DiscountType: "Percent",
        ProductId: undefined,
        LeadTime: today,
        Notes: "",
        ShippedQty: 0,
        ShippingStatus: "Not Started",
        InvoicedQty: 0,
        InvoiceStatus: "Not Invoiced",
      };

      return {
        ...prev,
        Tenantid: storage?.tenantID || 0,
        UserId: storage?.userId || 0,
        UserToken: storage?.userToken || 0,
        ...(orderId === 0
          ? {
              OrderDate: prev.OrderDate || today,
              Details: prev.Details.length === 0 ? [defaultDetail] : prev.Details,
            }
          : {}),
      };
    });

    loadCustomers();

    if (orderId > 0) {
      loadOrder(orderId);
    }
  }, [orderId]);

  useEffect(() => {
    setPartHistoryByRow(new Map());
  }, [formData.CustomerID]);

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

  const loadOrder = async (targetOrderId?: number) => {
    const idToLoad = targetOrderId ?? orderId;
    if (!idToLoad || idToLoad <= 0) return;
    setLoading(true);
    try {
      const order = await OrderService.GetOrderById(idToLoad);
      if (!order) {
        return;
      }

      setFormData(order);

      if (order.Attachments && Array.isArray(order.Attachments) && order.Attachments.length > 0) {
        const cleanedAttachments = order.Attachments.map((a) => {
          let id = Math.floor(a.id || 0);
          const MAX_INT32 = 2147483647;
          if (id > MAX_INT32) {
            id = id % MAX_INT32;
          }
          return {
            id,
            name: a.name || "",
            size: a.size || 0,
            fileUrl: a.fileUrl || "",
          };
        });
        setAttachments(cleanedAttachments);
        setAttachmentIdCounter(Math.max(...cleanedAttachments.map((a) => a.id), 0) + 1);
      } else {
        setAttachments([]);
        setAttachmentIdCounter(1);
      }

      if (order.Comments && Array.isArray(order.Comments) && order.Comments.length > 0) {
        const cleanedComments = order.Comments.map((c) => {
          let id = Math.floor(c.id || 0);
          const MAX_INT32 = 2147483647;
          if (id > MAX_INT32) {
            id = id % MAX_INT32;
          }
          return {
            id,
            text: c.text || "",
            createdAt: c.createdAt || new Date().toISOString(),
            createdBy: c.createdBy || "User",
          };
        });
        setComments(cleanedComments);
        setCommentIdCounter(Math.max(...cleanedComments.map((c) => c.id), 0) + 1);
      } else {
        setComments([]);
        setCommentIdCounter(1);
      }

      setIsStateChanged(false);
      // Show header/lines immediately; related data loads in parallel below
      setLoading(false);

      if (order.Details && order.Details.length > 0) {
        const [jobOrders, shippable, shipmentsData, invoiceable, invoicesData] =
          await Promise.all([
            JobOrderService.GetJobOrdersByCustomerOrder(order.OrderID).catch((err) => {
              console.error("Error loading job orders:", err);
              return null;
            }),
            ShippingService.GetShippableItems(order.OrderID).catch((err) => {
              console.error("Error loading shippable items:", err);
              return null;
            }),
            ShippingService.GetShipments(order.OrderID).catch((err) => {
              console.error("Error loading shipments:", err);
              return null;
            }),
            InvoiceService.GetInvoiceableItems(order.OrderID).catch((err) => {
              console.error("Error loading invoiceable items:", err);
              return null;
            }),
            InvoiceService.GetInvoices(order.OrderID).catch((err) => {
              console.error("Error loading invoices:", err);
              return null;
            }),
          ]);

        if (jobOrders) {
          const detailIdMap = new Map<number, number>();
          jobOrders.forEach((jo) => {
            if (jo.customerOrderDetailID > 0 && jo.jobOrderID > 0) {
              detailIdMap.set(jo.customerOrderDetailID, jo.jobOrderID);
            }
          });
          setJobOrderDetailIds(detailIdMap);
        }

        if (shippable) {
          setShippableItems(shippable);
        }
        if (shipmentsData) {
          setShipments(shipmentsData);
        }
        if (invoiceable) {
          setInvoiceableItems(invoiceable);
        } else {
          setInvoiceableItems([]);
        }
        if (invoicesData) {
          setInvoices(invoicesData);
        } else {
          setInvoices([]);
        }
      }
    } catch (error: any) {
      console.error("Error loading order:", error);
      toast.error(`Error loading order: ${error.message || "Unknown error"}`);
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof OrderMasterReq, value: any) => {
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

  const applyCustomerPart = (index: number, part: CustomerPartOption) => {
    setFormData((prev) => {
      const newDetails = [...prev.Details];
      const current = newDetails[index];
      if (!current) return prev;
      newDetails[index] = {
        ...current,
        PartNo: part.partNo,
        PartName: part.partName || current.PartName,
        Unit: part.unit || current.Unit || "EA",
        UnitPrice: part.unitPrice > 0 ? part.unitPrice : current.UnitPrice,
        ProductId: part.productId ?? current.ProductId,
        QtyOrdered:
          part.suggestedQty && part.suggestedQty > 0
            ? part.suggestedQty
            : current.QtyOrdered || 1,
      };
      const total = newDetails.reduce((sum, d) => sum + calculateLineTotal(d), 0);
      return { ...prev, Details: newDetails, TotalAmount: total };
    });
    setLineItemErrors((prev) => {
      const newMap = new Map(prev);
      const itemErrors = newMap.get(index);
      if (itemErrors) {
        delete itemErrors.PartNo;
        delete itemErrors.PartName;
        if (Object.keys(itemErrors).length === 0) newMap.delete(index);
        else newMap.set(index, itemErrors);
      }
      return newMap;
    });
    setPartHistoryByRow((prev) => {
      const next = new Map(prev);
      next.set(index, part);
      return next;
    });
    setIsStateChanged(true);
  };

  const handleRepeatLastOrder = async () => {
    if (!formData.CustomerID || formData.CustomerID <= 0) {
      toast.error("Select a customer first");
      return;
    }
    setRepeatingLastOrder(true);
    try {
      const result = await OrderService.GetLastOrderLinesByCustomer(formData.CustomerID);
      if (!result.found || result.lines.length === 0) {
        toast.info("No previous order found for this customer");
        return;
      }

      const today = new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "2-digit",
      });

      const formatDue = (raw: string) => {
        if (!raw) return today;
        try {
          const d = new Date(raw);
          if (isNaN(d.getTime())) return today;
          return d.toLocaleDateString("en-US", {
            month: "2-digit",
            day: "2-digit",
            year: "2-digit",
          });
        } catch {
          return today;
        }
      };

      const blankOnly =
        formData.Details.length === 0 ||
        (formData.Details.length === 1 &&
          !formData.Details[0].PartNo?.trim() &&
          !formData.Details[0].PartName?.trim());

      const newLines: OrderDetailReq[] = result.lines.map((l, i) => ({
        ID: 0,
        ItemNo: i + 1,
        PartName: l.partName,
        PartNo: l.partNo,
        DueDate: formatDue(l.dueDate),
        JobNumber: "",
        JobDesc: "",
        QtyOrdered: l.qtyOrdered || 1,
        Unit: l.unit || "EA",
        UnitPrice: l.unitPrice || 0,
        JobPriority: 0,
        Discount: l.discount || 0,
        DiscountType: l.discountType === "Amount" ? "Amount" : "Percent",
        ProductId: l.productId,
        LeadTime: formatDue(l.leadTime) || today,
        Notes: l.notes || "",
        ShippedQty: 0,
        ShippingStatus: "Not Started",
        InvoicedQty: 0,
        InvoiceStatus: "Not Invoiced",
      }));

      setFormData((prev) => {
        const Details = blankOnly
          ? newLines
          : [
              ...prev.Details,
              ...newLines.map((l, i) => ({
                ...l,
                ItemNo:
                  (prev.Details.length > 0
                    ? Math.max(...prev.Details.map((d) => d.ItemNo))
                    : 0) +
                  i +
                  1,
              })),
            ];
        const TotalAmount = Details.reduce((sum, d) => sum + calculateLineTotal(d), 0);
        return { ...prev, Details, TotalAmount };
      });
      setPartHistoryByRow(new Map());
      setIsStateChanged(true);

      const orderLabel =
        result.orderNumber < 1000
          ? `CO#${result.orderNumber + 999}`
          : `CO#${result.orderNumber}`;
      toast.success(
        `Added ${result.lines.length} line(s) from ${orderLabel}${
          result.orderDate ? ` (${result.orderDate})` : ""
        }`
      );
    } catch (error: any) {
      console.error("Error repeating last order:", error);
      toast.error(error?.message || "Failed to load last order");
    } finally {
      setRepeatingLastOrder(false);
    }
  };

  const handleDetailChange = (index: number, field: keyof OrderDetailReq, value: any) => {
    setFormData((prev) => {
      const newDetails = [...prev.Details];
      newDetails[index] = { ...newDetails[index], [field]: value };

      // Recalculate total using Percent/Amount-aware line totals
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
      const newDetail: OrderDetailReq = {
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
        DiscountType: "Percent",
        ProductId: undefined,
        LeadTime: today,
        Notes: "",
        ShippedQty: 0,
        ShippingStatus: "Not Started",
        InvoicedQty: 0,
        InvoiceStatus: "Not Invoiced",
      };

      return {
        ...prev,
        Details: [...prev.Details, newDetail],
      };
    });
    setIsStateChanged(true);
  };

  const handleDeleteDetail = (index: number) => {
    const detail = formData.Details[index];

    // Check if this line item has an associated Job Order
    const hasJobOrder = detail.ID > 0 && jobOrderDetailIds.has(detail.ID);

    let confirmed = false;

    if (hasJobOrder) {
      // Cascade delete warning for line items with associated Job Orders
      confirmed = window.confirm(
        `This line item has an associated Job Order. Deleting this line item will affect the related Job Order.\n\nAre you sure you want to delete this line item?`
      );
    } else {
      // Normal confirmation for line items without Job Orders
      confirmed = window.confirm("Are you sure you want to delete this line item?");
    }

    if (!confirmed) return;

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

  const handleCreateJobOrder = async (detail: OrderDetailReq, detailIndex: number) => {
    if (!detail.ID || detail.ID === 0) {
      toast.error("Please save the order first before creating a job order");
      return;
    }

    if (jobOrderDetailIds.has(detail.ID)) {
      // Job order already exists, open it
      const jobOrderId = jobOrderDetailIds.get(detail.ID);
      if (jobOrderId) {
        setSelectedJobOrderId(jobOrderId);
        setShowJobOrderSlideout(true);
      }
      return;
    }

    if (!window.confirm(`Create a job order for this line item (Item #${detail.ItemNo})?`)) {
      return;
    }

    setLoading(true);
    try {
      const result = await JobOrderService.CreateJobOrderFromOrderDetail(formData.OrderID, detail.ID);
      if (result && result.id > 0) {
        toast.success(`Job order created successfully! Job Order #: JO#${result.id < 1000 ? result.id + 999 : result.id}`);
        listNeedsRefreshRef.current = true;
        // Update the map to track this job order
        setJobOrderDetailIds(prev => {
          const newMap = new Map(prev);
          newMap.set(detail.ID, result.id);
          return newMap;
        });
        // Open the job order slideout
        setSelectedJobOrderId(result.id);
        setShowJobOrderSlideout(true);
      } else {
        toast.error("Failed to create job order");
      }
    } catch (error: any) {
      console.error("Error creating job order:", error);
      toast.error(`Error creating job order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to check if job order is completed (case-insensitive)
  const isJobOrderCompleted = (status: string | undefined | null): boolean => {
    if (!status) {
      return false;
    }
    return status.trim().toLowerCase() === "completed";
  };

  // Shipping functions
  const handleShipItem = (item: ShippableItem) => {
    if (item.availableQty <= 0) {
      toast.warning(`No available quantity to ship for ${item.partNo}`);
      return;
    }
    if (item.hasJobOrder && !isJobOrderCompleted(item.jobOrderStatus)) {
      toast.warning(`Job Order for ${item.partNo} is not completed yet`);
      return;
    }
    setSelectedShippingItems([item]);
    setShowShippingModal(true);
  };

  const handleBatchShip = () => {
    const readyItems = shippableItems.filter(item =>
      item.availableQty > 0 && (!item.hasJobOrder || isJobOrderCompleted(item.jobOrderStatus))
    );
    if (readyItems.length === 0) {
      toast.warning("No items are ready to ship.");
      return;
    }
    setSelectedShippingItems(readyItems);
    setShowShippingModal(true);
  };

  const handleShipmentCreated = async () => {
    try {
      const id = formData.OrderID > 0 ? formData.OrderID : orderId;
      listNeedsRefreshRef.current = true;
      await loadOrder(id);
      toast.success("Order updated with new shipping information");
    } catch (error) {
      console.error("Error refreshing data after shipment:", error);
      toast.error("Shipment created but failed to refresh data");
    }
  };

  const handleDeleteShipment = async (shipmentId: number) => {
    if (!window.confirm("Are you sure you want to delete this shipment? This will update the shipped quantities for the affected line items.")) {
      return;
    }

    try {
      await ShippingService.DeleteShipment(shipmentId);
      toast.success("Shipment deleted successfully");
      // Refresh data after deletion
      await handleShipmentCreated();
    } catch (error: any) {
      console.error("Error deleting shipment:", error);
      const errorMessage = error.response?.data?.error || error.message || "Unknown error occurred";
      toast.error(`Failed to delete shipment: ${errorMessage}`);
    }
  };

  // Invoice functions
  const handleInvoiceItem = (item: InvoiceableItem) => {
    if (item.availableQty <= 0) {
      toast.warning(`No available quantity to invoice for ${item.partNo}`);
      return;
    }
    setSelectedInvoiceItems([item]);
    setShowInvoiceModal(true);
  };

  const handleBatchInvoice = () => {
    const readyItems = invoiceableItems.filter(item =>
      item.availableQty > 0 && (!item.hasJobOrder || isJobOrderCompleted(item.jobOrderStatus))
    );
    if (readyItems.length === 0) {
      const itemsWithQty = invoiceableItems.filter(item => item.availableQty > 0);
      if (itemsWithQty.length > 0) {
        toast.warning(`No items are ready to invoice. ${itemsWithQty.length} item(s) have available quantity but job orders are not completed.`);
      } else {
        toast.warning("No items are ready to invoice. No items have available quantity to invoice.");
      }
      return;
    }
    setSelectedInvoiceItems(readyItems);
    setShowInvoiceModal(true);
  };

  const handleInvoiceCreated = async () => {
    try {
      const id = formData.OrderID > 0 ? formData.OrderID : orderId;
      listNeedsRefreshRef.current = true;
      await loadOrder(id);
      toast.success("Order updated with new invoice information");
    } catch (error) {
      console.error("Error refreshing data after invoice:", error);
      toast.error("Invoice created but failed to refresh data");
    }
  };

  const handleDeleteInvoice = async (invoiceId: number) => {
    if (!window.confirm("Are you sure you want to delete this invoice? This will update the invoiced quantities for the affected line items.")) {
      return;
    }

    try {
      await InvoiceService.DeleteInvoice(invoiceId);
      toast.success("Invoice deleted successfully");
      // Refresh data after deletion
      await handleInvoiceCreated();
    } catch (error: any) {
      console.error("Error deleting invoice:", error);
      const errorMessage = error.response?.data?.error || error.message || "Unknown error occurred";
      toast.error(`Failed to delete invoice: ${errorMessage}`);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const newLineItemErrors = new Map<number, { [field: string]: string }>();

    // Validate header fields
    if (!formData.CustomerID || formData.CustomerID <= 0) {
      newErrors.CustomerID = "Customer is required";
    }

    if (!formData.OrderDate) {
      newErrors.OrderDate = "Order date is required";
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

        // DueDate/LeadTime validation - only for NEW orders or NEW line items
        // Existing orders/line items may have past dates from when they were created
        // and already have jobs/shipments associated with them
        const estDate = detail.LeadTime || detail.DueDate;
        if (estDate) {
          // Only validate date for new orders or new line items
          const isNewOrder = (formData.OrderID > 0 ? formData.OrderID : orderId) === 0;
          const isNewLineItem = detail.ID === 0;
          
          if (isNewOrder || isNewLineItem) {
            try {
              const dateValue = new Date(estDate);
              const today = new Date();
              today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
              dateValue.setHours(0, 0, 0, 0);
              if (dateValue < today) {
                itemErrors.DueDate = "Due Date cannot be earlier than today";
              }
            } catch (e) {
              // Invalid date format - ignore for now, or add validation if needed
            }
          }
          // For existing orders/line items, skip date validation
          // They may have been created in the past and already have jobs/shipments
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
      const formDataToSave: OrderMasterReq = {
        ...formData,
        Attachments: attachments || [],
        Comments: comments || [],
      };
      
      // Validate that we have the minimum required data
      if (!formDataToSave.CustomerID || formDataToSave.CustomerID <= 0) {
        toast.error("Customer is required");
        setLoading(false);
        return;
      }
      
      if (!formDataToSave.OrderDate) {
        toast.error("Order date is required");
        setLoading(false);
        return;
      }
      
      const result = await OrderService.SaveOrder(formDataToSave);
      toast.success("Order saved successfully");

      const savedId = result.id > 0 ? result.id : formDataToSave.OrderID;
      if (savedId > 0) {
        const wasNew = orderId === 0;
        listNeedsRefreshRef.current = true;
        setFormData((prev) => ({
          ...prev,
          OrderID: savedId,
          ...(result.poNumber ? { PONumber: result.poNumber } : {}),
        }));
        if (wasNew) {
          // Parent updates orderId → useEffect loads once (avoid double full reload)
          onSaved?.(savedId);
        } else {
          await loadOrder(savedId);
        }
      }

      setIsStateChanged(false);
      // Don't close the slideout - keep it open for further editing
    } catch (error: any) {
      console.error("Error saving order:", error);
      toast.error(`Error saving order: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (isStateChanged) {
      if (window.confirm("You have unsaved changes. Are you sure you want to cancel?")) {
        onClose(listNeedsRefreshRef.current);
      }
    } else {
      onClose(listNeedsRefreshRef.current);
    }
  };

  const handlePrint = async () => {
    if (!formData.CustomerID || formData.Details.length === 0) {
      toast.error("Please ensure the order has a customer and at least one line item before printing");
      return;
    }

    try {
      const orderNumber = formData.PONumber < 1000 
        ? `CO#${formData.PONumber + 999}` 
        : `CO#${formData.PONumber}`;

      // Generate PDF using API
      const blob = await PdfService.GenerateOrder(formData.OrderID > 0 ? formData.OrderID : orderId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Order_${orderNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      toast.success("Order PDF generated successfully");
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast.error(`Error generating PDF: ${error.message || "Unknown error"}`);
    }
  };

  const refreshDeletionImpact = async () => {
    try {
      const response = await OrderService.CheckOrderDeletionImpact(orderId);
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
      const response = await OrderService.CheckOrderDeletionImpact(orderId);
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

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    try {
      // Extract the service and method from the endpoint
      if (deleteEndpoint.includes('/Invoice/DeleteInvoice')) {
        await InvoiceService.DeleteInvoice(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else if (deleteEndpoint.includes('/Shipping/DeleteShipment')) {
        await ShippingService.DeleteShipment(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else if (deleteEndpoint.includes('/JobOrder/DeleteJobOrder')) {
        await JobOrderService.DeleteJobOrder(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else {
        // Fallback: use fetch for unknown endpoints
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
      // Collect all dependencies to delete
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

      // Delete all dependencies sequentially
      for (const dep of allDependencies) {
        try {
          await handleDeleteDependency(dep.type, dep.id, dep.endpoint);
        } catch (error: any) {
          console.error(`Error deleting ${dep.name}:`, error);
          toast.error(`Failed to delete ${dep.name}. Stopping deletion process.`);
          setLoading(false);
          // Refresh impact to show current state
          await refreshDeletionImpact();
          return;
        }
      }

      // Wait a moment for backend to process
      await new Promise(resolve => setTimeout(resolve, 500));

      // Refresh impact check to verify all dependencies are gone
      await refreshDeletionImpact();

      // Check if we can now delete the order
      const updatedResponse = await OrderService.CheckOrderDeletionImpact(orderId);
      const updatedImpact = updatedResponse.result as DeletionImpactResult;

      if (updatedImpact.canDelete) {
        // All dependencies deleted, now delete the order
        await OrderService.DeleteOrder(orderId);
        toast.success("All dependencies and order deleted successfully");
        setShowDeletionDialog(false);
        onClose(true);
      } else {
        // Still have blocking dependencies (shouldn't happen, but handle it)
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
      await OrderService.DeleteOrder(orderId);
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

  const handleDuplicate = async () => {
    const id = formData.OrderID > 0 ? formData.OrderID : orderId;
    if (id > 0) {
      setLoading(true);
      try {
        await OrderService.DuplicateOrder(id);
        toast.success("Order duplicated successfully (including file copies)");
        onClose(true);
      } catch (error: any) {
        console.error("Error duplicating order:", error);
        toast.error(`Error duplicating order: ${error.message || "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const convertToDateInputFormat = (dateStr: string): string =>
    toHtmlDateInputValue(dateStr);

  const convertFromDateInputFormat = (dateStr: string): string =>
    fromHtmlDateInputValue(dateStr);

  const getFirstLine = (text: string): string => {
    if (!text) return "";
    // Get the first line (split by newline and take first part)
    const firstLine = text.split(/\r?\n/)[0];
    return firstLine;
  };

  // Calculate line total (supports Percent or Amount discount)
  const calculateLineTotal = (detail: OrderDetailReq): number => {
    const qty = Number(detail.QtyOrdered) || 0;
    const unitPrice = Number(detail.UnitPrice) || 0;
    const discount = Number(detail.Discount) || 0;
    const subtotal = qty * unitPrice;
    if (subtotal <= 0) {
      return 0;
    }
    const discountAmount =
      detail.DiscountType === "Amount"
        ? Math.min(Math.max(discount, 0), subtotal)
        : subtotal * (Math.min(Math.max(discount, 0), 100) / 100);
    return Math.max(0, subtotal - discountAmount);
  };

  const effectiveOrderId = formData.OrderID > 0 ? formData.OrderID : orderId;

  return (
    <div className="customer-order-slideout-overlay" onClick={handleCancel}>
      <div className="customer-order-slideout-card" onClick={(e) => e.stopPropagation()}>
        <div className="customer-order-slideout-header">
          <div>
            <h2>{effectiveOrderId > 0 ? "Edit Order" : "New Order"}</h2>
            {effectiveOrderId > 0 && formData.PONumber > 0 && (
              <div style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.25rem" }}>
                Order Number: {formData.PONumber < 1000 ? `CO#${formData.PONumber + 999}` : `CO#${formData.PONumber}`}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            {effectiveOrderId > 0 && (
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
              <div className={`input-group ${formData.Status === "In Progress" || formData.Status === "Partially Shipped" || formData.Status === "Shipped" || formData.Status === "Partially Invoiced" || formData.Status === "Fully Invoiced" || formData.Status === "Completed" ? "status-active-group" : "status-inactive-group"}`} style={{ maxWidth: "200px" }}>
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                  </span>
                </div>
                <select
                  className={`form-input ${formData.Status === "In Progress" || formData.Status === "Partially Shipped" || formData.Status === "Shipped" || formData.Status === "Partially Invoiced" || formData.Status === "Fully Invoiced" || formData.Status === "Completed" ? "status-active" : "status-inactive"}`}
                  value={formData.Status}
                  onChange={(e) => handleInputChange("Status", e.target.value)}
                >
                  <option value="Draft">Draft</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Partially Shipped">Partially Shipped</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Partially Invoiced">Partially Invoiced</option>
                  <option value="Fully Invoiced">Fully Invoiced</option>
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

        <form className="customer-order-slideout-form" onSubmit={handleSubmit}>
          <div className="customer-order-slideout-content">
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
                <label htmlFor="QuotationNo">Quotation #</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">📄</span>
                  </div>
                  <input
                    type="text"
                    id="QuotationNo"
                    name="QuotationNo"
                    className="form-input"
                    placeholder="Enter quotation number if converted from quotation"
                    value={formData.QuotationNo || ""}
                    onChange={(e) => handleInputChange("QuotationNo", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div style={{ marginTop: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3>Line Items</h3>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleRepeatLastOrder}
                    disabled={
                      repeatingLastOrder ||
                      !formData.CustomerID ||
                      formData.CustomerID <= 0
                    }
                    title={
                      formData.CustomerID
                        ? "Add lines from this customer's most recent order"
                        : "Select a customer first"
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.5rem 1rem",
                      backgroundColor: "#ffffff",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      cursor:
                        repeatingLastOrder || !formData.CustomerID
                          ? "not-allowed"
                          : "pointer",
                      opacity: repeatingLastOrder || !formData.CustomerID ? 0.6 : 1,
                    }}
                  >
                    {repeatingLastOrder ? "Loading…" : "Repeat last order"}
                  </button>
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
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Due Date</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Unit</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Qty</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Unit Price</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Discount % / $</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Total</th>
                        <th style={{ padding: "0.75rem", textAlign: "left", fontSize: "0.875rem", fontWeight: 600 }}>Notes</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Job Order</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Shipped</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Invoiced</th>
                        <th style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem", fontWeight: 600 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.Details.map((detail, index) => {
                        const lineTotal = calculateLineTotal(detail);
                        const itemErrors = lineItemErrors.get(index) || {};
                        const hasPartError = !!(itemErrors.PartNo || itemErrors.PartName);
                        const historyHint = formatPartHistoryHint(partHistoryByRow.get(index));
                        return (
                          <React.Fragment key={index}>
                          <tr style={{ borderBottom: historyHint ? "none" : "1px solid #e5e7eb", verticalAlign: "middle" }}>
                            <td style={{ padding: "0.75rem" }}>
                              <div
                                className="line-cell-value"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  minHeight: "2.5rem",
                                  fontSize: "0.875rem",
                                  lineHeight: 1.25,
                                }}
                              >
                                {detail.ItemNo}
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", position: "relative" }}>
                              <CustomerPartCombobox
                                value={detail.PartNo}
                                customerId={formData.CustomerID}
                                customerSelected={!!formData.CustomerID && formData.CustomerID > 0}
                                hasError={hasPartError}
                                scrollContainerSelector=".customer-order-slideout-content"
                                onChange={(partNo) => handleDetailChange(index, "PartNo", partNo)}
                                onSelectPart={(part) => applyCustomerPart(index, part)}
                                onHistoryMatch={(part) => {
                                  setPartHistoryByRow((prev) => {
                                    const next = new Map(prev);
                                    next.set(index, part);
                                    return next;
                                  });
                                }}
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
                              <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", minWidth: "140px" }}>
                                <select
                                  className="form-input"
                                  style={{ width: "52px", padding: "0.35rem", flexShrink: 0 }}
                                  value={detail.DiscountType === "Amount" ? "Amount" : "Percent"}
                                  onChange={(e) =>
                                    handleDetailChange(
                                      index,
                                      "DiscountType",
                                      e.target.value === "Amount" ? "Amount" : "Percent"
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
                                      newMap.set(`discount-${index}`, inputVal);
                                      return newMap;
                                    });
                                    if (inputVal === "" || inputVal === ".") {
                                      handleDetailChange(index, "Discount", 0);
                                    } else {
                                      const val = parseFloat(inputVal);
                                      if (!isNaN(val) && val >= 0) {
                                        handleDetailChange(index, "Discount", val);
                                      }
                                    }
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
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", fontWeight: 600 }}>
                              <div
                                className="line-cell-value"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  minHeight: "2.5rem",
                                  fontSize: "0.875rem",
                                  lineHeight: 1.25,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ${lineTotal.toFixed(2)}
                              </div>
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
                              <div
                                className="line-cell-value"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minHeight: "2.5rem",
                                }}
                              >
                              {detail.ID > 0 && jobOrderDetailIds.has(detail.ID) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const jobOrderId = jobOrderDetailIds.get(detail.ID);
                                    if (jobOrderId) {
                                      setSelectedJobOrderId(jobOrderId);
                                      setShowJobOrderSlideout(true);
                                    }
                                  }}
                                  style={{
                                    padding: "0.25rem 0.5rem",
                                    backgroundColor: "#10b981",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "0.25rem",
                                    fontSize: "0.75rem",
                                    cursor: "pointer",
                                    fontWeight: 500,
                                  }}
                                  title="View Job Order"
                                >
                                  View JO
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleCreateJobOrder(detail, index)}
                                  disabled={detail.ID === 0 || loading}
                                  style={{
                                    padding: "0.25rem 0.5rem",
                                    backgroundColor: detail.ID === 0 ? "#9ca3af" : "#6366f1",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "0.25rem",
                                    fontSize: "0.75rem",
                                    cursor: detail.ID === 0 ? "not-allowed" : "pointer",
                                    fontWeight: 500,
                                  }}
                                  title={detail.ID === 0 ? "Save order first" : "Create Job Order"}
                                >
                                  Create JO
                                </button>
                              )}
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem" }}>
                              <div
                                className="line-cell-value"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minHeight: "2.5rem",
                                  lineHeight: 1.25,
                                }}
                              >
                                {detail.ShippedQty || 0}
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.875rem" }}>
                              <div
                                className="line-cell-value"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minHeight: "2.5rem",
                                  lineHeight: 1.25,
                                }}
                              >
                                {detail.InvoicedQty || 0}
                              </div>
                            </td>
                            <td style={{ padding: "0.75rem", textAlign: "center" }}>
                              <div
                                className="line-cell-value"
                                style={{
                                  display: "flex",
                                  gap: "0.25rem",
                                  justifyContent: "center",
                                  alignItems: "center",
                                  minHeight: "2.5rem",
                                }}
                              >
                                {/* Ship Button */}
                                {(() => {
                                  const shippableItem = shippableItems.find(item => item.id === detail.ID);
                                  const canShip = shippableItem && shippableItem.availableQty > 0 &&
                                    (!shippableItem.hasJobOrder || isJobOrderCompleted(shippableItem.jobOrderStatus));

                                  return canShip ? (
                                    <button
                                      type="button"
                                      className="btn-icon"
                                      onClick={() => handleShipItem(shippableItem)}
                                      title={`Ship ${shippableItem.availableQty} units`}
                                      style={{
                                        backgroundColor: "#10b981",
                                        color: "white"
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#059669"}
                                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#10b981"}
                                    >
                                      🚚
                                    </button>
                                  ) : null;
                                })()}

                                {/* Invoice Button */}
                                {(() => {
                                  const invoiceableItem = invoiceableItems.find(item => item.id === detail.ID);
                                  const canInvoice = invoiceableItem && invoiceableItem.availableQty > 0;

                                  return canInvoice ? (
                                    <button
                                      type="button"
                                      className="btn-icon"
                                      onClick={() => handleInvoiceItem(invoiceableItem)}
                                      title={`Invoice ${invoiceableItem.availableQty} units`}
                                      style={{
                                        backgroundColor: "#8b5cf6",
                                        color: "white"
                                      }}
                                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#7c3aed"}
                                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#8b5cf6"}
                                    >
                                      💰
                                    </button>
                                  ) : null;
                                })()}

                                {/* Delete Button */}
                                {(() => {
                                  const hasJobOrder = detail.ID > 0 && jobOrderDetailIds.has(detail.ID);
                                  return (
                                    <button
                                      type="button"
                                      className={`btn-icon ${hasJobOrder ? 'btn-icon-disabled' : 'btn-icon-danger'}`}
                                      onClick={() => !hasJobOrder && handleDeleteDetail(index)}
                                      disabled={hasJobOrder}
                                      title={hasJobOrder ? "Cannot delete: Job Order exists for this line item" : "Delete"}
                                    >
                                      ×
                                    </button>
                                  );
                                })()}
                              </div>
                            </td>
                          </tr>
                          {historyHint ? (
                            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                              <td style={{ padding: 0, border: "none" }} />
                              <td
                                colSpan={13}
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
                        <td style={{ padding: "0.75rem", textAlign: "left", fontWeight: 600 }}>
                          ${formData.TotalAmount.toFixed(2)}
                        </td>
                        <td colSpan={5} style={{ padding: "0.75rem" }}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Shipments Section */}
            <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600 }}>📦 Shipment History</h3>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleBatchShip}
                  disabled={loading || shippableItems.filter(item => item.availableQty > 0 && (!item.hasJobOrder || isJobOrderCompleted(item.jobOrderStatus))).length === 0}
                  title="Create a new shipment for all ready-to-ship items"
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: shippableItems.filter(item => item.availableQty > 0 && (!item.hasJobOrder || isJobOrderCompleted(item.jobOrderStatus))).length > 0 ? "#3b82f6" : "#9ca3af",
                    color: "white",
                    border: "none",
                    borderRadius: "0.375rem",
                    cursor: shippableItems.filter(item => item.availableQty > 0 && (!item.hasJobOrder || isJobOrderCompleted(item.jobOrderStatus))).length > 0 ? "pointer" : "not-allowed",
                    fontSize: "0.875rem",
                    fontWeight: "500"
                  }}
                >
                  🚚 Create Shipment
                </button>
              </div>

              {shipments.length === 0 ? (
                <p style={{ margin: "0", color: "#6b7280", fontSize: "0.875rem" }}>
                  No shipments created yet. Items will appear here once shipped.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  {shipments.map((shipment) => (
                    <div key={shipment.id} style={{
                      padding: "1rem",
                      backgroundColor: "#ffffff",
                      borderRadius: "0.375rem",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                        <div>
                          <div style={{ fontWeight: "600", fontSize: "0.875rem", color: "#1f2937" }}>
                            Shipment #{shipment.shipmentNo}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            {new Date(shipment.shipmentDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "0.75rem", color: "#374151", fontWeight: "500" }}>
                              {shipment.courier}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                              {shipment.boxes} box{shipment.boxes !== 1 ? 'es' : ''}
                            </div>
                            {shipment.trackingNumber && (
                              <div style={{ fontSize: "0.75rem", color: "#3b82f6", fontWeight: "500" }}>
                                Tracking: {shipment.trackingNumber}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteShipment(shipment.id)}
                            title="Delete shipment"
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

                      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "0.75rem" }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.5rem", color: "#374151" }}>
                          Items Shipped ({shipment.items.reduce((sum, item) => sum + item.qtyShipped, 0)} units total):
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                          {shipment.items.map((item, index) => (
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
                              {item.partNo}: {item.qtyShipped} units
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invoices Section */}
            <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "#f9fafb", borderRadius: "0.5rem", border: "1px solid #e5e7eb" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600 }}>💰 Invoice History</h3>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleBatchInvoice}
                  disabled={loading || invoiceableItems.filter(item => 
                    item.availableQty > 0 && (!item.hasJobOrder || isJobOrderCompleted(item.jobOrderStatus))
                  ).length === 0}
                  title="Create a new invoice for ready-to-invoice items"
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: invoiceableItems.filter(item => 
                      item.availableQty > 0 && (!item.hasJobOrder || isJobOrderCompleted(item.jobOrderStatus))
                    ).length > 0 ? "#8b5cf6" : "#9ca3af",
                    color: "white",
                    border: "none",
                    borderRadius: "0.375rem",
                    cursor: invoiceableItems.filter(item => 
                      item.availableQty > 0 && (!item.hasJobOrder || isJobOrderCompleted(item.jobOrderStatus))
                    ).length > 0 ? "pointer" : "not-allowed",
                    fontSize: "0.875rem",
                    fontWeight: "500"
                  }}
                >
                  Create Invoice
                </button>
              </div>

              {invoices.length === 0 ? (
                <p style={{ margin: "0", color: "#6b7280", fontSize: "0.875rem" }}>
                  No invoices created yet. Items will appear here once invoiced.
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
                        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "0.875rem", color: "#374151", fontWeight: "500" }}>
                              Amount: ${invoice.totalAmount.toFixed(2)}
                            </div>
                          </div>
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
                              {item.description.split(' - ')[1] || item.description}: {item.qtyInvoiced} units (${item.amount.toFixed(2)})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
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

      {/* Job Order Slideout */}
      {showJobOrderSlideout && (
        <JobOrderSlideout
          jobOrderId={selectedJobOrderId}
          onClose={async () => {
            setShowJobOrderSlideout(false);
            setSelectedJobOrderId(0);
            const id = formData.OrderID > 0 ? formData.OrderID : orderId;
            if (id > 0) {
              await loadOrder(id);
            }
          }}
        />
      )}

      {/* Shipping Modal */}
      {showShippingModal && selectedShippingItems.length > 0 && (
        <ShippingModal
          isOpen={showShippingModal}
          onClose={() => {
            setShowShippingModal(false);
            setSelectedShippingItems([]);
          }}
          orderId={orderId}
          shippableItems={shippableItems}
          selectedItems={selectedShippingItems}
          onShipmentCreated={handleShipmentCreated}
        />
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && selectedInvoiceItems.length > 0 && (
        <InvoiceModal
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

      {/* Deletion Impact Dialog */}
      <DeletionImpactDialog
        isOpen={showDeletionDialog}
        entityName={`Customer Order #${formData.PONumber || orderId}`}
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

// Text Editor Popup Component
interface TextEditorPopupProps {
  title: string;
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

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

export default CustomerOrderSlideout;
