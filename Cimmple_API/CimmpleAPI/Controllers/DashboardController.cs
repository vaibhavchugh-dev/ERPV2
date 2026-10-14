using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DashboardController : ApiBaseController
    {
        private static readonly TimeSpan MetricsCacheDuration = TimeSpan.FromSeconds(60);

        private readonly CimmpleDbContext _context;
        private readonly DbContextOptions<CimmpleDbContext> _dbOptions;
        private readonly IMemoryCache _cache;

        public DashboardController(
            CimmpleDbContext context,
            DbContextOptions<CimmpleDbContext> dbOptions,
            IMemoryCache cache)
        {
            _context = context;
            _dbOptions = dbOptions;
            _cache = cache;
        }

        [HttpGet("GetMetrics")]
        public async Task<IActionResult> GetMetrics(
            [FromQuery] string dateRange = "This Month",
            [FromQuery] int? locationId = null,
            [FromQuery] bool refresh = false)
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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                var scopeKey = filterLocationId?.ToString()
                    ?? (restrictToLocationIds == null ? "all" : "r" + string.Join(",", restrictToLocationIds.OrderBy(id => id)));
                var cacheKey = $"dashboard-metrics:{tenantId}:{scopeKey}:{dateRange}:{DateTime.Now:yyyyMMdd}";
                if (!refresh && _cache.TryGetValue(cacheKey, out object? cachedMetrics) && cachedMetrics != null)
                {
                    return Ok(new { result = cachedMetrics });
                }

                var dateFilter = GetDateRangeFilter(dateRange);
                var today = DateTime.Now.Date;
                var tomorrow = today.AddDays(1);
                var weekStart = today.AddDays(-(int)today.DayOfWeek);
                var rangeStart = dateFilter.startDate.Date;
                // Exclusive upper bound: compare columns directly (no .Date) so SQL Server can use indexes.
                var rangeEndExclusive = dateFilter.endDate.Date.AddDays(1);
                var loc = filterLocationId;
                var allowed = restrictToLocationIds;

                // Every query is a network round trip to the database, so independent groups run concurrently.
                // Each group gets its own DbContext because a context cannot be used by two queries at once.
                var jobCountsTask = WithContextAsync(async db =>
                {
                    var jobs = ScopeJobOrders(db, tenantId, loc, allowed);
                    var active = await jobs.CountAsync(j => j.Status != null &&
                        (j.Status == "In Progress" || j.Status == "Pending" || j.Status == "Assigned"));
                    var completedToday = await jobs.CountAsync(j => (j.Status == "Completed" || j.Status == "Shipped") &&
                        j.ModifiedDate >= today && j.ModifiedDate < tomorrow);
                    var completedThisWeek = await jobs.CountAsync(j => (j.Status == "Completed" || j.Status == "Shipped") &&
                        j.ModifiedDate >= weekStart && j.ModifiedDate < tomorrow);
                    return (active, completedToday, completedThisWeek);
                });

                var jobPeriodTask = WithContextAsync(async db =>
                {
                    var jobs = ScopeJobOrders(db, tenantId, loc, allowed);
                    // On-time delivery: jobs due in the selected period, completed on/before due date
                    var due = await jobs
                        .Where(j => j.DueDate >= rangeStart &&
                                    j.DueDate < rangeEndExclusive &&
                                    j.Status != null &&
                                    j.Status != "Cancelled" &&
                                    j.Status != "Canceled")
                        .Select(j => new { j.Status, j.ModifiedDate, j.CreatedDate, j.DueDate })
                        .ToListAsync();
                    var onTime = due.Count(j =>
                        (j.Status == "Completed" || j.Status == "Shipped") &&
                        (j.ModifiedDate ?? j.CreatedDate).Date <= j.DueDate.Date);
                    var onTimeRate = due.Count > 0 ? (decimal)onTime / due.Count * 100 : 0;
                    var jobsInPeriod = await jobs.CountAsync(j => j.OrderDate >= rangeStart && j.OrderDate < rangeEndExclusive);
                    return (onTimeRate, jobsInPeriod);
                });

                var customerInvoiceTask = WithContextAsync(async db =>
                {
                    var unpaid = await ScopeCustomerInvoices(db,
                            db.InvoiceMaster.Where(im => im.TenantId == tenantId && !im.IsVoided),
                            tenantId, loc, allowed)
                        .Select(im => new { im.TotalAmount, im.PaidAmount, im.PaymentDate })
                        .ToListAsync();
                    var receivables = unpaid.Sum(im => OpenBalance(im.TotalAmount, im.PaidAmount, im.PaymentDate));

                    var revenue = await ScopeCustomerInvoices(db,
                            db.InvoiceMaster.Where(im => im.TenantId == tenantId &&
                                                         !im.IsVoided &&
                                                         im.InvoiceDate >= dateFilter.startDate &&
                                                         im.InvoiceDate <= dateFilter.endDate),
                            tenantId, loc, allowed)
                        .SumAsync(im => (decimal?)im.TotalAmount) ?? 0;
                    return (receivables, revenue);
                });

                var vendorTask = WithContextAsync(async db =>
                {
                    var unpaidQuery = db.VendorInvoiceMaster
                        .Where(vim => vim.TenantId == tenantId &&
                                      vim.isPaid != 1 &&
                                      vim.isPaid != 2 &&
                                      vim.voideddate == null);
                    var pendingQuery = db.VendorOrders
                        .Where(vo => vo.Tenantid == tenantId &&
                                     vo.Status != null &&
                                     (vo.Status == "Pending" || vo.Status == "Draft"));
                    if (loc.HasValue)
                    {
                        var locId = loc.Value;
                        unpaidQuery = unpaidQuery.Where(vim => vim.locationId == locId);
                        pendingQuery = pendingQuery.Where(vo => vo.LocationId == locId);
                    }
                    else if (allowed != null)
                    {
                        var ids = allowed.ToList();
                        unpaidQuery = ids.Count == 0 ? unpaidQuery.Where(_ => false) : unpaidQuery.Where(vim => ids.Contains(vim.locationId));
                        pendingQuery = ids.Count == 0
                            ? pendingQuery.Where(_ => false)
                            : pendingQuery.Where(vo => vo.LocationId.HasValue && ids.Contains(vo.LocationId.Value));
                    }

                    var unpaid = await unpaidQuery
                        .Select(vim => new { vim.TotalAmount, vim.PaidAmount, vim.Paydate })
                        .ToListAsync();
                    var payables = unpaid.Sum(vim => OpenBalance(vim.TotalAmount, vim.PaidAmount, vim.Paydate));
                    var pendingVendorOrders = await pendingQuery.CountAsync();
                    return (payables, pendingVendorOrders);
                });

                var cashFlowTask = Task.Run(() =>
                {
                    using var db = new CimmpleDbContext(_dbOptions);
                    return CashFlowMetricsCalculator.Calculate(db, tenantId, dateFilter, loc, allowed);
                });

                var qualityTask = WithContextAsync(async db =>
                {
                    var open = await ApplyNcrSiteFilter(db,
                        db.NonConformanceReports.Where(n => n.TenantId == tenantId &&
                            (n.Status == "Open" || n.Status == "Under_Investigation" || n.Status == "Pending_Approval")),
                        tenantId, loc, allowed).CountAsync();
                    var resolved = await ApplyNcrSiteFilter(db,
                        db.NonConformanceReports.Where(n => n.TenantId == tenantId &&
                            n.Status == "Closed" &&
                            n.ClosedDate >= rangeStart &&
                            n.ClosedDate < rangeEndExclusive),
                        tenantId, loc, allowed).CountAsync();
                    var reported = await ApplyNcrSiteFilter(db,
                        db.NonConformanceReports.Where(n => n.TenantId == tenantId &&
                            n.ReportedDate >= rangeStart &&
                            n.ReportedDate < rangeEndExclusive),
                        tenantId, loc, allowed).CountAsync();
                    return (open, resolved, reported);
                });

                // Overdue shipments = unshipped (or under-shipped) lines past promised due date
                var overdueShipmentsTask = WithContextAsync(async db =>
                {
                    var activeOrderIds = ScopeCustomerOrders(
                            db.CustomerOrder.Where(co => co.Tenantid == tenantId &&
                                                         co.Status != "Cancelled" &&
                                                         co.Status != "Canceled" &&
                                                         co.Status != "Completed" &&
                                                         co.Status != "Shipped" &&
                                                         co.Status != "Fully Invoiced"),
                            loc, allowed)
                        .Select(co => co.OrderID);

                    var overdueDetailsQuery = db.CustomerOrderDetails
                        .Where(d => d.Tenantid == tenantId &&
                                    activeOrderIds.Contains(d.OrderID) &&
                                    d.DueDate < today);

                    var overdueDetails = await overdueDetailsQuery
                        .Select(d => new { d.ID, d.ShippedQty, d.QtyOrdered })
                        .ToListAsync();

                    // Shipping has no locationId; shipped qty lookup stays tenant-scoped (orders already location-filtered).
                    var shippedByDetail = await db.ShippingDetails
                        .Where(sd => sd.OrderDetailID.HasValue &&
                                     overdueDetailsQuery.Select(d => d.ID).Contains(sd.OrderDetailID.Value))
                        .Join(db.Shipping.Where(s => s.TenantId == tenantId),
                            sd => sd.ShipmentId,
                            s => s.Id,
                            (sd, s) => new { DetailId = sd.OrderDetailID!.Value, sd.ShippedQty })
                        .GroupBy(x => x.DetailId)
                        .Select(g => new { DetailId = g.Key, Qty = g.Sum(x => x.ShippedQty) })
                        .ToDictionaryAsync(x => x.DetailId, x => x.Qty);

                    return overdueDetails.Count(d =>
                    {
                        var shipped = shippedByDetail.TryGetValue(d.ID, out var qty) ? qty : d.ShippedQty;
                        return shipped < d.QtyOrdered;
                    });
                });

                var salesTask = WithContextAsync(async db =>
                {
                    var pendingCustomerOrders = await ScopeCustomerOrders(
                            db.CustomerOrder.Where(co => co.Tenantid == tenantId &&
                                                         co.Status != null &&
                                                         (co.Status == "Pending" || co.Status == "Draft")),
                            loc, allowed)
                        .CountAsync();

                    var quotationsQuery = db.QuotationOrder
                        .Where(q => q.Tenantid == tenantId &&
                                    q.OrderDate >= dateFilter.startDate &&
                                    q.OrderDate <= dateFilter.endDate);
                    if (loc.HasValue)
                    {
                        var locId = loc.Value;
                        quotationsQuery = quotationsQuery.Where(q => q.Locationid == locId);
                    }
                    else if (allowed != null)
                    {
                        var ids = allowed.ToList();
                        quotationsQuery = ids.Count == 0
                            ? quotationsQuery.Where(_ => false)
                            : quotationsQuery.Where(q => q.Locationid.HasValue && ids.Contains(q.Locationid.Value));
                    }
                    var quotations = await quotationsQuery.CountAsync();

                    var orders = await ScopeCustomerOrders(
                            db.CustomerOrder.Where(co => co.Tenantid == tenantId &&
                                                         co.OrderDate >= dateFilter.startDate &&
                                                         co.OrderDate <= dateFilter.endDate),
                            loc, allowed)
                        .CountAsync();
                    return (pendingCustomerOrders, quotations, orders);
                });

                await Task.WhenAll(jobCountsTask, jobPeriodTask, customerInvoiceTask, vendorTask,
                    cashFlowTask, qualityTask, overdueShipmentsTask, salesTask);

                var (activeJobOrders, jobsCompletedToday, jobsCompletedThisWeek) = await jobCountsTask;
                var (onTimeDeliveryRate, totalJobOrdersForDefect) = await jobPeriodTask;
                var (totalReceivables, revenueThisMonth) = await customerInvoiceTask;
                var (totalPayables, pendingVendorOrders) = await vendorTask;
                var (cashIn, cashOut) = await cashFlowTask;
                var (openNCRs, ncrResolvedThisWeek, totalNCRs) = await qualityTask;
                var overdueShipments = await overdueShipmentsTask;
                var (pendingCustomerOrders, quotationsThisMonth, ordersThisMonth) = await salesTask;

                var netCashFlow = cashIn - cashOut;
                var defectRate = totalJobOrdersForDefect > 0
                    ? (decimal)totalNCRs / totalJobOrdersForDefect * 100
                    : 0;
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

                _cache.Set(cacheKey, (object)metrics, MetricsCacheDuration);
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

        private async Task<T> WithContextAsync<T>(Func<CimmpleDbContext, Task<T>> work)
        {
            await using var db = new CimmpleDbContext(_dbOptions);
            return await work(db);
        }

        private static decimal OpenBalance(decimal total, decimal paidAmount, DateTime? paidOn)
        {
            var paid = paidAmount > 0 ? paidAmount : (paidOn.HasValue ? total : 0m);
            var balance = total - paid;
            return balance > 0.009m ? balance : 0m;
        }

        // JobOrderMaster has no locationId — scope via related CustomerOrder.locationId
        private static IQueryable<JobOrderMaster> ScopeJobOrders(
            CimmpleDbContext db, int tenantId, int? locationId, IReadOnlyList<int>? allowed)
        {
            var jobs = db.JobOrderMaster.Where(j => j.Tenantid == tenantId);
            if (locationId.HasValue)
            {
                var locId = locationId.Value;
                return jobs.Where(j => db.CustomerOrder.Any(co =>
                    co.OrderID == j.CustomerOrderID && co.locationId == locId));
            }
            if (allowed != null)
            {
                var ids = allowed.ToList();
                return ids.Count == 0
                    ? jobs.Where(_ => false)
                    : jobs.Where(j => db.CustomerOrder.Any(co =>
                        co.OrderID == j.CustomerOrderID && ids.Contains(co.locationId)));
            }
            return jobs;
        }

        // InvoiceMaster has no locationId; filter via InvoiceDetail -> CustomerOrder
        private static IQueryable<InvoiceMaster> ScopeCustomerInvoices(
            CimmpleDbContext db, IQueryable<InvoiceMaster> invoices, int tenantId, int? locationId, IReadOnlyList<int>? allowed)
        {
            if (locationId.HasValue)
            {
                var locId = locationId.Value;
                return invoices.Where(im => db.InvoiceDetail.Any(id =>
                    id.InvoiceId == im.Id &&
                    db.CustomerOrder.Any(co =>
                        co.OrderID == id.OrderId &&
                        co.Tenantid == tenantId &&
                        co.locationId == locId)));
            }
            if (allowed != null)
            {
                var ids = allowed.ToList();
                return ids.Count == 0
                    ? invoices.Where(_ => false)
                    : invoices.Where(im => db.InvoiceDetail.Any(id =>
                        id.InvoiceId == im.Id &&
                        db.CustomerOrder.Any(co =>
                            co.OrderID == id.OrderId &&
                            co.Tenantid == tenantId &&
                            ids.Contains(co.locationId))));
            }
            return invoices;
        }

        private static IQueryable<CustomerOrder> ScopeCustomerOrders(
            IQueryable<CustomerOrder> orders, int? locationId, IReadOnlyList<int>? allowed)
        {
            if (locationId.HasValue)
            {
                var locId = locationId.Value;
                return orders.Where(co => co.locationId == locId);
            }
            if (allowed != null)
            {
                var ids = allowed.ToList();
                return ids.Count == 0 ? orders.Where(_ => false) : orders.Where(co => ids.Contains(co.locationId));
            }
            return orders;
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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    jobOrdersQuery = allowed.Count == 0
                        ? jobOrdersQuery.Where(_ => false)
                        : jobOrdersQuery.Where(j =>
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == j.CustomerOrderID &&
                                allowed.Contains(co.locationId)));
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
                    .Where(j => j.DueDate < DateTime.Now.Date &&
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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                var days = period == "7days" ? 7 : period == "30days" ? 30 : 90;
                var startDate = DateTime.Now.AddDays(-days).Date;

                // Billed revenue: non-voided customer invoices by invoice date (aligned with Sales reports)
                var revenueQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               !im.IsVoided &&
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    revenueQuery = allowed.Count == 0
                        ? revenueQuery.Where(_ => false)
                        : revenueQuery.Where(im =>
                            _context.InvoiceDetail.Any(id =>
                                id.InvoiceId == im.Id &&
                                _context.CustomerOrder.Any(co =>
                                    co.OrderID == id.OrderId &&
                                    co.Tenantid == tenantId &&
                                    allowed.Contains(co.locationId))));
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

                // Billed expenses: non-voided vendor invoices by invoice date (match revenue basis)
                var expenseQuery = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 vim.voideddate == null &&
                                 vim.InvoiceDate >= startDate);
                if (filterLocationId.HasValue)
                    expenseQuery = expenseQuery.Where(vim => vim.locationId == filterLocationId.Value);
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    expenseQuery = allowed.Count == 0
                        ? expenseQuery.Where(_ => false)
                        : expenseQuery.Where(vim => allowed.Contains(vim.locationId));
                }

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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    recentJobOrdersQuery = allowed.Count == 0
                        ? recentJobOrdersQuery.Where(_ => false)
                        : recentJobOrdersQuery.Where(j =>
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == j.CustomerOrderID &&
                                allowed.Contains(co.locationId)));
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

                var recentShipmentsQuery = _context.Shipping.Where(s => s.TenantId == tenantId);
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    recentShipmentsQuery = recentShipmentsQuery.Where(s =>
                        _context.CustomerOrder.Any(o =>
                            o.OrderID == s.OrderId && o.Tenantid == tenantId && o.locationId == locId));
                }
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    recentShipmentsQuery = allowed.Count == 0
                        ? recentShipmentsQuery.Where(_ => false)
                        : recentShipmentsQuery.Where(s =>
                            _context.CustomerOrder.Any(o =>
                                o.OrderID == s.OrderId && o.Tenantid == tenantId && allowed.Contains(o.locationId)));
                }

                var recentShipments = recentShipmentsQuery
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    recentInvoicesQuery = allowed.Count == 0
                        ? recentInvoicesQuery.Where(_ => false)
                        : recentInvoicesQuery.Where(im =>
                            _context.InvoiceDetail.Any(id =>
                                id.InvoiceId == im.Id &&
                                _context.CustomerOrder.Any(co =>
                                    co.OrderID == id.OrderId &&
                                    co.Tenantid == tenantId &&
                                    allowed.Contains(co.locationId))));
                }

                var recentInvoices = recentInvoicesQuery
                    .OrderByDescending(im => im.createdDate)
                    .Take(limit / 4)
                    .Select(im => new
                    {
                        type = "invoice",
                        action = "generated",
                        description = $"Invoice {im.PrefixInvoiceNo}{im.InvoiceNo} generated",
                        timestamp = (DateTime?)(im.createdDate ?? im.InvoiceDate),
                        hasCreatedDate = im.createdDate != null,
                        entityId = im.Id,
                        entityType = "Invoice"
                    })
                    .ToList();

                var recentNCRs = ApplyNcrSiteFilter(
                    _context.NonConformanceReports.Where(n => n.TenantId == tenantId),
                    tenantId, filterLocationId, restrictToLocationIds)
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

                // Job order / invoice / NCR creation times are saved with server-local DateTime.Now; shipments
                // carry the user-picked ship date (no time). Emit UTC instants with "Z" and flag date-only rows
                // so the client does not render a calendar date as "Xh ago".
                static DateTime ServerLocalToUtc(DateTime value) =>
                    DateTime.SpecifyKind(DateTime.SpecifyKind(value, DateTimeKind.Local).ToUniversalTime(), DateTimeKind.Utc);

                var rows = new List<(string type, string action, string description, DateTime sortKey, bool isDateOnly, int entityId, string entityType)>();
                rows.AddRange(recentJobOrders.Select(a =>
                    (a.type, a.action, a.description, ServerLocalToUtc(a.timestamp), false, a.entityId, a.entityType)));
                rows.AddRange(recentShipments.Select(a =>
                    (a.type, a.action, a.description, DateTime.SpecifyKind(a.timestamp.Date, DateTimeKind.Utc), true, a.entityId, a.entityType)));
                rows.AddRange(recentInvoices
                    .Where(a => a.timestamp.HasValue)
                    .Select(a => a.hasCreatedDate
                        ? (a.type, a.action, a.description, ServerLocalToUtc(a.timestamp!.Value), false, a.entityId, a.entityType)
                        : (a.type, a.action, a.description, DateTime.SpecifyKind(a.timestamp!.Value.Date, DateTimeKind.Utc), true, a.entityId, a.entityType)));
                rows.AddRange(recentNCRs.Select(a =>
                    (a.type, a.action, a.description, ServerLocalToUtc(a.timestamp), false, a.entityId, a.entityType)));

                var sortedActivities = rows
                    .OrderByDescending(r => r.sortKey)
                    .Take(limit)
                    .Select(r => (object)new
                    {
                        type = r.type,
                        action = r.action,
                        description = r.description,
                        timestamp = r.isDateOnly ? r.sortKey.ToString("yyyy-MM-dd") : r.sortKey.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
                        isDateOnly = r.isDateOnly,
                        entityId = r.entityId,
                        entityType = r.entityType
                    })
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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
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
                               j.Status != "Void" &&
                               j.Status != "Shipped" &&
                               j.Status != "Partially Shipped");
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    overdueJobsQuery = overdueJobsQuery.Where(j =>
                        _context.CustomerOrder.Any(co =>
                            co.OrderID == j.CustomerOrderID &&
                            co.locationId == locId));
                }
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    overdueJobsQuery = allowed.Count == 0
                        ? overdueJobsQuery.Where(_ => false)
                        : overdueJobsQuery.Where(j =>
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == j.CustomerOrderID &&
                                allowed.Contains(co.locationId)));
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    overdueARQuery = allowed.Count == 0
                        ? overdueARQuery.Where(_ => false)
                        : overdueARQuery.Where(im =>
                            _context.InvoiceDetail.Any(id =>
                                id.InvoiceId == im.Id &&
                                _context.CustomerOrder.Any(co =>
                                    co.OrderID == id.OrderId &&
                                    co.Tenantid == tenantId &&
                                    allowed.Contains(co.locationId))));
                }

                var overdueAR = overdueARQuery
                    .Select(im => new
                    {
                        type = "overdue_invoice_ar",
                        priority = "high",
                        title = $"Overdue Invoice: {im.PrefixInvoiceNo}{im.InvoiceNo}",
                        description = $"Customer invoice was due on {im.DueDate:MM/dd/yyyy}",
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    overdueAPQuery = allowed.Count == 0
                        ? overdueAPQuery.Where(_ => false)
                        : overdueAPQuery.Where(vim => allowed.Contains(vim.locationId));
                }

                var overdueAP = overdueAPQuery
                    .Select(vim => new
                    {
                        type = "overdue_invoice_ap",
                        priority = "high",
                        title = $"Overdue Vendor Invoice: {vim.InvoiceNo}",
                        description = $"Vendor invoice from {vim.VendorName} was due on {vim.DueDate:MM/dd/yyyy}",
                        entityId = vim.Id,
                        entityType = "VendorInvoice",
                        amount = vim.TotalAmount,
                        dueDate = vim.DueDate
                    })
                    .Take(10)
                    .ToList();

                var criticalNCRs = ApplyNcrSiteFilter(
                    _context.NonConformanceReports.Where(n => n.TenantId == tenantId &&
                        n.Status != null &&
                        (n.Status == "Open" || n.Status == "Under_Investigation" || n.Status == "Pending_Approval") &&
                        n.CreatedDate < today.AddDays(-7)),
                    tenantId, filterLocationId, restrictToLocationIds)
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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                var dateFilter = GetDateRangeFilter("This Month");

                var topCustomersQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               !im.IsVoided &&
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    topCustomersQuery = allowed.Count == 0
                        ? topCustomersQuery.Where(_ => false)
                        : topCustomersQuery.Where(x => allowed.Contains(x.co.locationId));
                }

                var topCustomers = topCustomersQuery
                    .GroupBy(x => x.im.Id)
                    .Select(g => new
                    {
                        customerId = g.First().co.CustomerID,
                        customerName = g.First().co.CustomerName,
                        revenue = g.First().im.TotalAmount,
                        orderId = g.First().co.OrderID
                    })
                    .GroupBy(x => new { x.customerId, x.customerName })
                    .Select(g => new
                    {
                        customerId = g.Key.customerId,
                        customerName = g.Key.customerName ?? "Unknown",
                        revenue = g.Sum(x => x.revenue),
                        orderCount = g.Select(x => x.orderId).Distinct().Count()
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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    topProductsQuery = allowed.Count == 0
                        ? topProductsQuery.Where(_ => false)
                        : topProductsQuery.Where(j =>
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == j.CustomerOrderID &&
                                allowed.Contains(co.locationId)));
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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                var ncrByStatus = ApplyNcrSiteFilter(
                    _context.NonConformanceReports.Where(n => n.TenantId == tenantId && n.Status != null),
                    tenantId, filterLocationId, restrictToLocationIds)
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

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    jobDeadlinesQuery = allowed.Count == 0
                        ? jobDeadlinesQuery.Where(_ => false)
                        : jobDeadlinesQuery.Where(j =>
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == j.CustomerOrderID &&
                                allowed.Contains(co.locationId)));
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    invoiceDeadlinesQuery = allowed.Count == 0
                        ? invoiceDeadlinesQuery.Where(_ => false)
                        : invoiceDeadlinesQuery.Where(im =>
                            _context.InvoiceDetail.Any(id =>
                                id.InvoiceId == im.Id &&
                                _context.CustomerOrder.Any(co =>
                                    co.OrderID == id.OrderId &&
                                    co.Tenantid == tenantId &&
                                    allowed.Contains(co.locationId))));
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
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    vendorInvoiceDeadlinesQuery = allowed.Count == 0
                        ? vendorInvoiceDeadlinesQuery.Where(_ => false)
                        : vendorInvoiceDeadlinesQuery.Where(vim => allowed.Contains(vim.locationId));
                }

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

        private IQueryable<NonConformanceReport> ApplyNcrSiteFilter(
            IQueryable<NonConformanceReport> q,
            int tenantId,
            int? filterLocationId,
            IReadOnlyList<int>? restrictToLocationIds) =>
            ApplyNcrSiteFilter(_context, q, tenantId, filterLocationId, restrictToLocationIds);

        private static IQueryable<NonConformanceReport> ApplyNcrSiteFilter(
            CimmpleDbContext db,
            IQueryable<NonConformanceReport> q,
            int tenantId,
            int? filterLocationId,
            IReadOnlyList<int>? restrictToLocationIds)
        {
            if (filterLocationId is int loc)
            {
                return q.Where(n =>
                    (n.JobOrderId != null && n.JobOrderId > 0 &&
                     db.JobOrderMaster.Any(j =>
                         j.JobOrderID == n.JobOrderId && j.Tenantid == tenantId &&
                         db.CustomerOrder.Any(o =>
                             o.OrderID == j.CustomerOrderID &&
                             o.Tenantid == tenantId &&
                             o.locationId == loc))) ||
                    ((n.JobOrderId == null || n.JobOrderId <= 0) &&
                     db.UserDetails.Any(u =>
                         u.User_UniqueID == n.ReportedBy && u.TenantID == tenantId &&
                         ((u.DefaultLocationId != null && u.DefaultLocationId == loc) ||
                          db.UserMapping.Any(m =>
                              m.userId == u.User_UniqueID && m.locationId == loc)))));
            }

            if (restrictToLocationIds is { Count: > 0 } allowed)
            {
                return q.Where(n =>
                    (n.JobOrderId != null && n.JobOrderId > 0 &&
                     db.JobOrderMaster.Any(j =>
                         j.JobOrderID == n.JobOrderId && j.Tenantid == tenantId &&
                         db.CustomerOrder.Any(o =>
                             o.OrderID == j.CustomerOrderID &&
                             o.Tenantid == tenantId &&
                             allowed.Contains(o.locationId)))) ||
                    ((n.JobOrderId == null || n.JobOrderId <= 0) &&
                     db.UserDetails.Any(u =>
                         u.User_UniqueID == n.ReportedBy && u.TenantID == tenantId &&
                         ((u.DefaultLocationId != null && allowed.Contains(u.DefaultLocationId.Value)) ||
                          db.UserMapping.Any(m =>
                              m.userId == u.User_UniqueID && allowed.Contains(m.locationId))))));
            }

            if (restrictToLocationIds is { Count: 0 })
                return q.Where(_ => false);

            return q;
        }
    }
}
