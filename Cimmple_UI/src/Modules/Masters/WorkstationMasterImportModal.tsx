import React, { useMemo, useState } from "react";
import { toast } from "react-toastify";
import {
  WorkstationService,
  WorkstationImportRow,
  WorkstationImportResult,
  WORKSTATION_IMPORT_HEADERS,
} from "../../Common/Services/WorkstationService";
import {
  buildCsv,
  downloadCsv,
  mapCsvRows,
  parseCsv,
} from "../../Common/Utils/CsvImport";
import { WORKSTATION_TEMPLATE_ROWS } from "./WorkstationMasterTemplateData";
import "./CustomerMasterSlideout.scss";

interface WorkstationMasterImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

interface PreviewRow extends WorkstationImportRow {
  _errors: string[];
}

const HEADER_ALIASES: Record<string, string> = {
  workstationname: "WorkstationName",
  workstation: "WorkstationName",
  name: "WorkstationName",
  status: "Status",
  isactive: "Status",
  active: "Status",
};

const WorkstationMasterImportModal: React.FC<WorkstationMasterImportModalProps> = ({
  onClose,
  onImported,
}) => {
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [updateExisting, setUpdateExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<WorkstationImportResult | null>(null);

  const validCount = useMemo(
    () => previewRows.filter((r) => r._errors.length === 0).length,
    [previewRows]
  );
  const errorCount = useMemo(
    () => previewRows.filter((r) => r._errors.length > 0).length,
    [previewRows]
  );

  const downloadTemplate = () => {
    const contents = buildCsv(
      WORKSTATION_IMPORT_HEADERS,
      WORKSTATION_TEMPLATE_ROWS.map((row) => [row.name, "Active"])
    );
    downloadCsv("workstation-master-import-template.csv", contents);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResult(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const parsed = mapCsvRows(parseCsv(text), HEADER_ALIASES, "WorkstationName");

      if (parsed.length === 0) {
        toast.error("No data rows found in the CSV");
        setPreviewRows([]);
        return;
      }

      const seen = new Set<string>();
      const mapped: PreviewRow[] = parsed.map(({ rowNumber, values }) => {
        const errors: string[] = [];
        const name = (values.WorkstationName || "").trim();

        if (!name) {
          errors.push("Workstation Name is required");
        } else if (seen.has(name.toLowerCase())) {
          errors.push("Duplicate workstation name in this file");
        } else {
          seen.add(name.toLowerCase());
        }

        return {
          RowNumber: rowNumber,
          WorkstationName: values.WorkstationName,
          Status: values.Status,
          _errors: errors,
        };
      });

      setPreviewRows(mapped);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse CSV");
      setPreviewRows([]);
    }
  };

  const handleImport = async () => {
    const rowsToImport = previewRows.filter((r) => r._errors.length === 0);
    if (rowsToImport.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    setImporting(true);
    try {
      const payload: WorkstationImportRow[] = rowsToImport.map(
        ({ _errors, ...rest }) => rest
      );
      const importResult = await WorkstationService.ImportWorkstations(payload, {
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
        style={{ maxWidth: "760px", width: "95vw" }}
      >
        <div className="form-header">
          <h2>Import Workstations</h2>
          <button type="button" className="btn-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tab-content" style={{ padding: "0 1.5rem 1rem" }}>
          <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: 0 }}>
            Upload a CSV file to create or update workstations. Rows are matched on
            Workstation Name.
          </p>
          <p style={{ color: "#6b7280", fontSize: "0.8125rem", marginTop: "-0.5rem" }}>
            The template contains {WORKSTATION_TEMPLATE_ROWS.length} workstations covering the
            standard process catalog. Import these before importing Process Master so each
            process picks up its default workstation.
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
            Update existing workstations when matched
          </label>

          {previewRows.length > 0 && (
            <>
              <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem", color: "#374151" }}>
                Preview: {previewRows.length} rows ({validCount} valid, {errorCount} with errors)
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
                      <th>Workstation Name</th>
                      <th>Status</th>
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, idx) => (
                      <tr key={idx} style={row._errors.length ? { background: "#fef2f2" } : undefined}>
                        <td>{idx + 1}</td>
                        <td>{row.WorkstationName || ""}</td>
                        <td>{row.Status || "Active"}</td>
                        <td style={{ color: "#dc2626", fontSize: "0.8125rem" }}>
                          {row._errors.join("; ")}
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
            {importing ? "Importing..." : `Import ${validCount || ""} Workstations`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkstationMasterImportModal;
