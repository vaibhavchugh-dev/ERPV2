import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  VendorService,
  VendorMasterReq,
  VendorContact,
} from "../../Common/Services/VendorService";
import { validateEmail, validatePhone, validateZipCode } from "../../Common/Utils/validation";
import { getCachedSettings } from "../../Common/Utils/settingsRuntime";
import { getDefaultSystemSettings } from "../../Common/Utils/defaultSystemSettings";
import { US_STATES, COUNTRIES, Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { ChartofAccountsService } from "../../Common/Services/ChartofAccountsService";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "../../Common/Components/MasterSlideout/MasterSlideout.scss";

interface VendorMasterSlideoutProps {
  vendorId: number;
  onClose: (refreshList?: boolean) => void;
}

const VendorMasterSlideout: React.FC<VendorMasterSlideoutProps> = ({
  vendorId,
  onClose,
}) => {
  const handleDismiss = () => onClose(false);
  const [formData, setFormData] = useState<VendorMasterReq>({
    vendor_id: 0,
    company_name: "",
    companyAlias: "",
    email: "",
    phone_number: "",
    address: "",
    apartment: "",
    City: "",
    states: "",
    zipcode: "",
    country: "US",
    shippingaddress: "",
    shippingCity: "",
    shippingStates: "",
    shippingCountry: "US",
    shippingZipCode: "",
    shippingApartment: "",
    status: "Active",
    term: "NET30",
    ship_via: "",
    TenantID: 0,
    VendorContact: [],
  });

  const [contacts, setContacts] = useState<VendorContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [activeTab, setActiveTab] = useState<'vendor' | 'billing' | 'shipping' | 'contacts'>('vendor');
  const [copyFromBilling, setCopyFromBilling] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [contactErrors, setContactErrors] = useState<{ [key: string]: string }>({});
  const [coaAccounts, setCoaAccounts] = useState<Array<{ accountID: number; accountCode: string; accountName: string }>>([]);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);
  const [portalAccessEnabled, setPortalAccessEnabled] = useState(false);
  const [portalHasPassword, setPortalHasPassword] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  const [portalPasswordConfirm, setPortalPasswordConfirm] = useState("");
  const [vendorCode, setVendorCode] = useState("");
  const [initialPortalAccessEnabled, setInitialPortalAccessEnabled] = useState(false);

  const loadCOAAccounts = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const accounts = await ChartofAccountsService.GetChartofAccounts({ tenantid: tenantID });
      if (accounts) {
        setCoaAccounts(accounts.map(a => ({
          accountID: a.accountID,
          accountCode: a.accountCode,
          accountName: a.accountName
        })));
      }
    } catch (error) {
      console.error('Error loading COA accounts:', error);
    }
  };

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      TenantID: storage?.tenantID || 0,
    }));

    loadCOAAccounts();

    if (vendorId > 0) {
      loadVendor();
    } else {
      setVendorCode("");
      setPortalAccessEnabled(false);
      setInitialPortalAccessEnabled(false);
      setPortalHasPassword(false);
      setPortalPassword("");
      setPortalPasswordConfirm("");
      setContacts([
        {
          id: 0,
          customer_id: 0,
          title: "",
          firstname: "",
          lastname: "",
          phoneno: "",
          email: "",
          isDefault: true,
        },
      ]);
    }
  }, [vendorId]);

  const loadVendor = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      const vendor = await VendorService.GetVendorById(vendorId);
      if (vendor) {
        // Normalize contacts from API.
        // Backend JSON uses `vendorContact`, some frontend code expects `VendorContact`.
        const rawVendor: any = vendor as any;
        const vendorContacts: VendorContact[] =
          (Array.isArray(rawVendor.vendorContact) && rawVendor.vendorContact) ||
          (Array.isArray(rawVendor.VendorContact) && rawVendor.VendorContact) ||
          [];

        const vendorData: VendorMasterReq = {
          vendor_id: vendor.vendor_id,
          company_name: vendor.company_name || "",
          companyAlias: vendor.companyAlias || "",
          email: vendor.email || "",
          phone_number: vendor.phone_number || "",
          address: vendor.address || "",
          apartment: vendor.apartment || "",
          City: vendor.City || "",
          states: vendor.states || "",
          zipcode: vendor.zipcode || "",
          country: vendor.country || "US",
          shippingaddress: vendor.shippingaddress || "",
          shippingCity: vendor.shippingCity || "",
          shippingStates: vendor.shippingStates || "",
          shippingCountry: vendor.shippingCountry || "US",
          shippingZipCode: vendor.shippingZipCode || "",
          shippingApartment: vendor.shippingApartment || "",
          status: vendor.status || "Active",
          term: vendor.term || "NET30",
          ship_via: vendor.ship_via || "",
          TenantID: vendor.TenantID || tenantID,
          VendorContact: vendorContacts,
          coaAccountId: (vendor as any).coaAccountId || undefined,
          defaultExpenseAccountId: (vendor as any).defaultExpenseAccountId || undefined,
        };

        setFormData(vendorData);
        setVendorCode((vendor as any).vendorcode || "");
        const enabled = !!(vendor as any).portalAccessEnabled;
        setPortalAccessEnabled(enabled);
        setInitialPortalAccessEnabled(enabled);
        setPortalHasPassword(!!(vendor as any).portalHasPassword);
        setPortalPassword("");
        setPortalPasswordConfirm("");

        const shippingMatchesBilling =
          vendorData.shippingaddress === vendorData.address &&
          vendorData.shippingCity === vendorData.City &&
          vendorData.shippingStates === vendorData.states &&
          vendorData.shippingCountry === vendorData.country &&
          vendorData.shippingZipCode === vendorData.zipcode &&
          vendorData.shippingApartment === vendorData.apartment;

        setCopyFromBilling(shippingMatchesBilling);
        setContacts(
          vendorContacts && vendorContacts.length > 0
            ? vendorContacts
            : [
                {
                  id: 0,
                  customer_id: vendor.vendor_id,
                  title: "",
                  firstname: "",
                  lastname: "",
                  phoneno: "",
                  email: "",
                  isDefault: true,
                },
              ]
        );
      }
    } catch (error: any) {
      toast.error(`Error loading vendor: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (name: keyof VendorMasterReq, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setIsStateChanged(true);

    let error = "";
    if (name === "email" && value) {
      error = validateEmail(value);
    } else if (name === "phone_number" && value) {
      error = validatePhone(value);
    } else if ((name === "zipcode" || name === "shippingZipCode") && value) {
      error = validateZipCode(value);
    }

    setErrors((prev) => {
      const newErrors = { ...prev };
      if (!value || !error) {
        delete newErrors[name];
      } else {
        newErrors[name] = error;
      }
      return newErrors;
    });

    if (name === "country" && value !== "US") {
      setFormData((prev) => ({ ...prev, states: "" }));
    }
    if (name === "shippingCountry" && value !== "US") {
      setFormData((prev) => ({ ...prev, shippingStates: "" }));
    }
  };

  const handleContactChange = (index: number, field: keyof VendorContact, value: any) => {
    setContacts((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });

    let error = "";
    if (field === "email" && value) {
      error = validateEmail(value);
    } else if (field === "phoneno" && value) {
      error = validatePhone(value);
    }

    const errorKey = `${index}_${field}`;
    setContactErrors((prev) => {
      const newErrors = { ...prev };
      if (!value || !error) {
        delete newErrors[errorKey];
      } else {
        newErrors[errorKey] = error;
      }
      return newErrors;
    });
  };

  const handleAddContact = () => {
    setContacts((prev) => [
      ...prev,
      {
        id: 0,
        customer_id: vendorId,
        title: "",
        firstname: "",
        lastname: "",
        phoneno: "",
        email: "",
        isDefault: false,
      },
    ]);
  };

  const handleDeleteContact = (index: number) => {
    if (contacts.length > 1) {
      setContacts((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const handleDefaultContact = (index: number) => {
    setContacts((prev) =>
      prev.map((contact, i) => ({
        ...contact,
        isDefault: i === index,
      }))
    );
  };

  const handleCopyFromBillingToggle = (checked: boolean) => {
    setCopyFromBilling(checked);
    if (checked) {
      setFormData((prev) => ({
        ...prev,
        shippingaddress: prev.address,
        shippingCity: prev.City,
        shippingStates: prev.states,
        shippingCountry: prev.country,
        shippingZipCode: prev.zipcode,
        shippingApartment: prev.apartment,
      }));
      setIsStateChanged(true);
    }
  };

  useEffect(() => {
    if (copyFromBilling) {
      setFormData((prev) => ({
        ...prev,
        shippingaddress: prev.address,
        shippingCity: prev.City,
        shippingStates: prev.states,
        shippingCountry: prev.country,
        shippingZipCode: prev.zipcode,
        shippingApartment: prev.apartment,
      }));
    }
  }, [copyFromBilling, formData.address, formData.City, formData.states, formData.country, formData.zipcode, formData.apartment]);

  const handleDelete = async () => {
    if (vendorId === 0) return;
    
    setLoading(true);
    try {
      const response = await VendorService.CheckVendorDeletionImpact(vendorId);
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
    if (vendorId === 0 || !deletionImpact?.canDelete) return;

    setLoading(true);
    try {
      await VendorService.DeleteVendor(vendorId);
      toast.success("Vendor deleted successfully");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting vendor:", error);
      toast.error(`Error deleting vendor: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (vendorId === 0) return;
    
    try {
      const response = await VendorService.CheckVendorDeletionImpact(vendorId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    try {
      // Extract the service and method from the endpoint
      if (deleteEndpoint.includes('/Order/DeleteVendorOrder')) {
        const { VendorOrderService } = await import("../../Common/Services/VendorOrderService");
        await VendorOrderService.DeleteVendorOrder(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else if (deleteEndpoint.includes('/Quotation/DeleteVendorQuotation')) {
        const { QuotationService } = await import("../../Common/Services/QuotationService");
        await QuotationService.DeleteVendorQuotation(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else if (deleteEndpoint.includes('/VendorInvoice/DeleteVendorInvoice')) {
        const { VendorInvoiceService } = await import("../../Common/Services/VendorInvoiceService");
        await VendorInvoiceService.DeleteVendorInvoice(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      }
      
      // Refresh impact after deletion
      await refreshDeletionImpact();
    } catch (error: any) {
      console.error(`Error deleting ${dependencyType}:`, error);
      toast.error(`Failed to delete ${dependencyType}: ${error.message || "Unknown error"}`);
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
      const dependenciesToDelete: Array<{ type: string; id: number; name: string; endpoint: string }> = [];
      
      deletionImpact.blockingDependencies.forEach((dep) => {
        dep.items.forEach((item) => {
          dependenciesToDelete.push({
            type: dep.entityType,
            id: item.id,
            name: item.name,
            endpoint: item.deleteEndpoint
          });
        });
      });

      // Delete all dependencies sequentially
      for (const dep of dependenciesToDelete) {
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

      // After all dependencies are deleted, refresh impact
      const updatedResponse = await VendorService.CheckVendorDeletionImpact(vendorId);
      const updatedImpact = updatedResponse.result as DeletionImpactResult;

      if (updatedImpact.canDelete) {
        // All dependencies deleted, now delete the vendor
        await VendorService.DeleteVendor(vendorId);
        toast.success("Vendor and all dependencies deleted successfully");
        setShowDeletionDialog(false);
        onClose(true);
      } else {
        // Still have blocking dependencies, refresh the dialog
        setDeletionImpact(updatedImpact);
        toast.warning("Some dependencies could not be deleted. Please review and try again.");
      }
    } catch (error: any) {
      console.error("Error in delete all:", error);
      toast.error(`Error deleting vendor: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const newContactErrors: { [key: string]: string } = {};

    if (!formData.company_name || formData.company_name.trim() === "") {
      newErrors.company_name = "Vendor Name is required";
    }

    if (formData.email) {
      const emailError = validateEmail(formData.email);
      if (emailError) newErrors.email = emailError;
    }

    if (formData.phone_number) {
      const phoneError = validatePhone(formData.phone_number);
      if (phoneError) newErrors.phone_number = phoneError;
    }

    if (formData.zipcode) {
      const zipError = validateZipCode(formData.zipcode);
      if (zipError) newErrors.zipcode = zipError;
    }

    if (formData.shippingZipCode && !copyFromBilling) {
      const shippingZipError = validateZipCode(formData.shippingZipCode);
      if (shippingZipError) newErrors.shippingZipCode = shippingZipError;
    }

    if (portalAccessEnabled) {
      const needsPassword = !portalHasPassword || portalPassword.trim() !== "" || portalPasswordConfirm.trim() !== "";
      const enablingFirstTime = !initialPortalAccessEnabled || !portalHasPassword;
      if (enablingFirstTime || needsPassword) {
        if (enablingFirstTime && !portalPassword.trim()) {
          newErrors.portalPassword = "Password is required to enable portal access";
        } else if (portalPassword.trim() || portalPasswordConfirm.trim() || enablingFirstTime) {
          const settings = getCachedSettings() || getDefaultSystemSettings(1);
          const minLen = settings.minPasswordLength > 0 ? settings.minPasswordLength : 8;
          const pwd = portalPassword;
          if (pwd.length < minLen) {
            newErrors.portalPassword = `Password must be at least ${minLen} characters`;
          } else if (settings.requireUppercase && !/[A-Z]/.test(pwd)) {
            newErrors.portalPassword = "Password must contain an uppercase letter";
          } else if (settings.requireLowercase && !/[a-z]/.test(pwd)) {
            newErrors.portalPassword = "Password must contain a lowercase letter";
          } else if (settings.requireNumbers && !/[0-9]/.test(pwd)) {
            newErrors.portalPassword = "Password must contain a number";
          } else if (settings.requireSpecialChars && /^[A-Za-z0-9]*$/.test(pwd)) {
            newErrors.portalPassword = "Password must contain a special character";
          }
          if (portalPassword !== portalPasswordConfirm) {
            newErrors.portalPasswordConfirm = "Passwords do not match";
          }
        }
      }
    }

    contacts.forEach((contact, index) => {
      if (contact.email) {
        const emailError = validateEmail(contact.email);
        if (emailError) {
          newContactErrors[`${index}_email`] = emailError;
        }
      }
      if (contact.phoneno) {
        const phoneError = validatePhone(contact.phoneno);
        if (phoneError) {
          newContactErrors[`${index}_phoneno`] = phoneError;
        }
      }
    });

    setErrors(newErrors);
    setContactErrors(newContactErrors);

    const hasErrors = Object.keys(newErrors).length > 0 ||
      Object.keys(newContactErrors).length > 0;

    if (hasErrors) {
      toast.error("Please fix validation errors before submitting");
      if (newErrors.portalPassword || newErrors.portalPasswordConfirm || newErrors.email || newErrors.phone_number) {
        setActiveTab('vendor');
      } else if (newErrors.zipcode) {
        setActiveTab('billing');
      } else if (newErrors.shippingZipCode) {
        setActiveTab('shipping');
      } else if (Object.keys(newContactErrors).length > 0) {
        setActiveTab('contacts');
      }
    }

    return !hasErrors;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const saveData: VendorMasterReq = {
        ...formData,
        VendorContact: contacts,
        portalAccessEnabled,
      };
      if (portalPassword.trim()) {
        saveData.portalPassword = portalPassword.trim();
      }
      const saveResult = await VendorService.SaveVendorData(saveData);
      const savedVendorId =
        vendorId > 0
          ? vendorId
          : (saveResult?.vendor_id ?? saveResult?.vendorId ?? 0);

      const portalChanged =
        portalAccessEnabled !== initialPortalAccessEnabled ||
        (portalAccessEnabled && portalPassword.trim() !== "");

      // Keep dedicated portal call as fallback for older API builds / explicit password reset
      if (savedVendorId > 0 && portalChanged) {
        try {
          await VendorService.SaveVendorPortalAccess({
            vendorId: savedVendorId,
            enabled: portalAccessEnabled,
            newPassword: portalPassword.trim() || undefined,
          });
        } catch (portalError: any) {
          // If SaveVendorData already applied portalAccessEnabled, a 404 here is fine on older partial deploys
          const status = portalError?.response?.status;
          if (status && status !== 404) {
            throw portalError;
          }
        }
      }

      toast.success(
        vendorId > 0 ? "Vendor updated successfully" : "Vendor created successfully"
      );
      setIsStateChanged(false);
      onClose(true);
    } catch (error: any) {
      const message =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Unknown error";
      toast.error(`Error saving vendor: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading && vendorId > 0) {
    return (
      <div className="slideout-overlay">
        <div className="form-card">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading vendor...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="slideout-overlay" onClick={(e) => e.target === e.currentTarget && handleDismiss()}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>{vendorId > 0 ? 'Edit Vendor' : 'Add New Vendor'}</h2>
          <button type="button" className="btn-close" onClick={handleDismiss}>
            ×
          </button>
        </div>
        <form className="airframe-form" onSubmit={handleSubmit}>
          {/* Tab Navigation */}
          <div className="form-tabs">
            <div className="form-tabs-left">
              <button
                type="button"
                className={`form-tab ${activeTab === 'vendor' ? 'active' : ''}`}
                onClick={() => setActiveTab('vendor')}
              >
                Vendor Info
              </button>
              <button
                type="button"
                className={`form-tab ${activeTab === 'billing' ? 'active' : ''}`}
                onClick={() => setActiveTab('billing')}
              >
                Billing Address
              </button>
              <button
                type="button"
                className={`form-tab ${activeTab === 'shipping' ? 'active' : ''}`}
                onClick={() => setActiveTab('shipping')}
              >
                Shipping Address
              </button>
              <button
                type="button"
                className={`form-tab ${activeTab === 'contacts' ? 'active' : ''}`}
                onClick={() => setActiveTab('contacts')}
              >
                Contacts
              </button>
            </div>
            <div className="form-tabs-right">
              <div className="status-field-inline">
                <div className={`input-group ${formData.status === 'Active' ? 'status-active-group' : 'status-inactive-group'}`} style={{ maxWidth: '150px' }}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                      </svg>
                    </span>
                  </div>
                  <select
                    id="status"
                    name="status"
                    className={`form-input ${formData.status === 'Active' ? 'status-active' : 'status-inactive'}`}
                    value={formData.status}
                    onChange={(e) => handleInputChange("status", e.target.value)}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Tab 1: Vendor Info */}
          <div className={`tab-content ${activeTab !== 'vendor' ? 'tab-hidden' : ''}`}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="company_name">Vendor Name <span className="required">*</span></label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Building}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="company_name"
                    name="company_name"
                    className="form-input"
                    placeholder="Enter vendor name"
                    value={formData.company_name}
                    onChange={(e) => handleInputChange("company_name", e.target.value)}
                    required
                  />
                </div>
                {errors.company_name && <span className="error-message">{errors.company_name}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="companyAlias">Vendor Alias</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="companyAlias"
                    name="companyAlias"
                    className="form-input"
                    placeholder="Enter vendor alias"
                    value={formData.companyAlias}
                    onChange={(e) => handleInputChange("companyAlias", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className={`input-group ${errors.email ? 'has-error' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Mail}
                    </span>
                  </div>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className={`form-input ${errors.email ? 'error' : ''}`}
                    placeholder="Enter email address"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                  />
                </div>
                {errors.email && <span className="error-message">{errors.email}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="phone_number">Phone Number</label>
                <div className={`input-group ${errors.phone_number ? 'has-error' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Phone}
                    </span>
                  </div>
                  <input
                    type="tel"
                    id="phone_number"
                    name="phone_number"
                    className={`form-input ${errors.phone_number ? 'error' : ''}`}
                    placeholder="(555) 123-4567"
                    value={formData.phone_number}
                    onChange={(e) => handleInputChange("phone_number", e.target.value)}
                  />
                </div>
                {errors.phone_number && <span className="error-message">{errors.phone_number}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="term">Payment Terms</label>
                <select
                  id="term"
                  name="term"
                  className="form-input"
                  value={formData.term}
                  onChange={(e) => handleInputChange("term", e.target.value)}
                >
                  <option value="NET15">Net 15</option>
                  <option value="NET30">Net 30</option>
                  <option value="NET60">Net 60</option>
                  <option value="NET90">Net 90</option>
                  <option value="COD">Cash on Delivery</option>
                  <option value="PREPAID">Prepaid</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="ship_via">Ship Via</label>
                <input
                  type="text"
                  id="ship_via"
                  name="ship_via"
                  className="form-input"
                  placeholder="Enter shipping method"
                  value={formData.ship_via}
                  onChange={(e) => handleInputChange("ship_via", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="form-group">
                <label htmlFor="coaAccountId">Accounts Payable</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <select
                    id="coaAccountId"
                    name="coaAccountId"
                    className="form-input"
                    value={formData.coaAccountId || ""}
                    onChange={(e) => handleInputChange("coaAccountId", e.target.value ? parseInt(e.target.value) : undefined)}
                  >
                    <option value="">Use company default AP</option>
                    {coaAccounts.map((coa) => (
                      <option key={coa.accountID} value={coa.accountID}>
                        {coa.accountCode} - {coa.accountName}
                      </option>
                    ))}
                  </select>
                </div>
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Liability control account credited on vendor bills.
                </small>
              </div>
              <div className="form-group">
                <label htmlFor="defaultExpenseAccountId">Default Expense Account</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <select
                    id="defaultExpenseAccountId"
                    name="defaultExpenseAccountId"
                    className="form-input"
                    value={formData.defaultExpenseAccountId || ""}
                    onChange={(e) => handleInputChange("defaultExpenseAccountId", e.target.value ? parseInt(e.target.value) : undefined)}
                  >
                    <option value="">Use company default expense</option>
                    {coaAccounts.map((coa) => (
                      <option key={`exp-${coa.accountID}`} value={coa.accountID}>
                        {coa.accountCode} - {coa.accountName}
                      </option>
                    ))}
                  </select>
                </div>
                <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  Used when a PO line has no GL code.
                </small>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: portalAccessEnabled ? '1rem' : 0 }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#111827', margin: 0 }}>
                    Vendor Portal Access
                  </h3>
                  <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0.25rem 0 0' }}>
                    Allow this vendor to sign in at /vendor/login with their vendor code.
                  </p>
                </div>
                <label className="checkbox-wrapper" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={portalAccessEnabled}
                    onChange={(e) => {
                      setPortalAccessEnabled(e.target.checked);
                      setPortalPassword("");
                      setPortalPasswordConfirm("");
                      setIsStateChanged(true);
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.portalPassword;
                        delete next.portalPasswordConfirm;
                        return next;
                      });
                    }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Enable Portal</span>
                </label>
              </div>

              {portalAccessEnabled && (
                <>
                  {vendorCode && (
                    <p style={{ fontSize: '0.8125rem', color: '#374151', marginBottom: '0.75rem' }}>
                      Login vendor code: <strong>{vendorCode}</strong>
                      {vendorId === 0 && (
                        <span style={{ color: '#6b7280' }}> (assigned after save)</span>
                      )}
                    </p>
                  )}
                  {!vendorCode && vendorId === 0 && (
                    <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                      Vendor code will be assigned when the vendor is saved.
                    </p>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="portalPassword">
                        {portalHasPassword ? "New Portal Password" : "Portal Password"}
                        {(!portalHasPassword || !initialPortalAccessEnabled) && (
                          <span className="required"> *</span>
                        )}
                      </label>
                      <input
                        type="password"
                        id="portalPassword"
                        name="portalPassword"
                        className={`form-input ${errors.portalPassword ? "error" : ""}`}
                        autoComplete="new-password"
                        placeholder={
                          portalHasPassword
                            ? "Leave blank to keep current password"
                            : "Enter portal password"
                        }
                        value={portalPassword}
                        onChange={(e) => {
                          setPortalPassword(e.target.value);
                          setIsStateChanged(true);
                        }}
                      />
                      {errors.portalPassword && (
                        <span className="error-message">{errors.portalPassword}</span>
                      )}
                      {!errors.portalPassword && (
                        <span style={{ fontSize: "0.75rem", color: "#6b7280", display: "block", marginTop: "0.25rem" }}>
                          {(() => {
                            const s = getCachedSettings() || getDefaultSystemSettings(1);
                            const parts = [`at least ${s.minPasswordLength || 8} characters`];
                            if (s.requireUppercase) parts.push("uppercase");
                            if (s.requireLowercase) parts.push("lowercase");
                            if (s.requireNumbers) parts.push("a number");
                            if (s.requireSpecialChars) parts.push("a special character");
                            return `Must include ${parts.join(", ")}.`;
                          })()}
                        </span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="portalPasswordConfirm">
                        Confirm Password
                        {(!portalHasPassword || !initialPortalAccessEnabled || portalPassword.trim() !== "") && (
                          <span className="required"> *</span>
                        )}
                      </label>
                      <input
                        type="password"
                        id="portalPasswordConfirm"
                        name="portalPasswordConfirm"
                        className={`form-input ${errors.portalPasswordConfirm ? "error" : ""}`}
                        autoComplete="new-password"
                        placeholder="Confirm portal password"
                        value={portalPasswordConfirm}
                        onChange={(e) => {
                          setPortalPasswordConfirm(e.target.value);
                          setIsStateChanged(true);
                        }}
                      />
                      {errors.portalPasswordConfirm && (
                        <span className="error-message">{errors.portalPasswordConfirm}</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Tab 2: Billing Address */}
          <div className={`tab-content ${activeTab !== 'billing' ? 'tab-hidden' : ''}`}>
            <div className="form-group">
              <label htmlFor="address">Street Address</label>
              <div className="input-group">
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </span>
                </div>
                <input
                  type="text"
                  id="address"
                  name="address"
                  className="form-input"
                  placeholder="Enter street address"
                  value={formData.address}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="apartment">Unit/Suite</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Building}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="apartment"
                    name="apartment"
                    className="form-input"
                    placeholder="Apt, Suite, etc."
                    value={formData.apartment}
                    onChange={(e) => handleInputChange("apartment", e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="City">City</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Location}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="City"
                    name="City"
                    className="form-input"
                    placeholder="Enter city"
                    value={formData.City}
                    onChange={(e) => handleInputChange("City", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="states">State</label>
                {formData.country === "US" ? (
                  <select
                    id="states"
                    name="states"
                    className="form-input"
                    value={formData.states}
                    onChange={(e) => handleInputChange("states", e.target.value)}
                  >
                    <option value="">Select State</option>
                    {US_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    id="states"
                    name="states"
                    className="form-input"
                    placeholder="Enter state"
                    value={formData.states}
                    onChange={(e) => handleInputChange("states", e.target.value)}
                  />
                )}
              </div>
              <div className="form-group">
                <label htmlFor="zipcode">Zip Code</label>
                <input
                  type="text"
                  id="zipcode"
                  name="zipcode"
                  className={`form-input ${errors.zipcode ? 'error' : ''}`}
                  placeholder="Enter zip code"
                  value={formData.zipcode}
                  onChange={(e) => handleInputChange("zipcode", e.target.value)}
                />
                {errors.zipcode && <span className="error-message">{errors.zipcode}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="country">Country</label>
                <select
                  id="country"
                  name="country"
                  className="form-input"
                  value={formData.country}
                  onChange={(e) => {
                    handleInputChange("country", e.target.value);
                    if (e.target.value !== "US") {
                      handleInputChange("states", "");
                    }
                  }}
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tab 3: Shipping Address */}
          <div className={`tab-content ${activeTab !== 'shipping' ? 'tab-hidden' : ''}`}>
            <div className="form-group">
              <div className="label-with-toggle">
                <label htmlFor="shippingaddress">Street Address</label>
                <label className="copy-toggle-wrapper">
                  <input
                    type="checkbox"
                    checked={copyFromBilling}
                    onChange={(e) => handleCopyFromBillingToggle(e.target.checked)}
                    className="copy-toggle"
                  />
                  <span>Copy from Billing?</span>
                </label>
              </div>
              <div className={`input-group ${copyFromBilling ? 'disabled' : ''}`}>
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                  </span>
                </div>
                <input
                  type="text"
                  id="shippingaddress"
                  name="shippingaddress"
                  className="form-input"
                  placeholder="Enter shipping address"
                  value={formData.shippingaddress}
                  onChange={(e) => handleInputChange("shippingaddress", e.target.value)}
                  disabled={copyFromBilling}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shippingApartment">Unit/Suite</label>
                <div className={`input-group ${copyFromBilling ? 'disabled' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Building}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="shippingApartment"
                    name="shippingApartment"
                    className="form-input"
                    placeholder="Apt, Suite, etc."
                    value={formData.shippingApartment}
                    onChange={(e) => handleInputChange("shippingApartment", e.target.value)}
                    disabled={copyFromBilling}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="shippingCity">City</label>
                <div className={`input-group ${copyFromBilling ? 'disabled' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Location}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="shippingCity"
                    name="shippingCity"
                    className="form-input"
                    placeholder="Enter shipping city"
                    value={formData.shippingCity}
                    onChange={(e) => handleInputChange("shippingCity", e.target.value)}
                    disabled={copyFromBilling}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="shippingStates">State</label>
                {formData.shippingCountry === "US" ? (
                  <select
                    id="shippingStates"
                    name="shippingStates"
                    className="form-input"
                    value={formData.shippingStates}
                    onChange={(e) => handleInputChange("shippingStates", e.target.value)}
                    disabled={copyFromBilling}
                  >
                    <option value="">Select State</option>
                    {US_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    id="shippingStates"
                    name="shippingStates"
                    className="form-input"
                    placeholder="Enter shipping state"
                    value={formData.shippingStates}
                    onChange={(e) => handleInputChange("shippingStates", e.target.value)}
                    disabled={copyFromBilling}
                  />
                )}
              </div>
              <div className="form-group">
                <label htmlFor="shippingZipCode">Zip Code</label>
                <input
                  type="text"
                  id="shippingZipCode"
                  name="shippingZipCode"
                  className={`form-input ${errors.shippingZipCode ? 'error' : ''}`}
                  placeholder="Enter shipping zip code"
                  value={formData.shippingZipCode}
                  onChange={(e) => handleInputChange("shippingZipCode", e.target.value)}
                  disabled={copyFromBilling}
                />
                {errors.shippingZipCode && <span className="error-message">{errors.shippingZipCode}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="shippingCountry">Country</label>
                <select
                  id="shippingCountry"
                  name="shippingCountry"
                  className="form-input"
                  value={formData.shippingCountry}
                  onChange={(e) => {
                    handleInputChange("shippingCountry", e.target.value);
                    if (e.target.value !== "US") {
                      handleInputChange("shippingStates", "");
                    }
                  }}
                  disabled={copyFromBilling}
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tab 4: Contacts */}
          <div className={`tab-content ${activeTab !== 'contacts' ? 'tab-hidden' : ''}`}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
              <button
                type="button"
                className="btn-add-contact"
                onClick={handleAddContact}
              >
                + Add Contact
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="empty-contacts">
                <p>No contacts added</p>
                <button
                  type="button"
                  className="btn-add-contact-inline"
                  onClick={handleAddContact}
                >
                  Add First Contact
                </button>
              </div>
            ) : (
              <div className="contacts-list">
                {contacts.map((contact, index) => (
                  <div key={index} className="contact-item">
                    <div className="contact-header">
                      <div className="contact-number">Contact #{index + 1}</div>
                      <div className="contact-actions">
                        <label className="checkbox-wrapper">
                          <input
                            type="checkbox"
                            checked={contact.isDefault}
                            onChange={() => handleDefaultContact(index)}
                          />
                          <span>Default</span>
                        </label>
                        {contacts.length > 1 && (
                          <button
                            type="button"
                            className="btn-icon btn-icon-danger"
                            onClick={() => handleDeleteContact(index)}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="contact-info">
                      <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <div className="form-group">
                          <label>Role/Title</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="e.g., Manager, Director"
                            value={contact.title}
                            onChange={(e) =>
                              handleContactChange(index, "title", e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>First Name</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="First name"
                            value={contact.firstname}
                            onChange={(e) =>
                              handleContactChange(index, "firstname", e.target.value)
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label>Last Name</label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder="Last name"
                            value={contact.lastname}
                            onChange={(e) =>
                              handleContactChange(index, "lastname", e.target.value)
                            }
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Phone</label>
                          <div className={`input-group ${contactErrors[`${index}_phoneno`] ? 'has-error' : ''}`}>
                            <div className="input-group-prepend">
                              <span className="input-group-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                                </svg>
                              </span>
                            </div>
                            <input
                              type="tel"
                              className={`form-input ${contactErrors[`${index}_phoneno`] ? 'error' : ''}`}
                              placeholder="(555) 123-4567"
                              value={contact.phoneno}
                              onChange={(e) =>
                                handleContactChange(index, "phoneno", e.target.value)
                              }
                            />
                          </div>
                          {contactErrors[`${index}_phoneno`] && (
                            <span className="error-message">{contactErrors[`${index}_phoneno`]}</span>
                          )}
                        </div>
                        <div className="form-group">
                          <label>Email</label>
                          <div className={`input-group ${contactErrors[`${index}_email`] ? 'has-error' : ''}`}>
                            <div className="input-group-prepend">
                              <span className="input-group-icon">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                  <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                              </span>
                            </div>
                            <input
                              type="email"
                              className={`form-input ${contactErrors[`${index}_email`] ? 'error' : ''}`}
                              placeholder="email@example.com"
                              value={contact.email}
                              onChange={(e) =>
                                handleContactChange(index, "email", e.target.value)
                              }
                            />
                          </div>
                          {contactErrors[`${index}_email`] && (
                            <span className="error-message">{contactErrors[`${index}_email`]}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="form-actions">
            {vendorId > 0 && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  opacity: loading ? 0.6 : 1
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete
              </button>
            )}
            <button
              type="button"
              className="btn-cancel"
              onClick={handleDismiss}
              disabled={loading}
            >
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? 'Saving...' : vendorId > 0 ? 'Update Vendor' : 'Add Vendor'}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Vendor ${formData.company_name || `#${vendorId}`}`}
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

export default VendorMasterSlideout;

export {};



