import Instense from "./Axios-config";

export class ReportsService {
  public static GenerateReport = async (
    reportType: string,
    parameters: any
  ): Promise<any> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;

    const dr = parameters.dateRange || parameters.DateRange || "This Month";
    const payload: Record<string, unknown> = {
      tenantId: tenantID,
      ReportType: reportType,
      DateRange: dr,
      Format: "json",
      LocationId: parameters.locationId ?? parameters.LocationId,
      Parameters: parameters,
    };
    if (
      String(dr).toLowerCase() === "custom" &&
      parameters.customStartDate &&
      parameters.customEndDate
    ) {
      payload.CustomStartDate = parameters.customStartDate;
      payload.CustomEndDate = parameters.customEndDate;
    }

    return Instense.post(`/Reports/GenerateReport`, payload).then((response) => {
      return response.data.result;
    });
  };

  public static DownloadReport = async (
    reportType: string,
    parameters: any
  ): Promise<{ blob: Blob; fileName: string; mimeType: string }> => {
    const storage = JSON.parse(localStorage.getItem("storage") || "{}");
    const tenantID = storage?.tenantID || 0;
    const dr = parameters.dateRange || parameters.DateRange || "This Month";
    const format = String(parameters.format || parameters.Format || "csv").toLowerCase();

    const payload: Record<string, unknown> = {
      tenantId: tenantID,
      ReportType: reportType,
      DateRange: dr,
      Format: format === "excel" ? "excel" : format,
      LocationId: parameters.locationId ?? parameters.LocationId,
      Parameters: parameters,
    };
    if (
      String(dr).toLowerCase() === "custom" &&
      parameters.customStartDate &&
      parameters.customEndDate
    ) {
      payload.CustomStartDate = parameters.customStartDate;
      payload.CustomEndDate = parameters.customEndDate;
    }

    const response = await Instense.post(`/Reports/GenerateReport`, payload, {
      responseType: "blob",
    });

    const disposition = response.headers?.["content-disposition"] as string | undefined;
    let fileName = `${reportType}.${format === "pdf" ? "pdf" : "csv"}`;
    if (disposition) {
      const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
      if (match?.[1]) fileName = match[1].replace(/['"]/g, "");
    }
    const mimeType =
      format === "pdf" ? "application/pdf" : "text/csv;charset=utf-8";
    return { blob: response.data as Blob, fileName, mimeType };
  };
}
