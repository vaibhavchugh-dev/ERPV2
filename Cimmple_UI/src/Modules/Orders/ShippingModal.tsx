import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { ShippableItem, CreateShipmentRequest, ShippingService } from '../../Common/Services/ShippingService';

interface ShippingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  shippableItems: ShippableItem[];
  selectedItems?: ShippableItem[];
  onShipmentCreated: () => void;
}

const ShippingModal: React.FC<ShippingModalProps> = ({
  isOpen,
  onClose,
  orderId,
  shippableItems,
  selectedItems = [],
  onShipmentCreated
}) => {
  const [loading, setLoading] = useState(false);
  const [courier, setCourier] = useState('FedEx');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [boxes, setBoxes] = useState<number | undefined>(1);
  const [packingType, setPackingType] = useState('Standard');
  const [terms, setTerms] = useState('');
  const [shipDate, setShipDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<{ [key: number]: number }>({});
  const [quantityInputs, setQuantityInputs] = useState<{ [key: number]: string }>({});

  // Initialize quantities for selected items
  useEffect(() => {
    if (selectedItems.length > 0) {
      const initialQuantities: { [key: number]: number } = {};
      const initialInputs: { [key: number]: string } = {};
      selectedItems.forEach(item => {
        initialQuantities[item.id] = item.availableQty;
        initialInputs[item.id] = item.availableQty.toString();
      });
      setQuantities(initialQuantities);
      setQuantityInputs(initialInputs);
    }
  }, [selectedItems]);

  const handleQuantityChange = (itemId: number, qty: number) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: qty
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    console.log('handleSubmit called - preventing default');
    e.preventDefault();
    e.stopPropagation();

    console.log('Setting loading to true');
    setLoading(true);

    try {
      const lineItems = selectedItems.map(item => ({
        orderDetailId: item.id,
        qtyToShip: quantities[item.id] || 0
      })).filter(item => item.qtyToShip > 0);

      console.log('Filtered line items:', lineItems);

      if (lineItems.length === 0) {
        console.log('No items to ship, showing warning');
        toast.warning('Please specify quantities to ship for at least one item.');
        setLoading(false);
        return;
      }

      const request: CreateShipmentRequest = {
        orderId,
        lineItems,
        courier,
        trackingNumber: trackingNumber.trim(),
        boxes,
        packingType,
        terms,
        shipDate,
        notes
      };

      console.log('Creating shipment with request:', request);

      const result = await ShippingService.CreateShipment(request);
      console.log('Shipment creation result:', result);

      if (result) {
        console.log('Shipment created successfully, closing modal');
        // Close modal first, then show success message
        onClose();
        setTimeout(() => {
          console.log('Showing success toast and calling onShipmentCreated');
          toast.success(`Shipment #${result.shipmentNumber} created successfully!`);
          onShipmentCreated();
        }, 100);
      } else {
        console.log('No result from shipment creation');
        toast.error('Failed to create shipment - no response from server');
      }
    } catch (error: any) {
      console.error('Shipment creation failed:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error occurred';
      toast.error(`Failed to create shipment: ${errorMessage}`);
    } finally {
      console.log('Setting loading to false');
      setLoading(false);
    }
  };

  const totalItems = selectedItems.length;
  const totalQuantity = Object.values(quantities).reduce((sum, qty) => sum + qty, 0);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000 // Increased z-index to be above slideout
      }}
      onClick={(e) => {
        // Only close if clicking directly on overlay, not on modal content
        if (e.target === e.currentTarget) {
          console.log('Modal overlay clicked - closing modal');
          onClose();
        }
      }}
    >
      <div
        className="modal-content"
        style={{
          background: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          position: 'relative',
          zIndex: 10001 // Above overlay
        }}
        onClick={(e) => {
          // Prevent event bubbling to overlay
          e.stopPropagation();
          console.log('Modal content clicked - not closing');
        }}
      >
        <div className="modal-header" style={{
          padding: '1.5rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>
            {selectedItems.length === 1 ? 'Ship Line Item' : 'Create Shipment'}
          </h3>
          <button
            type="button"
            onClick={() => {
              console.log('Close button clicked');
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280'
            }}
          >
            ×
          </button>
        </div>

        <form
        onSubmit={handleSubmit}
        onClick={(e) => {
          e.stopPropagation();
          console.log('Form clicked - preventing bubble');
        }}
      >
          <div className="modal-body" style={{ padding: '1.5rem' }}>
            {/* Items to Ship */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                Items to Ship ({totalItems} items, {totalQuantity} total units)
              </h4>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.375rem' }}>
                {selectedItems.map((item) => (
                  <div key={item.id} style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: '500' }}>
                        Item #{item.itemNo} - {item.partNo}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        {item.partName}
                      </div>
                      <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                        Open on order: {item.availableQty} units
                        {item.quantityOnHand != null && (
                          <span style={{ marginLeft: "0.5rem" }}>
                            • On hand: {item.quantityOnHand}
                          </span>
                        )}
                        {item.hasJobOrder && (
                          <span style={{ marginLeft: "0.5rem", color: item.jobOrderStatus === "Completed" ? "#10b981" : "#f59e0b" }}>
                            • Job Order: {item.jobOrderStatus}
                          </span>
                        )}
                      </div>
                      {item.quantityOnHand != null &&
                        (quantities[item.id] || 0) > item.quantityOnHand && (
                          <div style={{ fontSize: "0.8125rem", color: "#b45309", marginTop: "0.25rem" }}>
                            Ships short — on hand {item.quantityOnHand}, shipping {quantities[item.id] || 0}. Allowed during transition.
                          </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <label style={{ fontSize: '0.875rem' }}>Ship:</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={quantityInputs[item.id] !== undefined ? quantityInputs[item.id] : (quantities[item.id] || 0).toString()}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQuantityInputs(prev => ({ ...prev, [item.id]: val }));
                          if (val === '' || val === '0') {
                            handleQuantityChange(item.id, 0);
                          } else {
                            const numVal = parseInt(val);
                            if (!isNaN(numVal) && numVal >= 0) {
                              if (numVal > item.availableQty) {
                                toast.warning(`Cannot ship ${numVal} units. Only ${item.availableQty} available.`);
                                // Reset to available quantity
                                handleQuantityChange(item.id, item.availableQty);
                                setQuantityInputs(prev => ({ ...prev, [item.id]: item.availableQty.toString() }));
                              } else {
                                handleQuantityChange(item.id, numVal);
                              }
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          const numVal = parseInt(val) || 0;
                          const clampedVal = Math.max(0, Math.min(numVal, item.availableQty));
                          handleQuantityChange(item.id, clampedVal);
                          setQuantityInputs(prev => ({ ...prev, [item.id]: clampedVal.toString() }));
                        }}
                        style={{
                          width: '80px',
                          padding: '0.25rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem'
                        }}
                      />
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>units</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Shipping Details */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                Shipping Details
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Courier *
                  </label>
                  <select
                    value={courier}
                    onChange={(e) => {
                      e.stopPropagation();
                      setCourier(e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem'
                    }}
                  >
                    <option value="FedEx">FedEx</option>
                    <option value="UPS">UPS</option>
                    <option value="USPS">USPS</option>
                    <option value="DHL">DHL</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Tracking Number
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => {
                      e.stopPropagation();
                      setTrackingNumber(e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Enter tracking number"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Number of Boxes
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={boxes || ''}
                    onChange={(e) => setBoxes(parseInt(e.target.value) || undefined)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Packing Type
                  </label>
                  <select
                    value={packingType}
                    onChange={(e) => setPackingType(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem'
                    }}
                  >
                    <option value="Standard">Standard</option>
                    <option value="Fragile">Fragile</option>
                    <option value="Hazardous">Hazardous</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Ship Date *
                  </label>
                  <input
                    type="date"
                    value={shipDate}
                    onChange={(e) => setShipDate(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Terms
                  </label>
                  <input
                    type="text"
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="e.g., FOB Origin"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '0.25rem'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional shipping notes..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.25rem',
                  resize: 'vertical'
                }}
              />
            </div>
          </div>

          <div className="modal-footer" style={{
            padding: '1.5rem',
            borderTop: '1px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem'
          }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                console.log('Cancel button clicked');
                onClose();
              }}
              disabled={loading}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || totalQuantity === 0}
              onClick={(e) => {
                e.stopPropagation();
                console.log('Submit button clicked');
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: loading ? '#9ca3af' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Creating Shipment...' : 'Create Shipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ShippingModal;
