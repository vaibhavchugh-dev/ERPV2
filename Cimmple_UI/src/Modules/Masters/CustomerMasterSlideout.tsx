import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  CustomerService,
  CustomerMaster,
  CustomerMasterReq,
  CustomerContact,
} from "../../Common/Services/CustomerService";
import { validateEmail, validatePhone, validateZipCode } from "../../Common/Utils/validation";
import { US_STATES, COUNTRIES, Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./CustomerMasterSlideout.scss";

interface CustomerMasterSlideoutProps {
  customerId: number;
  onClose: (refreshList?: boolean) => void;
}

const CustomerMasterSlideout: React.FC<CustomerMasterSlideoutProps> = ({
  customerId,
  onClose,
}) => {
  const handleDismiss = () => onClose(false);
  const [formData, setFormData] = useState<CustomerMasterReq>({
    customer_id: 0,
    company_name: "",
    companyAlias: "",
    email: "",
    phone_number: "",
    address: "",
    apartment: "",
    City: "",
    states: "",
    zip: "",
    country: "US",
    shippingAddress: "",
    shippingCity: "",
    shippingStates: "",
    shippingCountry: "US",
    shippingZipCode: "",
    shippingApartment: "",
    status: "Active",
    TenantID: 0,
    CustomerContact: [],
  });

  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'billing' | 'shipping' | 'contacts'>('company');
  const [copyFromBilling, setCopyFromBilling] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [contactErrors, setContactErrors] = useState<{ [key: string]: string }>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      TenantID: storage?.tenantID || 0,
    }));

    if (customerId > 0) {
      loadCustomer();
    } else {
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
  }, [customerId]);

  const loadCustomer = async () => {
    setLoading(true);
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;

      const customer = await CustomerService.GetCustomerById(customerId);
      if (customer) {
        // Normalize contacts from API.
        // Backend JSON uses `customerContact`, some frontend code expects `CustomerContact`.
        const rawCustomer: any = customer as any;
        const customerContacts: CustomerContact[] =
          (Array.isArray(rawCustomer.customerContact) && rawCustomer.customerContact) ||
          (Array.isArray(rawCustomer.CustomerContact) && rawCustomer.CustomerContact) ||
          [];

        const customerData = {
          customer_id: customer.customer_id,
          company_name: customer.company_name || "",
          companyAlias: customer.companyAlias || "",
          email: customer.email || "",
          phone_number: customer.phone_number || "",
          address: customer.address || "",
          apartment: customer.apartment || "",
          City: customer.city || "",
          states: customer.state || "",
          zip: customer.zip || "",
          country: customer.country || "US",
          shippingAddress: customer.shippingAddress || "",
          shippingCity: customer.shippingCity || "",
          shippingStates: customer.shippingStates || "",
          shippingCountry: customer.shippingCountry || "US",
          shippingZipCode: customer.shippingZipCode || "",
          shippingApartment: customer.shippingApartment || "",
          status: customer.status || "Active",
          TenantID: customer.Tenantid || tenantID,
          CustomerContact: customerContacts,
        };
        
        setFormData(customerData);
        
        // Check if shipping matches billing
        const shippingMatchesBilling = 
          customerData.shippingAddress === customerData.address &&
          customerData.shippingCity === customerData.City &&
          customerData.shippingStates === customerData.states &&
          customerData.shippingCountry === customerData.country &&
          customerData.shippingZipCode === customerData.zip &&
          customerData.shippingApartment === customerData.apartment;
        
        setCopyFromBilling(shippingMatchesBilling);
        console.log("customer from API", customer);
        console.log("normalized customerContacts", customerContacts);
        console.log("contacts state before set", contacts);
        setContacts(
          customerContacts && customerContacts.length > 0
            ? customerContacts
            : [
                {
                  id: 0,
                  customer_id: customer.customer_id,
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
      toast.error(`Error loading customer: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };


  const handleInputChange = (field: keyof CustomerMasterReq, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsStateChanged(true);

    // Validate on change
    let error = "";
    if (field === "email" && value) {
      error = validateEmail(value);
    } else if (field === "phone_number" && value) {
      error = validatePhone(value);
    } else if ((field === "zip" || field === "shippingZipCode") && value) {
      error = validateZipCode(value);
    }

    // Update errors - clear if empty or valid, set if invalid
    setErrors((prev) => {
      const newErrors = { ...prev };
      if (!value || !error) {
        delete newErrors[field];
      } else {
        newErrors[field] = error;
      }
      return newErrors;
    });
  };

  const handleContactChange = (
    index: number,
    field: keyof CustomerContact,
    value: any
  ) => {
    const updatedContacts = [...contacts];
    updatedContacts[index] = {
      ...updatedContacts[index],
      [field]: value,
    };
    setContacts(updatedContacts);
    setIsStateChanged(true);

    // Validate contact fields
    let error = "";
    if (field === "email" && value) {
      error = validateEmail(value);
    } else if (field === "phoneno" && value) {
      error = validatePhone(value);
    }

    // Update contact errors
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

  const handleDefaultContact = (index: number) => {
    const updatedContacts = contacts.map((contact, i) => ({
      ...contact,
      isDefault: i === index,
    }));
    setContacts(updatedContacts);
    setIsStateChanged(true);
  };

  const handleAddContact = () => {
    const newContact: CustomerContact = {
      id: 0,
      customer_id: formData.customer_id,
      title: "",
      firstname: "",
      lastname: "",
      phoneno: "",
      email: "",
      isDefault: false,
    };
    setContacts([...contacts, newContact]);
    setIsStateChanged(true);
  };

  const handleDeleteContact = (index: number) => {
    if (contacts.length > 1) {
      const updatedContacts = contacts.filter((_, i) => i !== index);
      if (!updatedContacts.some((c) => c.isDefault) && updatedContacts.length > 0) {
        updatedContacts[0].isDefault = true;
      }
      setContacts(updatedContacts);
      setIsStateChanged(true);
    }
  };

  const handleCopyFromBillingToggle = (checked: boolean) => {
    setCopyFromBilling(checked);
    if (checked) {
      setFormData((prev) => ({
        ...prev,
        shippingAddress: prev.address,
        shippingCity: prev.City,
        shippingStates: prev.states,
        shippingCountry: prev.country,
        shippingZipCode: prev.zip,
        shippingApartment: prev.apartment,
      }));
      setIsStateChanged(true);
    }
  };

  // Update shipping address when billing address changes and toggle is on
  useEffect(() => {
    if (copyFromBilling) {
      setFormData((prev) => ({
        ...prev,
        shippingAddress: prev.address,
        shippingCity: prev.City,
        shippingStates: prev.states,
        shippingCountry: prev.country,
        shippingZipCode: prev.zip,
        shippingApartment: prev.apartment,
      }));
    }
  }, [copyFromBilling, formData.address, formData.City, formData.states, formData.country, formData.zip, formData.apartment]);

  const handleDelete = async () => {
    if (customerId === 0) return;
    
    setLoading(true);
    try {
      const response = await CustomerService.CheckCustomerDeletionImpact(customerId);
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
    const canDelete = deletionImpact?.canDelete ?? (deletionImpact as any)?.CanDelete ?? true;
    if (customerId === 0 || !canDelete) return;

    setLoading(true);
    try {
      await CustomerService.DeleteCustomer(customerId);
      toast.success("Customer deleted successfully");
      setShowDeletionDialog(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting customer:", error);
      toast.error(`Error deleting customer: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (customerId === 0) return;
    
    try {
      const response = await CustomerService.CheckCustomerDeletionImpact(customerId);
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
      if (deleteEndpoint.includes('/Order/DeleteOrder')) {
        const { OrderService } = await import("../../Common/Services/OrderService");
        await OrderService.DeleteOrder(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else if (deleteEndpoint.includes('/Quotation/DeleteQuotation')) {
        const { QuotationService } = await import("../../Common/Services/QuotationService");
        await QuotationService.DeleteQuotation(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else if (deleteEndpoint.includes('/Invoice/DeleteInvoice')) {
        const { InvoiceService } = await import("../../Common/Services/InvoiceService");
        await InvoiceService.DeleteInvoice(itemId);
        toast.success(`${dependencyType} deleted successfully`);
      } else if (deleteEndpoint.includes('/Shipping/DeleteShipment')) {
        const { ShippingService } = await import("../../Common/Services/ShippingService");
        await ShippingService.DeleteShipment(itemId);
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
      const updatedResponse = await CustomerService.CheckCustomerDeletionImpact(customerId);
      const updatedImpact = updatedResponse.result as DeletionImpactResult;

      if (updatedImpact.canDelete) {
        // All dependencies deleted, now delete the customer
        await CustomerService.DeleteCustomer(customerId);
        toast.success("Customer and all dependencies deleted successfully");
        setShowDeletionDialog(false);
        onClose(true);
      } else {
        // Still have blocking dependencies, refresh the dialog
        setDeletionImpact(updatedImpact);
        toast.warning("Some dependencies could not be deleted. Please review and try again.");
      }
    } catch (error: any) {
      console.error("Error in delete all:", error);
      toast.error(`Error deleting customer: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    const newContactErrors: { [key: string]: string } = {};

    // Validate required fields
    if (!formData.company_name || formData.company_name.trim() === "") {
      newErrors.company_name = "Company Name is required";
    }

    // Validate company email
    if (formData.email) {
      const emailError = validateEmail(formData.email);
      if (emailError) newErrors.email = emailError;
    }

    // Validate company phone
    if (formData.phone_number) {
      const phoneError = validatePhone(formData.phone_number);
      if (phoneError) newErrors.phone_number = phoneError;
    }

    // Validate billing zip
    if (formData.zip) {
      const zipError = validateZipCode(formData.zip);
      if (zipError) newErrors.zip = zipError;
    }

    // Validate shipping zip
    if (formData.shippingZipCode && !copyFromBilling) {
      const shippingZipError = validateZipCode(formData.shippingZipCode);
      if (shippingZipError) newErrors.shippingZipCode = shippingZipError;
    }

    // Validate contact emails and phones
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

    // Check if there are any errors
    const hasErrors = Object.keys(newErrors).length > 0 || 
                     Object.keys(newContactErrors).length > 0;
    
    if (hasErrors) {
      toast.error("Please fix validation errors before submitting");
      // Switch to tab with errors if needed
      if (newErrors.email || newErrors.phone_number) {
        setActiveTab('company');
      } else if (newErrors.zip) {
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
    
    // Validate form before submission
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      const saveData: CustomerMasterReq = {
        ...formData,
        CustomerContact: contacts,
      };

      await CustomerService.SaveCustomerData(saveData);
      toast.success(
        customerId > 0 ? "Customer updated successfully" : "Customer created successfully"
      );
      setIsStateChanged(false);
      onClose(true);
    } catch (error: any) {
      toast.error(`Error saving customer: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="slideout-overlay" onClick={handleDismiss}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>{customerId > 0 ? 'Edit Customer' : 'Add New Customer'}</h2>
          <button className="btn-close" onClick={handleDismiss}>×</button>
        </div>
        <form className="airframe-form" onSubmit={handleSubmit}>
          {/* Tab Navigation */}
          <div className="form-tabs">
            <div className="form-tabs-left">
              <button
                type="button"
                className={`form-tab ${activeTab === 'company' ? 'active' : ''}`}
                onClick={() => setActiveTab('company')}
              >
                Company Information
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

          {/* Tab 1: Company Information */}
          <div className={`tab-content ${activeTab !== 'company' ? 'tab-hidden' : ''}`}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="company_name">Company Name <span className="required">*</span></label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    id="company_name"
                    name="company_name"
                    className="form-input"
                    placeholder="Enter company name"
                    value={formData.company_name}
                    onChange={(e) => handleInputChange("company_name", e.target.value)}
                    required
                  />
                </div>
                {errors.company_name && <span className="error-message">{errors.company_name}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="companyAlias">Company Alias</label>
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
                    placeholder="Enter company alias"
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
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
                <label htmlFor="zip">Zip Code</label>
                <input
                  type="text"
                  id="zip"
                  name="zip"
                  className={`form-input ${errors.zip ? 'error' : ''}`}
                  placeholder="Enter zip code"
                  value={formData.zip}
                  onChange={(e) => handleInputChange("zip", e.target.value)}
                />
                {errors.zip && <span className="error-message">{errors.zip}</span>}
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
                    // Clear state if country changes from US
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
                <label htmlFor="shippingAddress">Street Address</label>
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
                  id="shippingAddress"
                  name="shippingAddress"
                  className="form-input"
                  placeholder="Enter shipping address"
                  value={formData.shippingAddress}
                  onChange={(e) => handleInputChange("shippingAddress", e.target.value)}
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
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
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                      </svg>
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
                    // Clear state if country changes from US
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
            {customerId > 0 && (
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
              {loading ? 'Saving...' : customerId > 0 ? 'Update Customer' : 'Add Customer'}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Customer ${formData.company_name || `#${customerId}`}`}
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

export default CustomerMasterSlideout;
