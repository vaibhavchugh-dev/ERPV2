import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { InvoiceableItem, CreateInvoiceRequest, InvoiceService } from '../../Common/Services/InvoiceService';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  invoiceableItems: InvoiceableItem[];
  selectedItems?: InvoiceableItem[];
  onInvoiceCreated: () => void;
}

const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  orderId,
  invoiceableItems,
  selectedItems = [],
  onInvoiceCreated
}) => {
  const [loading, setLoading] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30); // Default 30 days
    return date.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<{ [key: number]: number }>({});
  const [unitPrices, setUnitPrices] = useState<{ [key: number]: number }>({});
  const [discounts, setDiscounts] = useState<{ [key: number]: number }>({});
  const [quantityInputs, setQuantityInputs] = useState<{ [key: number]: string }>({});
  const [priceInputs, setPriceInputs] = useState<{ [key: number]: string }>({});
  const [discountInputs, setDiscountInputs] = useState<{ [key: number]: string }>({});

  // Initialize form data when selected items change
  useEffect(() => {
    if (selectedItems.length > 0) {
      const initialQuantities: { [key: number]: number } = {};
      const initialUnitPrices: { [key: number]: number } = {};
      const initialDiscounts: { [key: number]: number } = {};
      const initialQuantityInputs: { [key: number]: string } = {};
      const initialPriceInputs: { [key: number]: string } = {};
      const initialDiscountInputs: { [key: number]: string } = {};

      selectedItems.forEach(item => {
        initialQuantities[item.id] = item.availableQty;
        initialUnitPrices[item.id] = item.unitPrice;
        initialDiscounts[item.id] = item.discount;
        initialQuantityInputs[item.id] = item.availableQty.toString();
        initialPriceInputs[item.id] = item.unitPrice.toString();
        initialDiscountInputs[item.id] = item.discount.toString();
      });

      setQuantities(initialQuantities);
      setUnitPrices(initialUnitPrices);
      setDiscounts(initialDiscounts);
      setQuantityInputs(initialQuantityInputs);
      setPriceInputs(initialPriceInputs);
      setDiscountInputs(initialDiscountInputs);
    }
  }, [selectedItems]);

  const handleQuantityChange = (itemId: number, qty: number) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: qty
    }));
  };

  const handleUnitPriceChange = (itemId: number, price: number) => {
    setUnitPrices(prev => ({
      ...prev,
      [itemId]: price
    }));
  };

  const handleDiscountChange = (itemId: number, discount: number) => {
    setDiscounts(prev => ({
      ...prev,
      [itemId]: discount
    }));
  };

  const calculateLineTotal = (item: InvoiceableItem): number => {
    const qty = quantities[item.id] || 0;
    const price = unitPrices[item.id] || 0;
    const discount = discounts[item.id] || 0;
    return (price * qty) * (1 - discount / 100);
  };

  const calculateSubtotal = (): number => {
    return selectedItems.reduce((total, item) => total + calculateLineTotal(item), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setLoading(true);

    try {
      const lineItems = selectedItems.map(item => ({
        orderDetailId: item.id,
        qtyToInvoice: quantities[item.id] || 0,
        unitPrice: unitPrices[item.id] || 0,
        discount: discounts[item.id] || 0
      })).filter(item => item.qtyToInvoice > 0);

      if (lineItems.length === 0) {
        toast.warning('Please specify quantities to invoice for at least one item.');
        setLoading(false);
        return;
      }

      // Validate that we're not invoicing more than available
      for (const item of selectedItems) {
        const qtyToInvoice = quantities[item.id] || 0;
        if (qtyToInvoice > item.availableQty) {
          toast.warning(`Cannot invoice ${qtyToInvoice} units of ${item.partNo}. Only ${item.availableQty} available.`);
          setLoading(false);
          return;
        }
      }

      const request: CreateInvoiceRequest = {
        orderId,
        lineItems,
        invoiceDate,
        dueDate,
        notes
      };

      console.log('Creating invoice with request:', request);

      const result = await InvoiceService.CreateInvoice(request);
      console.log('Invoice creation result:', result);

      if (result) {
        console.log('Invoice created successfully, closing modal');
        onClose();
        setTimeout(() => {
          console.log('Showing success toast and calling onInvoiceCreated');
          toast.success(`Invoice #${result.invoiceNumber} created successfully!`);
          onInvoiceCreated();
        }, 100);
      } else {
        console.log('No result from invoice creation');
        toast.error('Failed to create invoice - no response from server');
      }
    } catch (error: any) {
      console.error('Invoice creation failed:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error occurred';
      toast.error(`Failed to create invoice: ${errorMessage}`);
    } finally {
      console.log('Setting loading to false');
      setLoading(false);
    }
  };

  const totalItems = selectedItems.length;
  const subtotal = calculateSubtotal();

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
        zIndex: 10000
      }}
      onClick={(e) => {
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
          maxWidth: '700px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          position: 'relative',
          zIndex: 10001
        }}
        onClick={(e) => {
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
            {selectedItems.length === 1 ? 'Invoice Line Item' : 'Create Invoice'}
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

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ padding: '1.5rem' }}>
            {/* Items to Invoice */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                Items to Invoice ({totalItems} items, Subtotal: ${subtotal.toFixed(2)})
              </h4>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '0.375rem' }}>
                {selectedItems.map((item) => (
                  <div key={item.id} style={{
                    padding: '1rem',
                    borderBottom: selectedItems.indexOf(item) < selectedItems.length - 1 ? '1px solid #e5e7eb' : 'none'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1f2937' }}>
                          Item #{item.itemNo} - {item.partNo}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          {item.partName}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Available: {item.availableQty} units • Shipped: {item.shippedQty} • Invoiced: {item.invoicedQty}
                        </div>
                      </div>
                      <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1f2937' }}>
                        ${calculateLineTotal(item).toFixed(2)}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem', alignItems: 'center' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                          Qty to Invoice
                        </label>
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
                                  toast.warning(`Cannot invoice ${numVal} units. Only ${item.availableQty} available.`);
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
                            width: '100%',
                            padding: '0.375rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                          Unit Price
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={priceInputs[item.id] !== undefined ? priceInputs[item.id] : (unitPrices[item.id] || 0).toString()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPriceInputs(prev => ({ ...prev, [item.id]: val }));
                            if (val === '' || val === '0') {
                              handleUnitPriceChange(item.id, 0);
                            } else {
                              const numVal = parseFloat(val);
                              if (!isNaN(numVal) && numVal >= 0) {
                                handleUnitPriceChange(item.id, numVal);
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value;
                            const numVal = parseFloat(val) || 0;
                            const clampedVal = Math.max(0, numVal);
                            handleUnitPriceChange(item.id, clampedVal);
                            setPriceInputs(prev => ({ ...prev, [item.id]: clampedVal.toString() }));
                          }}
                          style={{
                            width: '100%',
                            padding: '0.375rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                          Discount %
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={discountInputs[item.id] !== undefined ? discountInputs[item.id] : (discounts[item.id] || 0).toString()}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDiscountInputs(prev => ({ ...prev, [item.id]: val }));
                            if (val === '' || val === '0') {
                              handleDiscountChange(item.id, 0);
                            } else {
                              const numVal = parseFloat(val);
                              if (!isNaN(numVal) && numVal >= 0 && numVal <= 100) {
                                handleDiscountChange(item.id, numVal);
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value;
                            const numVal = parseFloat(val) || 0;
                            const clampedVal = Math.max(0, Math.min(numVal, 100));
                            handleDiscountChange(item.id, clampedVal);
                            setDiscountInputs(prev => ({ ...prev, [item.id]: clampedVal.toString() }));
                          }}
                          style={{
                            width: '100%',
                            padding: '0.375rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '0.25rem',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                          Line Total
                        </label>
                        <div style={{
                          padding: '0.375rem',
                          backgroundColor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.25rem',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          textAlign: 'right'
                        }}>
                          ${calculateLineTotal(item).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Invoice Details */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                Invoice Details
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem' }}>
                    Invoice Date *
                  </label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
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
                    Due Date *
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
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
                placeholder="Invoice notes..."
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
              onClick={() => {
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
              disabled={loading || totalItems === 0 || subtotal === 0}
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
              {loading ? 'Creating Invoice...' : `Create Invoice ($${subtotal.toFixed(2)})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InvoiceModal;



