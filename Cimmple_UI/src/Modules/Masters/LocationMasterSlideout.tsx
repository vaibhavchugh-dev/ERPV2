import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  LocationService,
  LocationMasterReq,
  LocationMaster,
  LOCATION_KIND,
  LOCATION_KIND_LABEL,
} from "../../Common/Services/LocationService";
import { API_ROOT } from "../../Common/Services/Api-config";
import { COUNTRIES, US_STATES, Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import { validateEmail, validatePhone, validateZipCode } from "../../Common/Utils/validation";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import "./CustomerMasterSlideout.scss";

interface LocationMasterSlideoutProps {
  locationId: number;
  onClose: () => void;
}

const LocationMasterSlideout: React.FC<LocationMasterSlideoutProps> = ({
  locationId,
  onClose,
}) => {
  const emptyForm = (): LocationMasterReq => ({
    LocationId: 0,
    Code: "",
    Name: "",
    Address: "",
    Apartment: "",
    City: "",
    State: "",
    Zip: "",
    Country: "US",
    Region: "",
    Email: "",
    Phone: "",
    WebAddress: "",
    Status: "Active",
    TenantId: 0,
    ParentLocationId: undefined,
    LocType: LOCATION_KIND.BusinessSite,
    ParentName: "",
    DisplayPath: "",
  });

  const [formData, setFormData] = useState<LocationMasterReq>(emptyForm());
  const [allLocations, setAllLocations] = useState<LocationMaster[]>([]);

  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isStateEditable, setIsStateEditable] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [shouldDeleteLogo, setShouldDeleteLogo] = useState(false);
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  const loadLocation = async () => {
    setLoading(true);
    try {
      const location = await LocationService.GetLocationById(locationId);
      if (location) {
        setFormData({
          LocationId: location.LocationId,
          Code: location.Code || "",
          Name: location.Name || "",
          Address: location.Address || "",
          Apartment: location.Apartment || "",
          City: location.City || "",
          State: location.State || "",
          Zip: location.Zip || "",
          Country: location.Country || "US",
          Region: location.Region || "",
          Email: location.Email || "",
          Phone: location.Phone || "",
          WebAddress: location.WebAddress || "",
          Status: location.Status || "Active",
          TenantId: location.TenantId,
          ParentLocationId: location.ParentLocationId ?? undefined,
          LocType: location.LocType ?? LOCATION_KIND.BusinessSite,
          ParentName: location.ParentName ?? "",
          DisplayPath: location.DisplayPath ?? "",
        });
        
        // Load logo URL if exists
        if (location.LogoUrl) {
          setLogoUrl(location.LogoUrl);
          // Set preview from URL - construct full URL from backend host
          const backendHost = API_ROOT.backendHost.replace('/api', ''); // Remove /api suffix
          setLogoPreview(`${backendHost}${location.LogoUrl}`);
        } else {
          setLogoUrl(null);
          setLogoPreview(null);
        }
        setShouldDeleteLogo(false);
      }
    } catch (error: any) {
      console.error("Error loading location:", error);
      toast.error(`Error loading location: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tid = storage?.tenantID || 0;

    const loadParentList = async () => {
      let tenantID = tid;
      if (tenantID === 0 && process.env.NODE_ENV === "development") tenantID = 1;
      const list = await LocationService.GetLocations({ tenantid: tenantID });
      setAllLocations(list || []);
    };
    loadParentList();

    if (locationId > 0) {
      loadLocation();
    } else {
      setFormData({
        ...emptyForm(),
        TenantId: tid,
      });
      setLogoFile(null);
      setLogoPreview(null);
      setLogoUrl(null);
      setShouldDeleteLogo(false);
      setIsStateEditable(false);
    }
  }, [locationId]);

  useEffect(() => {
    // Update state field editability based on country
    setIsStateEditable(formData.Country !== "US");
  }, [formData.Country]);

  const handleInputChange = (field: keyof LocationMasterReq, value: any) => {
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
    } else if (field === "Email" || field === "Phone" || field === "Zip") {
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

    if (!formData.Code || formData.Code.trim() === "") {
      newErrors.Code = "Location code is required";
    }

    if (!formData.Name || formData.Name.trim() === "") {
      newErrors.Name = "Location name is required";
    }

    if (formData.Email && formData.Email.trim() !== "") {
      const emailError = validateEmail(formData.Email);
      if (emailError) {
        newErrors.Email = emailError;
      }
    }

    if (formData.Phone && formData.Phone.trim() !== "") {
      const phoneError = validatePhone(formData.Phone);
      if (phoneError) {
        newErrors.Phone = phoneError;
      }
    }

    if (formData.Zip && formData.Zip.trim() !== "") {
      const zipError = validateZipCode(formData.Zip);
      if (zipError) {
        newErrors.Zip = zipError;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDelete = async () => {
    if (locationId === 0) return;
    
    setLoading(true);
    try {
      const response = await LocationService.CheckLocationDeletionImpact(locationId);
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
    if (locationId === 0 || !deletionImpact?.canDelete) return;

    setLoading(true);
    try {
      await LocationService.DeleteLocation(locationId);
      toast.success("Location deleted successfully");
      setShowDeletionDialog(false);
      onClose();
    } catch (error: any) {
      console.error("Error deleting location:", error);
      toast.error(`Error deleting location: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (locationId === 0) return;
    
    try {
      const response = await LocationService.CheckLocationDeletionImpact(locationId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
      toast.error(`Error refreshing deletion impact: ${error.message || "Unknown error"}`);
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    // Locations typically don't have blocking dependencies that can be deleted from the dialog
    toast.info("Dependency deletion not applicable for locations");
  };

  const handleDeleteAll = async () => {
    // For locations, if there are no blocking dependencies, just delete directly
    if (deletionImpact?.canDelete) {
      await confirmDeletion();
    }
  };

  const isBusinessSiteRow = (fd: LocationMasterReq) =>
    (fd.LocType ?? LOCATION_KIND.BusinessSite) === LOCATION_KIND.BusinessSite &&
    (fd.ParentLocationId == null || fd.ParentLocationId === 0);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    setLoading(true);
    try {
      const savePayload: LocationMasterReq = {
        ...formData,
        LocType: formData.LocType ?? LOCATION_KIND.BusinessSite,
      };
      delete (savePayload as LocationMasterReq & { ParentName?: string }).ParentName;
      delete (savePayload as LocationMasterReq & { DisplayPath?: string }).DisplayPath;
      if (!savePayload.ParentLocationId || savePayload.ParentLocationId <= 0) {
        savePayload.ParentLocationId = undefined;
        savePayload.LocType = LOCATION_KIND.BusinessSite;
      }

      const result = await LocationService.SaveLocation(savePayload);
      const savedLocationId = result?.locationId || formData.LocationId || locationId;

      // Handle logo upload/delete (business sites only)
      if (isBusinessSiteRow(savePayload) && shouldDeleteLogo && logoUrl) {
        // Delete existing logo
        try {
          await LocationService.DeleteLogo(savedLocationId);
          setLogoUrl(null);
          setLogoPreview(null);
        } catch (logoError: any) {
          console.error("Error deleting logo:", logoError);
          // Don't fail the whole save if logo deletion fails
        }
      } else if (isBusinessSiteRow(savePayload) && logoFile) {
        // Upload new logo
        try {
          console.log("Uploading logo for locationId:", savedLocationId);
          const logoResult = await LocationService.UploadLogo(savedLocationId, logoFile);
          console.log("Logo upload result:", logoResult);
          toast.success("Logo uploaded successfully");
        } catch (logoError: any) {
          console.error("Error uploading logo:", logoError);
          console.error("Error details:", {
            message: logoError?.message,
            response: logoError?.response?.data,
            status: logoError?.response?.status,
            url: logoError?.config?.url
          });
          // Log the actual server error message
          const serverError = logoError?.response?.data?.error || logoError?.response?.data?.message || "Unknown error";
          const innerError = logoError?.response?.data?.innerException || "";
          console.error("Server error:", serverError);
          if (innerError) {
            console.error("Inner exception:", innerError);
          }
          toast.warning(`Location saved but logo upload failed: ${serverError}`);
        }
      }

      toast.success(
        locationId > 0
          ? "Location updated successfully"
          : "Location created successfully"
      );
      setIsStateChanged(false);
      onClose();
    } catch (error: any) {
      console.error("Error saving location:", error);
      toast.error(`Error saving location: ${error.message || "Unknown error"}`);
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

  const handleParentSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (!v) {
      setFormData((prev) => ({
        ...prev,
        ParentLocationId: undefined,
        LocType: LOCATION_KIND.BusinessSite,
      }));
      setIsStateChanged(true);
      return;
    }
    const pid = parseInt(v, 10);
    const parent = allLocations.find((l) => l.locationId === pid);
    const pt = parent?.locType ?? LOCATION_KIND.BusinessSite;
    const nextType = Math.min(pt + 1, LOCATION_KIND.Bin);
    setFormData((prev) => ({
      ...prev,
      ParentLocationId: pid,
      LocType: nextType,
    }));
    setIsStateChanged(true);
  };

  if (loading && locationId > 0) {
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

  const isBusinessSite = isBusinessSiteRow(formData);

  const parentOptions = allLocations
    .filter((l) => (l.locType ?? LOCATION_KIND.BusinessSite) < LOCATION_KIND.Bin)
    .filter((l) => l.locationId !== locationId)
    .sort((a, b) => (a.displayPath || a.name).localeCompare(b.displayPath || b.name));

  const parentForType =
    formData.ParentLocationId != null && formData.ParentLocationId > 0
      ? allLocations.find((l) => l.locationId === formData.ParentLocationId)
      : undefined;
  const parentLocType = parentForType?.locType ?? LOCATION_KIND.BusinessSite;
  const allowedChildTypes =
    formData.ParentLocationId != null && formData.ParentLocationId > 0
      ? Array.from({ length: LOCATION_KIND.Bin - parentLocType }, (_, i) => parentLocType + 1 + i)
      : [];

  return (
    <div className="slideout-overlay" onClick={handleCancel}>
      <div className="form-card" onClick={(e) => e.stopPropagation()}>
        <div className="form-header">
          <h2>
            {locationId > 0
              ? "Edit Location"
              : formData.ParentLocationId
              ? "Add storage location"
              : "Add business site"}
          </h2>
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
          {/* Form Content */}
          <div className="tab-content">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Code">Location Code <span className="required">*</span></label>
                <div className={`input-group ${errors.Code ? 'has-error' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Document}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="Code"
                    name="Code"
                    className={`form-input ${errors.Code ? "error" : ""}`}
                    placeholder="Enter location code"
                    value={formData.Code}
                    onChange={(e) => handleInputChange("Code", e.target.value)}
                    required
                  />
                </div>
                {errors.Code && <span className="error-message">{errors.Code}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="Name">Location Name <span className="required">*</span></label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Building}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="Name"
                    name="Name"
                    className={`form-input ${errors.Name ? "error" : ""}`}
                    placeholder="Enter location name"
                    value={formData.Name}
                    onChange={(e) => handleInputChange("Name", e.target.value)}
                    required
                  />
                </div>
                {errors.Name && <span className="error-message">{errors.Name}</span>}
              </div>
            </div>

            {locationId === 0 && (
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="ParentLocationId">Under (parent)</label>
                  <select
                    id="ParentLocationId"
                    className="form-input"
                    value={formData.ParentLocationId ?? ""}
                    onChange={handleParentSelect}
                  >
                    <option value="">— Business site (no parent) —</option>
                    {parentOptions.map((l) => (
                      <option key={l.locationId} value={l.locationId}>
                        {(l.displayPath || `${l.code} ${l.name}`).trim()}
                      </option>
                    ))}
                  </select>
                  <small style={{ display: "block", marginTop: "0.35rem", color: "#6b7280" }}>
                    Choose a parent to add a warehouse, rack, shelf, or bin under an existing site or storage area.
                  </small>
                </div>
                <div className="form-group">
                  <label htmlFor="LocType">Storage type</label>
                  {formData.ParentLocationId ? (
                    <select
                      id="LocType"
                      className="form-input"
                      value={formData.LocType ?? Math.min(parentLocType + 1, LOCATION_KIND.Bin)}
                      onChange={(e) => {
                        handleInputChange("LocType", parseInt(e.target.value, 10));
                      }}
                    >
                      {allowedChildTypes.map((t) => (
                        <option key={t} value={t}>
                          {LOCATION_KIND_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      readOnly
                      className="form-input"
                      value={LOCATION_KIND_LABEL[LOCATION_KIND.BusinessSite]}
                    />
                  )}
                </div>
              </div>
            )}

            {locationId > 0 && (
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Path</label>
                  <div
                    className="form-input"
                    style={{ background: "#f9fafb", cursor: "default" }}
                  >
                    {formData.DisplayPath || formData.Name || "—"}
                  </div>
                </div>
                <div className="form-group">
                  <label>Type</label>
                  {!formData.ParentLocationId ? (
                    <input
                      readOnly
                      className="form-input"
                      value={LOCATION_KIND_LABEL[LOCATION_KIND.BusinessSite]}
                    />
                  ) : (
                    <select
                      className="form-input"
                      value={formData.LocType ?? LOCATION_KIND.Warehouse}
                      onChange={(e) =>
                        handleInputChange("LocType", parseInt(e.target.value, 10))
                      }
                    >
                      {allowedChildTypes.map((t) => (
                        <option key={t} value={t}>
                          {LOCATION_KIND_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="Email">Email Address</label>
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
              <div className="form-group">
                <label htmlFor="Phone">Phone Number</label>
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
            </div>

            <div className="form-row">
              <div
                className="form-group"
                style={isBusinessSite ? undefined : { flex: "1 1 100%", minWidth: "100%" }}
              >
                <label htmlFor="WebAddress">Web Address</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="text"
                    id="WebAddress"
                    name="WebAddress"
                    className="form-input"
                    placeholder="https://"
                    value={formData.WebAddress}
                    onChange={(e) => handleInputChange("WebAddress", e.target.value)}
                  />
                </div>
              </div>
              {isBusinessSite && (
              <div className="form-group">
                <label htmlFor="Logo">Logo</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                      </svg>
                    </span>
                  </div>
                  <input
                    type="file"
                    id="Logo"
                    name="Logo"
                    className="form-input"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        // Validate file type
                        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/svg+xml'];
                        if (!allowedTypes.includes(file.type)) {
                          toast.error("Invalid file type. Please select an image file (jpg, png, gif, svg).");
                          return;
                        }
                        
                        // Validate file size (5MB max)
                        const maxSize = 5 * 1024 * 1024; // 5MB
                        if (file.size > maxSize) {
                          toast.error("File size exceeds 5MB. Please select a smaller image.");
                          return;
                        }

                        setLogoFile(file);
                        setShouldDeleteLogo(false);
                        setIsStateChanged(true);
                        // Create preview
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setLogoPreview(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ padding: "0.5rem" }}
                  />
                </div>
                {logoPreview && (
                  <div style={{ marginTop: "0.5rem", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        style={{
                          maxWidth: "100px",
                          maxHeight: "100px",
                          objectFit: "contain",
                          border: "1px solid #ddd",
                          borderRadius: "4px",
                          padding: "4px",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setLogoFile(null);
                          if (logoUrl) {
                            // If there's an existing logo, mark it for deletion
                            setShouldDeleteLogo(true);
                            setLogoPreview(null);
                          } else {
                            setLogoPreview(null);
                          }
                          setIsStateChanged(true);
                          // Reset the file input
                          const fileInput = document.getElementById("Logo") as HTMLInputElement;
                          if (fileInput) {
                            fileInput.value = "";
                          }
                        }}
                        style={{
                          position: "absolute",
                          top: "-8px",
                          right: "-8px",
                          width: "20px",
                          height: "20px",
                          padding: "0",
                          backgroundColor: "#6b7280",
                          color: "white",
                          border: "2px solid white",
                          borderRadius: "50%",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "12px",
                          lineHeight: "1",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                        title="Remove logo"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}
                {logoFile && !logoPreview && (
                  <div style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: "#6b7280", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>Selected: {logoFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setLogoFile(null);
                        if (logoUrl) {
                          // If there's an existing logo, mark it for deletion
                          setShouldDeleteLogo(true);
                          setLogoPreview(null);
                        }
                        setIsStateChanged(true);
                        const fileInput = document.getElementById("Logo") as HTMLInputElement;
                        if (fileInput) {
                          fileInput.value = "";
                        }
                      }}
                      style={{
                        padding: "0",
                        width: "16px",
                        height: "16px",
                        fontSize: "0.75rem",
                        backgroundColor: "transparent",
                        color: "#6b7280",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        lineHeight: "1",
                      }}
                      title="Remove logo"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "#ef4444";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "#6b7280";
                      }}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="Address">Street Address</label>
              <div className="input-group">
                <div className="input-group-prepend">
                  <span className="input-group-icon">
                    {Icons.Location}
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
                      {Icons.Building}
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
                <label htmlFor="State">State</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Location}
                    </span>
                  </div>
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
              </div>
              <div className="form-group">
                <label htmlFor="Zip">Zip Code</label>
                <div className={`input-group ${errors.Zip ? 'has-error' : ''}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Location}
                    </span>
                  </div>
                  <input
                    type="text"
                    id="Zip"
                    name="Zip"
                    className={`form-input ${errors.Zip ? "error" : ""}`}
                    placeholder="Enter zip code"
                    value={formData.Zip}
                    onChange={(e) => handleInputChange("Zip", e.target.value)}
                  />
                </div>
                {errors.Zip && <span className="error-message">{errors.Zip}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="Country">Country</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">
                      {Icons.Location}
                    </span>
                  </div>
                  <select
                    id="Country"
                    name="Country"
                    className="form-input"
                    value={formData.Country}
                    onChange={(e) => {
                      handleInputChange("Country", e.target.value);
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

          {/* Footer */}
          <div className="form-actions" style={{ flexShrink: 0 }}>
            {locationId > 0 && (
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
              {loading ? "Saving..." : locationId > 0 ? "Update" : "Save"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Location ${formData.Name || formData.Code || `#${locationId}`}`}
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

export default LocationMasterSlideout;

