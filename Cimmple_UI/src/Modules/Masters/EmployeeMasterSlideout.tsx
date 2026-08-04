import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  EmployeeService,
  EmployeeMasterReq,
  Role,
} from "../../Common/Services/EmployeeService";
import { LocationService, LocationMaster } from "../../Common/Services/LocationService";
import { COUNTRIES, US_STATES } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { validateEmail, validatePhone, validateZipCode } from "../../Common/Utils/validation";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./CustomerMasterSlideout.scss";

interface EmployeeMasterSlideoutProps {
  employeeId: number;
  onClose: () => void;
}

const EmployeeMasterSlideout: React.FC<EmployeeMasterSlideoutProps> = ({
  employeeId,
  onClose,
}) => {
  const [formData, setFormData] = useState<EmployeeMasterReq>({
    User_UniqueID: 0,
    FirstName: "",
    LastName: "",
    Email: "",
    UserName: "",
    Status: "Active",
    Role: undefined,
    EmployeeType: "Regular",
    EmployeeCategory: "",
    EmpCode: "",
    Department: "",
    Phone1: "",
    Phone2: "",
    Date_of_hire: "",
    Address: "",
    Apartment: "",
    City: "",
    State: "",
    Zip: "",
    Country: "US",
    LocationId: undefined,
    LocationIds: [],
    DefaultLocationId: undefined,
    CanAccessAllLocations: false,
    TenantID: 0,
    DOB: "",
    SSN: "",
  });

  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      TenantID: storage?.tenantID || 0,
    }));

    loadRoles();
    loadLocations();

    if (employeeId > 0) {
      loadEmployee();
    }
  }, [employeeId]);

  const loadRoles = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await EmployeeService.GetAllRoles({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        setRoles(result);
      }
    } catch (error: any) {
      console.error("Error loading roles:", error);
      toast.error(`Error loading roles: ${error.message || "Unknown error"}`);
    }
  };

  const loadLocations = async () => {
    try {
      const storage = JSON.parse(localStorage.getItem("storage") || "{}");
      const tenantID = storage?.tenantID || 0;
      const result = await LocationService.GetLocations({ tenantid: tenantID });
      if (result && Array.isArray(result)) {
        setLocations(result);
      }
    } catch (error: any) {
      console.error("Error loading locations:", error);
      // Don't show toast error for locations as it's not critical
    }
  };

  const loadEmployee = async () => {
    setLoading(true);
    try {
      const employee = await EmployeeService.GetEmployeeById(employeeId);
      if (employee) {
        setFormData({
          User_UniqueID: employee.User_UniqueID,
          FirstName: employee.FirstName,
          LastName: employee.LastName,
          Email: employee.Email,
          Status: employee.Status,
          Role: employee.Role,
          EmployeeType: employee.EmployeeType || "Regular",
          EmployeeCategory: employee.EmployeeCategory || "",
          EmpCode: employee.EmpCode,
          Department: employee.Department,
          Phone1: employee.Phone1,
          Phone2: employee.Phone2,
          Date_of_hire: employee.Date_of_hire || "",
          Address: employee.Address,
          Apartment: employee.Apartment,
          City: employee.City,
          State: employee.State,
          Zip: employee.Zip,
          Country: employee.Country || "US",
          LocationId: employee.LocationId,
          LocationIds: employee.LocationIds || (employee.LocationId ? [employee.LocationId] : []),
          DefaultLocationId: employee.DefaultLocationId,
          CanAccessAllLocations: !!employee.CanAccessAllLocations,
          TenantID: employee.TenantID,
          DOB: employee.DOB,
          SSN: employee.SSN,
          // Keep actual UserName if it exists, otherwise empty (toggle will be set based on this)
          UserName: employee.UserName && employee.UserName.trim() !== "" ? employee.UserName : "",
        });
      }
    } catch (error: any) {
      console.error("Error loading employee:", error);
      toast.error(`Error loading employee: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to convert MM/DD/YY to YYYY-MM-DD for date input
  const convertToDateInputFormat = (dateStr: string): string => {
    if (!dateStr || dateStr.trim() === "") return "";
    
    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }
    
    // Try to parse MM/DD/YY or MM/DD/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      let year = parts[2];
      
      // Convert 2-digit year to 4-digit (assuming 20xx for years < 50, 19xx for years >= 50)
      if (year.length === 2) {
        const yearNum = parseInt(year);
        year = yearNum < 50 ? `20${year}` : `19${year}`;
      }
      
      try {
        const date = new Date(`${year}-${month}-${day}`);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch (e) {
        // If parsing fails, return empty string
      }
    }
    
    return "";
  };

  const handleInputChange = (field: keyof EmployeeMasterReq, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsStateChanged(true);

    // Real-time validation for specific fields
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
    } else if (field === "Phone1" && value) {
      const phoneError = validatePhone(value);
      setErrors((prev) => {
        const newErrors = { ...prev };
        if (phoneError) {
          newErrors.Phone1 = phoneError;
        } else {
          delete newErrors.Phone1;
        }
        return newErrors;
      });
    } else if (field === "Zip" && value) {
      const zipError = validateZipCode(value);
      setErrors((prev) => {
        const newErrors = { ...prev };
        if (zipError) {
          newErrors.Zip = zipError;
        } else {
          delete newErrors.Zip;
        }
        return newErrors;
      });
    } else if (field === "Email" || field === "Phone1" || field === "Zip") {
      // Clear error when field is cleared
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate required fields
    if (!formData.FirstName || formData.FirstName.trim() === "") {
      newErrors.FirstName = "First Name is required";
    }

    if (!formData.LastName || formData.LastName.trim() === "") {
      newErrors.LastName = "Last Name is required";
    }

    // UserName validation: if toggle is enabled (UserName === "enabled"), we'll auto-generate it in handleSubmit

    // Validate email
    if (formData.Email && formData.Email.trim() !== "") {
      const emailError = validateEmail(formData.Email);
      if (emailError) newErrors.Email = emailError;
    }

    // Validate phone
    if (formData.Phone1 && formData.Phone1.trim() !== "") {
      const phoneError = validatePhone(formData.Phone1);
      if (phoneError) newErrors.Phone1 = phoneError;
    }

    // Validate zip code
    if (formData.Zip && formData.Zip.trim() !== "") {
      const zipError = validateZipCode(formData.Zip);
      if (zipError) newErrors.Zip = zipError;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      toast.error("Please fix validation errors before submitting");
      return false;
    }

    return true;
  };

  const handleDelete = async () => {
    if (employeeId === 0) return;
    
    setLoading(true);
    try {
      const response = await EmployeeService.CheckEmployeeDeletionImpact(employeeId);
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
    if (employeeId === 0 || !deletionImpact?.canDelete) return;

    setLoading(true);
    try {
      await EmployeeService.DeleteEmployee(employeeId);
      toast.success("Employee deleted successfully");
      setShowDeletionDialog(false);
      onClose();
    } catch (error: any) {
      console.error("Error deleting employee:", error);
      toast.error(`Error deleting employee: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (employeeId === 0) return;
    
    try {
      const response = await EmployeeService.CheckEmployeeDeletionImpact(employeeId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    // Employees typically don't have blocking dependencies that can be deleted from the dialog
    // But we'll keep the structure for consistency
    toast.info("Dependency deletion not applicable for employees");
  };

  const handleDeleteAll = async () => {
    // For employees, if there are no blocking dependencies, just delete directly
    if (deletionImpact?.canDelete) {
      await confirmDeletion();
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      // Handle login username: 
      // - First Name + Last Name = Employee Name (display name)
      // - UserName = Login username (only if login access toggle is enabled/licensed)
      const submitData = { ...formData };
      if (submitData.UserName === "enabled") {
        // Generate login username as lastname.firstname (lowercase, no spaces)
        const firstName = submitData.FirstName?.toLowerCase().replace(/\s+/g, '') || '';
        const lastName = submitData.LastName?.toLowerCase().replace(/\s+/g, '') || '';
        submitData.UserName = `${lastName}.${firstName}` || '';
      } else if (!submitData.UserName || submitData.UserName.trim() === "") {
        // If login access toggle is off, set UserName to empty string (no login access)
        submitData.UserName = "";
      }
      // If UserName has a value other than "enabled", it's an existing login username - keep it as is
      
      await EmployeeService.SaveEmployee(submitData);
      toast.success(
        employeeId > 0 ? "Employee updated successfully" : "Employee created successfully"
      );
      setIsStateChanged(false);
      onClose();
    } catch (error: any) {
      console.error("Error saving employee:", error);
      toast.error(`Error saving employee: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscard = () => {
    onClose();
  };

  if (loading && employeeId > 0) {
    return (
      <div className="slideout-overlay">
        <div className="form-card">
          <div className="page-loading">
            <div className="loading-spinner"></div>
            <p>Loading employee...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="slideout-overlay" onClick={handleDiscard}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>
            {employeeId === 0 ? "New Employee" : formData.FirstName && formData.LastName ? `${formData.FirstName} ${formData.LastName}` : "Edit Employee"}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
            <button className="btn-close" onClick={handleDiscard}>
              ×
            </button>
          </div>
        </div>

        <form className="airframe-form" onSubmit={handleSubmit}>
          <>
              <div className="tab-content">
                {/* Basic Information */}
                <div style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', margin: 0 }}>
                    Basic Information
                  </h3>
                  <label className="checkbox-wrapper" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.UserName && formData.UserName.trim() !== "" ? true : false}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // If enabling, set to "enabled" (will be auto-generated on save)
                          handleInputChange("UserName", "enabled");
                        } else {
                          // If disabling, clear the username
                          handleInputChange("UserName", "");
                        }
                      }}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Login Access</span>
                  </label>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="FirstName">
                      First Name <span className="required">*</span>
                    </label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                        </span>
                      </div>
                      <input
                        type="text"
                        id="FirstName"
                        name="FirstName"
                        className={`form-input ${errors.FirstName ? "error" : ""}`}
                        placeholder="Enter first name"
                        value={formData.FirstName}
                        onChange={(e) => handleInputChange("FirstName", e.target.value)}
                      />
                    </div>
                    {errors.FirstName && (
                      <span className="error-message">{errors.FirstName}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="LastName">
                      Last Name <span className="required">*</span>
                    </label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                        </span>
                      </div>
                      <input
                        type="text"
                        id="LastName"
                        name="LastName"
                        className={`form-input ${errors.LastName ? "error" : ""}`}
                        placeholder="Enter last name"
                        value={formData.LastName}
                        onChange={(e) => handleInputChange("LastName", e.target.value)}
                      />
                    </div>
                    {errors.LastName && (
                      <span className="error-message">{errors.LastName}</span>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="EmpCode">Employee Code</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                          </svg>
                        </span>
                      </div>
                      <input
                        type="text"
                        id="EmpCode"
                        name="EmpCode"
                        className="form-input"
                        placeholder="Enter employee code"
                        value={formData.EmpCode}
                        onChange={(e) => handleInputChange("EmpCode", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="LocationIds">Locations</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                          </svg>
                        </span>
                      </div>
                      <select
                        id="LocationIds"
                        name="LocationIds"
                        className="form-input"
                        multiple
                        size={Math.min(6, Math.max(3, locations.length || 3))}
                        value={(formData.LocationIds || []).map(String)}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions).map((o) => parseInt(o.value, 10));
                          handleInputChange("LocationIds", selected);
                          handleInputChange("LocationId", selected[0] || undefined);
                          if (!formData.DefaultLocationId || !selected.includes(formData.DefaultLocationId)) {
                            handleInputChange("DefaultLocationId", selected[0] || undefined);
                          }
                        }}
                      >
                        {locations.map((location) => (
                          <option key={location.locationId} value={location.locationId}>
                            {location.name} {location.code ? `(${location.code})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <small className="text-muted">Hold Ctrl/Cmd to select multiple locations</small>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="DefaultLocationId">Default Location</label>
                    <select
                      id="DefaultLocationId"
                      name="DefaultLocationId"
                      className="form-input"
                      value={formData.DefaultLocationId || ""}
                      onChange={(e) =>
                        handleInputChange(
                          "DefaultLocationId",
                          e.target.value ? parseInt(e.target.value, 10) : undefined
                        )
                      }
                    >
                      <option value="">Select default</option>
                      {(formData.LocationIds || []).map((id) => {
                        const loc = locations.find((l) => l.locationId === id);
                        return (
                          <option key={id} value={id}>
                            {loc?.name || id}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="form-group" style={{ display: "flex", alignItems: "center", paddingTop: 28 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={!!formData.CanAccessAllLocations}
                        onChange={(e) => handleInputChange("CanAccessAllLocations", e.target.checked)}
                      />
                      Access all tenant locations
                    </label>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="Department">Department</label>
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
                        id="Department"
                        name="Department"
                        className="form-input"
                        placeholder="Enter department"
                        value={formData.Department}
                        onChange={(e) => handleInputChange("Department", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="Role">Role</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                          </svg>
                        </span>
                      </div>
                      <select
                        id="Role"
                        name="Role"
                        className="form-input"
                        value={formData.Role || 0}
                        onChange={(e) => handleInputChange("Role", e.target.value ? parseInt(e.target.value) : undefined)}
                      >
                        <option value={0}>Select Role</option>
                        {roles.map((role) => (
                          <option key={role.roleID} value={role.roleID}>
                            {role.roleName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="EmployeeType">Employee Type</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                          </svg>
                        </span>
                      </div>
                      <select
                        id="EmployeeType"
                        name="EmployeeType"
                        className="form-input"
                        value={formData.EmployeeType || "Regular"}
                        onChange={(e) => handleInputChange("EmployeeType", e.target.value)}
                      >
                        <option value="Regular">Regular</option>
                        <option value="Contractor">Contractor</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="EmployeeCategory">Employee Category</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 7h-4M4 7h4m0 0v13M8 7V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3m0 0v13m-4 0h4"></path>
                          </svg>
                        </span>
                      </div>
                      <select
                        id="EmployeeCategory"
                        name="EmployeeCategory"
                        className="form-input"
                        value={formData.EmployeeCategory || ""}
                        onChange={(e) => handleInputChange("EmployeeCategory", e.target.value)}
                      >
                        <option value="">Select Category</option>
                        <option value="Salaried - Full time">Salaried - Full time</option>
                        <option value="Salaried - Part time">Salaried - Part time</option>
                        <option value="Hourly - Full time">Hourly - Full time</option>
                        <option value="Hourly - Part time">Hourly - Part time</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="Date_of_hire">Date of Hire</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                          </svg>
                        </span>
                      </div>
                      <input
                        type="date"
                        id="Date_of_hire"
                        name="Date_of_hire"
                        className="form-input"
                        value={convertToDateInputFormat(formData.Date_of_hire)}
                        onChange={(e) => {
                          // Convert YYYY-MM-DD to MM/DD/YY format for backend
                          const dateValue = e.target.value;
                          if (dateValue) {
                            const date = new Date(dateValue + 'T00:00:00'); // Add time to avoid timezone issues
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            const year = String(date.getFullYear()).slice(-2);
                            handleInputChange("Date_of_hire", `${month}/${day}/${year}`);
                          } else {
                            handleInputChange("Date_of_hire", "");
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="form-group"></div>
                </div>
                </div>

                {/* Contact Information */}
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                    Contact Information
                  </h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="Phone1">Phone</label>
                      <div className="input-group">
                        <div className="input-group-prepend">
                          <span className="input-group-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                          </span>
                        </div>
                        <input
                          type="tel"
                          id="Phone1"
                          name="Phone1"
                          className={`form-input ${errors.Phone1 ? "error" : ""}`}
                          placeholder="(555) 123-4567"
                          value={formData.Phone1}
                          onChange={(e) => handleInputChange("Phone1", e.target.value)}
                        />
                      </div>
                      {errors.Phone1 && (
                        <span className="error-message">{errors.Phone1}</span>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="Email">Email</label>
                      <div className="input-group">
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
                          id="Email"
                          name="Email"
                          className={`form-input ${errors.Email ? "error" : ""}`}
                          placeholder="Enter email address"
                          value={formData.Email}
                          onChange={(e) => handleInputChange("Email", e.target.value)}
                        />
                      </div>
                      {errors.Email && (
                        <span className="error-message">{errors.Email}</span>
                      )}
                    </div>
                  </div>
                <div className="form-group">
                  <label htmlFor="Address">Street Address</label>
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
                      id="Address"
                      name="Address"
                      className="form-input"
                      placeholder="Enter street address"
                      value={formData.Address}
                      onChange={(e) => handleInputChange("Address", e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="Apartment">Unit/Suite</label>
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
                        id="Apartment"
                        name="Apartment"
                        className="form-input"
                        placeholder="Apt, Suite, etc."
                        value={formData.Apartment}
                        onChange={(e) => handleInputChange("Apartment", e.target.value)}
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
                    <label htmlFor="State">State</label>
                    {formData.Country === "US" ? (
                      <select
                        id="State"
                        name="State"
                        className="form-input"
                        value={formData.State}
                        onChange={(e) => handleInputChange("State", e.target.value)}
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
                        id="State"
                        name="State"
                        className="form-input"
                        placeholder="Enter state"
                        value={formData.State}
                        onChange={(e) => handleInputChange("State", e.target.value)}
                      />
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="Zip">Zip Code</label>
                    <input
                      type="text"
                      id="Zip"
                      name="Zip"
                      className={`form-input ${errors.Zip ? "error" : ""}`}
                      placeholder="Enter zip code"
                      value={formData.Zip}
                      onChange={(e) => handleInputChange("Zip", e.target.value)}
                    />
                    {errors.Zip && (
                      <span className="error-message">{errors.Zip}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="Country">Country</label>
                    <select
                      id="Country"
                      name="Country"
                      className="form-input"
                      value={formData.Country}
                      onChange={(e) => {
                        handleInputChange("Country", e.target.value);
                        // Clear state if country changes from US
                        if (e.target.value !== "US") {
                          handleInputChange("State", "");
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
              </div>

              {/* Form Actions */}
              <div className="form-actions" style={{ flexShrink: 0 }}>
                {employeeId > 0 && (
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
                  onClick={handleDiscard}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-submit"
                  disabled={loading}
                >
                  {loading ? "Saving..." : employeeId > 0 ? "Update Employee" : "Add Employee"}
                </button>
              </div>
          </>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Employee ${formData.FirstName || ""} ${formData.LastName || ""}`.trim() || `#${employeeId}`}
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

export default EmployeeMasterSlideout;

