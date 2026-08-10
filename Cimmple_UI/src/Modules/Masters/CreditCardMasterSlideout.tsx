import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  CreditCardService,
  CreditCardMasterReq,
} from "../../Common/Services/CreditCardService";
import { COUNTRIES, US_STATES, Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { ChartofAccountsService } from "../../Common/Services/ChartofAccountsService";
import { validateEmail, validatePhone, validateZipCode, validateCardNumber, validateCVV, validateExpiryDate } from "../../Common/Utils/validation";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./CustomerMasterSlideout.scss";

interface CreditCardMasterSlideoutProps {
  creditCardId: number;
  onClose: (refreshList?: boolean) => void;
}

const CreditCardMasterSlideout: React.FC<CreditCardMasterSlideoutProps> = ({
  creditCardId,
  onClose,
}) => {
  const [formData, setFormData] = useState<CreditCardMasterReq>({
    Id: 0,
    CardNumber: "",
    CardholderName: "",
    CardType: "",
    ExpiryMonth: "",
    ExpiryYear: "",
    CVV: "",
    BillingStreet: "",
    BillingApartment: "",
    BillingCity: "",
    BillingState: "",
    BillingZip: "",
    BillingCountry: "US",
    Phone: "",
    Email: "",
    Status: "Active",
    TenantId: 0,
    NickName: "",
    IsPrimary: false,
    COA: "",
  });

  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isStateEditable, setIsStateEditable] = useState(false);
  const [coaAccounts, setCoaAccounts] = useState<Array<{ accountID: number; accountCode: string; accountName: string }>>([]);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      TenantId: storage?.tenantID || 0,
    }));

    loadCOAAccounts();

    if (creditCardId > 0) {
      loadCreditCard();
    } else {
      setIsStateEditable(false);
    }
  }, [creditCardId]);

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
    setIsStateEditable(formData.BillingCountry !== "US");
  }, [formData.BillingCountry]);

  const loadCreditCard = async () => {
    setLoading(true);
    try {
      const creditCard = await CreditCardService.GetCreditCardById(creditCardId);
      if (creditCard) {
        setFormData({
          Id: creditCard.Id,
          CardNumber: creditCard.CardNumber || "",
          CardholderName: creditCard.CardholderName || "",
          CardType: creditCard.CardType || "",
          ExpiryMonth: creditCard.ExpiryMonth || "",
          ExpiryYear: creditCard.ExpiryYear || "",
          CVV: creditCard.CVV || "",
          BillingStreet: creditCard.BillingStreet || "",
          BillingApartment: creditCard.BillingApartment || "",
          BillingCity: creditCard.BillingCity || "",
          BillingState: creditCard.BillingState || "",
          BillingZip: creditCard.BillingZip || "",
          BillingCountry: creditCard.BillingCountry || "US",
          Phone: creditCard.Phone || "",
          Email: creditCard.Email || "",
          Status: creditCard.Status || "Active",
          TenantId: creditCard.TenantId,
          NickName: creditCard.NickName || "",
          IsPrimary: creditCard.IsPrimary || false,
          COA: creditCard.COA || "",
        });
      }
    } catch (error: any) {
      console.error("Error loading credit card:", error);
      toast.error(`Error loading credit card: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof CreditCardMasterReq, value: any) => {
    const updatedFormData = { ...formData, [field]: value };
    setFormData(updatedFormData);
    setIsStateChanged(true);

    // Real-time validation
    if (field === "Email" && value) {
      const emailError = validateEmail(value);
      setErrors((prev) => {
        const newErrors = { ...prev };
        if (emailError) {
          newErrors.Email = emailError;
        } else {
          delete newErrors.Email;
        }
        return newErrors;
      });
    } else if (field === "Phone" && value) {
      const phoneError = validatePhone(value);
      setErrors((prev) => {
        const newErrors = { ...prev };
        if (phoneError) {
          newErrors.Phone = phoneError;
        } else {
          delete newErrors.Phone;
        }
        return newErrors;
      });
    } else if (field === "BillingZip" && value) {
      const zipError = validateZipCode(value);
      setErrors((prev) => {
        const newErrors = { ...prev };
        if (zipError) {
          newErrors.BillingZip = zipError;
        } else {
          delete newErrors.BillingZip;
        }
        return newErrors;
      });
    } else if (field === "CardNumber" && value) {
      const cardError = validateCardNumber(value);
      setErrors((prev) => {
        const newErrors = { ...prev };
        if (cardError) {
          newErrors.CardNumber = cardError;
        } else {
          delete newErrors.CardNumber;
        }
        return newErrors;
      });
    } else if (field === "CVV" && value) {
      const cvvError = validateCVV(value);
      setErrors((prev) => {
        const newErrors = { ...prev };
        if (cvvError) {
          newErrors.CVV = cvvError;
        } else {
          delete newErrors.CVV;
        }
        return newErrors;
      });
    } else if (field === "ExpiryMonth" || field === "ExpiryYear") {
      // Validate expiry date when either month or year changes
      const month = field === "ExpiryMonth" ? value : updatedFormData.ExpiryMonth;
      const year = field === "ExpiryYear" ? value : updatedFormData.ExpiryYear;
      if (month && year) {
        const expiryError = validateExpiryDate(month, year);
        setErrors((prev) => {
          const newErrors = { ...prev };
          if (expiryError) {
            newErrors.ExpiryDate = expiryError;
          } else {
            delete newErrors.ExpiryDate;
          }
          return newErrors;
        });
      } else {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors.ExpiryDate;
          return newErrors;
        });
      }
    } else if (field === "Email" || field === "Phone" || field === "BillingZip" || field === "CardNumber" || field === "CVV") {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Cardholder Name - required
    if (!formData.CardholderName || formData.CardholderName.trim() === "") {
      newErrors.CardholderName = "Cardholder name is required";
    }

    // Card Number - required for new cards, validate format if provided
    if (creditCardId === 0) {
      if (!formData.CardNumber || formData.CardNumber.trim() === "") {
        newErrors.CardNumber = "Card number is required";
      } else {
        const cardError = validateCardNumber(formData.CardNumber);
        if (cardError) {
          newErrors.CardNumber = cardError;
        }
      }
    } else if (formData.CardNumber && formData.CardNumber.trim() !== "") {
      // Validate format if card number is being updated
      const cardError = validateCardNumber(formData.CardNumber);
      if (cardError) {
        newErrors.CardNumber = cardError;
      }
    }

    // CVV - validate if provided (for new cards)
    if (creditCardId === 0 && formData.CVV) {
      const cvvError = validateCVV(formData.CVV);
      if (cvvError) {
        newErrors.CVV = cvvError;
      }
    }

    // Expiry Date - validate if both month and year are provided
    if (formData.ExpiryMonth && formData.ExpiryYear) {
      const expiryError = validateExpiryDate(formData.ExpiryMonth, formData.ExpiryYear);
      if (expiryError) {
        newErrors.ExpiryDate = expiryError;
      }
    } else if (creditCardId === 0 && (!formData.ExpiryMonth || !formData.ExpiryYear)) {
      // For new cards, expiry is recommended
      if (!formData.ExpiryMonth) {
        newErrors.ExpiryMonth = "Expiry month is required";
      }
      if (!formData.ExpiryYear) {
        newErrors.ExpiryYear = "Expiry year is required";
      }
    }

    // Email validation
    if (formData.Email && validateEmail(formData.Email)) {
      newErrors.Email = validateEmail(formData.Email);
    }

    // Phone validation
    if (formData.Phone && validatePhone(formData.Phone)) {
      newErrors.Phone = validatePhone(formData.Phone);
    }

    // Zip Code validation
    if (formData.BillingZip && validateZipCode(formData.BillingZip)) {
      newErrors.BillingZip = validateZipCode(formData.BillingZip);
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setLoading(true);
    try {
      await CreditCardService.SaveCreditCard(formData);
      toast.success(
        creditCardId > 0
          ? "Credit card updated successfully"
          : "Credit card created successfully"
      );
      setIsStateChanged(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error saving credit card:", error);
      toast.error(`Error saving credit card: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (isStateChanged) {
      if (window.confirm("You have unsaved changes. Are you sure you want to cancel?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (creditCardId === 0) return;
    
    setLoading(true);
    try {
      const response = await CreditCardService.CheckCreditCardDeletionImpact(creditCardId);
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
    if (creditCardId === 0) return;
    setLoading(true);
    try {
      await CreditCardService.DeleteCreditCard(creditCardId);
      toast.success("Credit Card deleted successfully");
      setShowDeletionDialog(false);
      setDeletionImpact(null);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting credit card:", error);
      toast.error(`Error deleting credit card: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (creditCardId === 0) return;
    try {
      const response = await CreditCardService.CheckCreditCardDeletionImpact(creditCardId);
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
    if (!deletionImpact || creditCardId === 0) return;
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
      const updatedResponse = await CreditCardService.CheckCreditCardDeletionImpact(creditCardId);
      const updatedImpact = updatedResponse.result as DeletionImpactResult;
      
      if (!updatedImpact.canDelete) {
        toast.error("Some dependencies could not be deleted. Please try again.");
        setDeletionImpact(updatedImpact);
        return;
      }
      
      // Now delete the main credit card
      await confirmDeletion();
    } catch (error: any) {
      console.error("Error in delete all:", error);
      toast.error(`Error deleting dependencies: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  // Card type options
  const cardTypes = ["Visa", "Mastercard", "American Express", "Discover", "Other"];

  // Month options
  const months = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return { value: month.toString().padStart(2, "0"), label: month.toString().padStart(2, "0") };
  });

  // Year options (current year to 20 years ahead)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => {
    const year = currentYear + i;
    return { value: year.toString(), label: year.toString() };
  });

  if (loading && creditCardId > 0) {
    return (
      <div className="slideout-overlay">
        <div className="form-card">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="slideout-overlay" onClick={handleCancel}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>{creditCardId > 0 ? "Edit Credit Card" : "Add New Credit Card"}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="status-field-inline">
              <div className={`input-group ${formData.Status === 'Active' ? 'status-active-group' : 'status-inactive-group'}`} style={{ maxWidth: '150px' }}>
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                  </span>
                </div>
                <select
                  id="Status"
                  name="Status"
                  className={`form-input ${formData.Status === 'Active' ? 'status-active' : 'status-inactive'}`}
                  value={formData.Status}
                  onChange={(e) => handleInputChange("Status", e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn-close" onClick={handleCancel}>
              ×
            </button>
          </div>
        </div>

        <form className="airframe-form" onSubmit={handleSubmit}>
          <div className="tab-content">
            {/* Card Information */}
            {creditCardId === 0 && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="CardNumber">Card Number <span className="required">*</span></label>
                  <div className={`input-group ${errors.CardNumber ? 'has-error' : ''}`}>
                    <div className="input-group-prepend">
                      <span className="input-group-icon">
                        {Icons.Document}
                      </span>
                    </div>
                    <input
                      type="text"
                      id="CardNumber"
                      name="CardNumber"
                      className={`form-input ${errors.CardNumber ? "error" : ""}`}
                      placeholder="Enter card number"
                      value={formData.CardNumber}
                      onChange={(e) => {
                        // Remove non-digits
                        const value = e.target.value.replace(/\D/g, "");
                        // Add spaces every 4 digits
                        const formatted = value.match(/.{1,4}/g)?.join(" ") || value;
                        handleInputChange("CardNumber", formatted);
                      }}
                      onBlur={(e) => {
                        // Validate on blur as well
                        if (e.target.value) {
                          handleInputChange("CardNumber", e.target.value);
                        }
                      }}
                      maxLength={23} // 19 digits + 4 spaces
                      required
                    />
                  </div>
                  {errors.CardNumber && <span className="error-message">{errors.CardNumber}</span>}
                </div>
                <div className="form-group"></div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="CardholderName">Cardholder Name <span className="required">*</span></label>
                <div className={`input-group ${errors.CardholderName ? 'has-error' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="CardholderName"
                    name="CardholderName"
                    className={`form-input ${errors.CardholderName ? "error" : ""}`}
                    placeholder="Enter cardholder name"
                    value={formData.CardholderName}
                    onChange={(e) => handleInputChange("CardholderName", e.target.value)}
                    required
                  />
                </div>
                {errors.CardholderName && <span className="error-message">{errors.CardholderName}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="CardType">Card Type</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <select
                    id="CardType"
                    name="CardType"
                    className="form-input"
                    value={formData.CardType}
                    onChange={(e) => handleInputChange("CardType", e.target.value)}
                  >
                    <option value="">Select card type</option>
                    {cardTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="NickName">Card Nick Name</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="NickName"
                    name="NickName"
                    className="form-input"
                    placeholder="Enter card nick name"
                    value={formData.NickName}
                    onChange={(e) => handleInputChange("NickName", e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="COA">Chart of Accounts</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <select
                    id="COA"
                    name="COA"
                    className="form-input"
                    value={formData.COA}
                    onChange={(e) => handleInputChange("COA", e.target.value)}
                  >
                    <option value="">Select Chart of Accounts</option>
                    {coaAccounts.map((coa) => (
                      <option key={coa.accountID} value={coa.accountCode}>
                        {coa.accountCode} - {coa.accountName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {creditCardId === 0 && (
              <>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="ExpiryMonth">
                      Expiry Month
                      {creditCardId === 0 && <span className="required">*</span>}
                    </label>
                    <div className={`input-group ${errors.ExpiryMonth || errors.ExpiryDate ? 'has-error' : ''}`}>
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          {Icons.Document}
                        </span>
                      </div>
                      <select
                        id="ExpiryMonth"
                        name="ExpiryMonth"
                        className={`form-input ${errors.ExpiryMonth || errors.ExpiryDate ? "error" : ""}`}
                        value={formData.ExpiryMonth}
                        onChange={(e) => handleInputChange("ExpiryMonth", e.target.value)}
                        required={creditCardId === 0}
                      >
                        <option value="">MM</option>
                        {months.map((month) => (
                          <option key={month.value} value={month.value}>
                            {month.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {errors.ExpiryMonth && <span className="error-message">{errors.ExpiryMonth}</span>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="ExpiryYear">
                      Expiry Year
                      {creditCardId === 0 && <span className="required">*</span>}
                    </label>
                    <div className={`input-group ${errors.ExpiryYear || errors.ExpiryDate ? 'has-error' : ''}`}>
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          {Icons.Document}
                        </span>
                      </div>
                      <select
                        id="ExpiryYear"
                        name="ExpiryYear"
                        className={`form-input ${errors.ExpiryYear || errors.ExpiryDate ? "error" : ""}`}
                        value={formData.ExpiryYear}
                        onChange={(e) => handleInputChange("ExpiryYear", e.target.value)}
                        required={creditCardId === 0}
                      >
                        <option value="">YYYY</option>
                        {years.map((year) => (
                          <option key={year.value} value={year.value}>
                            {year.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {errors.ExpiryYear && <span className="error-message">{errors.ExpiryYear}</span>}
                    {errors.ExpiryDate && !errors.ExpiryYear && <span className="error-message">{errors.ExpiryDate}</span>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="CVV">CVV</label>
                    <div className={`input-group ${errors.CVV ? 'has-error' : ''}`}>
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          {Icons.Document}
                        </span>
                      </div>
                      <input
                        type="text"
                        id="CVV"
                        name="CVV"
                        className={`form-input ${errors.CVV ? "error" : ""}`}
                        placeholder="CVV"
                        value={formData.CVV}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, "");
                          handleInputChange("CVV", value);
                        }}
                        maxLength={4}
                      />
                    </div>
                    {errors.CVV && <span className="error-message">{errors.CVV}</span>}
                  </div>
                </div>
              </>
            )}

            {/* Billing Address */}
            <div className="form-group">
              <label htmlFor="BillingStreet">Billing Street Address</label>
              <div className="input-group">
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    {Icons.Location}
                  </span>
                </div>
                <input
                  type="text"
                  id="BillingStreet"
                  name="BillingStreet"
                  className="form-input"
                  placeholder="Enter street address"
                  value={formData.BillingStreet}
                  onChange={(e) => handleInputChange("BillingStreet", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="BillingApartment">Unit/Suite</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Location}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="BillingApartment"
                    name="BillingApartment"
                    className="form-input"
                    placeholder="Enter unit/suite"
                    value={formData.BillingApartment}
                    onChange={(e) => handleInputChange("BillingApartment", e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="BillingCity">City</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Location}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="BillingCity"
                    name="BillingCity"
                    className="form-input"
                    placeholder="Enter city"
                    value={formData.BillingCity}
                    onChange={(e) => handleInputChange("BillingCity", e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="BillingState">State</label>
                {isStateEditable ? (
                  <input
                    type="text"
                    id="BillingState"
                    name="BillingState"
                    className="form-input"
                    placeholder="Enter state"
                    value={formData.BillingState}
                    onChange={(e) => handleInputChange("BillingState", e.target.value)}
                  />
                ) : (
                  <select
                    id="BillingState"
                    name="BillingState"
                    className="form-input"
                    value={formData.BillingState}
                    onChange={(e) => handleInputChange("BillingState", e.target.value)}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="BillingZip">Zip Code</label>
                <input
                  type="text"
                  id="BillingZip"
                  name="BillingZip"
                  className={`form-input ${errors.BillingZip ? "error" : ""}`}
                  placeholder="Enter zip code"
                  value={formData.BillingZip}
                  onChange={(e) => handleInputChange("BillingZip", e.target.value)}
                  maxLength={10}
                />
                {errors.BillingZip && <span className="error-message">{errors.BillingZip}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="BillingCountry">Country</label>
                <select
                  id="BillingCountry"
                  name="BillingCountry"
                  className="form-input"
                  value={formData.BillingCountry}
                  onChange={(e) => handleInputChange("BillingCountry", e.target.value)}
                >
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Contact Information */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Phone">Phone</label>
                <div className={`input-group ${errors.Phone ? 'has-error' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Phone}
                    </span>
                  </div>
                  <input
                    type="tel"
                    id="Phone"
                    name="Phone"
                    className={`form-input ${errors.Phone ? "error" : ""}`}
                    placeholder="(555) 123-4567"
                    value={formData.Phone}
                    onChange={(e) => handleInputChange("Phone", e.target.value)}
                  />
                </div>
                {errors.Phone && <span className="error-message">{errors.Phone}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="Email">Email</label>
                <div className={`input-group ${errors.Email ? 'has-error' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Mail}
                    </span>
                  </div>
                  <input
                    type="email"
                    id="Email"
                    name="Email"
                    className={`form-input ${errors.Email ? "error" : ""}`}
                    placeholder="Enter email address"
                    value={formData.Email}
                    onChange={(e) => handleInputChange("Email", e.target.value)}
                  />
                </div>
                {errors.Email && <span className="error-message">{errors.Email}</span>}
              </div>
            </div>

            {/* Primary Card Toggle */}
            <div className="form-row">
              <div className="form-group">
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={formData.IsPrimary}
                    onChange={(e) => handleInputChange("IsPrimary", e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <span>Set as Primary Card</span>
                </label>
              </div>
              <div className="form-group"></div>
            </div>
          </div>

          <div className="form-actions" style={{ flexShrink: 0 }}>
            {creditCardId > 0 && (
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
            <button type="button" className="btn-cancel" onClick={handleCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Saving..." : creditCardId > 0 ? "Update" : "Save"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Credit Card ${formData.NickName || formData.CardholderName || `#${creditCardId}`}`}
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

export default CreditCardMasterSlideout;

