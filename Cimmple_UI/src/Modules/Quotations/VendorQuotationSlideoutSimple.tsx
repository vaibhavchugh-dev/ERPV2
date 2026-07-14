import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-toastify";
import {
  QuotationService,
  VendorQuotationMasterReq,
} from "../../Common/Services/QuotationService";
import { VendorService } from "../../Common/Services/VendorService";

interface VendorQuotationSlideoutProps {
  quotationId: number;
  onClose: () => void;
}

const VendorQuotationSlideout: React.FC<VendorQuotationSlideoutProps> = ({
  quotationId,
  onClose,
}) => {
  const [formData, setFormData] = useState<VendorQuotationMasterReq>({
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
    Details: [],
  });

  const [vendors, setVendors] = useState<Array<{ vendor_id: number; company_name: string; vendorcode: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    loadVendors();
    if (quotationId > 0) {
      loadQuotation();
    } else {
      initializeNewQuotation();
    }
  }, [quotationId]);

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

  const loadQuotation = async () => {
    setLoading(true);
    try {
      const result = await QuotationService.GetVendorQuotationById(quotationId);
      if (result) {
        setFormData(result);
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
    }));
  };

  const handleVendorChange = (vendorId: number) => {
    const selectedVendor = vendors.find(v => v.vendor_id === vendorId);
    if (selectedVendor) {
      setFormData(prev => ({
        ...prev,
        VendorID: selectedVendor.vendor_id,
        VendorCode: selectedVendor.vendorcode,
        VendorName: selectedVendor.company_name,
      }));
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

  const handleSave = async () => {
    setLoading(true);
    try {
      const result = await QuotationService.SaveVendorQuotation(formData);
      if (result) {
        toast.success(quotationId > 0 ? "Quotation updated successfully" : "Quotation created successfully");
        onClose();
      }
    } catch (error: any) {
      toast.error("Error saving quotation");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const slideoutContent = (
    <div className="vendor-quotation-slideout-overlay" onClick={onClose}>
      <div className="vendor-quotation-slideout-card" onClick={(e) => e.stopPropagation()}>
        <div className="vendor-quotation-slideout-header">
          <div>
            <div className="status-badge">
              <span className={`badge ${formData.Status === 'Draft' ? 'badge-warning' : 'badge-success'}`}>
                {formData.Status}
              </span>
            </div>
          </div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>

        <form className="vendor-quotation-slideout-form" onSubmit={handleSave}>
          <div className="vendor-quotation-slideout-content">
            <p>Vendor Quotation Form Content</p>
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(
    slideoutContent,
    document.body
  );
};

export default VendorQuotationSlideout;





































