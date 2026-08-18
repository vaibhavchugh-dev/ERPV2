import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  BankService,
  BankMaster,
  BankMasterReq,
} from "../../Common/Services/BankService";
import { ChartofAccountsService } from "../../Common/Services/ChartofAccountsService";
import { validateEmail, validatePhone, validateZipCode } from "../../Common/Utils/validation";
import { Utils } from "../../Common/Utilis";
import { US_STATES, COUNTRIES, Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "../../Common/Components/MasterSlideout/MasterSlideout.scss";

interface BankMasterSlideoutProps {
  bankId: number;
  onClose: (refreshList?: boolean) => void;
}

const BankMasterSlideout: React.FC<BankMasterSlideoutProps> = ({
  bankId,
  onClose,
}) => {
  const handleDismiss = () => onClose(false);
  const [formData, setFormData] = useState<BankMasterReq>({
    Id: 0,
    BankName: "",
    AccountNo: "",
    AccountType: "Checking",
    RoutingNumber: "",
    Phone: "",
    Email: "",
    street: "",
    apartment: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    Balance: 0,
    startingcheck: 0,
    checkseries: "",
    coa: "",
    NickName: "",
    status: "Active",
    isprimary: false,
    ispayrollDefault: false,
    TenantID: 0,
    locationId: 0,
  });

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'bank' | 'contact'>('bank');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [balanceDisplay, setBalanceDisplay] = useState<string>("");
  const [isStateEditable, setIsStateEditable] = useState(false);
  const [coaAccounts, setCoaAccounts] = useState<Array<{ accountID: number; accountCode: string; accountName: string }>>([]);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

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
    const locationId = Number(localStorage.getItem("locationId") || 0);
    setFormData((prev) => ({
      ...prev,
      TenantID: storage?.tenantID || 0,
      locationId: locationId > 0 ? locationId : 0,
    }));

    loadCOAAccounts();

    if (bankId > 0) {
      loadBank();
    } else {
      setBalanceDisplay("$0.00");
    }
  }, [bankId]);

  const loadBank = async () => {
    setLoading(true);
    try {
      const bank = await BankService.GetBankById(bankId);
      if (bank) {
        const bankData: BankMasterReq = {
          Id: bank.id,
          BankName: bank.bankName || "",
          AccountNo: bank.accountNo || "",
          AccountType: bank.accountType || "Checking",
          RoutingNumber: bank.routingNumber || "",
          Phone: bank.phone || "",
          Email: bank.email || "",
          street: bank.street || "",
          apartment: (bank as any).apartment || "",
          city: bank.city || "",
          state: bank.state || "",
          zip: bank.zip || "",
          country: (bank as any).country || "US",
          Balance: bank.balance || 0,
          startingcheck: bank.startingcheck || 0,
          checkseries: bank.checkseries || "",
          coa: bank.coa || "",
          NickName: bank.nickName || "",
          status: bank.status || "Active",
          isprimary: bank.isprimary || false,
          ispayrollDefault: bank.ispayrollDefault || false,
          TenantID: bank.TenantId || 0,
          locationId: bank.locationId || 0,
        };
        
        setFormData(bankData);
        // Use settings-aware formatting - will fallback to defaults if settings not loaded
        const storage = JSON.parse(localStorage.getItem('storage') || '{}');
        const tenantId = storage?.tenantID || 1;
        // Try to get settings from context if available, otherwise use Utils default
        setBalanceDisplay(Utils.currencyFormat(bank.balance || 0));
        setIsStateEditable(bankData.country !== "US");
      }
    } catch (error: any) {
      toast.error(`Error loading bank: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof BankMasterReq, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Handle balance formatting
    if (field === "Balance") {
      const numericValue = Utils.removeInvaildCharFromAmount(value);
      const numValue = parseFloat(numericValue) || 0;
      setFormData((prev) => ({
        ...prev,
        Balance: numValue,
      }));
      setBalanceDisplay(Utils.currencyFormat(numValue));
    }

    // Handle country change - clear state if changing from US
    if (field === "country" && value !== "US") {
      setFormData((prev) => ({
        ...prev,
        state: "",
      }));
      setIsStateEditable(true);
    } else if (field === "country" && value === "US") {
      setIsStateEditable(false);
    }

    // Validate on change
    let error = "";
    if (field === "Email" && value) {
      error = validateEmail(value);
    } else if (field === "Phone" && value) {
      error = validatePhone(value);
    } else if (field === "zip" && value) {
      error = validateZipCode(value);
    }
    // COA validation removed - now handled by dropdown selection

    // Update errors
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

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate required fields
    if (!formData.BankName || formData.BankName.trim() === "") {
      newErrors.BankName = "Bank Name is required";
    }

    if (!formData.AccountNo || formData.AccountNo.trim() === "") {
      newErrors.AccountNo = "Account No is required";
    }

    if (!formData.NickName || formData.NickName.trim() === "") {
      newErrors.NickName = "Short Name is required";
    }

    if (!formData.startingcheck || formData.startingcheck === 0) {
      newErrors.startingcheck = "Starting Check No is required";
    }

    if (!formData.checkseries || formData.checkseries.trim() === "") {
      newErrors.checkseries = "Check Series is required";
    }


    // Validate email
    if (formData.Email) {
      const emailError = validateEmail(formData.Email);
      if (emailError) newErrors.Email = emailError;
    }

    // Validate phone
    if (formData.Phone) {
      const phoneError = validatePhone(formData.Phone);
      if (phoneError) newErrors.Phone = phoneError;
    }

    // Validate zip
    if (formData.zip) {
      const zipError = validateZipCode(formData.zip);
      if (zipError) newErrors.zip = zipError;
    }

    setErrors(newErrors);

    const hasErrors = Object.keys(newErrors).length > 0;
    
    if (hasErrors) {
      toast.error("Please fix validation errors before submitting");
      if (newErrors.BankName || newErrors.AccountNo || newErrors.NickName || newErrors.startingcheck || newErrors.checkseries) {
        setActiveTab('bank');
      } else if (newErrors.Email || newErrors.Phone || newErrors.zip) {
        setActiveTab('contact');
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
      const saveData: BankMasterReq = {
        ...formData,
      };

      const result = await BankService.SaveBankData(saveData);
      
      if (result && (result as any).accountNo === "duplicate") {
        toast.error("Account no. / Routing no already exists");
      } else if (result && (result as any).coa === "duplicate") {
        toast.error("COA already exists");
      } else {
        toast.success(
          bankId > 0 ? "Bank updated successfully" : "Bank created successfully"
        );
        onClose(true);
      }
    } catch (error: any) {
      toast.error(`Error saving bank: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (bankId === 0) return;
    
    setLoading(true);
    try {
      const response = await BankService.CheckBankDeletionImpact(bankId);
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
    if (bankId === 0) return;
    setLoading(true);
    try {
      await BankService.DeleteBank(bankId);
      toast.success("Bank deleted successfully");
      setShowDeletionDialog(false);
      setDeletionImpact(null);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting bank:", error);
      toast.error(`Error deleting bank: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (bankId === 0) return;
    try {
      const response = await BankService.CheckBankDeletionImpact(bankId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    // Handle dependency deletion based on endpoint
    setLoading(true);
    try {
      // This would need to be implemented based on the specific endpoint
      toast.info(`Deleting ${dependencyType}...`);
      await refreshDeletionImpact();
    } catch (error: any) {
      console.error(`Error deleting ${dependencyType}:`, error);
      toast.error(`Error deleting ${dependencyType}: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!deletionImpact || bankId === 0) return;
    setLoading(true);
    try {
      // Delete all blocking dependencies first
      if (deletionImpact.blockingDependencies && deletionImpact.blockingDependencies.length > 0) {
        for (const dependency of deletionImpact.blockingDependencies) {
          for (const item of dependency.items) {
            try {
              await handleDeleteDependency(dependency.entityType, item.id, item.deleteEndpoint);
            } catch (error) {
              console.error(`Error deleting ${dependency.entityType} ${item.id}:`, error);
            }
          }
        }
      }
      
      // Refresh impact to check if we can delete now
      await refreshDeletionImpact();
      
      // If still can't delete, show error
      const updatedResponse = await BankService.CheckBankDeletionImpact(bankId);
      const updatedImpact = updatedResponse.result as DeletionImpactResult;
      
      if (!updatedImpact.canDelete) {
        toast.error("Some dependencies could not be deleted. Please try again.");
        setDeletionImpact(updatedImpact);
        return;
      }
      
      // Now delete the main bank
      await confirmDeletion();
    } catch (error: any) {
      console.error("Error in delete all:", error);
      toast.error(`Error deleting dependencies: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="slideout-overlay" onClick={handleDismiss}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>{bankId > 0 ? "Edit Bank" : "Add New Bank"}</h2>
          <button type="button" className="btn-close" onClick={handleDismiss}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form className="airframe-form" onSubmit={handleSubmit}>
          <div className="form-tabs">
            <div className="form-tabs-left">
              <button
                type="button"
                className={`form-tab ${activeTab === 'bank' ? 'active' : ''}`}
                onClick={() => setActiveTab('bank')}
              >
                Bank Details
              </button>
              <button
                type="button"
                className={`form-tab ${activeTab === 'contact' ? 'active' : ''}`}
                onClick={() => setActiveTab('contact')}
              >
                Contact Details
              </button>
            </div>
            <div className="form-tabs-right">
              <div className="status-field-inline">
                <div className={`input-group ${formData.status === 'Active' ? 'status-active-group' : 'status-inactive-group'}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                    </span>
                  </div>
                  <select
                    className={`form-input ${formData.status === 'Active' ? 'status-active' : 'status-inactive'}`}
                    value={formData.status}
                    onChange={(e) => handleInputChange("status", e.target.value)}
                    style={{ maxWidth: '150px' }}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Tab 1: Bank Details */}
          <div className={`tab-content ${activeTab !== 'bank' ? 'tab-hidden' : ''}`}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="isprimary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="isprimary"
                    name="isprimary"
                    checked={formData.isprimary}
                    onChange={(e) => handleInputChange("isprimary", e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  Set as Primary
                </label>
              </div>
              <div className="form-group">
                <label htmlFor="ispayrollDefault" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="ispayrollDefault"
                    name="ispayrollDefault"
                    checked={formData.ispayrollDefault}
                    onChange={(e) => handleInputChange("ispayrollDefault", e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  Default Payroll Bank
                </label>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="BankName">Bank Name <span className="required">*</span></label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Building}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="BankName"
                    name="BankName"
                    className={`form-input ${errors.BankName ? 'error' : ''}`}
                    placeholder="Enter bank name"
                    value={formData.BankName}
                    onChange={(e) => handleInputChange("BankName", e.target.value)}
                    required
                  />
                </div>
                {errors.BankName && <span className="error-message">{errors.BankName}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="NickName">Short Name <span className="required">*</span></label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    id="NickName"
                    name="NickName"
                    className={`form-input ${errors.NickName ? 'error' : ''}`}
                    placeholder="Enter short name"
                    value={formData.NickName}
                    onChange={(e) => handleInputChange("NickName", e.target.value)}
                    required
                  />
                </div>
                {errors.NickName && <span className="error-message">{errors.NickName}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="AccountType">Account Type</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                        <line x1="1" y1="10" x2="23" y2="10"></line>
                      </svg>
                    </span>
                  </div>
                  <select
                    id="AccountType"
                    name="AccountType"
                    className="form-input"
                    value={formData.AccountType}
                    onChange={(e) => handleInputChange("AccountType", e.target.value)}
                  >
                    <option value="Checking">Checking</option>
                    <option value="Savings">Savings</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="AccountNo">Account No <span className="required">*</span></label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                        <line x1="1" y1="10" x2="23" y2="10"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    id="AccountNo"
                    name="AccountNo"
                    className={`form-input ${errors.AccountNo ? 'error' : ''}`}
                    placeholder="Enter account number"
                    value={formData.AccountNo}
                    onChange={(e) => handleInputChange("AccountNo", e.target.value)}
                    required
                  />
                </div>
                {errors.AccountNo && <span className="error-message">{errors.AccountNo}</span>}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="RoutingNumber">Routing Number</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="4" y1="9" x2="20" y2="9"></line>
                        <line x1="4" y1="15" x2="20" y2="15"></line>
                        <line x1="10" y1="3" x2="8" y2="21"></line>
                        <line x1="14" y1="3" x2="16" y2="21"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    id="RoutingNumber"
                    name="RoutingNumber"
                    className="form-input"
                    placeholder="Enter routing number"
                    value={formData.RoutingNumber}
                    onChange={(e) => handleInputChange("RoutingNumber", e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="Balance">Opening Balance</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    id="Balance"
                    name="Balance"
                    className="form-input"
                    placeholder="0.00"
                    value={balanceDisplay}
                    onChange={(e) => handleInputChange("Balance", e.target.value)}
                    onFocus={(e) => {
                      const numericValue = Utils.removeInvaildCharFromAmount(e.target.value);
                      e.target.value = numericValue;
                    }}
                    onBlur={(e) => {
                      const numericValue = Utils.removeInvaildCharFromAmount(e.target.value);
                      const numValue = parseFloat(numericValue) || 0;
                      setBalanceDisplay(Utils.currencyFormat(numValue));
                      setFormData((prev) => ({ ...prev, Balance: numValue }));
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="startingcheck">Starting Check No <span className="required">*</span></label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="number"
                    id="startingcheck"
                    name="startingcheck"
                    className={`form-input ${errors.startingcheck ? 'error' : ''}`}
                    placeholder="Enter starting check number"
                    value={formData.startingcheck || ""}
                    onChange={(e) => handleInputChange("startingcheck", parseInt(e.target.value) || 0)}
                    required
                  />
                </div>
                {errors.startingcheck && <span className="error-message">{errors.startingcheck}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="checkseries">Check Series <span className="required">*</span></label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    id="checkseries"
                    name="checkseries"
                    className={`form-input ${errors.checkseries ? 'error' : ''}`}
                    placeholder="Enter check series"
                    value={formData.checkseries}
                    onChange={(e) => handleInputChange("checkseries", e.target.value)}
                    required
                  />
                </div>
                {errors.checkseries && <span className="error-message">{errors.checkseries}</span>}
              </div>
            </div>

            <div className="form-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="form-group">
                <label htmlFor="coa">Chart of Accounts</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <select
                    id="coa"
                    name="coa"
                    className={`form-input ${errors.coa ? 'error' : ''}`}
                    value={formData.coa || ""}
                    onChange={(e) => handleInputChange("coa", e.target.value)}
                  >
                    <option value="">Select Chart of Accounts</option>
                    {coaAccounts.map((coa) => (
                      <option key={coa.accountID} value={coa.accountCode}>
                        {coa.accountCode} - {coa.accountName}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.coa && <span className="error-message">{errors.coa}</span>}
              </div>
            </div>
          </div>

          {/* Tab 2: Contact Details */}
          <div className={`tab-content ${activeTab !== 'contact' ? 'tab-hidden' : ''}`}>
            <div className="form-group">
              <label htmlFor="street">Street Address</label>
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
                  id="street"
                  name="street"
                  className="form-input"
                  placeholder="Enter street address"
                  value={formData.street}
                  onChange={(e) => handleInputChange("street", e.target.value)}
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
                <label htmlFor="city">City</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Location}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    className="form-input"
                    placeholder="Enter city"
                    value={formData.city}
                    onChange={(e) => handleInputChange("city", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="state">State</label>
                {isStateEditable ? (
                  <input
                    type="text"
                    id="state"
                    name="state"
                    className="form-input"
                    placeholder="Enter state"
                    value={formData.state}
                    onChange={(e) => handleInputChange("state", e.target.value)}
                  />
                ) : (
                  <select
                    id="state"
                    name="state"
                    className="form-input"
                    value={formData.state}
                    onChange={(e) => handleInputChange("state", e.target.value)}
                  >
                    <option value="">Select State</option>
                    {US_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.name}
                      </option>
                    ))}
                  </select>
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
                  onChange={(e) => handleInputChange("country", e.target.value)}
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Email">Email</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Mail}
                    </span>
                  </div>
                  <input
                    type="email"
                    id="Email"
                    name="Email"
                    className={`form-input ${errors.Email ? 'error' : ''}`}
                    placeholder="Enter email"
                    value={formData.Email}
                    onChange={(e) => handleInputChange("Email", e.target.value)}
                  />
                </div>
                {errors.Email && <span className="error-message">{errors.Email}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="Phone">Phone Number</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Phone}
                    </span>
                  </div>
                  <input
                    type="tel"
                    id="Phone"
                    name="Phone"
                    className={`form-input ${errors.Phone ? 'error' : ''}`}
                    placeholder="(555) 123-4567"
                    value={formData.Phone}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9()-\s]/g, '');
                      handleInputChange("Phone", value);
                    }}
                  />
                </div>
                {errors.Phone && <span className="error-message">{errors.Phone}</span>}
              </div>
            </div>
          </div>

          <div className="form-actions">
            {bankId > 0 && (
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
            <button type="button" className="btn-cancel" onClick={handleDismiss}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving..." : bankId > 0 ? "Update Bank" : "Add Bank"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Bank ${formData.BankName || formData.NickName || `#${bankId}`}`}
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

export default BankMasterSlideout;

