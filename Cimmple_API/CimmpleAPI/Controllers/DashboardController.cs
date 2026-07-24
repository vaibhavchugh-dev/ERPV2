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
        public IActionResult GetMetrics([FromQuery] string dateRange = "This Month")
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
                var dateFilter = GetDateRangeFilter(dateRange);
                var today = DateTime.Now.Date;
                var weekStart = today.AddDays(-(int)today.DayOfWeek);

                // Production Metrics
                var activeJobOrders = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId && 
                               j.Status != null &&
                               (j.Status == "In Progress" || j.Status == "Pending" || j.Status == "Assigned"))
                    .Count();

                var jobsCompletedToday = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId && 
                               j.Status == "Completed" &&
                               j.ModifiedDate.HasValue &&
                               j.ModifiedDate.Value.Date == today)
                    .Count();

                var jobsCompletedThisWeek = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId && 
                               j.Status == "Completed" &&
                               j.ModifiedDate.HasValue &&
                               j.ModifiedDate.Value.Date >= weekStart)
                    .Count();

                var totalJobOrders = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId)
                    .Count();

                var completedJobOrders = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId && j.Status == "Completed")
                    .Count();

                var onTimeDeliveryRate = totalJobOrders > 0 
                    ? (decimal)completedJobOrders / totalJobOrders * 100 
                    : 0;

                // Financial Metrics (reuse from AccountingController logic)
                var totalReceivables = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               im.PaymentDate == null)
                    .Sum(im => (decimal?)im.TotalAmount) ?? 0;

                var totalPayables = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 (vim.isPaid != 1 && vim.Paydate == null))
                    .Sum(vim => (decimal?)vim.TotalAmount) ?? 0;

                var revenueThisMonth = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               im.PaymentDate != null &&
                               im.InvoiceDate >= dateFilter.startDate &&
                               im.InvoiceDate <= dateFilter.endDate)
                    .Sum(im => (decimal?)im.TotalAmount) ?? 0;

                var cashIn = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.isCustomer == 1 &&
                               t.TransactionType != null &&
                               t.TransactionType == "Payment" &&
                               t.TransactionDate != null &&
                               t.TransactionDate >= dateFilter.startDate &&
                               t.TransactionDate <= dateFilter.endDate)
                    .Sum(t => t.Amount ?? 0);

                var cashOut = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.isCustomer == 0 &&
                               t.TransactionType != null &&
                               t.TransactionType == "Payment" &&
                               t.TransactionDate != null &&
                               t.TransactionDate >= dateFilter.startDate &&
                               t.TransactionDate <= dateFilter.endDate)
                    .Sum(t => t.Amount ?? 0);

                var netCashFlow = cashIn - cashOut;

                // Quality Metrics
                var openNCRs = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId && 
                               (n.Status == "Open" || n.Status == "Under_Investigation" || n.Status == "Pending_Approval"))
                    .Count();

                var ncrResolvedThisWeek = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId && 
                               n.Status == "Closed" &&
                               n.ClosedDate != null &&
                               n.ClosedDate.Value.Date >= weekStart)
                    .Count();

                var totalNCRs = _context.NonConformanceReports
                    .Where(n => n.TenantId == tenantId)
                    .Count();

                var defectRate = totalJobOrders > 0 
                    ? (decimal)totalNCRs / totalJobOrders * 100 
                    : 0;

                // Operational Metrics
                var pendingCustomerOrders = _context.CustomerOrder
                    .Where(co => co.Tenantid == tenantId && 
                               co.Status != null &&
                               (co.Status == "Pending" || co.Status == "Draft"))
                    .Count();

                var pendingVendorOrders = _context.VendorOrders
                    .Where(vo => vo.Tenantid == tenantId && 
                               vo.Status != null &&
                               (vo.Status == "Pending" || vo.Status == "Draft"))
                    .Count();

                var overdueShipments = _context.Shipping
                    .Where(s => s.TenantId == tenantId && 
                               s.ShipmentDate != null &&
                               s.ShipmentDate.Date < today)
                    .Count();

                // Sales Metrics
                var quotationsThisMonth = _context.QuotationOrder
                    .Where(q => q.Tenantid == tenantId &&
                               q.OrderDate >= dateFilter.startDate &&
                               q.OrderDate <= dateFilter.endDate)
                    .Count();

                var ordersThisMonth = _context.CustomerOrder
                    .Where(co => co.Tenantid == tenantId &&
                               co.OrderDate >= dateFilter.startDate &&
                               co.OrderDate <= dateFilter.endDate)
                    .Count();

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
        public IActionResult GetProductionStatus([FromQuery] string period = "This Week")
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
                var dateFilter = GetDateRangeFilter(period);

                var jobOrdersByStatus = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId &&
                               j.OrderDate >= dateFilter.startDate &&
                               j.OrderDate <= dateFilter.endDate)
                    .GroupBy(j => j.Status ?? "Unknown")
                    .Select(g => new
                    {
                        status = g.Key,
                        count = g.Count()
                    })
                    .ToList();

                var overdueJobs = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId &&
                               j.DueDate < DateTime.Now &&
                               j.Status != null &&
                               j.Status != "Completed")
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
        public IActionResult GetRevenueTrends([FromQuery] string period = "30days")
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
                var days = period == "7days" ? 7 : period == "30days" ? 30 : 90;
                var startDate = DateTime.Now.AddDays(-days).Date;

                var revenueData = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               im.PaymentDate != null &&
                               im.InvoiceDate >= startDate)
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

                var expenseData = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 (vim.isPaid == 1 || vim.Paydate != null) &&
                                 vim.InvoiceDate >= startDate)
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
        public IActionResult GetRecentActivities([FromQuery] int limit = 20)
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
                var activities = new List<object>();

                // Recent Job Orders
                var recentJobOrders = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId)
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

                // Recent Shipments
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

                // Recent Invoices
                var recentInvoices = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId)
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

                // Recent NCRs
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
        public IActionResult GetAlerts()
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
                var today = DateTime.Now.Date;
                var alerts = new List<object>();

                // Overdue Job Orders
                var overdueJobs = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId &&
                               j.DueDate < today &&
                               j.Status != null &&
                               j.Status != "Completed")
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

                // Overdue Invoices (AR)
                var overdueAR = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               im.DueDate < today &&
                               im.PaymentDate == null)
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
                var overdueAP = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 vim.DueDate < today &&
                                 (vim.isPaid != 1 && vim.Paydate == null))
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

                // Open NCRs requiring attention
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
        public IActionResult GetTopCustomers([FromQuery] int limit = 5)
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
                var dateFilter = GetDateRangeFilter("This Month");

                var topCustomers = _context.InvoiceMaster
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
                          (x, co) => new { x.im, co })
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
        public IActionResult GetTopProducts([FromQuery] int limit = 5)
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
                var dateFilter = GetDateRangeFilter("This Month");

                var topProducts = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId &&
                               j.OrderDate >= dateFilter.startDate &&
                               j.OrderDate <= dateFilter.endDate)
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
        public IActionResult GetQualityStatus()
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
        public IActionResult GetUpcomingDeadlines([FromQuery] int days = 7)
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
                var endDate = DateTime.Now.AddDays(days).Date;
                var today = DateTime.Now.Date;

                var deadlines = new List<object>();

                // Job Order due dates
                var jobDeadlines = _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId &&
                               j.DueDate >= today &&
                               j.DueDate <= endDate &&
                               j.Status != null &&
                               j.Status != "Completed")
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

                // Invoice due dates (AR)
                var invoiceDeadlines = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                               im.DueDate >= today &&
                               im.DueDate <= endDate &&
                               im.PaymentDate == null)
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
                var vendorInvoiceDeadlines = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 vim.DueDate >= today &&
                                 vim.DueDate <= endDate &&
                                 (vim.isPaid != 1 && vim.Paydate == null))
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

