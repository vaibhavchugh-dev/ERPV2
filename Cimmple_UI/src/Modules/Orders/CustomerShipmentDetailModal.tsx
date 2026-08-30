import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { faTimes, faPrint, faTruck, faMapMarkerAlt, faBox, faCalendar, faDollarSign, faHashtag, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CustomerShipmentsService, CustomerShipmentDetail } from '../../Common/Services/CustomerShipmentsService';
import { ShippingService } from '../../Common/Services/ShippingService';
import { PdfService } from '../../Common/Services/PdfService';
import DeletionImpactDialog, { DeletionImpactResult } from '../../Common/Components/DeletionImpactDialog';

interface CustomerShipmentDetailModalProps {
  isOpen: boolean;
  onClose: (refresh?: boolean) => void;
  shipmentId: number;
}

const CustomerShipmentDetailModal: React.FC<CustomerShipmentDetailModalProps> = ({
  isOpen,
  onClose,
  shipmentId
}) => {
  const [shipment, setShipment] = useState<CustomerShipmentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  useEffect(() => {
    if (isOpen && shipmentId) {
      loadShipmentDetails();
    }
  }, [isOpen, shipmentId]);

  const loadShipmentDetails = async () => {
    if (!shipmentId) return;

    setLoading(true);
    try {
      const result = await CustomerShipmentsService.GetShipmentDetails(shipmentId);

      if (result) {
        setShipment(result);
      } else {
        toast.error('Shipment not found or failed to load');
        setShipment(null);
      }
    } catch (error: any) {
      console.error('Error loading shipment details:', error);
      toast.error(`Error loading shipment details: ${error.message || 'Unknown error'}`);
      setShipment(null);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const handlePrintShipment = async () => {
    if (!shipment?.id) {
      toast.error('Shipment not loaded');
      return;
    }

    try {
      const blob = await PdfService.GenerateShipment(shipment.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Shipment_${shipment.shipmentNo || shipment.id}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Shipment PDF generated successfully');
    } catch (error: any) {
      console.error('Error generating shipment PDF:', error);
      toast.error(error.response?.data?.error || 'Failed to generate shipment PDF');
    }
  };

  const handleTrackShipment = () => {
    if (shipment?.trackingNumber) {
      // Open tracking URL in new tab
      const trackingUrl = getTrackingUrl(shipment.courier, shipment.trackingNumber);
      if (trackingUrl) {
        window.open(trackingUrl, '_blank');
      } else {
        toast.info(`Tracking number: ${shipment.trackingNumber}`);
      }
    }
  };

  const getTrackingUrl = (courier: string, trackingNumber: string): string | null => {
    const courierLower = courier?.toLowerCase() || '';

    if (courierLower.includes('fedex')) {
      return `https://www.fedex.com/en-us/tracking.html?tracknumbers=${trackingNumber}`;
    } else if (courierLower.includes('ups')) {
      return `https://www.ups.com/track?tracknum=${trackingNumber}`;
    } else if (courierLower.includes('usps')) {
      return `https://tools.usps.com/go/TrackConfirmAction?tRef=fullpage&tLc=2&text28777=&tLabels=${trackingNumber}`;
    } else if (courierLower.includes('dhl')) {
      return `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
    }

    return null;
  };

  const refreshDeletionImpact = async () => {
    if (!shipment?.id) return;
    try {
      const response = await ShippingService.CheckShipmentDeletionImpact(shipment.id);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteShipment = async () => {
    if (!shipment?.id) return;
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
    if (!shipment?.id) return;
    setLoading(true);
    try {
      const success = await CustomerShipmentsService.DeleteShipment(shipment.id);
      if (success) {
        toast.success(`Shipment ${shipment.shipmentNo} deleted successfully`);
        setShowDeletionDialog(false);
        setDeletionImpact(null);
        onClose(true);
      } else {
        toast.error(`Failed to delete shipment ${shipment.shipmentNo}`);
      }
    } catch (error: any) {
      console.error("Error deleting shipment:", error);
      toast.error(`Error deleting shipment: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1050,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f9fafb'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold', color: '#111827' }}>
              <FontAwesomeIcon icon={faTruck} style={{ marginRight: '0.5rem', color: '#3b82f6' }} />
              Shipment Details
            </h3>
            {shipment && (
              <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                {shipment.shipmentNo} • {shipment.customerName}
              </p>
            )}
          </div>
          <button
            onClick={() => onClose()}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.25rem',
              borderRadius: '0.25rem'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '1.5rem'
        }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div>Loading shipment details...</div>
            </div>
          ) : !shipment ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
              Shipment not found
            </div>
          ) : (
            <div>
              {/* Shipment Header Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem',
                padding: '1rem',
                backgroundColor: '#f9fafb',
                borderRadius: '0.5rem'
              }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faHashtag} style={{ marginRight: '0.25rem' }} />
                    Shipment Number
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                    {shipment.shipmentNo}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faCalendar} style={{ marginRight: '0.25rem' }} />
                    Ship Date
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                    {formatDate(shipment.shipmentDate)}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faTruck} style={{ marginRight: '0.25rem' }} />
                    Courier
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                    {shipment.courier || 'Not specified'}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faMapMarkerAlt} style={{ marginRight: '0.25rem' }} />
                    Tracking Number
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                    {shipment.trackingNumber || 'Not available'}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faBox} style={{ marginRight: '0.25rem' }} />
                    Boxes
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                    {shipment.boxes || 'Not specified'}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <FontAwesomeIcon icon={faDollarSign} style={{ marginRight: '0.25rem' }} />
                    Total Value
                  </label>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                    {formatCurrency(shipment.totalAmount)}
                  </p>
                </div>
              </div>

              {/* Order Information */}
              <div style={{ marginBottom: '2rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                  Order Information
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem'
                }}>
                  <div>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Order Number:</span>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                      {shipment.orderNumber}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Customer:</span>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                      {shipment.customerName}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Packing Type:</span>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>
                      {shipment.packingType || 'Standard'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Shipment Items */}
              <div>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                  Shipment Items
                </h4>
                <div style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  overflow: 'hidden'
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ backgroundColor: '#f9fafb' }}>
                      <tr>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Item
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Description
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Qty
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Unit Price
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipment.items.map((item, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#111827' }}>
                            {item.partNo}
                          </td>
                          <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#111827' }}>
                            {item.partName}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                            {item.qtyShipped}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827' }}>
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', color: '#111827', fontWeight: '500' }}>
                            {formatCurrency(item.lineTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                      <tr>
                        <td colSpan={4} style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                          Total Value:
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>
                          {formatCurrency(shipment.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginTop: '2rem' }}>
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600', color: '#111827' }}>
                  Notes
                </h4>
                <div style={{
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#374151', whiteSpace: 'pre-wrap' }}>
                    {shipment.notes?.trim() ? shipment.notes : 'No notes added.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {shipment && (
          <div style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f9fafb'
          }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Shipment {shipment.shipmentNo} • {shipment.items.length} item{shipment.items.length !== 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {shipment.trackingNumber && (
                <button
                  onClick={handleTrackShipment}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3b82f6',
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
                  <FontAwesomeIcon icon={faMapMarkerAlt} />
                  Track Shipment
                </button>
              )}
              <button
                onClick={handlePrintShipment}
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
                onClick={handleDeleteShipment}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
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
                <FontAwesomeIcon icon={faTrash} />
                Delete
              </button>
            </div>
          </div>
        )}

        {/* Deletion Impact Dialog */}
        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Shipment #${shipment?.shipmentNo || ''}`}
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
    </div>
  );
};

export default CustomerShipmentDetailModal;
















