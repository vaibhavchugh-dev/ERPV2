import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  ChartofAccountsService,
  ChartofAccountMasterReq,
} from "../../Common/Services/ChartofAccountsService";
import { Icons } from "../../Common/Components/MasterSlideout/SharedFieldConfigs";
import DeletionImpactDialog, { DeletionImpactResult } from "../../Common/Components/DeletionImpactDialog";
import { AccountingService } from "../../Common/Services/AccountingService";
import { VendorInvoiceService } from "../../Common/Services/VendorInvoiceService";
import "./CustomerMasterSlideout.scss";

interface ChartofAccountsMasterSlideoutProps {
  accountId: number;
  onClose: (refreshList?: boolean) => void;
}

interface GroupOption {
  id: number;
  name: string;
}

type GroupField = "Groupid" | "Subgroupid" | "Subgroupid2" | "Subgroupid3";
const groupFieldOrder: GroupField[] = ["Groupid", "Subgroupid", "Subgroupid2", "Subgroupid3"];

const apiError = (error: any) =>
  error?.response?.data?.error || error?.response?.data?.message || error?.message || "Unknown error";

const ChartofAccountsMasterSlideout: React.FC<ChartofAccountsMasterSlideoutProps> = ({
  accountId,
  onClose,
}) => {
  const [formData, setFormData] = useState<ChartofAccountMasterReq>({
    AccountID: 0,
    AccountCode: "",
    AccountName: "",
    AccountType: "",
    Status: "Active",
    Tenantid: 0,
    Groupid: undefined,
    Subgroupid: undefined,
    Subgroupid2: undefined,
    Subgroupid3: undefined,
    Linegroupid: undefined,
    MainGroup: "",
  });

  const [loading, setLoading] = useState(false);
  const [isStateChanged, setIsStateChanged] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [showDeletionDialog, setShowDeletionDialog] = useState(false);
  const [deletionImpact, setDeletionImpact] = useState<DeletionImpactResult | null>(null);

  // Group/Subgroup lists
  const [mainGroups, setMainGroups] = useState<GroupOption[]>([]);
  const [subGroups, setSubGroups] = useState<GroupOption[]>([]);
  const [subGroups2, setSubGroups2] = useState<GroupOption[]>([]);
  const [subGroups3, setSubGroups3] = useState<GroupOption[]>([]);

  // "Add New" states
  const [showAddMainGroup, setShowAddMainGroup] = useState(false);
  const [showAddSubGroup, setShowAddSubGroup] = useState(false);
  const [showAddSubGroup2, setShowAddSubGroup2] = useState(false);
  const [showAddSubGroup3, setShowAddSubGroup3] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Account Type options
  const accountTypes = [
    "Asset",
    "Liability",
    "Equity",
    "Revenue",
    "Expense",
    "Other",
  ];

  useEffect(() => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    setFormData((prev) => ({
      ...prev,
      Tenantid: storage?.tenantID || 0,
    }));

    loadMainGroups();

    if (accountId > 0) {
      loadAccount();
    }
  }, [accountId]);

  // Load subgroups when main group changes
  useEffect(() => {
    if (formData.Groupid) {
      loadSubGroups(formData.Groupid);
    } else {
      setSubGroups([]);
      setFormData((prev) => ({ ...prev, Subgroupid: undefined, Subgroupid2: undefined, Subgroupid3: undefined }));
    }
  }, [formData.Groupid]);

  // Load subgroups2 when subgroup1 changes
  useEffect(() => {
    if (formData.Subgroupid) {
      loadSubGroups2(formData.Subgroupid);
    } else {
      setSubGroups2([]);
      setFormData((prev) => ({ ...prev, Subgroupid2: undefined, Subgroupid3: undefined }));
    }
  }, [formData.Subgroupid]);

  // Load subgroups3 when subgroup2 changes
  useEffect(() => {
    if (formData.Subgroupid2) {
      loadSubGroups3(formData.Subgroupid2);
    } else {
      setSubGroups3([]);
      setFormData((prev) => ({ ...prev, Subgroupid3: undefined }));
    }
  }, [formData.Subgroupid2]);

  const loadMainGroups = async () => {
    try {
      const groups = await ChartofAccountsService.GetMainGroups();
      setMainGroups(groups.map((g) => ({ id: g.mainGroupID, name: g.mainGroupName })));
    } catch (error: any) {
      console.error("Error loading main groups:", error);
    }
  };

  const loadSubGroups = async (mainGroupId: number) => {
    try {
      const groups = await ChartofAccountsService.GetSubGroups(mainGroupId);
      setSubGroups(groups.map((g) => ({ id: g.subGroupID, name: g.subGroupName })));
    } catch (error: any) {
      console.error("Error loading sub groups:", error);
    }
  };

  const loadSubGroups2 = async (subGroupId: number) => {
    try {
      const groups = await ChartofAccountsService.GetSubGroups2(subGroupId);
      setSubGroups2(groups.map((g) => ({ id: g.subGroup2ID, name: g.subGroup2Name })));
    } catch (error: any) {
      console.error("Error loading sub groups 2:", error);
    }
  };

  const loadSubGroups3 = async (subGroup2Id: number) => {
    try {
      const groups = await ChartofAccountsService.GetSubGroups3(subGroup2Id);
      setSubGroups3(groups.map((g) => ({ id: g.subGroup3ID, name: g.subGroup3Name })));
    } catch (error: any) {
      console.error("Error loading sub groups 3:", error);
    }
  };

  const loadAccount = async () => {
    setLoading(true);
    try {
      const account = await ChartofAccountsService.GetChartofAccountById(accountId);
      if (account) {
        setFormData({
          AccountID: account.AccountID,
          AccountCode: account.AccountCode || "",
          AccountName: account.AccountName || "",
          AccountType: account.AccountType || "",
          Status: account.Status || "Active",
          Tenantid: account.Tenantid,
          Groupid: account.Groupid,
          Subgroupid: account.Subgroupid,
          Subgroupid2: account.Subgroupid2,
          Subgroupid3: account.Subgroupid3,
          Linegroupid: account.Linegroupid,
          MainGroup: account.MainGroup || "",
        });

        // Load subgroups based on saved values
        if (account.Groupid) {
          await loadSubGroups(account.Groupid);
        }
        if (account.Subgroupid) {
          await loadSubGroups2(account.Subgroupid);
        }
        if (account.Subgroupid2) {
          await loadSubGroups3(account.Subgroupid2);
        }
      }
    } catch (error: any) {
      console.error("Error loading chart of account:", error);
      toast.error(`Error loading chart of account: ${apiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ChartofAccountMasterReq, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsStateChanged(true);

    // Clear error when field is changed
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // A group only makes sense under its parent, so picking a different parent clears everything below it.
  const handleGroupChange = (field: GroupField, value: number | undefined) => {
    setFormData((prev) => {
      if (prev[field] === value) return prev;
      const next = { ...prev, [field]: value };
      groupFieldOrder.slice(groupFieldOrder.indexOf(field) + 1).forEach((child) => {
        next[child] = undefined;
      });
      return next;
    });
    setIsStateChanged(true);
  };

  const handleSaveNewMainGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a main group name");
      return;
    }

    try {
      const result = await ChartofAccountsService.SaveMainGroup(newGroupName.trim());
      setMainGroups((prev) => [...prev, { id: result.mainGroupID, name: result.mainGroupName }]);
      handleGroupChange("Groupid", result.mainGroupID);
      setShowAddMainGroup(false);
      setNewGroupName("");
      toast.success("Main group created successfully");
    } catch (error: any) {
      toast.error(`Error creating main group: ${apiError(error)}`);
    }
  };

  const handleSaveNewSubGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a sub group name");
      return;
    }

    if (!formData.Groupid) {
      toast.error("Please select a main group first");
      return;
    }

    try {
      const result = await ChartofAccountsService.SaveSubGroup(newGroupName.trim(), formData.Groupid);
      setSubGroups((prev) => [...prev, { id: result.subGroupID, name: result.subGroupName }]);
      handleGroupChange("Subgroupid", result.subGroupID);
      setShowAddSubGroup(false);
      setNewGroupName("");
      toast.success("Sub group created successfully");
    } catch (error: any) {
      toast.error(`Error creating sub group: ${apiError(error)}`);
    }
  };

  const handleSaveNewSubGroup2 = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a sub group 2 name");
      return;
    }

    if (!formData.Subgroupid) {
      toast.error("Please select a sub group 1 first");
      return;
    }

    try {
      const result = await ChartofAccountsService.SaveSubGroup2(newGroupName.trim(), formData.Subgroupid);
      setSubGroups2((prev) => [...prev, { id: result.subGroup2ID, name: result.subGroup2Name }]);
      handleGroupChange("Subgroupid2", result.subGroup2ID);
      setShowAddSubGroup2(false);
      setNewGroupName("");
      toast.success("Sub group 2 created successfully");
    } catch (error: any) {
      toast.error(`Error creating sub group 2: ${apiError(error)}`);
    }
  };

  const handleSaveNewSubGroup3 = async () => {
    if (!newGroupName.trim()) {
      toast.error("Please enter a sub group 3 name");
      return;
    }

    if (!formData.Subgroupid2) {
      toast.error("Please select a sub group 2 first");
      return;
    }

    try {
      const result = await ChartofAccountsService.SaveSubGroup3(newGroupName.trim(), formData.Subgroupid2);
      setSubGroups3((prev) => [...prev, { id: result.subGroup3ID, name: result.subGroup3Name }]);
      handleGroupChange("Subgroupid3", result.subGroup3ID);
      setShowAddSubGroup3(false);
      setNewGroupName("");
      toast.success("Sub group 3 created successfully");
    } catch (error: any) {
      toast.error(`Error creating sub group 3: ${apiError(error)}`);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.AccountCode || formData.AccountCode.trim() === "") {
      newErrors.AccountCode = "Account code is required";
    }

    if (!formData.AccountName || formData.AccountName.trim() === "") {
      newErrors.AccountName = "Account name is required";
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
      await ChartofAccountsService.SaveChartofAccount(formData);
      toast.success(
        accountId > 0
          ? "Chart of Account updated successfully"
          : "Chart of Account created successfully"
      );
      setIsStateChanged(false);
      onClose(true);
    } catch (error: any) {
      console.error("Error saving chart of account:", error);
      toast.error(`Error saving chart of account: ${apiError(error)}`);
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
    if (accountId === 0) return;
    
    setLoading(true);
    try {
      const response = await ChartofAccountsService.CheckChartofAccountDeletionImpact(accountId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
      setShowDeletionDialog(true);
    } catch (error: any) {
      console.error("Error checking deletion impact:", error);
      toast.error(`Error checking deletion impact: ${apiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeletion = async () => {
    if (accountId === 0) return;
    setLoading(true);
    try {
      await ChartofAccountsService.DeleteChartofAccount(accountId);
      toast.success("Chart of Account deleted successfully");
      setShowDeletionDialog(false);
      setDeletionImpact(null);
      onClose(true);
    } catch (error: any) {
      console.error("Error deleting chart of account:", error);
      toast.error(`Error deleting chart of account: ${apiError(error)}`);
      if (error?.response?.status === 409) {
        await refreshDeletionImpact();
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshDeletionImpact = async () => {
    if (accountId === 0) return;
    try {
      const response = await ChartofAccountsService.CheckChartofAccountDeletionImpact(accountId);
      const impact = response.result as DeletionImpactResult;
      setDeletionImpact(impact);
    } catch (error: any) {
      console.error("Error refreshing deletion impact:", error);
    }
  };

  const removeDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string): Promise<boolean> => {
    try {
      if (deleteEndpoint?.includes("/Accounting/DeleteJournalEntry")) {
        await AccountingService.DeleteJournalEntry(itemId);
      } else if (deleteEndpoint?.includes("/Accounting/DeleteTransaction")) {
        await AccountingService.DeleteTransaction(itemId);
      } else if (deleteEndpoint?.includes("/VendorInvoice/DeleteVendorInvoice")) {
        await VendorInvoiceService.DeleteVendorInvoice(itemId);
      } else {
        toast.info(`${dependencyType} cannot be removed from here. Resolve it in its own module first.`);
        return false;
      }
      toast.success(`${dependencyType} item deleted successfully`);
      return true;
    } catch (error: any) {
      console.error(`Error deleting ${dependencyType}:`, error);
      toast.error(`Failed to delete ${dependencyType}: ${apiError(error)}`);
      throw error;
    }
  };

  const handleDeleteDependency = async (dependencyType: string, itemId: number, deleteEndpoint: string) => {
    await removeDependency(dependencyType, itemId, deleteEndpoint);
  };

  const handleDeleteAll = async () => {
    if (!deletionImpact?.blockingDependencies || accountId === 0) return;
    setLoading(true);
    try {
      let impact: DeletionImpactResult = deletionImpact;
      // Deposits, withdrawals and transaction lines can point at the same transaction, and the impact
      // check lists at most 10 items per type, so delete each endpoint once and re-check until nothing new is left.
      const attempted = new Set<string>();
      for (;;) {
        const removable = (impact.blockingDependencies || [])
          .flatMap((dep) => dep.items.map((item) => ({ type: dep.entityType, ...item })))
          .filter((item) => !!item.deleteEndpoint && !attempted.has(item.deleteEndpoint));
        if (removable.length === 0) break;

        for (const item of removable) {
          if (attempted.has(item.deleteEndpoint)) continue;
          attempted.add(item.deleteEndpoint);
          try {
            await removeDependency(item.type, item.id, item.deleteEndpoint);
          } catch {
            toast.error(`Failed to delete ${item.name}. Stopping deletion process.`);
            await refreshDeletionImpact();
            return;
          }
        }

        const response = await ChartofAccountsService.CheckChartofAccountDeletionImpact(accountId);
        impact = response.result as DeletionImpactResult;
        setDeletionImpact(impact);
      }

      if (!impact.canDelete) {
        toast.error(
          `Account still cannot be deleted. Resolve these in their own modules first: ${(impact.blockingDependencies || []).map((d) => d.entityType).join(", ")}`
        );
        return;
      }

      await confirmDeletion();
    } catch (error: any) {
      console.error("Error in delete all:", error);
      toast.error(`Error deleting dependencies: ${apiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const renderGroupDropdown = (
    label: string,
    value: number | undefined,
    options: GroupOption[],
    onChange: (value: number | undefined) => void,
    showAddNew: boolean,
    onShowAddNew: () => void,
    onSaveNew: () => void,
    disabled?: boolean
  ) => {
    return (
      <div className="form-group">
        <label htmlFor={label}>{label}</label>
        {showAddNew ? (
          <div className="input-group" style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              className="form-input"
              placeholder={`Enter new ${label.toLowerCase()}`}
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSaveNew();
                }
              }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn-submit"
              onClick={onSaveNew}
              style={{ padding: "0.5rem 1rem" }}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-cancel"
              onClick={() => {
                onShowAddNew();
                setNewGroupName("");
              }}
              style={{ padding: "0.5rem 1rem" }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="input-group">
            <div className="input-group-prepend">
              <span className="input-group-icon">{Icons.Document}</span>
            </div>
            <select
              className="form-input"
              value={value || ""}
              onChange={(e) => {
                if (e.target.value === "__add_new__") {
                  onShowAddNew();
                } else {
                  const val = e.target.value ? parseInt(e.target.value) : undefined;
                  onChange(val);
                }
              }}
              disabled={disabled}
            >
              <option value="">Select {label.toLowerCase()}</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              <option value="__add_new__">+ Add New {label}</option>
            </select>
          </div>
        )}
      </div>
    );
  };

  if (loading && accountId > 0) {
    return (
      <div className="slideout-overlay" onClick={handleCancel}>
        <div className="form-card" onClick={(e) => e.stopPropagation()}>
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
          <h2>{accountId > 0 ? "Edit Chart of Account" : "Add New Chart of Account"}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="status-field-inline">
              <div
                className={`input-group ${
                  formData.Status === "Active" ? "status-active-group" : "status-inactive-group"
                }`}
                style={{ maxWidth: "150px" }}
              >
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
                  className={`form-input ${
                    formData.Status === "Active" ? "status-active" : "status-inactive"
                  }`}
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
            {/* Basic Information */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="AccountCode">
                  Account Code <span className="required">*</span>
                </label>
                <div className={`input-group ${errors.AccountCode ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="AccountCode"
                    name="AccountCode"
                    className={`form-input ${errors.AccountCode ? "error" : ""}`}
                    placeholder="Enter account code"
                    value={formData.AccountCode}
                    onChange={(e) => handleInputChange("AccountCode", e.target.value)}
                    required
                  />
                </div>
                {errors.AccountCode && (
                  <span className="error-message">{errors.AccountCode}</span>
                )}
              </div>
              <div className="form-group">
                <label htmlFor="AccountName">
                  Account Name <span className="required">*</span>
                </label>
                <div className={`input-group ${errors.AccountName ? "has-error" : ""}`}>
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <input
                    type="text"
                    id="AccountName"
                    name="AccountName"
                    className={`form-input ${errors.AccountName ? "error" : ""}`}
                    placeholder="Enter account name"
                    value={formData.AccountName}
                    onChange={(e) => handleInputChange("AccountName", e.target.value)}
                    required
                  />
                </div>
                {errors.AccountName && (
                  <span className="error-message">{errors.AccountName}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="AccountType">Account Type</label>
                <div className="input-group">
                  <div className="input-group-prepend">
                    <span className="input-group-icon">{Icons.Document}</span>
                  </div>
                  <select
                    id="AccountType"
                    name="AccountType"
                    className="form-input"
                    value={formData.AccountType}
                    onChange={(e) => handleInputChange("AccountType", e.target.value)}
                  >
                    <option value="">Select account type</option>
                    {accountTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Group Hierarchy */}
            <div style={{ marginTop: "1.5rem", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111827", marginBottom: "1rem" }}>
                Group Hierarchy
              </h3>
            </div>

            <div className="form-row">
              {renderGroupDropdown(
                "Main Group",
                formData.Groupid,
                mainGroups,
                (value) => handleGroupChange("Groupid", value),
                showAddMainGroup,
                () => {
                  setShowAddMainGroup(!showAddMainGroup);
                  if (!showAddMainGroup) setNewGroupName("");
                },
                handleSaveNewMainGroup
              )}
              {renderGroupDropdown(
                "Subgroup 1",
                formData.Subgroupid,
                subGroups,
                (value) => handleGroupChange("Subgroupid", value),
                showAddSubGroup,
                () => {
                  setShowAddSubGroup(!showAddSubGroup);
                  if (!showAddSubGroup) setNewGroupName("");
                },
                handleSaveNewSubGroup,
                !formData.Groupid
              )}
            </div>

            <div className="form-row">
              {renderGroupDropdown(
                "Subgroup 2",
                formData.Subgroupid2,
                subGroups2,
                (value) => handleGroupChange("Subgroupid2", value),
                showAddSubGroup2,
                () => {
                  setShowAddSubGroup2(!showAddSubGroup2);
                  if (!showAddSubGroup2) setNewGroupName("");
                },
                handleSaveNewSubGroup2,
                !formData.Subgroupid
              )}
              {renderGroupDropdown(
                "Subgroup 3",
                formData.Subgroupid3,
                subGroups3,
                (value) => handleGroupChange("Subgroupid3", value),
                showAddSubGroup3,
                () => {
                  setShowAddSubGroup3(!showAddSubGroup3);
                  if (!showAddSubGroup3) setNewGroupName("");
                },
                handleSaveNewSubGroup3,
                !formData.Subgroupid2
              )}
            </div>
          </div>

          <div className="form-actions">
            {accountId > 0 && (
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
              {loading ? "Saving..." : accountId > 0 ? "Update" : "Save"}
            </button>
          </div>
        </form>

        <DeletionImpactDialog
          isOpen={showDeletionDialog}
          entityName={`Chart of Account ${formData.AccountCode || formData.AccountName || `#${accountId}`}`}
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

export default ChartofAccountsMasterSlideout;
