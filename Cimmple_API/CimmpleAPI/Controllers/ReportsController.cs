using CimmpleAPI.Data;
using CimmpleAPI.Services;
using Microsoft.AspNetCore.Mvc;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ReportsController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public ReportsController(CimmpleDbContext context)
        {
            _context = context;
        }

        public class ReportRequest
        {
            public string ReportType { get; set; }
            public string DateRange { get; set; }
            public string Format { get; set; }
            public int TenantId { get; set; }
            public int? LocationId { get; set; }
            public string CustomStartDate { get; set; }
            public string CustomEndDate { get; set; }
            public object Parameters { get; set; }
        }

        [HttpPost("GenerateReport")]
        public IActionResult GenerateReport([FromBody] ReportRequest request)
        {
            try
            {
                if (request == null)
                    return BadRequest(new { error = "Request is null" });

                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                if (tenantId <= 0)
                    return BadRequest(new { error = "Tenant id is required. Select a company or sign in again." });

                if (string.IsNullOrWhiteSpace(request.ReportType))
                    return BadRequest(new { error = "ReportType is required" });

                var dateRange = request.DateRange ?? "This Month";

                if (dateRange.Equals("Custom", StringComparison.OrdinalIgnoreCase) &&
                    (string.IsNullOrWhiteSpace(request.CustomStartDate) ||
                     string.IsNullOrWhiteSpace(request.CustomEndDate) ||
                     !DateTime.TryParse(request.CustomStartDate, out _) ||
                     !DateTime.TryParse(request.CustomEndDate, out _)))
                {
                    return BadRequest(new { error = "Custom date range requires valid CustomStartDate and CustomEndDate (yyyy-MM-dd)." });
                }

                if (!TryResolveListLocationFilter(request.LocationId, out var reportLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                var dateFilter = GetDateRangeFilter(dateRange, request);
                var reportTypeKey = request.ReportType.Trim().ToLowerInvariant();

                ReportResultDto reportData;
                switch (reportTypeKey)
                {
                    // Sales & Revenue
                    case "sales-performance":
                        reportData = SalesReportsService.BuildSalesPerformance(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "sales-trends":
                        reportData = SalesReportsService.BuildSalesTrends(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "product-revenue":
                        reportData = SalesReportsService.BuildProductRevenue(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "quotation-conversion":
                        reportData = SalesReportsService.BuildQuotationConversion(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "revenue-by-location":
                        reportData = SalesReportsService.BuildRevenueByLocation(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;

                    // Operations
                    case "job-status-dashboard":
                        reportData = JobOrderStatusReportService.Build(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "job-completion-time":
                        reportData = OperationsReportsService.BuildJobCompletionTime(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "on-time-delivery":
                        reportData = OperationsReportsService.BuildOnTimeDelivery(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "production-efficiency":
                        reportData = OperationsReportsService.BuildProductionEfficiency(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "workstation-utilization":
                        reportData = OperationsReportsService.BuildWorkstationUtilization(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "process-performance":
                        reportData = OperationsReportsService.BuildProcessPerformance(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;

                    // Purchasing
                    case "vendor-performance":
                        reportData = PurchasingReportsService.BuildVendorPerformance(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "purchase-trends":
                        reportData = PurchasingReportsService.BuildPurchaseTrends(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "vendor-cost-analysis":
                        reportData = PurchasingReportsService.BuildVendorCostAnalysis(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "material-cost-trends":
                        reportData = PurchasingReportsService.BuildMaterialCostTrends(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "vendor-delivery":
                        reportData = PurchasingReportsService.BuildVendorDelivery(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;

                    // Inventory
                    case "inventory-valuation":
                        reportData = InventoryReportsService.BuildInventoryValuation(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "stock-movement":
                        reportData = InventoryReportsService.BuildStockMovement(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "material-usage":
                        reportData = InventoryReportsService.BuildMaterialUsage(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "inventory-turnover":
                        reportData = InventoryReportsService.BuildInventoryTurnover(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;

                    // Quality
                    case "ncr-trends":
                        reportData = QualityReportsService.BuildNcrTrends(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "defect-rate":
                        reportData = QualityReportsService.BuildDefectRate(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "quality-cost":
                        reportData = QualityReportsService.BuildQualityCost(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "root-cause-analysis":
                        reportData = QualityReportsService.BuildRootCauseAnalysis(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;

                    // Customer
                    case "customer-profitability":
                        reportData = CustomerReportsService.BuildCustomerProfitability(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "customer-lifetime-value":
                        reportData = CustomerReportsService.BuildCustomerLifetimeValue(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "customer-order-history":
                        reportData = CustomerReportsService.BuildCustomerOrderHistory(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "top-customers":
                        reportData = CustomerReportsService.BuildTopCustomers(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;
                    case "customer-payment-behavior":
                        reportData = CustomerReportsService.BuildCustomerPaymentBehavior(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, restrictToLocationIds);
                        break;

                    default:
                        return BadRequest(new { error = "Unsupported report type" });
                }

                var format = (request.Format ?? "json").Trim().ToLowerInvariant();
                if (format == "pdf")
                {
                    var pdfBytes = OperationalReportExportService.BuildPdf(reportTypeKey, reportData);
                    var fileName = $"{reportTypeKey}-{dateFilter.endDate:yyyy-MM-dd}.pdf";
                    return File(pdfBytes, "application/pdf", fileName);
                }

                if (format == "csv" || format == "excel")
                {
                    var csv = OperationalReportExportService.BuildCsv(reportData);
                    var bytes = System.Text.Encoding.UTF8.GetPreamble()
                        .Concat(System.Text.Encoding.UTF8.GetBytes(csv))
                        .ToArray();
                    var fileName = $"{reportTypeKey}-{dateFilter.endDate:yyyy-MM-dd}.csv";
                    return File(bytes, "text/csv; charset=utf-8", fileName);
                }

                return Ok(new { result = reportData });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GenerateReport: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private static (DateTime startDate, DateTime endDate) GetDateRangeFilter(
            string dateRange,
            ReportRequest? reportRequest = null)
        {
            var now = DateTime.Now;
            var today = now.Date;

            if (!string.IsNullOrWhiteSpace(dateRange) &&
                dateRange.Equals("Custom", StringComparison.OrdinalIgnoreCase) &&
                reportRequest != null &&
                DateTime.TryParse(reportRequest.CustomStartDate, out var custStart) &&
                DateTime.TryParse(reportRequest.CustomEndDate, out var custEnd))
            {
                if (custEnd.Date < custStart.Date)
                    return (custEnd.Date, custStart.Date);
                return (custStart.Date, custEnd.Date);
            }

            switch ((dateRange ?? "").ToLowerInvariant())
            {
                case "this week":
                    {
                        var start = today.AddDays(-(int)today.DayOfWeek);
                        return (start, today);
                    }
                case "this month":
                    return (new DateTime(today.Year, today.Month, 1), today);
                case "last month":
                    {
                        var start = new DateTime(today.Year, today.Month, 1).AddMonths(-1);
                        var end = new DateTime(today.Year, today.Month, 1).AddDays(-1);
                        return (start, end);
                    }
                case "this quarter":
                    {
                        var q = (today.Month - 1) / 3;
                        var start = new DateTime(today.Year, q * 3 + 1, 1);
                        return (start, today);
                    }
                case "last quarter":
                    {
                        var currentQuarter = (today.Month - 1) / 3;
                        if (currentQuarter == 0)
                            return (new DateTime(today.Year - 1, 10, 1), new DateTime(today.Year - 1, 12, 31));
                        var prevQ = currentQuarter - 1;
                        var start = new DateTime(today.Year, prevQ * 3 + 1, 1);
                        return (start, start.AddMonths(3).AddDays(-1));
                    }
                case "this year":
                    return (new DateTime(today.Year, 1, 1), today);
                case "last year":
                    return (new DateTime(today.Year - 1, 1, 1), new DateTime(today.Year - 1, 12, 31));
                default:
                    return (new DateTime(today.Year, today.Month, 1), today);
            }
        }
    }
}
