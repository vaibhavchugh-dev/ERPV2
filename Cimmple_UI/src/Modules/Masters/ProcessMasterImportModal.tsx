import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  ProcessService,
  ProcessImportRow,
  ProcessImportResult,
  PROCESS_IMPORT_HEADERS,
} from "../../Common/Services/ProcessService";
import {
  WorkstationService,
  WorkstationMaster,
} from "../../Common/Services/WorkstationService";
import {
  buildCsv,
  downloadCsv,
  mapCsvRows,
  parseCsv,
} from "../../Common/Utils/CsvImport";
import { PROCESS_TEMPLATE_ROWS } from "./ProcessMasterTemplateData";
import "./CustomerMasterSlideout.scss";

interface ProcessMasterImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

type PreviewRow = ProcessImportRow & { _errors: string[]; _warnings: string[] };

const HEADER_ALIASES: Record<string, string> = {
  processcode: "ProcessCode",
  code: "ProcessCode",
  processname: "ProcessName",
  name: "ProcessName",
  description: "Description",
  pdescription: "Description",
  ledgercode: "LedgerCode",
  processcategory: "ProcessCategory",
  category: "ProcessCategory",
  outsideservices: "OutsideServices",
  outside: "OutsideServices",
  isfixed: "OutsideServices",
  status: "Status",
  defaultestimatedtimeminutes: "DefaultEstimatedTimeMinutes",
  estimatedtime: "DefaultEstimatedTimeMinutes",
  defaulttime: "DefaultEstimatedTimeMinutes",
  defaultworkstationname: "DefaultWorkstationName",
  workstation: "DefaultWorkstationName",
  defaultworkstation: "DefaultWorkstationName",
  standardcostperhour: "StandardCostPerHour",
  costperhour: "StandardCostPerHour",
};

function mapRows(csvRows: string[][]): PreviewRow[] {
  return mapCsvRows(csvRows, HEADER_ALIASES, "ProcessName").map(
    ({ rowNumber, values }) => {
      const row: PreviewRow = {
        ...(values as ProcessImportRow),
        RowNumber: rowNumber,
        _errors: [],
        _warnings: [],
      };

      if (!row.ProcessName?.trim()) {
        row._errors.push("Process Name is required");
      }
      return row;
    }
  );
}

const ProcessMasterImportModal: React.FC<ProcessMasterImportModalProps> = ({
  onClose,
  onImported,
}) => {
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ProcessImportResult | null>(null);
  const [workstations, setWorkstations] = useState<WorkstationMaster[]>([]);
  const [workstationsLoaded, setWorkstationsLoaded] = useState(false);

  useEffect(() => {
    const loadWorkstations = async () => {
      try {
        const storage = JSON.parse(localStorage.getItem("storage") || "{}");
        let tenantID = storage?.tenantID || 0;
        if (tenantID === 0 && process.env.NODE_ENV === "development") {
          tenantID = 1;
        }
        const result = await WorkstationService.GetWorkstations({ tenantid: tenantID });
        if (result && Array.isArray(result)) {
          setWorkstations(result.filter((w) => w.isActive !== false));
        }
        setWorkstationsLoaded(true);
      } catch (error) {
        console.error("Error loading workstations:", error);
        setWorkstationsLoaded(true);
      }
    };
    loadWorkstations();
  }, []);

  // Warnings are derived so they settle once the workstation list arrives. Checking before
  // then would flag every row as missing.
  const rows = useMemo<PreviewRow[]>(
    () =>
      previewRows.map((row) => {
        const warnings: string[] = [];
        const workstationName = row.DefaultWorkstationName?.trim();
        if (
          workstationsLoaded &&
          workstationName &&
          !workstations.some(
            (w) => w.workstationName?.toLowerCase() === workstationName.toLowerCase()
          )
        ) {
          warnings.push(`Workstation "${workstationName}" not found, will be left blank`);
        }
        return { ...row, _warnings: warnings };
      }),
    [previewRows, workstations, workstationsLoaded]
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
      PROCESS_IMPORT_HEADERS,
      PROCESS_TEMPLATE_ROWS.map((row) => [
        row.code,
        row.name,
        row.description,
        "", // LedgerCode depends on the tenant chart of accounts
        row.category,
        row.outsideServices,
        "Active",
        row.estimatedMinutes != null ? String(row.estimatedMinutes) : "",
        row.defaultWorkstation,
        "", // StandardCostPerHour depends on the shop's rates
      ])
    );
    downloadCsv("process-master-import-template.csv", contents);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const csvRows = parseCsv(text);
      const mapped = mapRows(csvRows);
      if (mapped.length === 0) {
        toast.error("No data rows found in the CSV");
        setPreviewRows([]);
        return;
      }
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
      const payload: ProcessImportRow[] = rowsToImport.map(
        ({ _errors, _warnings, ...rest }) => rest
      );
      const importResult = await ProcessService.ImportProcesses(payload, {
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
        error?.response?.data?.error ||
        error?.message ||
        "Import failed";
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
        style={{ maxWidth: "920px", width: "95vw" }}
      >
        <div className="form-header">
          <h2>Import Processes</h2>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tab-content" style={{ padding: "0 1.5rem 1rem" }}>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: 0 }}>
            Upload a CSV file to create or update processes. Matching uses Process Code when present, otherwise Process Name.
          </p>
          <p style={{ color: "#6b7280", fontSize: "0.8125rem", marginTop: "-0.5rem" }}>
            The template contains {PROCESS_TEMPLATE_ROWS.length} standard machine shop processes. Import the
            Workstation Master template first so the default workstations resolve; unmatched names are
            imported as a warning with the workstation left blank. Ledger Code and Standard Cost / Hour are
            left blank because they depend on your accounts and rates.
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

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
            />
            Update existing processes when matched
          </label>

          {rows.length > 0 && (
            <>
              <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem", color: "#374151" }}>
                Preview: {rows.length} rows ({validCount} valid, {errorCount} with errors
                {warningCount > 0 ? `, ${warningCount} with warnings` : ""})
                {!workstationsLoaded && (
                  <span style={{ color: "#b45309", marginLeft: "0.5rem" }}>
                    checking workstation names...
                  </span>
                )}
              </div>
              <div style={{ maxHeight: "280px", overflow: "auto", border: "1px solid #e5e7eb", borderRadius: "0.5rem" }}>
                <table className="customers-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Est. Time</th>
                      <th>Workstation</th>
                      <th>Outside</th>
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
                        <td>{row.ProcessCode || ""}</td>
                        <td>{row.ProcessName || ""}</td>
                        <td>{row.ProcessCategory || ""}</td>
                        <td>{row.DefaultEstimatedTimeMinutes || ""}</td>
                        <td>{row.DefaultWorkstationName || ""}</td>
                        <td>{row.OutsideServices || ""}</td>
                        <td>{row.Status || ""}</td>
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
              <strong>Import result:</strong> Created {result.created}, Updated {result.updated}, Skipped {result.skipped}, Failed {result.failed}
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
            disabled={importing || validCount === 0}
            onClick={handleImport}
          >
            {importing ? "Importing..." : `Import ${validCount || ""} Processes`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProcessMasterImportModal;
