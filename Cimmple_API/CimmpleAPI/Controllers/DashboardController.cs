using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DashboardController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public DashboardController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetMetrics")]
        public IActionResult GetMetrics(
            [FromQuery] string dateRange = "This Month",
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetMetrics");
                    // Try to get from query string as fallback
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var dateFilter = GetDateRangeFilter(dateRange);
                var today = DateTime.Now.Date;
                var weekStart = today.AddDays(-(int)today.DayOfWeek);
                var rangeStart = dateFilter.startDate.Date;
                var rangeEnd = dateFilter.endDate.Date;

                // JobOrderMaster has no locationId — scope via related CustomerOrder.locationId
                var jobOrdersQuery = _context.JobOrderMaster.Where(j => j.Tenantid == tenantId);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    jobOrdersQuery = jobOrdersQuery.Where(j =>
                        _context.CustomerOrder.Any(co =>
                            co.OrderID == j.CustomerOrderID &&
                            co.locationId == locId));
                }

                // Production Metrics
                var activeJobOrders = jobOrdersQuery
                    .Where(j => j.Status != null &&
                               (j.Status == "In Progress" || j.Status == "Pending" || j.Status == "Assigned"))
                    .Count();

                var jobsCompletedToday = jobOrdersQuery
                    .Where(j => (j.Status == "Completed" || j.Status == "Shipped") &&
                               j.ModifiedDate.HasValue &&
                               j.ModifiedDate.Value.Date == today)
                    .Count();

                var jobsCompletedThisWeek = jobOrdersQuery
                    .Where(j => (j.Status == "Completed" || j.Status == "Shipped") &&
                               j.ModifiedDate.HasValue &&
                               j.ModifiedDate.Value.Date >= weekStart &&
                               j.ModifiedDate.Value.Date <= today)
                    .Count();

                // On-time delivery: jobs due in the selected period, completed on/before due date
                var jobsDueInPeriod = jobOrdersQuery
                    .Where(j => j.DueDate.Date >= rangeStart &&
                               j.DueDate.Date <= rangeEnd &&
                               j.Status != null &&
                               j.Status != "Cancelled" &&
                               j.Status != "Canceled")
                    .ToList();

                var onTimeCount = jobsDueInPeriod.Count(j =>
                {
                    var isComplete = j.Status == "Completed" || j.Status == "Shipped";
                    if (!isComplete) return false;
                    var completedOn = (j.ModifiedDate ?? j.CreatedDate).Date;
                    return completedOn <= j.DueDate.Date;
                });

                var onTimeDeliveryRate = jobsDueInPeriod.Count > 0
                    ? (decimal)onTimeCount / jobsDueInPeriod.Count * 100
                    : 0;

                // Financial Metrics — InvoiceMaster has no locationId; filter via InvoiceDetail -> CustomerOrder
                var unpaidCustomerInvoicesQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId && !im.IsVoided);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    unpaidCustomerInvoicesQuery = unpaidCustomerInvoicesQuery.Where(im =>
                        _context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                co.locationId == locId)));
                }

                var unpaidCustomerInvoices = unpaidCustomerInvoicesQuery
                    .ToList()
                    .Select(im =>
                    {
                        var paid = im.PaidAmount > 0
                            ? im.PaidAmount
                            : (im.PaymentDate.HasValue ? im.TotalAmount : 0m);
                        var balance = im.TotalAmount - paid;
                        return balance > 0.009m ? balance : 0m;
                    })
                    .Where(b => b > 0)
                    .ToList();
                var totalReceivables = unpaidCustomerInvoices.Sum();

                var unpaidVendorInvoicesQuery = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 vim.isPaid != 1 &&
                                 vim.isPaid != 2 &&
                                 vim.voideddate == null);
                if (filterLocationId.HasValue)
                    unpaidVendorInvoicesQuery = unpaidVendorInvoicesQuery.Where(vim => vim.locationId == filterLocationId.Value);

                var unpaidVendorInvoices = unpaidVendorInvoicesQuery
                    .ToList()
                    .Select(vim =>
                    {
                        var paid = vim.PaidAmount > 0
                            ? vim.PaidAmount
                            : (vim.Paydate.HasValue ? vim.TotalAmount : 0m);
                        var balance = vim.TotalAmount - paid;
                        return balance > 0.009m ? balance : 0m;
                    })
                    .Where(b => b > 0)
                    .ToList();
                var totalPayables = unpaidVendorInvoices.Sum();

                var revenueThisMonthQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               !im.IsVoided &&
                               im.PaymentDate != null &&
                               im.InvoiceDate >= dateFilter.startDate &&
                               im.InvoiceDate <= dateFilter.endDate);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    revenueThisMonthQuery = revenueThisMonthQuery.Where(im =>
                        _context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                co.locationId == locId)));
                }
                var revenueThisMonth = revenueThisMonthQuery.Sum(im => (decimal?)im.TotalAmount) ?? 0;

                var cashInQuery = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.isCustomer == 1 &&
                               t.TransactionType != null &&
                               t.TransactionType == "Payment" &&
                               t.TransactionDate != null &&
                               t.TransactionDate >= dateFilter.startDate &&
                               t.TransactionDate <= dateFilter.endDate);
                if (filterLocationId.HasValue)
                    cashInQuery = cashInQuery.Where(t => t.locationId == filterLocationId.Value);
                var cashIn = cashInQuery.Sum(t => t.Amount ?? 0);

                var cashOutQuery = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.isCustomer == 0 &&
                               t.TransactionType != null &&
                               t.TransactionType == "Payment" &&
                               t.TransactionDate != null &&
                               t.TransactionDate >= dateFilter.startDate &&
                               t.TransactionDate <= dateFilter.endDate);
                if (filterLocationId.HasValue)
                    cashOutQuery = cashOutQuery.Where(t => t.locationId == filterLocationId.Value);
                var cashOut = cashOutQuery.Sum(t => t.Amount ?? 0);

                var netCashFlow = cashIn - cashOut;

                // Quality Metrics — NonConformanceReport has no locationId; leave tenant-wide
                var openNCRs = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId &&
                               (n.Status == "Open" || n.Status == "Under_Investigation" || n.Status == "Pending_Approval"))
                    .Count();

                var ncrResolvedThisWeek = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId &&
                               n.Status == "Closed" &&
                               n.ClosedDate != null &&
                               n.ClosedDate.Value.Date >= rangeStart &&
                               n.ClosedDate.Value.Date <= rangeEnd)
                    .Count();

                var totalJobOrdersForDefect = jobOrdersQuery
                    .Where(j => j.OrderDate.Date >= rangeStart &&
                               j.OrderDate.Date <= rangeEnd)
                    .Count();

                // NCR count remains tenant-wide (no locationId on entity)
                var totalNCRs = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId &&
                               n.ReportedDate.Date >= rangeStart &&
                               n.ReportedDate.Date <= rangeEnd)
                    .Count();

                var defectRate = totalJobOrdersForDefect > 0
                    ? (decimal)totalNCRs / totalJobOrdersForDefect * 100
                    : 0;

                // Operational Metrics
                var pendingCustomerOrdersQuery = _context.CustomerOrder
                    .Where(co => co.Tenantid == tenantId &&
                               co.Status != null &&
                               (co.Status == "Pending" || co.Status == "Draft"));
                if (filterLocationId.HasValue)
                    pendingCustomerOrdersQuery = pendingCustomerOrdersQuery.Where(co => co.locationId == filterLocationId.Value);
                var pendingCustomerOrders = pendingCustomerOrdersQuery.Count();

                var pendingVendorOrdersQuery = _context.VendorOrders
                    .Where(vo => vo.Tenantid == tenantId &&
                               vo.Status != null &&
                               (vo.Status == "Pending" || vo.Status == "Draft"));
                if (filterLocationId.HasValue)
                    pendingVendorOrdersQuery = pendingVendorOrdersQuery.Where(vo => vo.LocationId == filterLocationId.Value);
                var pendingVendorOrders = pendingVendorOrdersQuery.Count();

                // Overdue shipments = unshipped (or under-shipped) lines past promised due date
                var activeOrdersQuery = _context.CustomerOrder
                    .Where(co => co.Tenantid == tenantId &&
                                 co.Status != "Cancelled" &&
                                 co.Status != "Canceled" &&
                                 co.Status != "Completed" &&
                                 co.Status != "Shipped" &&
                                 co.Status != "Fully Invoiced");
                if (filterLocationId.HasValue)
                    activeOrdersQuery = activeOrdersQuery.Where(co => co.locationId == filterLocationId.Value);

                var activeOrderIds = activeOrdersQuery
                    .Select(co => co.OrderID)
                    .ToList();

                // Shipping has no locationId; shipped qty lookup stays tenant-scoped (orders already location-filtered)
                var shippedByDetail = _context.ShippingDetails
                    .Where(sd => sd.OrderDetailID.HasValue)
                    .Join(_context.Shipping.Where(s => s.TenantId == tenantId),
                        sd => sd.ShipmentId,
                        s => s.Id,
                        (sd, s) => new { DetailId = sd.OrderDetailID!.Value, sd.ShippedQty })
                    .GroupBy(x => x.DetailId)
                    .ToDictionary(g => g.Key, g => g.Sum(x => x.ShippedQty));

                var overdueShipments = _context.CustomerOrderDetails
                    .Where(d => d.Tenantid == tenantId &&
                                activeOrderIds.Contains(d.OrderID) &&
                                d.DueDate.Date < today)
                    .AsEnumerable()
                    .Count(d =>
                    {
                        var shipped = shippedByDetail.TryGetValue(d.ID, out var qty) ? qty : d.ShippedQty;
                        return shipped < d.QtyOrdered;
                    });

                // Sales Metrics
                var quotationsThisMonthQuery = _context.QuotationOrder
                    .Where(q => q.Tenantid == tenantId &&
                               q.OrderDate >= dateFilter.startDate &&
                               q.OrderDate <= dateFilter.endDate);
                if (filterLocationId.HasValue)
                    quotationsThisMonthQuery = quotationsThisMonthQuery.Where(q => q.Locationid == filterLocationId.Value);
                var quotationsThisMonth = quotationsThisMonthQuery.Count();

                var ordersThisMonthQuery = _context.CustomerOrder
                    .Where(co => co.Tenantid == tenantId &&
                               co.OrderDate >= dateFilter.startDate &&
                               co.OrderDate <= dateFilter.endDate);
                if (filterLocationId.HasValue)
                    ordersThisMonthQuery = ordersThisMonthQuery.Where(co => co.locationId == filterLocationId.Value);
                var ordersThisMonth = ordersThisMonthQuery.Count();

                var conversionRate = quotationsThisMonth > 0
                    ? (decimal)ordersThisMonth / quotationsThisMonth * 100
                    : 0;

                var metrics = new
                {
                    production = new
                    {
                        activeJobOrders,
                        jobsCompletedToday,
                        jobsCompletedThisWeek,
                        onTimeDeliveryRate = Math.Round(onTimeDeliveryRate, 2)
                    },
                    financial = new
                    {
                        totalReceivables,
                        totalPayables,
                        revenueThisMonth,
                        netCashFlow
                    },
                    quality = new
                    {
                        openNCRs,
                        ncrResolvedThisWeek,
                        defectRate = Math.Round(defectRate, 2)
                    },
                    operational = new
                    {
                        pendingCustomerOrders,
                        pendingVendorOrders,
                        overdueShipments
                    },
                    sales = new
                    {
                        quotationsThisMonth,
                        conversionRate = Math.Round(conversionRate, 2)
                    }
                };

                return Ok(new { result = metrics });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetMetrics: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("GetProductionStatus")]
        public IActionResult GetProductionStatus(
            [FromQuery] string period = "This Week",
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetProductionStatus");
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var dateFilter = GetDateRangeFilter(period);

                var jobOrdersQuery = _context.JobOrderMaster.Where(j => j.Tenantid == tenantId);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    jobOrdersQuery = jobOrdersQuery.Where(j =>
                        _context.CustomerOrder.Any(co =>
                            co.OrderID == j.CustomerOrderID &&
                            co.locationId == locId));
                }

                var jobOrdersByStatus = jobOrdersQuery
                    .Where(j => j.OrderDate >= dateFilter.startDate &&
                               j.OrderDate <= dateFilter.endDate)
                    .GroupBy(j => j.Status ?? "Unknown")
                    .Select(g => new
                    {
                        status = g.Key,
                        count = g.Count()
                    })
                    .ToList();

                var overdueJobs = jobOrdersQuery
                    .Where(j => j.DueDate.Date < DateTime.Now.Date &&
                               j.Status != null &&
                               j.Status != "Completed" &&
                               j.Status != "Shipped" &&
                               j.Status != "Cancelled" &&
                               j.Status != "Canceled")
                    .Count();

                var result = new
                {
                    jobOrdersByStatus,
                    overdueJobs
                };

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetProductionStatus: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("GetRevenueTrends")]
        public IActionResult GetRevenueTrends(
            [FromQuery] string period = "30days",
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetRevenueTrends");
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var days = period == "7days" ? 7 : period == "30days" ? 30 : 90;
                var startDate = DateTime.Now.AddDays(-days).Date;

                var revenueQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               im.PaymentDate != null &&
                               im.InvoiceDate >= startDate);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    revenueQuery = revenueQuery.Where(im =>
                        _context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                co.locationId == locId)));
                }

                var revenueData = revenueQuery
                    .GroupBy(im => im.InvoiceDate.Date)
                    .Select(g => new
                    {
                        date = g.Key,
                        revenue = g.Sum(im => im.TotalAmount),
                        count = g.Count()
                    })
                    .OrderBy(x => x.date)
                    .ToList()
                    .Select(g => new
                    {
                        date = g.date.ToString("yyyy-MM-dd"),
                        revenue = g.revenue,
                        count = g.count
                    })
                    .ToList();

                var expenseQuery = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 (vim.isPaid == 1 || vim.Paydate != null) &&
                                 vim.InvoiceDate >= startDate);
                if (filterLocationId.HasValue)
                    expenseQuery = expenseQuery.Where(vim => vim.locationId == filterLocationId.Value);

                var expenseData = expenseQuery
                    .GroupBy(vim => vim.InvoiceDate.Date)
                    .Select(g => new
                    {
                        date = g.Key,
                        expenses = g.Sum(vim => vim.TotalAmount)
                    })
                    .OrderBy(x => x.date)
                    .ToList()
                    .Select(g => new
                    {
                        date = g.date.ToString("yyyy-MM-dd"),
                        expenses = g.expenses
                    })
                    .ToList();

                var result = new
                {
                    revenue = revenueData,
                    expenses = expenseData
                };

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetRevenueTrends: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("GetRecentActivities")]
        public IActionResult GetRecentActivities(
            [FromQuery] int limit = 20,
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetRecentActivities");
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var activities = new List<object>();

                // Recent Job Orders — scoped via CustomerOrder.locationId
                var recentJobOrdersQuery = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    recentJobOrdersQuery = recentJobOrdersQuery.Where(j =>
                        _context.CustomerOrder.Any(co =>
                            co.OrderID == j.CustomerOrderID &&
                            co.locationId == locId));
                }

                var recentJobOrders = recentJobOrdersQuery
                    .OrderByDescending(j => j.CreatedDate)
                    .Take(limit / 4)
                    .Select(j => new
                    {
                        type = "job_order",
                        action = "created",
                        description = $"Job Order {j.JobOrderNumber} created for {j.CustomerName}",
                        timestamp = j.CreatedDate,
                        entityId = j.JobOrderID,
                        entityType = "JobOrder"
                    })
                    .ToList();

                // Shipping has no locationId — leave tenant-wide
                var recentShipments = _context.Shipping
                    .Where(s => s.TenantId == tenantId)
                    .OrderByDescending(s => s.ShipmentDate)
                    .Take(limit / 4)
                    .Select(s => new
                    {
                        type = "shipment",
                        action = "completed",
                        description = $"Shipment {s.ShipmentNo ?? s.Id.ToString()} completed",
                        timestamp = s.ShipmentDate,
                        entityId = s.Id,
                        entityType = "Shipment"
                    })
                    .ToList();

                // Recent Invoices — filter via InvoiceDetail -> CustomerOrder
                var recentInvoicesQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    recentInvoicesQuery = recentInvoicesQuery.Where(im =>
                        _context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                co.locationId == locId)));
                }

                var recentInvoices = recentInvoicesQuery
                    .OrderByDescending(im => im.createdDate)
                    .Take(limit / 4)
                    .Select(im => new
                    {
                        type = "invoice",
                        action = "generated",
                        description = $"Invoice {im.PrefixInvoiceNo}{im.InvoiceNo} generated",
                        timestamp = im.createdDate ?? im.InvoiceDate,
                        entityId = im.Id,
                        entityType = "Invoice"
                    })
                    .ToList();

                // NCR has no locationId — leave tenant-wide
                var recentNCRs = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId)
                    .OrderByDescending(n => n.CreatedDate)
                    .Take(limit / 4)
                    .Select(n => new
                    {
                        type = "ncr",
                        action = "opened",
                        description = $"NCR {n.NcrNumber} opened",
                        timestamp = n.CreatedDate,
                        entityId = n.NcrId,
                        entityType = "NCR"
                    })
                    .ToList();

                activities.AddRange(recentJobOrders);
                activities.AddRange(recentShipments);
                activities.AddRange(recentInvoices);
                activities.AddRange(recentNCRs);

                var sortedActivities = activities
                    .Where(a => ((dynamic)a).timestamp != null)
                    .OrderByDescending(a => ((dynamic)a).timestamp)
                    .Take(limit)
                    .ToList();

                return Ok(new { result = sortedActivities });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetRecentActivities: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("GetAlerts")]
        public IActionResult GetAlerts([FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetAlerts");
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var today = DateTime.Now.Date;
                var alerts = new List<object>();

                // Overdue Job Orders — scoped via CustomerOrder.locationId
                var overdueJobsQuery = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId &&
                               j.DueDate < today &&
                               j.Status != null &&
                               j.Status != "Completed" &&
                               j.Status != "Cancelled" &&
                               j.Status != "Void");
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    overdueJobsQuery = overdueJobsQuery.Where(j =>
                        _context.CustomerOrder.Any(co =>
                            co.OrderID == j.CustomerOrderID &&
                            co.locationId == locId));
                }

                var overdueJobs = overdueJobsQuery
                    .Select(j => new
                    {
                        type = "overdue_job",
                        priority = "high",
                        title = $"Overdue Job Order: {j.JobOrderNumber}",
                        description = $"Job Order for {j.CustomerName ?? "Unknown"} was due on {j.DueDate:MM/dd/yyyy}",
                        entityId = j.JobOrderID,
                        entityType = "JobOrder",
                        dueDate = j.DueDate
                    })
                    .Take(10)
                    .ToList();

                // Overdue Invoices (AR) — via InvoiceDetail -> CustomerOrder
                var overdueARQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               im.DueDate < today &&
                               im.PaymentDate == null &&
                               !im.IsVoided);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    overdueARQuery = overdueARQuery.Where(im =>
                        _context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                co.locationId == locId)));
                }

                var overdueAR = overdueARQuery
                    .Select(im => new
                    {
                        type = "overdue_invoice_ar",
                        priority = "high",
                        title = $"Overdue Invoice: {im.PrefixInvoiceNo}{im.InvoiceNo}",
                        description = $"Invoice for ${im.TotalAmount:N2} was due on {im.DueDate:MM/dd/yyyy}",
                        entityId = im.Id,
                        entityType = "Invoice",
                        amount = im.TotalAmount,
                        dueDate = im.DueDate
                    })
                    .Take(10)
                    .ToList();

                // Overdue Vendor Invoices (AP)
                var overdueAPQuery = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 vim.DueDate < today &&
                                 vim.isPaid != 1 &&
                                 vim.isPaid != 2 &&
                                 vim.Paydate == null);
                if (filterLocationId.HasValue)
                    overdueAPQuery = overdueAPQuery.Where(vim => vim.locationId == filterLocationId.Value);

                var overdueAP = overdueAPQuery
                    .Select(vim => new
                    {
                        type = "overdue_invoice_ap",
                        priority = "high",
                        title = $"Overdue Vendor Invoice: {vim.InvoiceNo}",
                        description = $"Invoice from {vim.VendorName} for ${vim.TotalAmount:N2} was due on {vim.DueDate:MM/dd/yyyy}",
                        entityId = vim.Id,
                        entityType = "VendorInvoice",
                        amount = vim.TotalAmount,
                        dueDate = vim.DueDate
                    })
                    .Take(10)
                    .ToList();

                // Open NCRs — no locationId; leave tenant-wide
                var criticalNCRs = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId &&
                               n.Status != null &&
                               (n.Status == "Open" || n.Status == "Under_Investigation" || n.Status == "Pending_Approval") &&
                               n.CreatedDate < today.AddDays(-7))
                    .Select(n => new
                    {
                        type = "critical_ncr",
                        priority = "medium",
                        title = $"NCR {n.NcrNumber ?? "Unknown"} requires attention",
                        description = $"NCR opened on {n.CreatedDate:MM/dd/yyyy} is still unresolved",
                        entityId = n.NcrId,
                        entityType = "NCR",
                        createdDate = n.CreatedDate,
                        dueDate = n.CreatedDate
                    })
                    .Take(10)
                    .ToList();

                alerts.AddRange(overdueJobs);
                alerts.AddRange(overdueAR);
                alerts.AddRange(overdueAP);
                alerts.AddRange(criticalNCRs);

                var sortedAlerts = alerts
                    .OrderByDescending(a => ((dynamic)a).priority == "high" ? 1 : 0)
                    .ThenBy(a => {
                        try {
                            dynamic alert = a;
                            return alert.dueDate ?? DateTime.MaxValue;
                        } catch {
                            return DateTime.MaxValue;
                        }
                    })
                    .Take(20)
                    .ToList();

                return Ok(new { result = sortedAlerts });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetAlerts: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("GetTopCustomers")]
        public IActionResult GetTopCustomers(
            [FromQuery] int limit = 5,
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetTopCustomers");
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var dateFilter = GetDateRangeFilter("This Month");

                var topCustomersQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               im.PaymentDate != null &&
                               im.InvoiceDate >= dateFilter.startDate &&
                               im.InvoiceDate <= dateFilter.endDate)
                    .Join(_context.InvoiceDetail,
                          im => im.Id,
                          id => id.InvoiceId,
                          (im, id) => new { im, id })
                    .Join(_context.CustomerOrder,
                          x => x.id.OrderId,
                          co => co.OrderID,
                          (x, co) => new { x.im, co });

                if (filterLocationId.HasValue)
                    topCustomersQuery = topCustomersQuery.Where(x => x.co.locationId == filterLocationId.Value);

                var topCustomers = topCustomersQuery
                    .GroupBy(x => new { x.co.CustomerID, x.co.CustomerName })
                    .Select(g => new
                    {
                        customerId = g.Key.CustomerID,
                        customerName = g.Key.CustomerName ?? "Unknown",
                        revenue = g.Sum(x => x.im.TotalAmount),
                        orderCount = g.Select(x => x.co.OrderID).Distinct().Count()
                    })
                    .OrderByDescending(x => x.revenue)
                    .Take(limit)
                    .ToList();

                return Ok(new { result = topCustomers });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetTopCustomers: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("GetTopProducts")]
        public IActionResult GetTopProducts(
            [FromQuery] int limit = 5,
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetTopProducts");
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var dateFilter = GetDateRangeFilter("This Month");

                var topProductsQuery = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId &&
                               j.OrderDate >= dateFilter.startDate &&
                               j.OrderDate <= dateFilter.endDate);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    topProductsQuery = topProductsQuery.Where(j =>
                        _context.CustomerOrder.Any(co =>
                            co.OrderID == j.CustomerOrderID &&
                            co.locationId == locId));
                }

                var topProducts = topProductsQuery
                    .GroupBy(j => new { j.PartNo, j.PartName })
                    .Select(g => new
                    {
                        partNo = g.Key.PartNo ?? "Unknown",
                        partName = g.Key.PartName ?? g.Key.PartNo ?? "Unknown",
                        quantity = g.Sum(j => j.QtyOrdered),
                        revenue = g.Sum(j => j.QtyOrdered * j.UnitPrice),
                        orderCount = g.Count()
                    })
                    .OrderByDescending(x => x.revenue)
                    .Take(limit)
                    .ToList();

                return Ok(new { result = topProducts });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetTopProducts: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("GetQualityStatus")]
        public IActionResult GetQualityStatus([FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetQualityStatus");
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                // NonConformanceReport has no locationId — leave tenant-wide (filterLocationId unused)
                _ = filterLocationId;

                var ncrByStatus = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId && n.Status != null)
                    .GroupBy(n => n.Status)
                    .Select(g => new
                    {
                        status = g.Key ?? "Unknown",
                        count = g.Count()
                    })
                    .ToList();

                return Ok(new { result = ncrByStatus });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetQualityStatus: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        [HttpGet("GetUpcomingDeadlines")]
        public IActionResult GetUpcomingDeadlines(
            [FromQuery] int days = 7,
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (tenantId == 0)
                {
                    Console.WriteLine("Warning: TenantId is 0 in GetUpcomingDeadlines");
                    var tenantIdParam = Request.Query["tenantId"].FirstOrDefault();
                    if (!string.IsNullOrEmpty(tenantIdParam) && int.TryParse(tenantIdParam, out var parsedTenantId))
                    {
                        tenantId = parsedTenantId;
                    }
                    if (tenantId == 0)
                    {
                        return BadRequest(new { error = "TenantId is required" });
                    }
                }

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var endDate = DateTime.Now.AddDays(days).Date;
                var today = DateTime.Now.Date;

                var deadlines = new List<object>();

                // Job Order due dates — scoped via CustomerOrder.locationId
                var jobDeadlinesQuery = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId &&
                               j.DueDate >= today &&
                               j.DueDate <= endDate &&
                               j.Status != null &&
                               j.Status != "Completed" &&
                               j.Status != "Shipped" &&
                               j.Status != "Cancelled" &&
                               j.Status != "Canceled" &&
                               j.Status != "Void");
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    jobDeadlinesQuery = jobDeadlinesQuery.Where(j =>
                        _context.CustomerOrder.Any(co =>
                            co.OrderID == j.CustomerOrderID &&
                            co.locationId == locId));
                }

                var jobDeadlines = jobDeadlinesQuery
                    .Select(j => new
                    {
                        type = "job_order",
                        title = $"Job Order {j.JobOrderNumber}",
                        description = $"Due for {j.CustomerName ?? "Unknown"}",
                        dueDate = j.DueDate,
                        entityId = j.JobOrderID,
                        entityType = "JobOrder",
                        priority = j.JobPriority
                    })
                    .ToList();

                // Invoice due dates (AR) — via InvoiceDetail -> CustomerOrder
                var invoiceDeadlinesQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               !im.IsVoided &&
                               im.DueDate >= today &&
                               im.DueDate <= endDate &&
                               im.PaymentDate == null &&
                               !im.IsVoided);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    invoiceDeadlinesQuery = invoiceDeadlinesQuery.Where(im =>
                        _context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                co.locationId == locId)));
                }

                var invoiceDeadlines = invoiceDeadlinesQuery
                    .Select(im => new
                    {
                        type = "invoice_ar",
                        title = $"Invoice {im.PrefixInvoiceNo}{im.InvoiceNo}",
                        description = $"Payment due from customer",
                        dueDate = im.DueDate,
                        entityId = im.Id,
                        entityType = "Invoice",
                        amount = im.TotalAmount
                    })
                    .ToList();

                // Vendor Invoice due dates (AP)
                var vendorInvoiceDeadlinesQuery = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 vim.DueDate >= today &&
                                 vim.DueDate <= endDate &&
                                 vim.isPaid != 1 &&
                                 vim.isPaid != 2 &&
                                 vim.voideddate == null &&
                                 vim.Paydate == null);
                if (filterLocationId.HasValue)
                    vendorInvoiceDeadlinesQuery = vendorInvoiceDeadlinesQuery.Where(vim => vim.locationId == filterLocationId.Value);

                var vendorInvoiceDeadlines = vendorInvoiceDeadlinesQuery
                    .Select(vim => new
                    {
                        type = "invoice_ap",
                        title = $"Vendor Invoice {vim.InvoiceNo}",
                        description = $"Payment due to {vim.VendorName}",
                        dueDate = vim.DueDate,
                        entityId = vim.Id,
                        entityType = "VendorInvoice",
                        amount = vim.TotalAmount
                    })
                    .ToList();

                deadlines.AddRange(jobDeadlines);
                deadlines.AddRange(invoiceDeadlines);
                deadlines.AddRange(vendorInvoiceDeadlines);

                var sortedDeadlines = deadlines
                    .OrderBy(d => ((dynamic)d).dueDate)
                    .ToList();

                return Ok(new { result = sortedDeadlines });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetUpcomingDeadlines: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, details = ex.StackTrace });
            }
        }

        private (DateTime startDate, DateTime endDate) GetDateRangeFilter(string dateRange)
        {
            try
            {
                var today = DateTime.Now.Date;
                DateTime startDate, endDate;

                if (string.IsNullOrWhiteSpace(dateRange))
                {
                    dateRange = "This Month";
                }

                switch (dateRange)
                {
                    case "This Week":
                        startDate = today.AddDays(-(int)today.DayOfWeek);
                        endDate = today;
                        break;
                    case "Last Week":
                        startDate = today.AddDays(-(int)today.DayOfWeek - 7);
                        endDate = today.AddDays(-(int)today.DayOfWeek);
                        break;
                    case "This Month":
                        startDate = new DateTime(today.Year, today.Month, 1);
                        endDate = today;
                        break;
                    case "Last Month":
                        startDate = new DateTime(today.Year, today.Month, 1).AddMonths(-1);
                        endDate = new DateTime(today.Year, today.Month, 1).AddDays(-1);
                        break;
                    case "This Quarter":
                        var quarter = (today.Month - 1) / 3;
                        startDate = new DateTime(today.Year, quarter * 3 + 1, 1);
                        endDate = today;
                        break;
                    case "Last Quarter":
                        var lastQuarter = ((today.Month - 1) / 3 - 1 + 4) % 4;
                        var lastQuarterYear = lastQuarter == 3 ? today.Year - 1 : today.Year;
                        startDate = new DateTime(lastQuarterYear, lastQuarter * 3 + 1, 1);
                        endDate = new DateTime(today.Year, ((today.Month - 1) / 3) * 3 + 1, 1).AddDays(-1);
                        break;
                    case "This Year":
                        startDate = new DateTime(today.Year, 1, 1);
                        endDate = today;
                        break;
                    case "Last Year":
                        startDate = new DateTime(today.Year - 1, 1, 1);
                        endDate = new DateTime(today.Year - 1, 12, 31);
                        break;
                    default:
                        startDate = new DateTime(today.Year, today.Month, 1);
                        endDate = today;
                        break;
                }

                return (startDate, endDate);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetDateRangeFilter: {ex.Message}");
                var today = DateTime.Now.Date;
                return (new DateTime(today.Year, today.Month, 1), today);
            }
        }
    }
}
