import React, { useState, useEffect } from "react";
import { useLocation, useHistory } from "react-router-dom";
import { toast } from "react-toastify";
import { faEye, faTrash, faTruck, faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import MasterListPage from "../../Common/Components/MasterListPage/MasterListPage";
import { CustomerShipmentsService, CustomerShipmentSummary } from "../../Common/Services/CustomerShipmentsService";
import { ShippingService } from "../../Common/Services/ShippingService";
import { PdfService } from "../../Common/Services/PdfService";
import CustomerShipmentDetailModal from "./CustomerShipmentDetailModal";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import { useFormatting } from "../../Common/Hooks/useFormatting";

interface FilterOptions {
  dateRange: string;
  customerId?: number;
  searchTerm: string;
}

const CustomerShipments: React.FC = () => {
  const { formatCurrency, formatDate } = useFormatting();
  const location = useLocation();
  const history = useHistory();
  const [shipments, setShipments] = useState<CustomerShipmentSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    dateRange: 'Last 30 Days',
    searchTerm: ''
  });

  // Modal states
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number>(0);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const [shipmentToDelete, setShipmentToDelete] = useState<CustomerShipmentSummary | null>(null);

  // Handle URL parameter to open modal (from global search)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const openId = params.get('open');
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id) && id > 0) {
        setSelectedShipmentId(id);
        setShowDetailModal(true);
        history.replace(location.pathname);
      }
    }
  }, [location.search, history, location.pathname]);

  useEffect(() => {
    loadShipments();
  }, [filters]);

  const loadShipments = async () => {
    setLoading(true);
    try {
      console.log("[CustomerShipments] Loading shipments with filters:", filters);
      const result = await CustomerShipmentsService.GetAllShipments(
        "All",
        filters.searchTerm,
        filters.customerId,
        filters.dateRange
      );

      console.log("[CustomerShipments] API result:", result);
      if (result) {
        setShipments(result);
        console.log(`[CustomerShipments] Loaded ${result.length} shipments`);
      } else {
        setShipments([]);
        console.log("[CustomerShipments] No shipments returned from API");
      }
    } catch (error: any) {
      console.error("[CustomerShipments] Error loading shipments:", error);
      toast.error(`Error loading shipments: ${error.message || "Unknown error"}`);
      setShipments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewShipment = (shipment: CustomerShipmentSummary) => {
    setSelectedShipmentId(shipment.id);
    setShowDetailModal(true);
  };

  const handleCloseDetailModal = () => {
    setShowDetailModal(false);
    setSelectedShipmentId(0);
  };

  const handlePrintShipment = async (shipment: CustomerShipmentSummary) => {
    if (!shipment?.id) {
      toast.error("Shipment not loaded");
      return;
    }

    try {
      const blob = await PdfService.GenerateShipment(shipment.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Shipment_${shipment.shipmentNo || shipment.id}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("Shipment PDF generated successfully");
    } catch (error: any) {
      console.error("Error generating shipment PDF:", error);
      toast.error(error.response?.data?.error || "Failed to generate shipment PDF");
    }
  };

  const refreshDeletionImpact = async () => {
    if (!shipmentToDelete) return;
    try {
      const response = await ShippingService.CheckShipmentDeletionImpact(shipmentToDelete.id);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteShipment = async (shipment: CustomerShipmentSummary) => {
    setShipmentToDelete(shipment);
    try {
      const response = await ShippingService.CheckShipmentDeletionImpact(shipment.id);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
      setShowDeletionDialog(true);
    } catch (error: any) {
      console.error("Error checking deletion impact:", error);
      toast.error(`Error checking deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const confirmDeletion = async () => {
    if (!shipmentToDelete) return;
    try {
      const success = await CustomerShipmentsService.DeleteShipment(shipmentToDelete.id);
      if (success) {
        toast.success(`Shipment ${shipmentToDelete.shipmentNo} deleted successfully`);
        setShowDeletionDialog(false);
        setShipmentToDelete(null);
        setDeletionImpact(null);
        loadShipments(); // Refresh the list
      } else {
        toast.error(`Failed to delete shipment ${shipmentToDelete.shipmentNo}`);
      }
    } catch (error: any) {
      console.error("Error deleting shipment:", error);
      toast.error(`Error deleting shipment: ${error.message || "Unknown error"}`);
    }
  };

  const handleFilterChange = (filterType: keyof FilterOptions, value: any) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const columns = [
    {
      key: "shipmentNo",
      label: "Shipment #",
      sortable: true,
      align: "left" as const,
      render: (value: any, row: CustomerShipmentSummary) => (
        <button
          className="link-button"
          onClick={() => handleViewShipment(row)}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563eb',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontWeight: '500'
          }}
        >
          {value}
        </button>
      ),
    },
    {
      key: "orderNumber",
      label: "Order #",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "customerName",
      label: "Customer",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "courier",
      label: "Courier",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "trackingNumber",
      label: "Tracking #",
      sortable: true,
      align: "left" as const,
    },
    {
      key: "shipmentDate",
      label: "Ship Date",
      sortable: true,
      align: "left" as const,
      render: (value: any) => formatDate(value),
    },
    {
      key: "itemCount",
      label: "Items",
      sortable: true,
      align: "center" as const,
    },
    {
      key: "totalItems",
      label: "Qty Shipped",
      sortable: true,
      align: "center" as const,
    },
    {
      key: "boxes",
      label: "Boxes",
      sortable: true,
      align: "center" as const,
    },
    {
      key: "actions",
      label: "Actions",
      align: "center" as const,
      render: (value: any, row: CustomerShipmentSummary) => (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => handleViewShipment(row)}
            title="View Shipment"
            style={{
              padding: "0.25rem 0.5rem",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            <FontAwesomeIcon icon={faEye} />
          </button>
          <button
            type="button"
            onClick={() => handlePrintShipment(row)}
            title="Print Shipment"
            style={{
              padding: "0.25rem 0.5rem",
              backgroundColor: "#6b7280",
              color: "white",
              border: "none",
              borderRadius: "0.25rem",
              cursor: "pointer",
              fontSize: "0.75rem",
            }}
          >
            <FontAwesomeIcon icon={faPrint} />
          </button>
          <button
            type="button"
            onClick={() => handleDeleteShipment(row)}
            title="Delete Shipment"
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
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      ),
    },
  ];

  const dateRangeOptions = [
    { value: 'All', label: 'All Dates' },
    { value: 'Last 7 Days', label: 'Last 7 Days' },
    { value: 'Last 30 Days', label: 'Last 30 Days' },
    { value: 'This Month', label: 'This Month' },
    { value: 'Last Month', label: 'Last Month' }
  ];

  return (
    <div style={{ padding: "1rem" }}>
      <MasterListPage
        title="Customer Shipments"
        subtitle="Manage all customer shipments across orders"
        data={shipments}
        columns={columns}
        loading={loading}
        enablePagination
        searchPlaceholder="Search by shipment #, order #, customer, or tracking #..."
        searchFields={["shipmentNo", "orderNumber", "customerName", "customerCode", "trackingNumber", "courier"]}
        filters={[
          {
            label: "Date Range",
            options: dateRangeOptions,
            value: filters.dateRange,
            onChange: (value) => handleFilterChange('dateRange', value)
          }
        ]}
        emptyMessage="No customer shipments found"
      />

      {/* Shipment Detail Modal */}
      <CustomerShipmentDetailModal
        isOpen={showDetailModal}
        onClose={handleCloseDetailModal}
        shipmentId={selectedShipmentId}
      />

      {/* Deletion Impact Dialog */}
      <DeletionImpactDialog
        isOpen={showDeletionDialog}
        entityName={`Shipment #${shipmentToDelete?.shipmentNo || ''}`}
        impact={deletionImpact}
        onConfirm={confirmDeletion}
        onCancel={() => {
          setShowDeletionDialog(false);
          setShipmentToDelete(null);
          setDeletionImpact(null);
        }}
        onRefreshImpact={refreshDeletionImpact}
        isLoading={false}
      />
    </div>
  );
};

export default CustomerShipments;










