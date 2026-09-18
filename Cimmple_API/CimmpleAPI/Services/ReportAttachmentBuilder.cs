using System.Text;
using System.Text.Json;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    public sealed class ReportAttachmentResult
    {
        public byte[] Content { get; init; } = Array.Empty<byte>();
        public string FileName { get; init; } = "report.bin";
        public string ContentType { get; init; } = "application/octet-stream";
        public string? Error { get; init; }
        public bool Ok => string.IsNullOrEmpty(Error) && Content.Length > 0;
    }

    /// <summary>Builds PDF/CSV attachments for operational and financial reports (no HTTP context).</summary>
    public static class ReportAttachmentBuilder
    {
        private static readonly HashSet<string> FinancialTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            "balance-sheet", "profit-loss", "income-statement", "cash-flow",
            "ar-aging", "ap-aging", "trial-balance", "customer-statements", "vendor-analysis"
        };

        public static bool IsFinancial(string? reportType) =>
            !string.IsNullOrWhiteSpace(reportType) && FinancialTypes.Contains(reportType.Trim());

        public static ReportAttachmentResult Build(CimmpleDbContext context, ReportSchedule schedule)
        {
            if (schedule == null)
                return Fail("Schedule is missing.");

            var reportType = (schedule.ReportType ?? "").Trim();
            if (string.IsNullOrWhiteSpace(reportType))
                return Fail("Report type is required.");

            var category = (schedule.ReportCategory ?? "").Trim().ToLowerInvariant();
            if (string.IsNullOrEmpty(category))
                category = IsFinancial(reportType) ? "financial" : "operational";

            var dateFilter = ReportDateRangeHelper.Resolve(
                schedule.DateRange,
                schedule.CustomStartDate,
                schedule.CustomEndDate);

            int? locationId = schedule.LocationId.HasValue && schedule.LocationId.Value > 0
                ? schedule.LocationId
                : null;

            object? parameters = null;
            if (!string.IsNullOrWhiteSpace(schedule.ParametersJson))
            {
                try
                {
                    parameters = JsonSerializer.Deserialize<JsonElement>(schedule.ParametersJson);
                }
                catch
                {
                    parameters = null;
                }
            }

            var format = (schedule.Format ?? "pdf").Trim().ToLowerInvariant();
            if (format is not ("pdf" or "csv" or "excel"))
                format = "pdf";

            try
            {
                if (category == "financial" || IsFinancial(reportType))
                    return BuildFinancial(context, schedule.TenantId, reportType, dateFilter, locationId, parameters, format);

                return BuildOperational(context, schedule.TenantId, reportType, dateFilter, locationId, format);
            }
            catch (Exception ex)
            {
                return Fail(ex.Message);
            }
        }

        private static ReportAttachmentResult BuildOperational(
            CimmpleDbContext context,
            int tenantId,
            string reportType,
            (DateTime startDate, DateTime endDate) dateFilter,
            int? locationId,
            string format)
        {
            var key = reportType.Trim().ToLowerInvariant();
            ReportResultDto reportData = key switch
            {
                "sales-performance" => SalesReportsService.BuildSalesPerformance(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "sales-trends" => SalesReportsService.BuildSalesTrends(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "product-revenue" => SalesReportsService.BuildProductRevenue(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "quotation-conversion" => SalesReportsService.BuildQuotationConversion(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "revenue-by-location" => SalesReportsService.BuildRevenueByLocation(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "job-status-dashboard" => JobOrderStatusReportService.Build(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "job-completion-time" => OperationsReportsService.BuildJobCompletionTime(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "on-time-delivery" => OperationsReportsService.BuildOnTimeDelivery(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "production-efficiency" => OperationsReportsService.BuildProductionEfficiency(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "workstation-utilization" => OperationsReportsService.BuildWorkstationUtilization(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "process-performance" => OperationsReportsService.BuildProcessPerformance(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "vendor-performance" => PurchasingReportsService.BuildVendorPerformance(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "purchase-trends" => PurchasingReportsService.BuildPurchaseTrends(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "vendor-cost-analysis" => PurchasingReportsService.BuildVendorCostAnalysis(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "material-cost-trends" => PurchasingReportsService.BuildMaterialCostTrends(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "vendor-delivery" => PurchasingReportsService.BuildVendorDelivery(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "inventory-valuation" => InventoryReportsService.BuildInventoryValuation(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "stock-movement" => InventoryReportsService.BuildStockMovement(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "material-usage" => InventoryReportsService.BuildMaterialUsage(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "inventory-turnover" => InventoryReportsService.BuildInventoryTurnover(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "ncr-trends" => QualityReportsService.BuildNcrTrends(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "defect-rate" => QualityReportsService.BuildDefectRate(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "quality-cost" => QualityReportsService.BuildQualityCost(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "root-cause-analysis" => QualityReportsService.BuildRootCauseAnalysis(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "customer-profitability" => CustomerReportsService.BuildCustomerProfitability(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "customer-lifetime-value" => CustomerReportsService.BuildCustomerLifetimeValue(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "customer-order-history" => CustomerReportsService.BuildCustomerOrderHistory(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "top-customers" => CustomerReportsService.BuildTopCustomers(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "customer-payment-behavior" => CustomerReportsService.BuildCustomerPaymentBehavior(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                _ => null!
            };

            if (reportData == null)
                return Fail($"Unsupported operational report type: {reportType}");

            if (format == "pdf")
            {
                var bytes = OperationalReportExportService.BuildPdf(key, reportData);
                return Ok(bytes, $"{key}-{dateFilter.endDate:yyyy-MM-dd}.pdf", "application/pdf");
            }

            var csv = OperationalReportExportService.BuildCsv(reportData);
            var csvBytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray();
            return Ok(csvBytes, $"{key}-{dateFilter.endDate:yyyy-MM-dd}.csv", "text/csv; charset=utf-8");
        }

        private static ReportAttachmentResult BuildFinancial(
            CimmpleDbContext context,
            int tenantId,
            string reportType,
            (DateTime startDate, DateTime endDate) dateFilter,
            int? locationId,
            object? parameters,
            string format)
        {
            var key = reportType.Trim().ToLowerInvariant();
            object reportData = key switch
            {
                "balance-sheet" => BalanceSheetReportService.Build(context, tenantId, dateFilter.endDate, locationId),
                "profit-loss" or "income-statement" => ProfitLossGlReportService.Build(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "cash-flow" => CashFlowDirectReportService.Build(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                "ar-aging" => AgingReportService.BuildArAging(context, tenantId, dateFilter.endDate, locationId),
                "ap-aging" => AgingReportService.BuildApAging(context, tenantId, dateFilter.endDate, locationId),
                "trial-balance" => TrialBalanceReportService.Build(context, tenantId, dateFilter.endDate, locationId),
                "customer-statements" => CustomerStatementReportService.Build(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId, parameters),
                "vendor-analysis" => VendorPaymentAnalysisReportService.Build(context, tenantId, dateFilter.startDate, dateFilter.endDate, locationId),
                _ => null!
            };

            if (reportData == null)
                return Fail($"Unsupported financial report type: {reportType}");

            if (format == "pdf")
            {
                var bytes = FinancialReportPdfService.BuildPdf(key, reportData);
                return Ok(bytes, $"{key}-{dateFilter.endDate:yyyy-MM-dd}.pdf", "application/pdf");
            }

            var csv = FinancialReportPdfService.BuildCsv(reportData);
            var csvBytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray();
            return Ok(csvBytes, $"{key}-{dateFilter.endDate:yyyy-MM-dd}.csv", "text/csv; charset=utf-8");
        }

        private static ReportAttachmentResult Ok(byte[] content, string fileName, string contentType) =>
            new() { Content = content, FileName = fileName, ContentType = contentType };

        private static ReportAttachmentResult Fail(string error) =>
            new() { Error = error };
    }
}
