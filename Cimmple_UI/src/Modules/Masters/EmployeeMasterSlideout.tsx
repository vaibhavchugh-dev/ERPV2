import React, { useState, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import { Modal, Button } from "react-bootstrap";
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
  onClose: (refreshList?: boolean) => void;
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

  // Login access: checked only when the employee can actually authenticate (has password)
  const [loginAccessEnabled, setLoginAccessEnabled] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [loginPasswordConfirm, setLoginPasswordConfirm] = useState("");
  const [initialLoginAccessEnabled, setInitialLoginAccessEnabled] = useState(false);

  // Profile Picture State & Refs
  const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
  const [profilePicPreview, setProfilePicPreview] = useState<string>("");
  const [profilePicUrl, setProfilePicUrl] = useState<string>("");
  const [showProfilePicModal, setShowProfilePicModal] = useState<boolean>(false);
  const [showProfileCamera, setShowProfileCamera] = useState<boolean>(false);
  const [pendingProfilePicFile, setPendingProfilePicFile] = useState<File | null>(null);
  const [pendingProfilePicPreview, setPendingProfilePicPreview] = useState<string>("");

  const profileVideoRef = useRef<HTMLVideoElement | null>(null);
  const profileCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const profilePicInputRef = useRef<HTMLInputElement | null>(null);
  const profileCameraStreamRef = useRef<MediaStream | null>(null);

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
    } else {
      setLoginAccessEnabled(false);
      setHasPassword(false);
      setFaceEnrolled(false);
      setInitialLoginAccessEnabled(false);
      setLoginPassword("");
      setLoginPasswordConfirm("");
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

  const defaultProfileAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 24 24' fill='%239ca3af'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";

  const getProfilePicSrc = () => {
    return profilePicPreview || profilePicUrl || defaultProfileAvatar;
  };

  const loadProfilePic = async (userId: number) => {
    if (!userId || userId === 0) return;
    try {
      const blob = await EmployeeService.GetProfilePic({ userId });
      if (blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        setProfilePicUrl(url);
      }
    } catch (e) {
      console.error("Error loading profile picture:", e);
    }
  };

  const stopProfileCamera = () => {
    if (profileCameraStreamRef.current) {
      profileCameraStreamRef.current.getTracks().forEach((track) => track.stop());
      profileCameraStreamRef.current = null;
    }
    if (profileVideoRef.current) {
      profileVideoRef.current.srcObject = null;
    }
  };

  const openProfilePicModal = () => {
    setShowProfilePicModal(true);
    setShowProfileCamera(false);
    setPendingProfilePicFile(profilePicFile);
    setPendingProfilePicPreview(profilePicPreview || profilePicUrl || "");
  };

  const closeProfilePicModal = () => {
    stopProfileCamera();
    setShowProfilePicModal(false);
    setShowProfileCamera(false);
    setPendingProfilePicFile(null);
    setPendingProfilePicPreview("");
    if (profilePicInputRef.current) {
      profilePicInputRef.current.value = "";
    }
  };

  const openProfileCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error("Camera is not available in this browser.");
      return;
    }

    try {
      stopProfileCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      profileCameraStreamRef.current = stream;
      setShowProfileCamera(true);
      setPendingProfilePicFile(null);
      setPendingProfilePicPreview("");

      setTimeout(() => {
        if (profileVideoRef.current) {
          profileVideoRef.current.srcObject = stream;
          profileVideoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch (err) {
      toast.error("Unable to open the camera. Please allow camera access.");
    }
  };

  const captureProfilePhoto = () => {
    const video = profileVideoRef.current;
    const canvas = profileCanvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error("Camera is not ready yet.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      toast.error("Unable to capture photo.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const preview = canvas.toDataURL("image/jpeg", 0.9);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Unable to capture photo.");
          return;
        }

        const file = new File([blob], `profile-photo-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });

        stopProfileCamera();
        setPendingProfilePicFile(file);
        setPendingProfilePicPreview(preview);
        setShowProfileCamera(false);
      },
      "image/jpeg",
      0.9
    );
  };

  const handleProfilePicChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const allowedExtensions = ["jpg", "jpeg", "png", "gif", "webp"];
    const fileExtension = file.name.split(".").pop()?.toLowerCase();
    const isImageFile =
      (file.type && file.type.indexOf("image/") === 0) ||
      (fileExtension && allowedExtensions.includes(fileExtension));

    if (!isImageFile) {
      toast.error("Only image files are allowed.");
      event.target.value = "";
      return;
    }

    const maxFileSize = 5 * 1024 * 1024;
    if (file.size > maxFileSize) {
      toast.error("Profile picture must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      stopProfileCamera();
      setPendingProfilePicFile(file);
      setPendingProfilePicPreview(reader.result as string);
      setShowProfileCamera(false);
    };
    reader.onerror = () => {
      toast.error("Unable to read the selected image.");
    };
    reader.readAsDataURL(file);
  };

  const saveProfilePicSelection = () => {
    if (!pendingProfilePicFile) {
      closeProfilePicModal();
      return;
    }

    setProfilePicFile(pendingProfilePicFile);
    setProfilePicPreview(pendingProfilePicPreview);
    setShowProfilePicModal(false);
    setIsStateChanged(true);

    if (profilePicInputRef.current) {
      profilePicInputRef.current.value = "";
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
          UserName: employee.UserName && employee.UserName.trim() !== "" ? employee.UserName : "",
        });

        const passwordExists = !!employee.HasPassword;
        setHasPassword(passwordExists);
        setFaceEnrolled(!!employee.FaceEnrolled);
        setLoginAccessEnabled(passwordExists);
        setInitialLoginAccessEnabled(passwordExists);
        setLoginPassword("");
        setLoginPasswordConfirm("");

        loadProfilePic(employee.User_UniqueID);
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

    if (loginAccessEnabled) {
      const enablingFirstTime = !initialLoginAccessEnabled || !hasPassword;
      if (enablingFirstTime && !loginPassword.trim()) {
        newErrors.loginPassword = "Password is required to enable login access";
      } else if (loginPassword.trim() || loginPasswordConfirm.trim() || enablingFirstTime) {
        if (loginPassword.length < 8) {
          newErrors.loginPassword = "Password must be at least 8 characters";
        }
        if (loginPassword !== loginPasswordConfirm) {
          newErrors.loginPasswordConfirm = "Passwords do not match";
        }
      }
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
      onClose(true);
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
      const submitData: EmployeeMasterReq = { ...formData };
      delete submitData.HasPassword;
      delete submitData.CanLogin;
      if (loginAccessEnabled) {
        const firstName = submitData.FirstName?.toLowerCase().replace(/\s+/g, "") || "";
        const lastName = submitData.LastName?.toLowerCase().replace(/\s+/g, "") || "";
        submitData.UserName = `${firstName}.${lastName}` || "";
        if (loginPassword.trim()) {
          submitData.Password = loginPassword.trim();
        } else {
          delete submitData.Password;
        }
      } else {
        submitData.UserName = "";
        delete submitData.Password;
      }
      
      const saved = await EmployeeService.SaveEmployeeData(submitData, profilePicFile);
      toast.success(
        employeeId > 0 ? "Employee updated successfully" : "Employee created successfully"
      );
      if (profilePicFile) {
        if (saved?.faceEnrolled || saved?.FaceEnrolled) {
          toast.success("Face enrolled for Time Clock");
        } else if (saved?.faceMessage || saved?.FaceMessage) {
          toast.warn(saved.faceMessage || saved.FaceMessage);
        }
      }
      setIsStateChanged(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error saving employee:", error);
      const apiError =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        "Unknown error";
      toast.error(`Error saving employee: ${apiError}`);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="user-slideout-profile-pic" style={{ position: "relative", width: "60px", height: "60px", flex: "0 0 60px" }}>
              <button
                type="button"
                className="btn p-0 border-0 bg-transparent position-relative"
                onClick={openProfilePicModal}
                title="Edit profile picture"
                style={{ width: "100%", height: "100%" }}
              >
                <img
                  src={getProfilePicSrc()}
                  alt="Profile"
                  style={{
                    width: "60px",
                    height: "60px",
                    objectFit: "cover",
                    borderRadius: "50%",
                    border: "1px solid #d7dde5",
                  }}
                />
                <span
                  className="edit-icon d-flex align-items-center justify-content-center"
                  style={{
                    position: "absolute",
                    right: "0px",
                    bottom: "0px",
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    background: "#164DA0",
                    color: "#fff",
                    border: "2px solid #fff",
                    fontSize: "11px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  ✎
                </span>
              </button>
            </div>
            <div>
              <h2>
                {employeeId === 0 ? "New Employee" : formData.FirstName && formData.LastName ? `${formData.FirstName} ${formData.LastName}` : "Edit Employee"}
              </h2>
              {employeeId > 0 && (
                <div style={{ fontSize: "12px", color: faceEnrolled ? "#198754" : "#6c757d", marginTop: "2px" }}>
                  {faceEnrolled ? "Face enrolled" : "Face not enrolled"}
                </div>
              )}
            </div>
          </div>
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
                  <div>
                    <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#111827', margin: 0 }}>
                      Basic Information
                    </h3>
                    <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0.25rem 0 0' }}>
                      Login Access is only enabled when a password is set and the employee can sign in.
                    </p>
                  </div>
                  <label className="checkbox-wrapper" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={loginAccessEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setLoginAccessEnabled(enabled);
                        setLoginPassword("");
                        setLoginPasswordConfirm("");
                        setIsStateChanged(true);
                        if (!enabled) {
                          handleInputChange("UserName", "");
                        } else if (!formData.UserName || formData.UserName.trim() === "") {
                          handleInputChange("UserName", "enabled");
                        }
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.loginPassword;
                          delete next.loginPasswordConfirm;
                          return next;
                        });
                      }}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Login Access</span>
                  </label>
                </div>

                {loginAccessEnabled && (
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                    {(formData.UserName && formData.UserName !== "enabled") ? (
                      <p style={{ fontSize: '0.8125rem', color: '#374151', marginBottom: '0.75rem' }}>
                        Login username: <strong>{formData.UserName}</strong>
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                        Username will be generated as <strong>firstname.lastname</strong> on save.
                      </p>
                    )}
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="loginPassword">
                          {hasPassword ? "New Password" : "Password"}
                          {(!hasPassword || !initialLoginAccessEnabled) && (
                            <span className="required"> *</span>
                          )}
                        </label>
                        <input
                          type="password"
                          id="loginPassword"
                          name="loginPassword"
                          className={`form-input ${errors.loginPassword ? "error" : ""}`}
                          autoComplete="new-password"
                          placeholder={
                            hasPassword
                              ? "Leave blank to keep current password"
                              : "Enter login password"
                          }
                          value={loginPassword}
                          onChange={(e) => {
                            setLoginPassword(e.target.value);
                            setIsStateChanged(true);
                          }}
                        />
                        {errors.loginPassword && (
                          <span className="error-message">{errors.loginPassword}</span>
                        )}
                      </div>
                      <div className="form-group">
                        <label htmlFor="loginPasswordConfirm">
                          Confirm Password
                          {(!hasPassword || !initialLoginAccessEnabled || loginPassword.trim() !== "") && (
                            <span className="required"> *</span>
                          )}
                        </label>
                        <input
                          type="password"
                          id="loginPasswordConfirm"
                          name="loginPasswordConfirm"
                          className={`form-input ${errors.loginPasswordConfirm ? "error" : ""}`}
                          autoComplete="new-password"
                          placeholder="Confirm login password"
                          value={loginPasswordConfirm}
                          onChange={(e) => {
                            setLoginPasswordConfirm(e.target.value);
                            setIsStateChanged(true);
                          }}
                        />
                        {errors.loginPasswordConfirm && (
                          <span className="error-message">{errors.loginPasswordConfirm}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

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
                          const dateValue = e.target.value;
                          if (dateValue) {
                            const date = new Date(dateValue + 'T00:00:00');
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
                </div>
                <div className="location-access-panel">
                  <h4 className="location-access-panel__title">Location Access</h4>
                  <p className="location-access-panel__hint">
                    Choose where this employee can work, then pick their starting location at sign-in.
                  </p>

                  <label htmlFor="CanAccessAllLocations" className="location-access-mode">
                    <input
                      id="CanAccessAllLocations"
                      type="checkbox"
                      checked={!!formData.CanAccessAllLocations}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFormData((prev) => {
                          const nextDefault =
                            checked && !prev.DefaultLocationId && locations.length > 0
                              ? locations[0].locationId
                              : prev.DefaultLocationId;
                          return {
                            ...prev,
                            CanAccessAllLocations: checked,
                            DefaultLocationId: nextDefault,
                          };
                        });
                        setIsStateChanged(true);
                      }}
                    />
                    <span>Can work at all locations</span>
                  </label>

                  {!formData.CanAccessAllLocations && (
                    <div className="form-group">
                      <label htmlFor="LocationIds">Assigned locations</label>
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
                          size={Math.min(5, Math.max(3, locations.length || 3))}
                          value={(formData.LocationIds || []).map(String)}
                          onChange={(e) => {
                            const selected = Array.from(e.target.selectedOptions).map((o) => parseInt(o.value, 10));
                            setFormData((prev) => {
                              const keepDefault =
                                prev.DefaultLocationId && selected.includes(prev.DefaultLocationId)
                                  ? prev.DefaultLocationId
                                  : selected[0] || undefined;
                              return {
                                ...prev,
                                LocationIds: selected,
                                LocationId: selected[0] || undefined,
                                DefaultLocationId: keepDefault,
                              };
                            });
                            setIsStateChanged(true);
                          }}
                        >
                          {locations.map((location) => (
                            <option key={location.locationId} value={location.locationId}>
                              {location.name} {location.code ? `(${location.code})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <small className="text-muted">Hold Ctrl/Cmd to select multiple</small>
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="DefaultLocationId">Starting location</label>
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
                        id="DefaultLocationId"
                        name="DefaultLocationId"
                        className="form-input"
                        value={formData.DefaultLocationId || ""}
                        disabled={
                          !formData.CanAccessAllLocations &&
                          (formData.LocationIds || []).length === 0
                        }
                        onChange={(e) =>
                          handleInputChange(
                            "DefaultLocationId",
                            e.target.value ? parseInt(e.target.value, 10) : undefined
                          )
                        }
                      >
                        <option value="">
                          {!formData.CanAccessAllLocations &&
                          (formData.LocationIds || []).length === 0
                            ? "Select assigned locations first"
                            : "Select starting location"}
                        </option>
                        {(formData.CanAccessAllLocations
                          ? locations
                          : locations.filter((l) =>
                              (formData.LocationIds || []).includes(l.locationId)
                            )
                        ).map((loc) => (
                          <option key={loc.locationId} value={loc.locationId}>
                            {loc.name} {loc.code ? `(${loc.code})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <small className="text-muted">
                      Used as this employee&apos;s home location when they sign in.
                    </small>
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
                <div className="form-row form-row-full">
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
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label htmlFor="State">State</label>
                    {formData.Country === "US" ? (
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
                      </div>
                    ) : (
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
                          id="State"
                          name="State"
                          className="form-input"
                          placeholder="Enter state"
                          value={formData.State}
                          onChange={(e) => handleInputChange("State", e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="Zip">Zip Code</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 4h16v16H4z"></path>
                            <path d="M9 9h6v6H9z"></path>
                          </svg>
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
                    {errors.Zip && (
                      <span className="error-message">{errors.Zip}</span>
                    )}
                  </div>
                  <div className="form-group">
                    <label htmlFor="Country">Country</label>
                    <div className="input-group">
                      <div className="input-group-prepend">
                        <span className="input-group-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                          </svg>
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

        <Modal
          show={showProfilePicModal}
          onHide={closeProfilePicModal}
          centered
        >
          <Modal.Header closeButton>
            <Modal.Title>Upload Photo</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="d-flex flex-column align-items-center">
              {showProfileCamera ? (
                <>
                  <video
                    ref={profileVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      width: "100%",
                      maxWidth: "420px",
                      aspectRatio: "4 / 3",
                      objectFit: "cover",
                      borderRadius: "8px",
                      border: "1px solid #d7dde5",
                      background: "#111",
                    }}
                  />
                  <Button
                    variant="primary"
                    type="button"
                    className="mt-3"
                    onClick={captureProfilePhoto}
                  >
                    Capture Photo
                  </Button>
                </>
              ) : (
                <img
                  src={pendingProfilePicPreview || getProfilePicSrc()}
                  alt="Profile preview"
                  style={{
                    width: "200px",
                    height: "200px",
                    objectFit: "cover",
                    borderRadius: "50%",
                    border: "1px solid #d7dde5",
                  }}
                />
              )}
              <p className="text-muted mt-3 mb-0" style={{ fontSize: "13px" }}>
                Use a clear, single-face photo. Saving the employee enrolls this photo for Time Clock.
              </p>
              <div className="d-flex align-items-center justify-content-center gap-2 mt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => profilePicInputRef.current?.click()}
                >
                  Choose Photo
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  onClick={openProfileCamera}
                >
                  Take Photo
                </Button>
              </div>
              <input
                ref={profilePicInputRef}
                type="file"
                accept="image/*"
                className="d-none"
                onChange={handleProfilePicChange}
              />
              <canvas ref={profileCanvasRef} className="d-none" />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              type="button"
              onClick={closeProfilePicModal}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="button"
              onClick={saveProfilePicSelection}
              disabled={!pendingProfilePicFile}
            >
              Use Photo
            </Button>
          </Modal.Footer>
        </Modal>
      </div>
    </div>
  );
};

export default EmployeeMasterSlideout;

