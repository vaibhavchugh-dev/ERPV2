import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  EmployeeService,
  EmployeeImportRow,
  EmployeeImportResult,
  EMPLOYEE_IMPORT_HEADERS,
  Role,
} from "../../Common/Services/EmployeeService";
import {
  LocationService,
  LocationMaster,
} from "../../Common/Services/LocationService";
import {
  buildCsv,
  downloadCsv,
  mapCsvRows,
  parseCsv,
} from "../../Common/Utils/CsvImport";
import { EMPLOYEE_TEMPLATE_ROWS } from "./EmployeeMasterTemplateData";
import "./CustomerMasterSlideout.scss";

interface EmployeeMasterImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

type PreviewRow = EmployeeImportRow & { _errors: string[]; _warnings: string[] };

const HEADER_ALIASES: Record<string, string> = {
  empcode: "EmpCode",
  employeecode: "EmpCode",
  code: "EmpCode",
  firstname: "FirstName",
  first: "FirstName",
  lastname: "LastName",
  last: "LastName",
  email: "Email",
  username: "UserName",
  user: "UserName",
  status: "Status",
  rolename: "RoleName",
  role: "RoleName",
  employeetype: "EmployeeType",
  type: "EmployeeType",
  phone1: "Phone1",
  phone: "Phone1",
  phone2: "Phone2",
  dateofhire: "DateOfHire",
  hiredate: "DateOfHire",
  address: "Address",
  city: "City",
  state: "State",
  zip: "Zip",
  zipcode: "Zip",
  locationname: "LocationName",
  location: "LocationName",
  dob: "DOB",
  dateofbirth: "DOB",
  ssn: "SSN",
};

const EmployeeMasterImportModal: React.FC<EmployeeMasterImportModalProps> = ({
  onClose,
  onImported,
}) => {
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<LocationMaster[]>([]);
  const [lookupsLoaded, setLookupsLoaded] = useState(false);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        let tenantID = storage?.tenantID || 0;
        if (tenantID === 0 && process.env.NODE_ENV === "development") {
          tenantID = 1;
        }
        const [roleResult, locationResult] = await Promise.all([
          EmployeeService.GetAllRoles({ tenantid: tenantID }),
          LocationService.GetLocations({ tenantid: tenantID }),
        ]);
        if (roleResult && Array.isArray(roleResult)) {
          setRoles(roleResult);
        }
        if (locationResult && Array.isArray(locationResult)) {
          setLocations(locationResult);
        }
      } catch (error) {
        console.error("Error loading employee import lookups:", error);
      } finally {
        setLookupsLoaded(true);
      }
    };
    loadLookups();
  }, []);

  const rows = useMemo<PreviewRow[]>(
    () =>
      previewRows.map((row) => {
        const warnings: string[] = [];
        if (!lookupsLoaded) {
          return { ...row, _warnings: warnings };
        }

        const roleName = row.RoleName?.trim();
        if (
          roleName &&
          !roles.some((r) => r.roleName?.toLowerCase() === roleName.toLowerCase())
        ) {
          warnings.push(`Role "${roleName}" not found, will be left blank`);
        }

        const locationName = row.LocationName?.trim();
        if (
          locationName &&
          !locations.some(
            (l) =>
              l.name?.toLowerCase() === locationName.toLowerCase() ||
              l.code?.toLowerCase() === locationName.toLowerCase()
          )
        ) {
          warnings.push(`Location "${locationName}" not found, will be left blank`);
        }

        return { ...row, _warnings: warnings };
      }),
    [previewRows, roles, locations, lookupsLoaded]
  );

  const validCount = useMemo(
    () => rows.filter((r) => r._errors.length === 0).length,
    [rows]
  );
  const errorCount = useMemo(
    () => rows.filter((r) => r._errors.length > 0).length,
    [rows]
  );
  const warningCount = useMemo(
    () => rows.filter((r) => r._errors.length === 0 && r._warnings.length > 0).length,
    [rows]
  );

  const downloadTemplate = () => {
    const contents = buildCsv(
      EMPLOYEE_IMPORT_HEADERS,
      EMPLOYEE_TEMPLATE_ROWS.map((row) => [
        row.empCode,
        row.firstName,
        row.lastName,
        row.email,
        row.userName,
        "Active",
        row.roleName,
        row.employeeType,
        row.phone1,
        row.phone2,
        row.dateOfHire,
        row.address,
        row.city,
        row.state,
        row.zip,
        row.locationName,
        row.dob,
        row.ssn,
      ])
    );
    downloadCsv("employee-master-import-template.csv", contents);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = mapCsvRows(parseCsv(text), HEADER_ALIASES, "FirstName");

      if (parsed.length === 0) {
        toast.error("No data rows found in the CSV");
        setPreviewRows([]);
        return;
      }

      const seenCodes = new Set<string>();
      const seenUserNames = new Set<string>();
      const seenEmails = new Set<string>();
      const mapped: PreviewRow[] = parsed.map(({ rowNumber, values }) => {
        const errors: string[] = [];
        const firstName = (values.FirstName || "").trim();
        const lastName = (values.LastName || "").trim();
        const empCode = (values.EmpCode || "").trim();
        const userName = (values.UserName || "").trim();
        const email = (values.Email || "").trim();

        if (!firstName) errors.push("First Name is required");
        if (!lastName) errors.push("Last Name is required");

        if (empCode) {
          if (seenCodes.has(empCode.toLowerCase())) {
            errors.push("Duplicate emp code in this file");
          } else {
            seenCodes.add(empCode.toLowerCase());
          }
        }
        if (userName) {
          if (seenUserNames.has(userName.toLowerCase())) {
            errors.push("Duplicate user name in this file");
          } else {
            seenUserNames.add(userName.toLowerCase());
          }
        }
        if (email) {
          if (seenEmails.has(email.toLowerCase())) {
            errors.push("Duplicate email in this file");
          } else {
            seenEmails.add(email.toLowerCase());
          }
        }

        return {
          RowNumber: rowNumber,
          ...(values as EmployeeImportRow),
          _errors: errors,
          _warnings: [],
        };
      });

      setPreviewRows(mapped);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse CSV");
      setPreviewRows([]);
    }
  };

  const handleImport = async () => {
    const rowsToImport = rows.filter((r) => r._errors.length === 0);
    if (rowsToImport.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setImporting(true);
    try {
      const payload: EmployeeImportRow[] = rowsToImport.map(
        ({ _errors, _warnings, ...rest }) => rest
      );
      const importResult = await EmployeeService.ImportEmployees(payload, {
        updateExisting,
        stopOnError: false,
      });
      setResult(importResult);

      const summary = `Created ${importResult.created}, updated ${importResult.updated}, skipped ${importResult.skipped}, failed ${importResult.failed}`;
      if (importResult.failed > 0) {
        toast.warning(`Import completed with errors. ${summary}`);
      } else {
        toast.success(`Import successful. ${summary}`);
      }
      onImported();
    } catch (error: any) {
      const message =
        error?.response?.data?.error || error?.message || "Import failed";
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="slideout-overlay" onClick={onClose}>
      <div
        className="form-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "960px", width: "95vw" }}
      >
        <div className="form-header">
          <h2>Import Employees</h2>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tab-content" style={{ padding: "0 1.5rem 1rem" }}>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: 0 }}>
            Upload a CSV file to create or update employees. Matching uses Emp Code, then User
            Name, then Email. First Name and Last Name are required.
          </p>
          <p style={{ color: "#6b7280", fontSize: "0.8125rem", marginTop: "-0.5rem" }}>
            RoleName and LocationName are soft lookups — unmatched names import with a warning and
            leave those fields blank.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem" }}>
            <button type="button" className="btn-cancel" onClick={downloadTemplate}>
              Download Template
            </button>
            <label className="btn-submit">
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </label>
            {fileName && (
              <span style={{ alignSelf: "center", fontSize: "0.875rem", color: "#374151" }}>
                {fileName}
              </span>
            )}
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
            />
            Update existing employees when matched
          </label>

          {rows.length > 0 && (
            <>
              <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem", color: "#374151" }}>
                Preview: {rows.length} rows ({validCount} valid, {errorCount} with errors
                {warningCount > 0 ? `, ${warningCount} with warnings` : ""})
                {!lookupsLoaded && (
                  <span style={{ color: "#b45309", marginLeft: "0.5rem" }}>
                    checking role and location names...
                  </span>
                )}
              </div>
              <div
                style={{
                  maxHeight: "280px",
                  overflow: "auto",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                }}
              >
                <table className="customers-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>User Name</th>
                      <th>Role</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr
                        key={idx}
                        style={
                          row._errors.length
                            ? { background: "#fef2f2" }
                            : row._warnings.length
                            ? { background: "#fffbeb" }
                            : undefined
                        }
                      >
                        <td>{idx + 1}</td>
                        <td>{row.EmpCode || ""}</td>
                        <td>
                          {[row.FirstName, row.LastName].filter(Boolean).join(" ")}
                        </td>
                        <td>{row.UserName || ""}</td>
                        <td>{row.RoleName || ""}</td>
                        <td>{row.EmployeeType || ""}</td>
                        <td>{row.Status || "Active"}</td>
                        <td style={{ fontSize: "0.8125rem" }}>
                          {row._errors.length > 0 && (
                            <span style={{ color: "#dc2626" }}>{row._errors.join("; ")}</span>
                          )}
                          {row._errors.length === 0 && row._warnings.length > 0 && (
                            <span style={{ color: "#b45309" }}>{row._warnings.join("; ")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {result && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1rem",
                background: "#f9fafb",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              <strong>Import result:</strong> Created {result.created}, Updated {result.updated},
              Skipped {result.skipped}, Failed {result.failed}
              {result.rows?.some((r) => r.status === "Error") && (
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", color: "#dc2626" }}>
                  {result.rows
                    .filter((r) => r.status === "Error")
                    .slice(0, 10)
                    .map((r) => (
                      <li key={`error-${r.rowNumber}`}>
                        Row {r.rowNumber}: {r.message}
                      </li>
                    ))}
                </ul>
              )}
              {result.rows?.some((r) => r.warning) && (
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", color: "#b45309" }}>
                  {result.rows
                    .filter((r) => r.warning)
                    .slice(0, 10)
                    .map((r) => (
                      <li key={`warning-${r.rowNumber}`}>
                        Row {r.rowNumber}: {r.warning}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="form-actions" style={{ flexShrink: 0 }}>
          <button type="button" className="btn-cancel" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-submit"
            disabled={importing || validCount === 0 || !lookupsLoaded}
            onClick={handleImport}
          >
            {importing ? "Importing..." : `Import ${validCount || ""} Employees`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeMasterImportModal;
