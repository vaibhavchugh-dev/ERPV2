import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { QuotationService, VendorQuotationMasterReq, QuotationDetailReq } from "../Common/Services/QuotationService";
import "./VendorPortal.scss";

interface VendorQuotationResponseProps {
  quotationId: number;
  onClose: (refreshList?: boolean) => void;
}

const VendorQuotationResponse: React.FC<VendorQuotationResponseProps> = ({
  quotationId,
  onClose,
}) => {
  const handleDismiss = () => onClose(false);
  console.log("VendorQuotationResponse: Received quotationId:", quotationId);
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
    AdditionalNotes: "",
    Details: [],
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [numericDisplayValues, setNumericDisplayValues] = useState<Map<string, string>>(new Map());
  const [attachments, setAttachments] = useState<Array<{id: number; name: string; size: number; fileUrl?: string}>>([]);
  const [lineItemAttachments, setLineItemAttachments] = useState<Map<number, Array<{id: number; name: string; size: number; fileUrl?: string}>>>(new Map());
  const [lineItemAttachmentCounters, setLineItemAttachmentCounters] = useState<Map<number, number>>(new Map());

  useEffect(() => {
    loadQuotation();
  }, [quotationId]);

  const loadQuotation = async () => {
    setLoading(true);
    try {
      // Get tenantId from vendor portal storage
      const storage = JSON.parse(localStorage.getItem("vendorStorage") || localStorage.getItem("storage") || "{}");
      const tenantId = storage?.tenantID || 0;
      console.log("VendorQuotationResponse: Using tenantId:", tenantId, "for quotationId:", quotationId);

      const result = await QuotationService.GetVendorQuotationById(quotationId, tenantId);
      console.log("VendorQuotationResponse: API call result:", result);
      if (result) {
        console.log("VendorQuotationResponse: result.ParentQuotationID:", result.ParentQuotationID);
        console.log("VendorQuotationResponse: result.parentQuotationID:", (result as any).parentQuotationID);
        console.log("VendorQuotationResponse: result object keys:", Object.keys(result));
        console.log("VendorQuotationResponse: Full result object:", JSON.stringify(result, null, 2));
        console.log("Vendor portal received quotation data:", result);
        console.log("PONumber from result:", result.PONumber);
        console.log("ParentQuotationID from result:", result.ParentQuotationID);

        const formDataWithDetails: VendorQuotationMasterReq & { QuotationType?: string } = {
          OrderID: result.OrderID,
          Tenantid: result.Tenantid || tenantId || 0,
          VendorID: result.VendorID,
          VendorCode: result.VendorCode,
          PONumber: result.PONumber || 0,
          VendorName: result.VendorName || "Unknown Vendor",
          Address: result.Address || "",
          VendorPoNumber: result.VendorPoNumber || "",
          OrderDate: result.OrderDate || "",
          TotalAmount: result.TotalAmount || 0,
          UserId: 0,
          UserToken: 0,
          Status: result.Status,
          ShippingInstructions: result.ShippingInstructions || "",
          ExternalVendorPO: result.ExternalVendorPO || "",
          BuyerName: result.BuyerName || "",
          VendorRefNo: result.VendorRefNo || "",
          QuotationType: result.QuotationType || "Material",
          LocationId: result.LocationId,
          convertedOrderId: result.convertedOrderId,
          ParentQuotationID: result.ParentQuotationID || (result as any).parentQuotationID,
          Details: result.Details || [],
          Attachments: result.Attachments,
          Comments: result.Comments,
        };
        console.log("VendorQuotationResponse: Setting formData with ParentQuotationID:", formDataWithDetails.ParentQuotationID);
        setFormData(formDataWithDetails);
        
        // Load attachments (master quotation attachments - for reference only)
        if (result.Attachments && Array.isArray(result.Attachments)) {
          setAttachments(result.Attachments);
        } else {
          setAttachments([]);
        }
        
        // Load line item attachments
        const lineItemAttsMap = new Map<number, Array<{id: number; name: string; size: number; fileUrl?: string}>>();
        const lineItemCountersMap = new Map<number, number>();
        
        if (result.Details && Array.isArray(result.Details)) {
          result.Details.forEach((detail: any, index: number) => {
            if (detail.Attachments && Array.isArray(detail.Attachments)) {
              lineItemAttsMap.set(index, detail.Attachments);
              const maxId = Math.max(...detail.Attachments.map((a: any) => a.id || 0), 0);
              lineItemCountersMap.set(index, maxId + 1);
            } else {
              lineItemAttsMap.set(index, []);
              lineItemCountersMap.set(index, 1);
            }
          });
        }
        
        setLineItemAttachments(lineItemAttsMap);
        setLineItemAttachmentCounters(lineItemCountersMap);
      } else {
        console.log("VendorQuotationResponse: API call returned null/undefined");
      }
    } catch (error: any) {
      console.error("Error loading quotation:", error);
      toast.error(`Error loading quotation: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const calculateVendorLineTotal = (detail: QuotationDetailReq): number => {
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

  const isReadOnlyResponse = ["converted", "rejected", "cancelled", "accepted"].includes(
    (formData.Status || "").toLowerCase().trim()
  );

  const handleDetailChange = (index: number, field: keyof QuotationDetailReq, value: any) => {
    setFormData((prev) => {
      const newDetails = [...prev.Details];
      newDetails[index] = { ...newDetails[index], [field]: value };

      // Recalculate total
      const total = newDetails.reduce((sum, detail) => sum + calculateVendorLineTotal(detail), 0);

      return {
        ...prev,
        Details: newDetails,
        TotalAmount: total,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnlyResponse) {
      return;
    }
    setSaving(true);

    try {
      // Vendor response updates pricing/notes only; backend keeps original RFQ line identity.
      const detailsWithAttachments = formData.Details.map((detail, index) => {
        const lineItemAtts = lineItemAttachments.get(index) || [];
        console.log(`VendorQuotationResponse: Saving detail ${index} (ItemNo: ${detail.ItemNo}) with ${lineItemAtts.length} attachments:`, lineItemAtts);
        return {
          ...detail,
          Attachments: lineItemAtts
        };
      });
      
      console.log("VendorQuotationResponse: Saving quotation with details:", detailsWithAttachments.map(d => ({
        ItemNo: d.ItemNo,
        attachmentsCount: d.Attachments?.length || 0
      })));
      
      const dataToSave: VendorQuotationMasterReq = {
        ...formData,
        Status: "Responded",
        ParentQuotationID: formData.ParentQuotationID,
        Attachments: attachments,
        Details: detailsWithAttachments,
      };
      
      console.log("VendorQuotationResponse: Full data to save:", JSON.stringify(dataToSave, null, 2));

      console.log("Saving vendor quotation:", dataToSave);
      console.log("VendorQuotationResponse: formData.ParentQuotationID:", formData.ParentQuotationID);
      console.log("VendorQuotationResponse: dataToSave.ParentQuotationID:", dataToSave.ParentQuotationID);
      await QuotationService.SaveVendorQuotation(dataToSave);
      toast.success("Your response has been submitted successfully!");
      onClose(true);
    } catch (error: any) {
      console.error("Error saving quotation:", error);
      console.error("Error response:", error.response?.data);
      toast.error(`Error submitting response: ${error.response?.data?.error || error.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
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
    console.log("Formatting quotation number:", number);
    const displayNumber = number < 1000 ? number + 999 : number;
    return `VQ#${displayNumber}`;
  };


  const handleLineItemFileUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const currentAtts = lineItemAttachments.get(index) || [];
    const counter = lineItemAttachmentCounters.get(index) || 1;
    let newCounter = counter;
    
    const newAttachments = Array.from(files).map(file => {
      const newAttachment = {
        id: newCounter++,
        name: file.name,
        size: file.size,
        fileUrl: "" // In production, upload to server and get URL
      };
      return newAttachment;
    });
    
    setLineItemAttachments(prev => {
      const newMap = new Map(prev);
      newMap.set(index, [...currentAtts, ...newAttachments]);
      return newMap;
    });
    
    setLineItemAttachmentCounters(prev => {
      const newMap = new Map(prev);
      newMap.set(index, newCounter);
      return newMap;
    });
    
    if (e.target) {
      e.target.value = "";
    }
  };

  if (loading) {
    return (
      <div className="vendor-response-overlay">
        <div className="vendor-response-container">
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading quotation...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="vendor-response-overlay" onClick={handleDismiss}>
      <div className="vendor-response-container" onClick={(e) => e.stopPropagation()}>
        <div className="vendor-response-header">
          <h2>Respond to Quotation - {formatQuotationNumber(formData.PONumber)}</h2>
          <button type="button" className="btn-close" onClick={handleDismiss}>
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="vendor-response-content">
            {/* Quotation Info - Read Only */}
            <div className="vendor-info-section">
              <h3>Quotation Information</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1.5rem" }}>
                <div className="form-group">
                  <label htmlFor="QuotationNumber">Quotation Number</label>
                  <div className="input-group">
                    <div className="input-group-prepend">
                      <span className="input-group-icon">📋</span>
                    </div>
                    <input
                      type="text"
                      id="QuotationNumber"
                      className="form-input"
                      value={formatQuotationNumber(formData.PONumber)}
                      readOnly
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="OrderDate">Date</label>
                  <div className="input-group">
                    <div className="input-group-prepend">
                      <span className="input-group-icon">📅</span>
                    </div>
                    <input
                      type="text"
                      id="OrderDate"
                      className="form-input"
                      value={formatDate(formData.OrderDate)}
                      readOnly
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="QuotationType">Type</label>
                  <div className="input-group">
                    <div className="input-group-prepend">
                      <span className="input-group-icon">
                        {formData.QuotationType === "Service" ? "🔧" : "📦"}
                      </span>
                    </div>
                    <input
                      type="text"
                      id="QuotationType"
                      className="form-input"
                      value={formData.QuotationType === "Service" ? "Service" : "Material"}
                      readOnly
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="TotalAmount">Total Amount</label>
                  <div className="input-group">
                    <div className="input-group-prepend">
                      <span className="input-group-icon">💰</span>
                    </div>
                    <input
                      type="text"
                      id="TotalAmount"
                      className="form-input"
                      value={formatCurrency(formData.TotalAmount)}
                      readOnly
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items - Editable Pricing */}
            <div className="vendor-line-items-section">
              <h3>Line Items - Please provide your pricing</h3>
              <p style={{ color: "#6b7280", fontSize: "0.875rem", marginBottom: "1rem" }}>
                Update the unit prices and discounts for each item. Quantities and descriptions are provided for reference.
              </p>

              {formData.Details.length > 0 ? (
                <div className="vendor-line-items-table-container">
                  <table className="vendor-line-items-table">
                    <thead>
                      <tr>
                        <th>Item #</th>
                        <th>Description</th>
                        <th>Part/Job No</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th>Unit Price *</th>
                        <th>Discount</th>
                        <th>Total</th>
                        <th>Notes</th>
                        <th>Attachments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.Details.map((detail, index) => {
                        const lineTotal = calculateVendorLineTotal(detail);
                        return (
                          <tr key={index}>
                            <td>{detail.ItemNo}</td>
                            <td style={{ maxWidth: "200px" }}>
                              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {detail.PartName || "-"}
                              </div>
                            </td>
                            <td>{detail.PartNo || "-"}</td>
                            <td>{detail.QtyOrdered}</td>
                            <td>{detail.Unit || "EA"}</td>
                            <td>
                              <input
                                type="text"
                                inputMode="decimal"
                                className="form-input no-spinner"
                                style={{ width: "100%", minWidth: "100px" }}
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
                                required={!isReadOnlyResponse}
                                disabled={isReadOnlyResponse}
                              />
                            </td>
                            <td>
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
                                  disabled={isReadOnlyResponse}
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
                                        const isAmount = detail.DiscountType === "Amount";
                                        if (!isNaN(val) && val >= 0 && (isAmount || val <= 100)) {
                                          handleDetailChange(index, "Discount", val);
                                        }
                                      }
                                      return newMap;
                                    });
                                  }}
                                  onBlur={(e) => {
                                    let val = e.target.value === "" || e.target.value === "." ? 0 : parseFloat(e.target.value) || 0;
                                    if (detail.DiscountType !== "Amount") {
                                      val = Math.min(Math.max(val, 0), 100);
                                    } else {
                                      val = Math.max(val, 0);
                                    }
                                    handleDetailChange(index, "Discount", val);
                                    setNumericDisplayValues(prev => {
                                      const newMap = new Map(prev);
                                      newMap.delete(`discount-${index}`);
                                      return newMap;
                                    });
                                  }}
                                  disabled={isReadOnlyResponse}
                                />
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{formatCurrency(lineTotal)}</td>
                            <td>
                              <textarea
                                className="form-input"
                                style={{ 
                                  width: "100%", 
                                  minWidth: "150px", 
                                  fontSize: "0.875rem", 
                                  padding: "0.5rem",
                                  height: "38px",
                                  resize: "vertical",
                                  minHeight: "38px"
                                }}
                                value={detail.Notes || ""}
                                onChange={(e) => handleDetailChange(index, "Notes", e.target.value)}
                                placeholder="Add notes..."
                                disabled={isReadOnlyResponse}
                              />
                            </td>
                            <td style={{ verticalAlign: "top", minWidth: "200px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                {/* Display existing attachments */}
                                {(lineItemAttachments.get(index) || []).map((att) => (
                                  <div 
                                    key={att.id} 
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "0.5rem",
                                      fontSize: "0.8125rem",
                                      padding: "0.25rem 0.5rem",
                                      backgroundColor: "#f9fafb",
                                      borderRadius: "0.25rem"
                                    }}
                                  >
                                    <span>📎</span>
                                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {att.name}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setLineItemAttachments(prev => {
                                          const newMap = new Map(prev);
                                          const current = newMap.get(index) || [];
                                          newMap.set(index, current.filter(a => a.id !== att.id));
                                          return newMap;
                                        });
                                      }}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        color: "#ef4444",
                                        cursor: "pointer",
                                        fontSize: "1rem",
                                        padding: "0",
                                        lineHeight: "1"
                                      }}
                                      title="Remove attachment"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                                
                                {/* Add attachment button */}
                                <input
                                  type="file"
                                  multiple
                                  onChange={(e) => handleLineItemFileUpload(index, e)}
                                  style={{ display: "none" }}
                                  id={`lineItemFile-${index}`}
                                />
                                <label
                                  htmlFor={`lineItemFile-${index}`}
                                  style={{
                                    padding: "0.375rem 0.75rem",
                                    backgroundColor: "#6366f1",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "0.375rem",
                                    cursor: "pointer",
                                    fontSize: "0.8125rem",
                                    textAlign: "center",
                                    display: "block"
                                  }}
                                >
                                  + Add
                                </label>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ backgroundColor: "#f9fafb", fontWeight: 600 }}>
                        <td colSpan={9} style={{ textAlign: "right", padding: "0.75rem" }}>
                          Total Amount:
                        </td>
                        <td style={{ padding: "0.75rem", fontSize: "1.125rem", color: "#6366f1" }}>
                          {formatCurrency(formData.TotalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p style={{ color: "#6b7280", textAlign: "center", padding: "2rem" }}>
                  No line items found
                </p>
              )}
            </div>

            {/* Attachments Section - Read-only, shows attachments from master quotation */}
            {attachments.length > 0 && (
              <div className="vendor-attachments-section" style={{ marginTop: "2rem" }}>
                <h3>Attachments from Quotation</h3>
                <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1rem" }}>
                  These attachments were included with the quotation sent to you.
                </p>
                
                {/* Display attachments (read-only) */}
                <div style={{ marginBottom: "1rem" }}>
                  {attachments.map((attachment) => (
                    <div 
                      key={attachment.id} 
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.75rem",
                        backgroundColor: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        borderRadius: "0.375rem",
                        marginBottom: "0.5rem"
                      }}
                    >
                      <span style={{ fontSize: "1rem" }}>📎</span>
                      <span style={{ flex: 1, fontSize: "0.875rem", color: "#1f2937" }}>{attachment.name}</span>
                      {attachment.fileUrl && (
                        <a 
                          href={attachment.fileUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ 
                            color: "#6366f1", 
                            textDecoration: "none", 
                            fontSize: "0.875rem",
                            fontWeight: 500
                          }}
                        >
                          View
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes Section */}
            <div className="vendor-notes-section" style={{ marginTop: "2rem" }}>
              <h3>Additional Notes (Optional)</h3>
              <textarea
                className="form-input"
                rows={4}
                value={formData.AdditionalNotes || ""}
                onChange={(e) => setFormData(prev => ({ ...prev, AdditionalNotes: e.target.value }))}
                placeholder="Add any additional notes, terms, or conditions..."
                style={{ width: "100%", resize: "vertical" }}
                disabled={isReadOnlyResponse}
              />
            </div>
          </div>

          <div className="vendor-response-footer">
            <button type="button" className="btn-cancel" onClick={handleDismiss} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={saving || isReadOnlyResponse || formData.Details.length === 0}>
              {saving ? "Submitting..." : isReadOnlyResponse ? "Response locked" : "Submit Response"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VendorQuotationResponse;

