import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faTimes, faSave } from "@fortawesome/free-solid-svg-icons";
import { isEmailNotificationsEnabled } from "../Utils/settingsRuntime";
import {
  ReportScheduleDto,
  ReportScheduleService,
  timeInputToMinutes,
  minutesToTimeInput,
} from "../Services/ReportScheduleService";

export interface ScheduleReportDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** When set, dialog updates this schedule instead of creating a new one. */
  editSchedule?: ReportScheduleDto | null;
  /** Required for create; ignored when editSchedule is set (taken from the schedule). */
  reportCategory?: "operational" | "financial";
  reportType?: string;
  reportName?: string;
  dateRange?: string;
  customStartDate?: string;
  customEndDate?: string;
  locationId?: number | null;
  parameters?: Record<string, unknown>;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "#374151",
  marginBottom: "0.35rem",
};

const ScheduleReportDialog: React.FC<ScheduleReportDialogProps> = ({
  open,
  onClose,
  onSaved,
  editSchedule,
  reportCategory = "operational",
  reportType = "",
  reportName = "",
  dateRange: initialDateRange = "This Month",
  customStartDate: initialCustomStart,
  customEndDate: initialCustomEnd,
  locationId,
  parameters,
}) => {
  const isEdit = !!editSchedule?.id;

  const [toEmails, setToEmails] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [subject, setSubject] = useState("");
  const [format, setFormat] = useState<"pdf" | "csv">("pdf");
  const [frequency, setFrequency] = useState<"Daily" | "Weekly" | "Monthly">("Daily");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [timeValue, setTimeValue] = useState("08:00");
  const [dateRange, setDateRange] = useState("This Month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [saving, setSaving] = useState(false);

  const displayName = isEdit
    ? editSchedule!.reportName
    : reportName || reportType;
  const displayCategory = isEdit
    ? editSchedule!.reportCategory
    : reportCategory;
  const displayType = isEdit ? editSchedule!.reportType : reportType;

  useEffect(() => {
    if (!open) return;

    if (editSchedule?.id) {
      setToEmails(editSchedule.toEmails || "");
      setCcEmails(editSchedule.ccEmails || "");
      setSubject(editSchedule.subject || `Scheduled report: ${editSchedule.reportName}`);
      setFormat(
        (editSchedule.format || "pdf").toLowerCase() === "csv" ? "csv" : "pdf"
      );
      const freq = (editSchedule.frequency || "Daily") as
        | "Daily"
        | "Weekly"
        | "Monthly";
      setFrequency(
        freq === "Weekly" || freq === "Monthly" ? freq : "Daily"
      );
      setDayOfWeek(editSchedule.dayOfWeek ?? 1);
      setDayOfMonth(editSchedule.dayOfMonth ?? 1);
      setTimeValue(minutesToTimeInput(editSchedule.timeOfDayMinutes ?? 480));
      setDateRange(editSchedule.dateRange || "This Month");
      setCustomStartDate(editSchedule.customStartDate || "");
      setCustomEndDate(editSchedule.customEndDate || "");
      return;
    }

    setToEmails("");
    setCcEmails("");
    setSubject(`Scheduled report: ${reportName}`);
    setFormat("pdf");
    setFrequency("Daily");
    setDayOfWeek(1);
    setDayOfMonth(1);
    setTimeValue("08:00");
    setDateRange(initialDateRange || "This Month");
    setCustomStartDate(initialCustomStart || "");
    setCustomEndDate(initialCustomEnd || "");
  }, [open, editSchedule, reportName, initialDateRange, initialCustomStart, initialCustomEnd]);

  if (!open) return null;

  const handleSave = async () => {
    if (!isEmailNotificationsEnabled()) {
      toast.error("Email notifications are disabled in System Settings (General).");
      return;
    }
    if (!toEmails.trim()) {
      toast.error("Enter at least one recipient email.");
      return;
    }
    if (dateRange === "Custom" && (!customStartDate || !customEndDate)) {
      toast.error("Custom period requires start and end dates.");
      return;
    }

    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const timeZoneId =
      (isEdit ? editSchedule?.timeZoneId : null) ||
      storage?.timezone ||
      "America/New_York";

    let parsedParameters = parameters;
    if (isEdit && editSchedule?.parametersJson && !parameters) {
      try {
        parsedParameters = JSON.parse(editSchedule.parametersJson);
      } catch {
        parsedParameters = undefined;
      }
    }

    const payload = {
      reportCategory: displayCategory,
      reportType: displayType,
      reportName: displayName,
      dateRange,
      customStartDate: dateRange === "Custom" ? customStartDate : undefined,
      customEndDate: dateRange === "Custom" ? customEndDate : undefined,
      locationId: isEdit
        ? editSchedule!.locationId && editSchedule!.locationId > 0
          ? editSchedule!.locationId
          : null
        : locationId && locationId > 0
          ? locationId
          : null,
      parameters: parsedParameters,
      format,
      frequency,
      dayOfWeek: frequency === "Weekly" ? dayOfWeek : null,
      dayOfMonth: frequency === "Monthly" ? dayOfMonth : null,
      timeOfDayMinutes: timeInputToMinutes(timeValue),
      timeZoneId,
      toEmails: toEmails.trim(),
      ccEmails: ccEmails.trim() || undefined,
      subject: subject.trim() || undefined,
      isEnabled: isEdit ? editSchedule!.isEnabled : true,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await ReportScheduleService.Update(editSchedule!.id, payload);
        toast.success("Schedule updated.");
      } else {
        await ReportScheduleService.Create(payload);
        toast.success(
          "Report schedule saved. It will email automatically on the set frequency."
        );
      }
      onSaved?.();
      onClose();
    } catch (error: any) {
      const data = error?.response?.data;
      toast.error(
        data?.message || data?.error || error?.message || "Failed to save schedule"
      );
    } finally {
      setSaving(false);
    }
  };

  let tenantTzLabel = "America/New_York";
  try {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    tenantTzLabel =
      (isEdit ? editSchedule?.timeZoneId : null) ||
      storage?.timezone ||
      "America/New_York";
  } catch {
    /* keep default */
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "0.75rem",
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FontAwesomeIcon icon={faClock} style={{ color: "#2563eb" }} />
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>
              {isEdit ? "Edit schedule" : "Schedule report email"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "1.1rem",
              color: "#6b7280",
            }}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <div style={{ padding: "1.25rem", display: "grid", gap: "0.9rem" }}>
          <div>
            <div style={{ fontSize: "0.8rem", color: "#6b7280", marginBottom: 4 }}>
              Report
            </div>
            <div style={{ fontWeight: 600 }}>{displayName}</div>
            <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
              {displayCategory} · {displayType}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Period</label>
            <select
              style={fieldStyle}
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
            >
              <option value="This Month">This Month</option>
              <option value="Last Month">Last Month</option>
              <option value="This Quarter">This Quarter</option>
              <option value="Last Quarter">Last Quarter</option>
              <option value="This Year">This Year</option>
              <option value="Last Year">Last Year</option>
              <option value="Custom">Custom Range</option>
            </select>
          </div>

          {dateRange === "Custom" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div>
                <label style={labelStyle}>Start</label>
                <input
                  style={fieldStyle}
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>End</label>
                <input
                  style={fieldStyle}
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>To emails *</label>
            <input
              style={fieldStyle}
              value={toEmails}
              onChange={(e) => setToEmails(e.target.value)}
              placeholder="user@company.com, other@company.com"
            />
          </div>

          <div>
            <label style={labelStyle}>CC (optional)</label>
            <input
              style={fieldStyle}
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="optional@company.com"
            />
          </div>

          <div>
            <label style={labelStyle}>Subject</label>
            <input
              style={fieldStyle}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Attachment</label>
              <select
                style={fieldStyle}
                value={format}
                onChange={(e) => setFormat(e.target.value as "pdf" | "csv")}
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Frequency</label>
              <select
                style={fieldStyle}
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as "Daily" | "Weekly" | "Monthly")
                }
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
          </div>

          {frequency === "Weekly" && (
            <div>
              <label style={labelStyle}>Day of week</label>
              <select
                style={fieldStyle}
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
          )}

          {frequency === "Monthly" && (
            <div>
              <label style={labelStyle}>Day of month (1–28)</label>
              <input
                style={fieldStyle}
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
              />
            </div>
          )}

          <div>
            <label style={labelStyle}>
              Send time (24-hour, tenant timezone: {tenantTzLabel})
            </label>
            <input
              style={fieldStyle}
              type="time"
              step={60}
              value={timeValue || minutesToTimeInput(480)}
              onChange={(e) => setTimeValue(e.target.value)}
            />
            <p
              style={{
                margin: "0.35rem 0 0",
                fontSize: "0.75rem",
                color: "#6b7280",
                lineHeight: 1.35,
              }}
            >
              Stored as 24-hour HH:mm. Schedule / Next / Last run columns use the
              same 24-hour format in this timezone.
            </p>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            padding: "1rem 1.25rem",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: "0.375rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "0.5rem 0.9rem",
              borderRadius: "0.375rem",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <FontAwesomeIcon icon={faSave} />
            {saving ? "Saving…" : isEdit ? "Update schedule" : "Save schedule"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleReportDialog;
