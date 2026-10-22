import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClock,
  faPlay,
  faTrash,
  faToggleOn,
  faToggleOff,
  faSync,
  faEdit,
} from "@fortawesome/free-solid-svg-icons";
import {
  ReportScheduleDto,
  ReportScheduleService,
  minutesToTimeInput,
  formatScheduleInstant,
} from "../../Common/Services/ReportScheduleService";
import ScheduleReportDialog from "../../Common/Components/ScheduleReportDialog";
import { useSiteListFilter } from "../../Common/Hooks/useSiteListFilter";
import { usePagePermissions } from "../../Common/Hooks/usePagePermissions";
import { useTableSort } from "../../Common/Hooks/useTableSort";
import SortableTh from "../../Common/Components/SortableTh";
import { rowClickHandler } from "../../Common/Utils/rowClick";
import "./ScheduledReports.scss";

const freqLabel = (s: ReportScheduleDto) => {
  const time = minutesToTimeInput(s.timeOfDayMinutes);
  if (s.frequency === "Weekly") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Weekly (${days[s.dayOfWeek ?? 1]} ${time})`;
  }
  if (s.frequency === "Monthly") {
    return `Monthly (day ${s.dayOfMonth ?? 1} @ ${time})`;
  }
  return `Daily @ ${time}`;
};

const getScheduleSortValue = (s: ReportScheduleDto, key: string): unknown => {
  switch (key) {
    case "schedule":
      return freqLabel(s);
    case "nextRunUtc":
      return s.isEnabled ? s.nextRunUtc : null;
    case "status":
      return s.isEnabled ? "Enabled" : "Paused";
    default:
      return s[key as keyof ReportScheduleDto];
  }
};

const ScheduledReports: React.FC = () => {
  const { canEdit, canDelete, canSend, can } = usePagePermissions("/reports/schedules");
  const canManage = can("Manage");
  const { locationIdParam, masterListFilter } = useSiteListFilter();
  const [items, setItems] = useState<ReportScheduleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ReportScheduleDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ReportScheduleService.List({
        locationId: locationIdParam,
      });
      setItems(list);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || error?.message || "Failed to load schedules"
      );
    } finally {
      setLoading(false);
    }
  }, [locationIdParam]);

  useEffect(() => {
    load();
  }, [load]);

  const { sortedRows: sortedItems, sortKey, sortDirection, toggleSort, tableRef } = useTableSort(
    items,
    getScheduleSortValue
  );
  const sortProps = { activeKey: sortKey, direction: sortDirection, onSort: toggleSort };

  const toggleEnabled = async (item: ReportScheduleDto) => {
    setBusyId(item.id);
    try {
      await ReportScheduleService.SetEnabled(item.id, !item.isEnabled);
      toast.success(item.isEnabled ? "Schedule paused" : "Schedule enabled");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to update schedule");
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (item: ReportScheduleDto) => {
    setBusyId(item.id);
    try {
      await ReportScheduleService.RunNow(item.id);
      toast.success("Report generated and queued for email delivery");
      await load();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || error?.message || "Failed to run schedule"
      );
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: ReportScheduleDto) => {
    if (!window.confirm(`Delete schedule for “${item.reportName}”?`)) return;
    setBusyId(item.id);
    try {
      await ReportScheduleService.Delete(item.id);
      toast.success("Schedule deleted");
      await load();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete schedule");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="scheduled-reports-page">
      <header className="sr-header">
        <div>
          <h1>
            <FontAwesomeIcon icon={faClock} /> Scheduled report emails
          </h1>
          <p>
            Reports run automatically with their saved filters and are emailed as PDF or CSV.
            Create schedules from the Reports or Financial Reports pages. Use Edit to change
            recipients, frequency, or period.
          </p>
        </div>
        <button type="button" className="sr-btn" onClick={load} disabled={loading}>
          <FontAwesomeIcon icon={faSync} spin={loading} /> Refresh
        </button>
      </header>

      <div className="sr-filters" style={{ marginBottom: "1rem" }}>
        <select
          className="filter-select"
          value={masterListFilter.value}
          onChange={(e) => masterListFilter.onChange(e.target.value)}
        >
          {masterListFilter.options.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading && items.length === 0 ? (
        <div className="sr-empty">Loading schedules…</div>
      ) : items.length === 0 ? (
        <div className="sr-empty">
          No scheduled reports yet. Open a report, set filters, then click{" "}
          <strong>Schedule</strong>.
        </div>
      ) : (
        <div className="sr-table-wrap">
          <table className="sr-table" ref={tableRef}>
            <thead>
              <tr>
                <SortableTh sortKey="reportName" {...sortProps}>Report</SortableTh>
                <th>Filters</th>
                <SortableTh sortKey="schedule" {...sortProps}>Schedule</SortableTh>
                <th>Recipients</th>
                <SortableTh
                  sortKey="lastRunUtc"
                  {...sortProps}
                  title="Time the report was generated and email was queued (not inbox delivery)"
                >
                  Last queued
                </SortableTh>
                <SortableTh sortKey="nextRunUtc" {...sortProps}>Next run</SortableTh>
                <SortableTh sortKey="status" {...sortProps}>Status</SortableTh>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item) => {
                const busy = busyId === item.id;
                return (
                  <tr
                    key={item.id}
                    className={`clickable${!item.isEnabled ? " is-disabled" : ""}`}
                    onClick={canEdit ? rowClickHandler(() => setEditing(item)) : undefined}
                  >
                    <td>
                      <div className="sr-name">{item.reportName}</div>
                      <div className="sr-meta">
                        {item.reportCategory} · {item.format.toUpperCase()}
                      </div>
                    </td>
                    <td>
                      <div>{item.dateRange}</div>
                      {item.dateRange === "Custom" && (
                        <div className="sr-meta">
                          {item.customStartDate} → {item.customEndDate}
                        </div>
                      )}
                    </td>
                    <td>{freqLabel(item)}</td>
                    <td>
                      <div className="sr-emails">{item.toEmails}</div>
                      {item.ccEmails && (
                        <div className="sr-meta">CC: {item.ccEmails}</div>
                      )}
                    </td>
                    <td>
                      <div>{formatScheduleInstant(item.lastRunUtc, item.timeZoneId)}</div>
                      {item.lastRunStatus && (
                        <div
                          className={`sr-status ${
                            item.lastRunStatus === "Failed" ? "err" : "ok"
                          }`}
                          title={
                            item.lastRunStatus === "Queued"
                              ? "Report generated and email queued; delivery may take a short time via SMTP"
                              : undefined
                          }
                        >
                          {item.lastRunStatus === "Queued"
                            ? "Queued (sending)"
                            : item.lastRunStatus === "Sent"
                              ? "Delivered"
                              : item.lastRunStatus}
                          {item.lastRunError ? `: ${item.lastRunError}` : ""}
                        </div>
                      )}
                    </td>
                    <td>
                      {item.isEnabled
                        ? formatScheduleInstant(item.nextRunUtc, item.timeZoneId)
                        : "Paused"}
                    </td>
                    <td>{item.isEnabled ? "Enabled" : "Paused"}</td>
                    <td className="sr-actions">
                      {canEdit && (
                      <button
                        type="button"
                        title="Edit"
                        disabled={busy}
                        onClick={() => setEditing(item)}
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      )}
                      {canManage && (
                      <button
                        type="button"
                        title={item.isEnabled ? "Pause" : "Enable"}
                        disabled={busy}
                        onClick={() => toggleEnabled(item)}
                      >
                        <FontAwesomeIcon
                          icon={item.isEnabled ? faToggleOn : faToggleOff}
                        />
                      </button>
                      )}
                      {canSend && (
                      <button
                        type="button"
                        title="Run now"
                        disabled={busy}
                        onClick={() => runNow(item)}
                      >
                        <FontAwesomeIcon icon={faPlay} />
                      </button>
                      )}
                      {canDelete && (
                      <button
                        type="button"
                        title="Delete"
                        disabled={busy}
                        onClick={() => remove(item)}
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ScheduleReportDialog
        open={!!editing}
        editSchedule={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </div>
  );
};

export default ScheduledReports;
