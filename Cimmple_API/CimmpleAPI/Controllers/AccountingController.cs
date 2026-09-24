using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Services;
using CimmpleAPI.Services.Pdf;
using CimmpleAPI.Utilities;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AccountingController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly DocumentPdfService _documentPdfService;
        private readonly IConfiguration _configuration;
        private readonly EmailOutboxService _emailOutbox;

        public AccountingController(
            CimmpleDbContext context,
            DocumentPdfService documentPdfService,
            IConfiguration configuration,
            EmailOutboxService emailOutbox)
        {
            _context = context;
            _documentPdfService = documentPdfService;
            _configuration = configuration;
            _emailOutbox = emailOutbox;
        }

        [HttpGet("GetPaymentDashboardMetrics")]
        public IActionResult GetPaymentDashboardMetrics(
            [FromQuery] string dateRange = "All",
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                Console.WriteLine($"GetPaymentDashboardMetrics called - TenantId: {tenantId}, DateRange: {dateRange}, LocationId: {filterLocationId}");

                var dateFilter = GetDateRangeFilter(dateRange);

                // Calculate Accounts Receivable metrics
                var arMetrics = CalculateAccountsReceivableMetrics(tenantId, dateFilter, filterLocationId, restrictToLocationIds);

                // Calculate Accounts Payable metrics
                var apMetrics = CalculateAccountsPayableMetrics(tenantId, dateFilter, filterLocationId, restrictToLocationIds);

                // Calculate Cash Flow metrics
                var cashFlowMetrics = CashFlowMetricsCalculator.Calculate(_context, tenantId, dateFilter, filterLocationId, restrictToLocationIds);

                var dashboardData = new
                {
                    // AR Section
                    totalReceivables = arMetrics.totalReceivables,
                    overdueReceivables = arMetrics.overdueReceivables,
                    receivablesDueThisWeek = arMetrics.receivablesDueThisWeek,

                    // AP Section
                    totalPayables = apMetrics.totalPayables,
                    overduePayables = apMetrics.overduePayables,
                    payablesDueThisWeek = apMetrics.payablesDueThisWeek,

                    // Cash Flow Section
                    cashIn = cashFlowMetrics.cashIn,
                    cashOut = cashFlowMetrics.cashOut,
                    netCashFlow = cashFlowMetrics.cashIn - cashFlowMetrics.cashOut
                };

                return Ok(new { result = dashboardData });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetPaymentDashboardMetrics: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetRecentTransactions")]
        public IActionResult GetRecentTransactions(
            [FromQuery] int limit = 10,
            [FromQuery] string dateRange = "All",
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid, out var restrictToLocationIds))
                    return forbid!;

                Console.WriteLine($"GetRecentTransactions called - TenantId: {tenantId}, Limit: {limit}, DateRange: {dateRange}, LocationId: {filterLocationId}");
                var safeLimit = Math.Clamp(limit, 1, 200);
                var dateFilter = GetDateRangeFilter(dateRange);
                var rangeStart = dateFilter.startDate.Date;
                var rangeEnd = dateFilter.endDate.Date.AddDays(1).AddTicks(-1);

                // Get recent transactions from multiple sources
                var recentTransactions = new List<dynamic>();

                var allCustomerInvoiceNos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var locationCustomerInvoiceNos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var allVendorInvoiceNos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                var locationVendorInvoiceNos = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                List<int>? scopeLocations = null;
                if (filterLocationId.HasValue)
                    scopeLocations = new List<int> { filterLocationId.Value };
                else if (restrictToLocationIds != null)
                    scopeLocations = restrictToLocationIds.ToList();

                if (scopeLocations != null)
                {
                    var allowed = scopeLocations;
                    var customerInvoices = _context.InvoiceMaster
                        .Where(im => im.TenantId == tenantId)
                        .Select(im => new
                        {
                            im.Id,
                            im.InvoiceNo,
                            im.PrefixInvoiceNo,
                            AtLocation = allowed.Count > 0 && _context.InvoiceDetail.Any(id =>
                                id.InvoiceId == im.Id &&
                                _context.CustomerOrder.Any(co =>
                                    co.OrderID == id.OrderId &&
                                    co.Tenantid == tenantId &&
                                    allowed.Contains(co.locationId)))
                        })
                        .ToList();
                    foreach (var invoice in customerInvoices)
                    {
                        allCustomerInvoiceNos.Add(invoice.InvoiceNo.ToString());
                        if (!string.IsNullOrWhiteSpace(invoice.PrefixInvoiceNo))
                            allCustomerInvoiceNos.Add(invoice.PrefixInvoiceNo.Trim());
                        if (invoice.AtLocation)
                        {
                            locationCustomerInvoiceNos.Add(invoice.InvoiceNo.ToString());
                            if (!string.IsNullOrWhiteSpace(invoice.PrefixInvoiceNo))
                                locationCustomerInvoiceNos.Add(invoice.PrefixInvoiceNo.Trim());
                        }
                    }

                    var vendorInvoices = _context.VendorInvoiceMaster
                        .Where(vim => vim.TenantId == tenantId)
                        .Select(vim => new { vim.InvoiceNo, vim.prefixinvoiceno, vim.locationId })
                        .ToList();
                    foreach (var invoice in vendorInvoices)
                    {
                        if (!string.IsNullOrWhiteSpace(invoice.InvoiceNo))
                            allVendorInvoiceNos.Add(invoice.InvoiceNo.Trim());
                        if (!string.IsNullOrWhiteSpace(invoice.prefixinvoiceno))
                            allVendorInvoiceNos.Add(invoice.prefixinvoiceno.Trim());
                        if (allowed.Contains(invoice.locationId))
                        {
                            if (!string.IsNullOrWhiteSpace(invoice.InvoiceNo))
                                locationVendorInvoiceNos.Add(invoice.InvoiceNo.Trim());
                            if (!string.IsNullOrWhiteSpace(invoice.prefixinvoiceno))
                                locationVendorInvoiceNos.Add(invoice.prefixinvoiceno.Trim());
                        }
                    }
                }

                bool PaymentMatchesLocation(Transactions transaction, bool customer)
                {
                    if (scopeLocations == null)
                        return true;

                    var invoiceNo = transaction.invoiceNo?.Trim() ?? "";
                    var selected = customer ? locationCustomerInvoiceNos : locationVendorInvoiceNos;
                    var all = customer ? allCustomerInvoiceNos : allVendorInvoiceNos;
                    if (selected.Contains(invoiceNo))
                        return true;
                    if (all.Contains(invoiceNo))
                        return false;
                    return scopeLocations.Contains(transaction.locationId);
                }

                // 1. Recent customer payments (from Transactions table)
                var customerPaymentsQuery = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                                t.isCustomer == 1 &&
                                t.TransactionType != null &&
                                EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                t.TransactionDate >= rangeStart &&
                                t.TransactionDate <= rangeEnd);

                var customerPayments = customerPaymentsQuery
                    .OrderByDescending(t => t.TransactionDate)
                    .ThenByDescending(t => t.TransactionID)
                    .AsEnumerable()
                    .Where(t => PaymentMatchesLocation(t, true))
                    .Take(safeLimit)
                    .Select(t => new
                    {
                        id = t.TransactionID,
                        type = "payment" as string,
                        description = $"Payment received from {t.Description}",
                        amount = t.Amount ?? 0,
                        date = t.TransactionDate,
                        status = "completed" as string,
                        customerVendor = t.Description ?? "Customer"
                    })
                    .ToList();

                recentTransactions.AddRange(customerPayments);

                // Legacy fully paid customer invoices may predate Transactions rows.
                var customerInvoiceFallbackQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                                 !im.IsVoided &&
                                 im.PaymentDate != null &&
                                 im.PaymentDate >= rangeStart &&
                                 im.PaymentDate <= rangeEnd &&
                                 !_context.Transactions.Any(t =>
                                     t.TenantId == tenantId &&
                                     t.isCustomer == 1 &&
                                     t.TransactionType != null &&
                                     EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                     (t.invoiceNo == im.PrefixInvoiceNo ||
                                      t.invoiceNo == im.InvoiceNo.ToString())));
                if (filterLocationId.HasValue)
                {
                    var locId = filterLocationId.Value;
                    customerInvoiceFallbackQuery = customerInvoiceFallbackQuery.Where(im =>
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
                    customerInvoiceFallbackQuery = allowed.Count == 0
                        ? customerInvoiceFallbackQuery.Where(_ => false)
                        : customerInvoiceFallbackQuery.Where(im =>
                            _context.InvoiceDetail.Any(id =>
                                id.InvoiceId == im.Id &&
                                _context.CustomerOrder.Any(co =>
                                    co.OrderID == id.OrderId &&
                                    co.Tenantid == tenantId &&
                                    allowed.Contains(co.locationId))));
                }

                var customerInvoiceFallbackPayments = customerInvoiceFallbackQuery
                    .OrderByDescending(im => im.PaymentDate)
                    .ThenByDescending(im => im.Id)
                    .Take(safeLimit)
                    .Select(im => new
                    {
                        id = im.Id,
                        type = "payment" as string,
                        description = $"Payment received for invoice {im.PrefixInvoiceNo ?? im.InvoiceNo.ToString()}",
                        amount = im.PaidAmount > 0 ? im.PaidAmount : im.TotalAmount,
                        date = im.PaymentDate,
                        status = "completed" as string,
                        customerVendor = "Customer" as string
                    })
                    .ToList();
                recentTransactions.AddRange(customerInvoiceFallbackPayments);

                // 2. Recent vendor payments (from Transactions table)
                var vendorPaymentsQuery = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                                (t.isCustomer == 0 || t.isCustomer == null) &&
                                t.TransactionType != null &&
                                EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                t.TransactionDate >= rangeStart &&
                                t.TransactionDate <= rangeEnd);

                var vendorPayments = vendorPaymentsQuery
                    .OrderByDescending(t => t.TransactionDate)
                    .ThenByDescending(t => t.TransactionID)
                    .AsEnumerable()
                    .Where(t => PaymentMatchesLocation(t, false))
                    .Take(safeLimit)
                    .Select(t => new
                    {
                        id = t.TransactionID,
                        type = "payment" as string,
                        description = $"Payment made to {t.Description}",
                        amount = -(t.Amount ?? 0), // Negative for payments out
                        date = t.TransactionDate,
                        status = "completed" as string,
                        customerVendor = t.Description ?? "Vendor"
                    })
                    .ToList();

                recentTransactions.AddRange(vendorPayments);

                // 2b. Fallback vendor payments from invoice table (for historical rows without Transactions entries)
                var vendorInvoiceFallbackQuery = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                  vim.isPaid == 1 &&
                                  vim.Paydate != null &&
                                  vim.Paydate >= rangeStart &&
                                  vim.Paydate <= rangeEnd &&
                                  !_context.Transactions.Any(t =>
                                      t.TenantId == tenantId &&
                                      (t.isCustomer == 0 || t.isCustomer == null) &&
                                      t.TransactionType != null &&
                                      EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                      (t.invoiceNo == vim.prefixinvoiceno ||
                                       t.invoiceNo == vim.InvoiceNo)));
                if (filterLocationId.HasValue)
                    vendorInvoiceFallbackQuery = vendorInvoiceFallbackQuery.Where(vim => vim.locationId == filterLocationId.Value);
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    vendorInvoiceFallbackQuery = allowed.Count == 0
                        ? vendorInvoiceFallbackQuery.Where(_ => false)
                        : vendorInvoiceFallbackQuery.Where(vim => allowed.Contains(vim.locationId));
                }

                var vendorInvoiceFallbackPayments = vendorInvoiceFallbackQuery
                    .OrderByDescending(vim => vim.Paydate)
                    .ThenByDescending(vim => vim.Id)
                    .Take(safeLimit)
                    .AsEnumerable()
                    .Select(vim => new
                    {
                        id = vim.Id,
                        type = "payment" as string,
                        description = $"Payment made to {(string.IsNullOrWhiteSpace(vim.VendorName) ? "Vendor" : vim.VendorName)} for invoice {vim.prefixinvoiceno ?? vim.InvoiceNo}",
                        amount = -(vim.PaidAmount > 0 ? vim.PaidAmount : vim.TotalAmount),
                        date = vim.Paydate,
                        status = "completed" as string,
                        customerVendor = string.IsNullOrWhiteSpace(vim.VendorName) ? "Vendor" : vim.VendorName
                    })
                    .ToList();

                recentTransactions.AddRange(vendorInvoiceFallbackPayments);

                var today = DateTime.Now.Date;
                // 3. Recent open invoices (skip paid/voided so amounts are not duplicated with payments)
                var recentInvoicesQuery = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                                 !im.IsVoided &&
                                 im.PaymentDate == null &&
                                 im.InvoiceDate >= rangeStart &&
                                 im.InvoiceDate <= rangeEnd);
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
                    .OrderByDescending(im => im.InvoiceDate)
                    .ThenByDescending(im => im.Id)
                    .Take(safeLimit)
                    .AsEnumerable()
                    .Select(im =>
                    {
                        var paid = im.PaidAmount > 0 ? im.PaidAmount : 0m;
                        var balance = im.TotalAmount - paid;
                        if (balance <= 0.009m) return null;
                        return new
                        {
                            id = im.Id,
                            type = "invoice" as string,
                            description = $"Invoice {im.PrefixInvoiceNo ?? im.InvoiceNo.ToString()} created",
                            amount = balance,
                            date = (DateTime?)im.InvoiceDate,
                            status = (im.DueDate.Date < today ? "overdue" : "pending") as string,
                            customerVendor = "Customer" as string
                        };
                    })
                    .Where(x => x != null)
                    .ToList();

                recentTransactions.AddRange(recentInvoices!);

                // 4. Recent open vendor invoices (skip paid/voided so amounts are not duplicated with payments)
                var recentVendorInvoicesQuery = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                  vim.voideddate == null &&
                                  vim.isPaid != 1 &&
                                  vim.isPaid != 2 &&
                                  vim.InvoiceDate >= rangeStart &&
                                  vim.InvoiceDate <= rangeEnd);

                if (filterLocationId.HasValue)
                {
                    recentVendorInvoicesQuery = recentVendorInvoicesQuery
                        .Where(vim => vim.locationId == filterLocationId.Value);
                }
                else if (restrictToLocationIds != null)
                {
                    var allowed = restrictToLocationIds.ToList();
                    recentVendorInvoicesQuery = allowed.Count == 0
                        ? recentVendorInvoicesQuery.Where(_ => false)
                        : recentVendorInvoicesQuery.Where(vim => allowed.Contains(vim.locationId));
                }

                var recentVendorInvoices = recentVendorInvoicesQuery
                    .OrderByDescending(vim => vim.InvoiceDate)
                    .ThenByDescending(vim => vim.Id)
                    .Take(safeLimit)
                    .AsEnumerable()
                    .Select(vim =>
                    {
                        var paid = vim.PaidAmount > 0
                            ? vim.PaidAmount
                            : (vim.Paydate.HasValue ? vim.TotalAmount : 0m);
                        var balance = vim.TotalAmount - paid;
                        if (balance <= 0.009m) return null;
                        return new
                        {
                            id = vim.Id,
                            type = "invoice" as string,
                            description = $"Vendor Invoice {vim.prefixinvoiceno ?? vim.InvoiceNo} created",
                            amount = -balance,
                            date = (DateTime?)vim.InvoiceDate,
                            status = (vim.DueDate.Date < today ? "overdue" : "pending") as string,
                            customerVendor = string.IsNullOrWhiteSpace(vim.VendorName) ? "Vendor" : vim.VendorName
                        };
                    })
                    .Where(x => x != null)
                    .ToList();

                recentTransactions.AddRange(recentVendorInvoices!);

                // Sort all transactions by date and take the most recent ones
                var sortedTransactions = recentTransactions
                    .OrderByDescending(t => t.date)
                    .ThenByDescending(t => t.id)
                    .Take(safeLimit)
                    .ToList();

                return Ok(new { result = sortedTransactions });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetRecentTransactions: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetBankTransactions")]
        public IActionResult GetBankTransactions(
            [FromQuery] int bankAccountId,
            [FromQuery] string? startDate = null,
            [FromQuery] string? endDate = null)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();

                // Backfill already runs on GetBanklist; skip duplicate work on txn reload.
                // (Still runs if list was cached / skipped and force is needed elsewhere.)

                // Include Payment (AR/AP cash), plus legacy Deposit / Withdrawal rows.
                // Same type set as Book Balance (BankController.GetBanklist).
                var bankTypeSet = new[] { "Payment", "Deposit", "Withdrawal" };
                var query = _context.Transactions
                    .AsNoTracking()
                    .Where(t => t.TenantId == tenantId &&
                                t.BankId == bankAccountId &&
                                t.TransactionType != null &&
                                bankTypeSet.Contains(t.TransactionType));

                // Optional date window. When both omitted, include every row (incl. null dates)
                // to match all-time Book Balance. A very wide window (All Dates UI) also
                // includes null TransactionDate rows.
                var hasStart = !string.IsNullOrWhiteSpace(startDate);
                var hasEnd = !string.IsNullOrWhiteSpace(endDate);
                if (hasStart || hasEnd)
                {
                    if (!DateTime.TryParse(hasStart ? startDate : "1900-01-01", out var startParsed) ||
                        !DateTime.TryParse(hasEnd ? endDate : "2099-12-31", out var endParsed))
                    {
                        return BadRequest(new { error = "Invalid startDate or endDate" });
                    }

                    var start = startParsed.Date;
                    var end = endParsed.Date.AddDays(1).AddTicks(-1);
                    var isAllDatesWindow = start.Year <= 1900 && endParsed.Year >= 2099;

                    if (isAllDatesWindow)
                    {
                        query = query.Where(t =>
                            t.TransactionDate == null ||
                            (t.TransactionDate >= start && t.TransactionDate <= end));
                    }
                    else
                    {
                        query = query.Where(t =>
                            t.TransactionDate != null &&
                            t.TransactionDate >= start &&
                            t.TransactionDate <= end);
                    }
                }

                var raw = query
                    .OrderByDescending(t => t.TransactionDate)
                    .ThenByDescending(t => t.TransactionID)
                    .Select(t => new
                    {
                        t.TransactionID,
                        t.TransactionDate,
                        t.Description,
                        t.TransactionType,
                        t.Amount,
                        t.isCustomer,
                        t.IsReconciled,
                        t.CheckNo,
                        t.invoiceNo
                    })
                    .ToList();

                var rows = raw.Select(t =>
                {
                    var amount = t.Amount ?? 0;
                    var (signed, isCredit) = AccountingRules.MapBankTransactionSign(
                        amount, t.isCustomer, t.TransactionType);
                    return new
                    {
                        id = t.TransactionID,
                        date = t.TransactionDate.HasValue ? t.TransactionDate.Value.ToString("yyyy-MM-dd") : "",
                        description = t.Description ?? t.TransactionType ?? "Transaction",
                        amount = signed,
                        type = isCredit ? "credit" : "debit",
                        reconciled = t.IsReconciled,
                        reference = t.CheckNo ?? t.invoiceNo ?? ""
                    };
                }).ToList();

                return Ok(new { result = rows });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetBankTransactions: {ex}");
                return StatusCode(500, new { error = ex.InnerException?.Message ?? ex.Message });
            }
        }

        [HttpPost("ReconcileBankTransaction")]
        public IActionResult ReconcileBankTransaction([FromBody] ReconciliationRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                Console.WriteLine($"ReconcileBankTransaction called - TenantId: {tenantId}, TransactionId: {request.TransactionId}, Reconciled: {request.Reconciled}");

                var txn = _context.Transactions
                    .FirstOrDefault(t => t.TransactionID == request.TransactionId && t.TenantId == tenantId);
                if (txn == null)
                    return NotFound(new { error = "Transaction not found" });

                if (txn.TransactionDate.HasValue &&
                    GlWorkflowService.IsDateInLockedPeriod(_context, tenantId, txn.TransactionDate.Value))
                {
                    var pk = GlWorkflowService.PeriodKeyFromDate(txn.TransactionDate.Value);
                    return Conflict(new
                    {
                        error = $"Accounting period {pk} is closed. Reopen that period on Period Close & Audit before changing bank reconciliation."
                    });
                }

                txn.IsReconciled = request.Reconciled;
                txn.ReconciledUtc = request.Reconciled ? DateTime.UtcNow : null;

                _context.SaveChanges();
                return Ok(new { result = new { message = "Transaction reconciliation updated successfully", reconciled = txn.IsReconciled } });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in ReconcileBankTransaction: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("BulkReconcileTransactions")]
        public IActionResult BulkReconcileTransactions([FromBody] BulkReconciliationRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();

                if (request?.TransactionIds == null || request.TransactionIds.Length == 0)
                    return BadRequest(new { error = "No transaction ids provided" });

                var txns = _context.Transactions
                    .Where(t => t.TenantId == tenantId && request.TransactionIds.Contains(t.TransactionID))
                    .ToList();

                var locked = txns
                    .Where(t => t.TransactionDate.HasValue &&
                                GlWorkflowService.IsDateInLockedPeriod(_context, tenantId, t.TransactionDate.Value))
                    .Select(t => GlWorkflowService.PeriodKeyFromDate(t.TransactionDate!.Value))
                    .Distinct()
                    .ToList();
                if (locked.Count > 0)
                {
                    return Conflict(new
                    {
                        error = $"Accounting period(s) {string.Join(", ", locked)} are closed. Reopen on Period Close & Audit before clearing those transactions."
                    });
                }

                var now = DateTime.UtcNow;
                foreach (var txn in txns)
                {
                    txn.IsReconciled = true;
                    txn.ReconciledUtc = now;
                }

                _context.SaveChanges();
                return Ok(new { result = new { message = $"{txns.Count} transactions reconciled", count = txns.Count } });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in BulkReconcileTransactions: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetBankReconciliationContext")]
        public IActionResult GetBankReconciliationContext([FromQuery] int bankId)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                if (bankId <= 0)
                    return BadRequest(new { error = "bankId is required" });

                var bank = _context.BankMaster.AsNoTracking()
                    .FirstOrDefault(b => b.Id == bankId && b.TenantId == tenantId);
                if (bank == null)
                    return NotFound(new { error = "Bank account not found" });

                var periods = _context.BankReconciliationPeriods
                    .AsNoTracking()
                    .Where(p => p.TenantId == tenantId && p.BankId == bankId)
                    .OrderByDescending(p => p.StatementDate)
                    .ThenByDescending(p => p.Id)
                    .Take(24)
                    .ToList();

                var open = periods.FirstOrDefault(p =>
                    string.Equals(p.Status, "Open", StringComparison.OrdinalIgnoreCase));
                var lastCompleted = periods
                    .Where(p => string.Equals(p.Status, "Completed", StringComparison.OrdinalIgnoreCase))
                    .OrderByDescending(p => p.StatementDate)
                    .ThenByDescending(p => p.Id)
                    .FirstOrDefault();

                var beginningBalance = lastCompleted?.EndingBalance ?? bank.Balance;
                decimal? clearedBalance = null;
                decimal? difference = null;
                decimal? clearedCredits = null;
                decimal? clearedDebits = null;
                if (open != null)
                {
                    var cleared = ComputePeriodCleared(tenantId, bankId, open.StatementDate.Date, open.BeginningBalance);
                    clearedBalance = cleared.ClearedBalance;
                    clearedCredits = cleared.ClearedCredits;
                    clearedDebits = cleared.ClearedDebits;
                    // Statement ending − cleared balance (0 when reconciled)
                    difference = open.EndingBalance - cleared.ClearedBalance;
                }

                return Ok(new
                {
                    result = new
                    {
                        bankId,
                        bankOpeningBalance = bank.Balance,
                        suggestedBeginningBalance = beginningBalance,
                        lastReconciledDate = bank.LastReconciledDate.HasValue
                            ? bank.LastReconciledDate.Value.ToString("yyyy-MM-dd")
                            : (string?)null,
                        openPeriod = open == null
                            ? null
                            : MapPeriodDto(open, clearedBalance, difference, clearedCredits, clearedDebits),
                        lastCompletedPeriod = lastCompleted == null
                            ? null
                            : MapPeriodDto(lastCompleted, lastCompleted.ClearedBalance, null, null, null),
                        periods = periods.Select(p => MapPeriodDto(
                            p,
                            p.Id == open?.Id ? clearedBalance : p.ClearedBalance,
                            p.Id == open?.Id ? difference : null,
                            p.Id == open?.Id ? clearedCredits : null,
                            p.Id == open?.Id ? clearedDebits : null)).ToList()
                    }
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetBankReconciliationContext: {ex}");
                return StatusCode(500, new { error = ex.InnerException?.Message ?? ex.Message });
            }
        }

        [HttpPost("StartBankReconciliationPeriod")]
        public IActionResult StartBankReconciliationPeriod([FromBody] StartBankReconciliationPeriodRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                if (request == null || request.BankId <= 0)
                    return BadRequest(new { error = "bankId is required" });
                if (!DateTime.TryParse(request.StatementDate, out var statementDate))
                    return BadRequest(new { error = "Valid statementDate is required" });

                if (GlWorkflowService.IsDateInLockedPeriod(_context, tenantId, statementDate))
                {
                    var pk = GlWorkflowService.PeriodKeyFromDate(statementDate);
                    return Conflict(new
                    {
                        error = $"Accounting period {pk} is closed. Reopen that period on Period Close & Audit before starting bank reconciliation."
                    });
                }

                var bank = _context.BankMaster.FirstOrDefault(b => b.Id == request.BankId && b.TenantId == tenantId);
                if (bank == null)
                    return NotFound(new { error = "Bank account not found" });

                var hasOpen = _context.BankReconciliationPeriods.Any(p =>
                    p.TenantId == tenantId &&
                    p.BankId == request.BankId &&
                    p.Status == "Open");
                if (hasOpen)
                    return BadRequest(new { error = "An open reconciliation period already exists for this bank. Complete it first." });

                var lastCompleted = _context.BankReconciliationPeriods
                    .Where(p => p.TenantId == tenantId && p.BankId == request.BankId && p.Status == "Completed")
                    .OrderByDescending(p => p.StatementDate)
                    .ThenByDescending(p => p.Id)
                    .FirstOrDefault();

                var beginning = lastCompleted?.EndingBalance ?? bank.Balance;
                var period = new BankReconciliationPeriod
                {
                    TenantId = tenantId,
                    BankId = request.BankId,
                    BeginningBalance = beginning,
                    EndingBalance = request.EndingBalance,
                    StatementDate = statementDate.Date,
                    Status = "Open",
                    CreatedUtc = DateTime.UtcNow
                };
                _context.BankReconciliationPeriods.Add(period);
                _context.SaveChanges();

                var cleared = ComputePeriodCleared(tenantId, request.BankId, period.StatementDate.Date, period.BeginningBalance);
                return Ok(new
                {
                    result = MapPeriodDto(
                        period,
                        cleared.ClearedBalance,
                        period.EndingBalance - cleared.ClearedBalance,
                        cleared.ClearedCredits,
                        cleared.ClearedDebits)
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in StartBankReconciliationPeriod: {ex}");
                return StatusCode(500, new { error = ex.InnerException?.Message ?? ex.Message });
            }
        }

        [HttpPost("UpdateBankReconciliationPeriod")]
        public IActionResult UpdateBankReconciliationPeriod([FromBody] UpdateBankReconciliationPeriodRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                if (request == null || request.PeriodId <= 0)
                    return BadRequest(new { error = "periodId is required" });

                var period = _context.BankReconciliationPeriods
                    .FirstOrDefault(p => p.Id == request.PeriodId && p.TenantId == tenantId);
                if (period == null)
                    return NotFound(new { error = "Reconciliation period not found" });
                if (!string.Equals(period.Status, "Open", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "Only an open period can be updated" });

                if (!string.IsNullOrWhiteSpace(request.StatementDate))
                {
                    if (!DateTime.TryParse(request.StatementDate, out var statementDate))
                        return BadRequest(new { error = "Valid statementDate is required" });
                    if (GlWorkflowService.IsDateInLockedPeriod(_context, tenantId, statementDate))
                    {
                        var pk = GlWorkflowService.PeriodKeyFromDate(statementDate);
                        return Conflict(new
                        {
                            error = $"Accounting period {pk} is closed. Reopen that period on Period Close & Audit before updating the statement date."
                        });
                    }
                    period.StatementDate = statementDate.Date;
                }

                if (request.EndingBalance.HasValue)
                    period.EndingBalance = request.EndingBalance.Value;

                if (GlWorkflowService.IsDateInLockedPeriod(_context, tenantId, period.StatementDate))
                {
                    var pk = GlWorkflowService.PeriodKeyFromDate(period.StatementDate);
                    return Conflict(new
                    {
                        error = $"Accounting period {pk} is closed. Reopen that period on Period Close & Audit before changing this reconciliation."
                    });
                }

                _context.SaveChanges();

                var cleared = ComputePeriodCleared(tenantId, period.BankId, period.StatementDate.Date, period.BeginningBalance);
                return Ok(new
                {
                    result = MapPeriodDto(
                        period,
                        cleared.ClearedBalance,
                        period.EndingBalance - cleared.ClearedBalance,
                        cleared.ClearedCredits,
                        cleared.ClearedDebits)
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in UpdateBankReconciliationPeriod: {ex}");
                return StatusCode(500, new { error = ex.InnerException?.Message ?? ex.Message });
            }
        }

        [HttpPost("CompleteBankReconciliationPeriod")]
        public IActionResult CompleteBankReconciliationPeriod([FromBody] CompleteBankReconciliationPeriodRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                if (request == null || request.PeriodId <= 0)
                    return BadRequest(new { error = "periodId is required" });

                var period = _context.BankReconciliationPeriods
                    .FirstOrDefault(p => p.Id == request.PeriodId && p.TenantId == tenantId);
                if (period == null)
                    return NotFound(new { error = "Reconciliation period not found" });
                if (!string.Equals(period.Status, "Open", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "Period is already completed" });

                if (GlWorkflowService.IsDateInLockedPeriod(_context, tenantId, period.StatementDate))
                {
                    var pkLock = GlWorkflowService.PeriodKeyFromDate(period.StatementDate);
                    return Conflict(new
                    {
                        error = $"Accounting period {pkLock} is closed. Reopen that period on Period Close & Audit before completing bank reconciliation."
                    });
                }

                var statementEnd = period.StatementDate.Date;
                var cleared = ComputePeriodCleared(tenantId, period.BankId, statementEnd, period.BeginningBalance);
                var diff = period.EndingBalance - cleared.ClearedBalance;
                if (Math.Abs(diff) >= 0.01m)
                {
                    return BadRequest(new
                    {
                        error = $"Cannot complete: difference is {diff:0.00} (statement ending − cleared). Cleared credits {cleared.ClearedCredits:0.00}, cleared debits {cleared.ClearedDebits:0.00}."
                    });
                }

                var alreadyLinked = (
                    from item in _context.BankReconciliationPeriodItems
                    join p in _context.BankReconciliationPeriods on item.PeriodId equals p.Id
                    where p.TenantId == tenantId && p.BankId == period.BankId
                    select item.TransactionId
                ).ToHashSet();

                var bankTypeSet = new[] { "Payment", "Deposit", "Withdrawal" };
                var endInclusive = statementEnd.AddDays(1).AddTicks(-1);
                var toLink = _context.Transactions
                    .AsNoTracking()
                    .Where(t => t.TenantId == tenantId &&
                                t.BankId == period.BankId &&
                                t.IsReconciled &&
                                t.TransactionType != null &&
                                bankTypeSet.Contains(t.TransactionType) &&
                                t.TransactionDate != null &&
                                t.TransactionDate <= endInclusive)
                    .Select(t => t.TransactionID)
                    .ToList()
                    .Where(id => !alreadyLinked.Contains(id))
                    .ToList();

                foreach (var txnId in toLink)
                {
                    _context.BankReconciliationPeriodItems.Add(new BankReconciliationPeriodItem
                    {
                        PeriodId = period.Id,
                        TransactionId = txnId
                    });
                }

                period.ClearedBalance = cleared.ClearedBalance;
                period.Status = "Completed";
                period.CompletedUtc = DateTime.UtcNow;
                period.CompletedByUserId = GetUserId();

                var bank = _context.BankMaster.FirstOrDefault(b => b.Id == period.BankId && b.TenantId == tenantId);
                if (bank != null)
                    bank.LastReconciledDate = statementEnd;

                var bankLabel = bank == null
                    ? $"Bank {period.BankId}"
                    : (string.IsNullOrWhiteSpace(bank.NickName) ? bank.BankName : bank.NickName);
                GlWorkflowService.AddAudit(
                    _context,
                    tenantId,
                    "BankReconComplete",
                    GetUserId(),
                    null,
                    null,
                    GlWorkflowService.PeriodKeyFromDate(statementEnd),
                    $"{bankLabel}: statement {statementEnd:yyyy-MM-dd}, ending {period.EndingBalance:0.00}");

                _context.SaveChanges();
                return Ok(new
                {
                    result = MapPeriodDto(
                        period,
                        cleared.ClearedBalance,
                        0m,
                        cleared.ClearedCredits,
                        cleared.ClearedDebits)
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in CompleteBankReconciliationPeriod: {ex}");
                return StatusCode(500, new { error = ex.InnerException?.Message ?? ex.Message });
            }
        }

        private readonly struct PeriodClearedTotals
        {
            public PeriodClearedTotals(decimal clearedCredits, decimal clearedDebits, decimal clearedBalance)
            {
                ClearedCredits = clearedCredits;
                ClearedDebits = clearedDebits;
                ClearedBalance = clearedBalance;
            }

            /// <summary>Sum of cleared credit magnitudes (deposits / customer receipts).</summary>
            public decimal ClearedCredits { get; }
            /// <summary>Sum of cleared debit magnitudes (payments / withdrawals).</summary>
            public decimal ClearedDebits { get; }
            /// <summary>Beginning + credits − debits.</summary>
            public decimal ClearedBalance { get; }
        }

        /// <summary>
        /// Cleared balance for an open statement period:
        /// Beginning + cleared credits − cleared debits
        /// (only reconciled cash txns dated on/before statement date, not already closed in a prior period).
        /// </summary>
        private PeriodClearedTotals ComputePeriodCleared(
            int tenantId,
            int bankId,
            DateTime statementDate,
            decimal beginningBalance)
        {
            var bankTypeSet = new[] { "Payment", "Deposit", "Withdrawal" };
            var endInclusive = statementDate.Date.AddDays(1).AddTicks(-1);

            var alreadyInCompleted = (
                from item in _context.BankReconciliationPeriodItems.AsNoTracking()
                join p in _context.BankReconciliationPeriods.AsNoTracking() on item.PeriodId equals p.Id
                where p.TenantId == tenantId &&
                      p.BankId == bankId &&
                      p.Status == "Completed"
                select item.TransactionId
            ).ToHashSet();

            var raw = _context.Transactions
                .AsNoTracking()
                .Where(t => t.TenantId == tenantId &&
                            t.BankId == bankId &&
                            t.IsReconciled &&
                            t.TransactionType != null &&
                            bankTypeSet.Contains(t.TransactionType) &&
                            t.TransactionDate != null &&
                            t.TransactionDate <= endInclusive)
                .Select(t => new
                {
                    t.TransactionID,
                    t.Amount,
                    t.isCustomer,
                    t.TransactionType
                })
                .ToList()
                .Where(t => !alreadyInCompleted.Contains(t.TransactionID));

            decimal credits = 0;
            decimal debits = 0;
            foreach (var t in raw)
            {
                var (signed, isCredit) = AccountingRules.MapBankTransactionSign(
                    t.Amount ?? 0, t.isCustomer, t.TransactionType);
                if (isCredit)
                    credits += Math.Abs(signed);
                else
                    debits += Math.Abs(signed);
            }

            var clearedBalance = beginningBalance + credits - debits;
            return new PeriodClearedTotals(credits, debits, clearedBalance);
        }

        private static object MapPeriodDto(
            BankReconciliationPeriod p,
            decimal? clearedBalance,
            decimal? difference,
            decimal? clearedCredits,
            decimal? clearedDebits)
        {
            return new
            {
                id = p.Id,
                bankId = p.BankId,
                beginningBalance = p.BeginningBalance,
                endingBalance = p.EndingBalance,
                statementDate = p.StatementDate.ToString("yyyy-MM-dd"),
                status = p.Status,
                clearedCredits,
                clearedDebits,
                clearedBalance,
                // Statement ending − cleared balance
                difference,
                completedUtc = p.CompletedUtc,
                createdUtc = p.CreatedUtc
            };
        }

        [HttpGet("GetAccountingSettings")]
        public IActionResult GetAccountingSettings()
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                EnsureDefaultPaymentTerms(tenantId);
                EnsureDefaultApprovalLimits(tenantId);

                var defaults = _context.AccountingDefaults.FirstOrDefault(d => d.TenantId == tenantId);
                var paymentTerms = _context.PaymentTerms
                    .Where(p => p.TenantId == tenantId && p.IsActive)
                    .OrderBy(p => p.Days)
                    .Select(p => new { id = p.Id, name = p.Name, days = p.Days, description = p.Description ?? "" })
                    .ToList();

                var approvalLimits = (
                    from lim in _context.ApApprovalLimits
                    where lim.TenantId == tenantId && lim.IsActive
                    join role in _context.UserRole on lim.RoleId equals role.RoleID into rj
                    from role in rj.DefaultIfEmpty()
                    orderby lim.LimitAmount
                    select new
                    {
                        id = lim.Id,
                        roleId = lim.RoleId,
                        role = role != null ? (role.RoleName ?? $"Role {lim.RoleId}") : $"Role {lim.RoleId}",
                        limit = lim.LimitAmount,
                        requiresDualApproval = lim.RequiresDualApproval
                    }
                ).ToList();

                var settings = new
                {
                    companyName = defaults?.CompanyName ?? "Cimmple Corp",
                    fiscalYearStart = defaults?.FiscalYearStart ?? "01-01",
                    defaultCurrency = defaults?.DefaultCurrency ?? "USD",
                    taxRate = defaults?.TaxRate ?? 8.25m,
                    gstEnabled = defaults?.GstEnabled ?? false,
                    taxRegistrationNumber = defaults?.TaxRegistrationNumber,
                    defaultAccountsReceivableAccountId = defaults?.DefaultAccountsReceivableAccountId,
                    defaultAccountsPayableAccountId = defaults?.DefaultAccountsPayableAccountId,
                    defaultRevenueAccountId = defaults?.DefaultRevenueAccountId,
                    defaultExpenseAccountId = defaults?.DefaultExpenseAccountId,
                    defaultInventoryAccountId = defaults?.DefaultInventoryAccountId,
                    defaultSalesTaxPayableAccountId = defaults?.DefaultSalesTaxPayableAccountId,
                    defaultInputTaxAccountId = defaults?.DefaultInputTaxAccountId,
                    defaultFreightOutAccountId = defaults?.DefaultFreightOutAccountId,
                    defaultOtherChargeAccountId = defaults?.DefaultOtherChargeAccountId,
                    defaultFreightInAccountId = defaults?.DefaultFreightInAccountId,
                    defaultWageExpenseAccountId = defaults?.DefaultWageExpenseAccountId,
                    defaultEmployerPayrollTaxExpenseAccountId = defaults?.DefaultEmployerPayrollTaxExpenseAccountId,
                    defaultEmployerPayrollTaxPayableAccountId = defaults?.DefaultEmployerPayrollTaxPayableAccountId,
                    defaultFederalTaxPayableAccountId = defaults?.DefaultFederalTaxPayableAccountId,
                    defaultStateTaxPayableAccountId = defaults?.DefaultStateTaxPayableAccountId,
                    defaultLocalTaxPayableAccountId = defaults?.DefaultLocalTaxPayableAccountId,
                    defaultSocialSecurityTaxPayableAccountId = defaults?.DefaultSocialSecurityTaxPayableAccountId,
                    defaultMedicareTaxPayableAccountId = defaults?.DefaultMedicareTaxPayableAccountId,
                    defaultPreTaxDeductionsPayableAccountId = defaults?.DefaultPreTaxDeductionsPayableAccountId,
                    defaultRetirementDeductionsPayableAccountId = defaults?.DefaultRetirementDeductionsPayableAccountId,
                    defaultPostTaxDeductionsPayableAccountId = defaults?.DefaultPostTaxDeductionsPayableAccountId,
                    defaultGarnishmentsPayableAccountId = defaults?.DefaultGarnishmentsPayableAccountId,
                    defaultNetPayPayableAccountId = defaults?.DefaultNetPayPayableAccountId,
                    defaultPayrollBankId = defaults?.DefaultPayrollBankId,
                    paymentTerms,
                    approvalLimits
                };

                return Ok(new { result = settings });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetAccountingSettings: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveAccountingSettings")]
        public IActionResult SaveAccountingSettings([FromBody] AccountingSettingsRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();

                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                if (string.IsNullOrWhiteSpace(request.CompanyName))
                {
                    return BadRequest(new { error = "Company name is required" });
                }

                if (request.TaxRate < 0 || request.TaxRate > 100)
                {
                    return BadRequest(new { error = "Tax rate must be between 0 and 100" });
                }

                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultAccountsReceivableAccountId, "Accounts Receivable", out var arId, out var arError))
                    return BadRequest(new { error = arError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultAccountsPayableAccountId, "Accounts Payable", out var apId, out var apError))
                    return BadRequest(new { error = apError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultRevenueAccountId, "Revenue", out var revId, out var revError))
                    return BadRequest(new { error = revError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultExpenseAccountId, "Expense", out var expId, out var expError))
                    return BadRequest(new { error = expError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultInventoryAccountId, "Inventory", out var invId, out var invError))
                    return BadRequest(new { error = invError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultSalesTaxPayableAccountId, "Sales Tax Payable", out var taxPayId, out var taxPayError))
                    return BadRequest(new { error = taxPayError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultInputTaxAccountId, "Input Tax", out var inputTaxId, out var inputTaxError))
                    return BadRequest(new { error = inputTaxError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultFreightOutAccountId, "Freight Out", out var freightOutId, out var freightOutError))
                    return BadRequest(new { error = freightOutError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultOtherChargeAccountId, "Other Charge", out var otherChargeId, out var otherChargeError))
                    return BadRequest(new { error = otherChargeError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultFreightInAccountId, "Freight In", out var freightInId, out var freightInError))
                    return BadRequest(new { error = freightInError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultWageExpenseAccountId, "Wage Expense", out var wageExpId, out var wageExpError))
                    return BadRequest(new { error = wageExpError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultEmployerPayrollTaxExpenseAccountId, "Employer Payroll Tax Expense", out var erTaxExpId, out var erTaxExpError))
                    return BadRequest(new { error = erTaxExpError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultEmployerPayrollTaxPayableAccountId, "Employer Payroll Tax Payable", out var erTaxPayId, out var erTaxPayError))
                    return BadRequest(new { error = erTaxPayError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultFederalTaxPayableAccountId, "Federal Tax Payable", out var fedTaxId, out var fedTaxError))
                    return BadRequest(new { error = fedTaxError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultStateTaxPayableAccountId, "State Tax Payable", out var stateTaxId, out var stateTaxError))
                    return BadRequest(new { error = stateTaxError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultLocalTaxPayableAccountId, "Local Tax Payable", out var localTaxId, out var localTaxError))
                    return BadRequest(new { error = localTaxError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultSocialSecurityTaxPayableAccountId, "Social Security Payable", out var ssTaxId, out var ssTaxError))
                    return BadRequest(new { error = ssTaxError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultMedicareTaxPayableAccountId, "Medicare Payable", out var medTaxId, out var medTaxError))
                    return BadRequest(new { error = medTaxError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultPreTaxDeductionsPayableAccountId, "Pre-Tax Deductions Payable", out var preTaxId, out var preTaxError))
                    return BadRequest(new { error = preTaxError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultRetirementDeductionsPayableAccountId, "Retirement Deductions Payable", out var retId, out var retError))
                    return BadRequest(new { error = retError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultPostTaxDeductionsPayableAccountId, "Post-Tax Deductions Payable", out var postTaxId, out var postTaxError))
                    return BadRequest(new { error = postTaxError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultGarnishmentsPayableAccountId, "Garnishments Payable", out var garnId, out var garnError))
                    return BadRequest(new { error = garnError });
                if (!TryNormalizeOptionalAccountId(tenantId, request.DefaultNetPayPayableAccountId, "Net Pay Payable", out var netPayId, out var netPayError))
                    return BadRequest(new { error = netPayError });

                int? payrollBankId = null;
                if (request.DefaultPayrollBankId is > 0)
                {
                    var bankOk = _context.BankMaster.AsNoTracking()
                        .Any(b => b.Id == request.DefaultPayrollBankId.Value && b.TenantId == tenantId);
                    if (!bankOk)
                        return BadRequest(new { error = "Payroll bank is invalid for this tenant." });
                    payrollBankId = request.DefaultPayrollBankId;
                }

                var defaults = _context.AccountingDefaults.FirstOrDefault(d => d.TenantId == tenantId);
                var now = DateTime.UtcNow;
                if (defaults == null)
                {
                    defaults = new AccountingDefaults
                    {
                        TenantId = tenantId,
                        CreatedDate = now
                    };
                    _context.AccountingDefaults.Add(defaults);
                }

                defaults.CompanyName = request.CompanyName.Trim();
                defaults.FiscalYearStart = string.IsNullOrWhiteSpace(request.FiscalYearStart) ? "01-01" : request.FiscalYearStart.Trim();
                defaults.DefaultCurrency = string.IsNullOrWhiteSpace(request.DefaultCurrency) ? "USD" : request.DefaultCurrency.Trim();
                defaults.TaxRate = request.TaxRate;
                defaults.GstEnabled = request.GstEnabled;
                defaults.TaxRegistrationNumber = string.IsNullOrWhiteSpace(request.TaxRegistrationNumber)
                    ? null
                    : request.TaxRegistrationNumber.Trim();
                defaults.DefaultAccountsReceivableAccountId = arId;
                defaults.DefaultAccountsPayableAccountId = apId;
                defaults.DefaultRevenueAccountId = revId;
                defaults.DefaultExpenseAccountId = expId;
                defaults.DefaultInventoryAccountId = invId;
                defaults.DefaultSalesTaxPayableAccountId = taxPayId;
                defaults.DefaultInputTaxAccountId = inputTaxId;
                defaults.DefaultFreightOutAccountId = freightOutId;
                defaults.DefaultOtherChargeAccountId = otherChargeId;
                defaults.DefaultFreightInAccountId = freightInId;
                defaults.DefaultWageExpenseAccountId = wageExpId;
                defaults.DefaultEmployerPayrollTaxExpenseAccountId = erTaxExpId;
                defaults.DefaultEmployerPayrollTaxPayableAccountId = erTaxPayId;
                defaults.DefaultFederalTaxPayableAccountId = fedTaxId;
                defaults.DefaultStateTaxPayableAccountId = stateTaxId;
                defaults.DefaultLocalTaxPayableAccountId = localTaxId;
                defaults.DefaultSocialSecurityTaxPayableAccountId = ssTaxId;
                defaults.DefaultMedicareTaxPayableAccountId = medTaxId;
                defaults.DefaultPreTaxDeductionsPayableAccountId = preTaxId;
                defaults.DefaultRetirementDeductionsPayableAccountId = retId;
                defaults.DefaultPostTaxDeductionsPayableAccountId = postTaxId;
                defaults.DefaultGarnishmentsPayableAccountId = garnId;
                defaults.DefaultNetPayPayableAccountId = netPayId;
                defaults.DefaultPayrollBankId = payrollBankId;
                defaults.UpdatedDate = now;

                // Upsert payment terms when provided (Setup Save). Dedicated CRUD also available.
                if (request.PaymentTerms != null)
                {
                    UpsertPaymentTerms(tenantId, request.PaymentTerms, now);
                }

                if (request.ApprovalLimits != null)
                {
                    UpsertApprovalLimits(tenantId, request.ApprovalLimits, now);
                }

                _context.SaveChanges();

                return Ok(new { result = new { message = "Accounting settings saved successfully" } });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in SaveAccountingSettings: {ex}");
                var detail = ex.InnerException?.Message ?? ex.Message;
                return StatusCode(500, new { error = detail });
            }
        }

        private bool TryNormalizeOptionalAccountId(
            int tenantId,
            int? accountId,
            string label,
            out int? normalized,
            out string? error)
        {
            normalized = null;
            error = null;
            if (!accountId.HasValue || accountId.Value <= 0)
                return true;

            if (!GlAccountResolutionService.IsActiveAccountForTenant(_context, tenantId, accountId.Value))
            {
                error = $"{label} account is invalid or inactive for this tenant.";
                return false;
            }

            normalized = accountId.Value;
            return true;
        }

        [HttpPost("GenerateFinancialReport")]
        public IActionResult GenerateFinancialReport([FromBody] ReportRequest request)
        {
            try
            {
                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                if (tenantId <= 0)
                {
                    return BadRequest(new { error = "Tenant id is required. Select a company or sign in again." });
                }

                if (string.IsNullOrWhiteSpace(request.ReportType))
                {
                    return BadRequest(new { error = "ReportType is required" });
                }

                var dateRange = request.DateRange ?? "This Month";
                Console.WriteLine($"GenerateFinancialReport called - TenantId: {tenantId}, ReportType: {request.ReportType}, DateRange: {dateRange}");

                if (dateRange.Equals("Custom", StringComparison.OrdinalIgnoreCase) &&
                    (string.IsNullOrWhiteSpace(request.CustomStartDate) ||
                     string.IsNullOrWhiteSpace(request.CustomEndDate) ||
                     !DateTime.TryParse(request.CustomStartDate, out _) ||
                     !DateTime.TryParse(request.CustomEndDate, out _)))
                {
                    return BadRequest(new { error = "Custom date range requires valid CustomStartDate and CustomEndDate (yyyy-MM-dd)." });
                }

                var dateFilter = GetDateRangeFilter(dateRange, request);
                int? reportLocationId = request.LocationId.HasValue && request.LocationId.Value > 0
                    ? request.LocationId
                    : null;

                object reportData;
                var reportTypeKey = request.ReportType.ToLowerInvariant();

                switch (reportTypeKey)
                {
                    case "balance-sheet":
                        reportData = BalanceSheetReportService.Build(_context, tenantId, dateFilter.endDate, reportLocationId);
                        break;
                    case "profit-loss":
                    case "income-statement":
                        reportData = ProfitLossGlReportService.Build(_context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId);
                        break;
                    case "cash-flow":
                        reportData = CashFlowDirectReportService.Build(_context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId);
                        break;
                    case "ar-aging":
                        reportData = AgingReportService.BuildArAging(_context, tenantId, dateFilter.endDate, reportLocationId);
                        break;
                    case "ap-aging":
                        reportData = AgingReportService.BuildApAging(_context, tenantId, dateFilter.endDate, reportLocationId);
                        break;
                    case "trial-balance":
                        reportData = TrialBalanceReportService.Build(_context, tenantId, dateFilter.endDate, reportLocationId);
                        break;
                    case "customer-statements":
                        reportData = CustomerStatementReportService.Build(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId, request.Parameters);
                        break;
                    case "vendor-analysis":
                        reportData = VendorPaymentAnalysisReportService.Build(
                            _context, tenantId, dateFilter.startDate, dateFilter.endDate, reportLocationId);
                        break;
                    default:
                        return BadRequest(new { error = "Unsupported report type" });
                }

                var format = (request.Format ?? "json").Trim().ToLowerInvariant();
                if (format == "pdf")
                {
                    var pdfBytes = FinancialReportPdfService.BuildPdf(reportTypeKey, reportData);
                    var fileName = $"{reportTypeKey}-{dateFilter.endDate:yyyy-MM-dd}.pdf";
                    return File(pdfBytes, "application/pdf", fileName);
                }

                if (format == "csv" || format == "excel")
                {
                    var csv = FinancialReportPdfService.BuildCsv(reportData);
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
                Console.WriteLine($"Error in GenerateFinancialReport: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private (decimal totalReceivables, decimal overdueReceivables, decimal receivablesDueThisWeek) CalculateAccountsReceivableMetrics(
            int tenantId,
            (DateTime startDate, DateTime endDate) dateFilter,
            int? locationId = null,
            IReadOnlyList<int>? restrictToLocationIds = null)
        {
            // Outstanding AR: exclude voided; use remaining balance due (supports partial payments).
            var invoiceQuery = _context.InvoiceMaster
                .Where(im => im.TenantId == tenantId && !im.IsVoided);

            if (locationId.HasValue)
            {
                var locId = locationId.Value;
                invoiceQuery = invoiceQuery.Where(im =>
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
                invoiceQuery = allowed.Count == 0
                    ? invoiceQuery.Where(_ => false)
                    : invoiceQuery.Where(im =>
                        _context.InvoiceDetail.Any(id =>
                            id.InvoiceId == im.Id &&
                            _context.CustomerOrder.Any(co =>
                                co.OrderID == id.OrderId &&
                                co.Tenantid == tenantId &&
                                allowed.Contains(co.locationId))));
            }

            var openBalances = invoiceQuery
                .ToList()
                .Select(im =>
                {
                    var paid = im.PaidAmount > 0
                        ? im.PaidAmount
                        : (im.PaymentDate.HasValue ? im.TotalAmount : 0m);
                    var balance = im.TotalAmount - paid;
                    return new { im.DueDate, balance = balance > 0.009m ? balance : 0m };
                })
                .Where(x => x.balance > 0)
                .ToList();

            var totalReceivables = openBalances.Sum(x => x.balance);

            var today = DateTime.Today;
            var weekFromToday = today.AddDays(7);

            var overdueReceivables = openBalances
                .Where(x => x.DueDate.Date < today)
                .Sum(x => x.balance);

            var receivablesDueThisWeek = openBalances
                .Where(x => x.DueDate.Date >= today && x.DueDate.Date <= weekFromToday)
                .Sum(x => x.balance);

            return (totalReceivables, overdueReceivables, receivablesDueThisWeek);
        }

        private (decimal totalPayables, decimal overduePayables, decimal payablesDueThisWeek) CalculateAccountsPayableMetrics(
            int tenantId,
            (DateTime startDate, DateTime endDate) dateFilter,
            int? locationId = null,
            IReadOnlyList<int>? restrictToLocationIds = null)
        {
            // Outstanding AP: exclude paid/voided; use remaining balance due.
            var vendorInvoiceQuery = _context.VendorInvoiceMaster
                .Where(vim => vim.TenantId == tenantId &&
                             vim.isPaid != 1 &&
                             vim.isPaid != 2 &&
                             vim.voideddate == null);
            if (locationId.HasValue)
                vendorInvoiceQuery = vendorInvoiceQuery.Where(vim => vim.locationId == locationId.Value);
            else if (restrictToLocationIds != null)
            {
                var allowed = restrictToLocationIds.ToList();
                vendorInvoiceQuery = allowed.Count == 0
                    ? vendorInvoiceQuery.Where(_ => false)
                    : vendorInvoiceQuery.Where(vim => allowed.Contains(vim.locationId));
            }

            var openBalances = vendorInvoiceQuery
                .ToList()
                .Select(vim =>
                {
                    var paid = vim.PaidAmount > 0
                        ? vim.PaidAmount
                        : (vim.Paydate.HasValue ? vim.TotalAmount : 0m);
                    var balance = vim.TotalAmount - paid;
                    return new { vim.DueDate, balance = balance > 0.009m ? balance : 0m };
                })
                .Where(x => x.balance > 0)
                .ToList();

            var totalPayables = openBalances.Sum(x => x.balance);

            var today = DateTime.Today;
            var weekFromToday = today.AddDays(7);

            var overduePayables = openBalances
                .Where(x => x.DueDate.Date < today)
                .Sum(x => x.balance);

            var payablesDueThisWeek = openBalances
                .Where(x => x.DueDate.Date >= today && x.DueDate.Date <= weekFromToday)
                .Sum(x => x.balance);

            return (totalPayables, overduePayables, payablesDueThisWeek);
        }

        private (DateTime startDate, DateTime endDate) GetDateRangeFilter(string dateRange, ReportRequest? reportRequest = null)
        {
            var now = DateTime.Now;
            var startDate = now;
            var endDate = now;

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

            switch ((dateRange ?? "").ToLower())
            {
                case "all":
                case "all dates":
                    startDate = new DateTime(2000, 1, 1);
                    endDate = now.Date.AddYears(1);
                    break;
                case "this week":
                    startDate = now.AddDays(-(int)now.DayOfWeek);
                    endDate = startDate.AddDays(6);
                    break;
                case "this month":
                    startDate = new DateTime(now.Year, now.Month, 1);
                    endDate = startDate.AddMonths(1).AddDays(-1);
                    break;
                case "last month":
                    startDate = new DateTime(now.Year, now.Month, 1).AddMonths(-1);
                    endDate = new DateTime(now.Year, now.Month, 1).AddDays(-1);
                    break;
                case "this quarter":
                    {
                        var q = (now.Month - 1) / 3;
                        startDate = new DateTime(now.Year, q * 3 + 1, 1);
                        endDate = startDate.AddMonths(3).AddDays(-1);
                    }
                    break;
                case "last quarter":
                    {
                        var currentQuarter = (now.Month - 1) / 3;
                        if (currentQuarter == 0)
                        {
                            startDate = new DateTime(now.Year - 1, 10, 1);
                            endDate = new DateTime(now.Year - 1, 12, 31);
                        }
                        else
                        {
                            var prevQ = currentQuarter - 1;
                            startDate = new DateTime(now.Year, prevQ * 3 + 1, 1);
                            endDate = startDate.AddMonths(3).AddDays(-1);
                        }
                    }
                    break;
                case "last 30 days":
                    startDate = now.AddDays(-30);
                    endDate = now;
                    break;
                case "last 90 days":
                    startDate = now.AddDays(-90);
                    endDate = now;
                    break;
                case "this year":
                    {
                        var (fyStart, fyEnd) = GetFiscalYearBounds(GetTenantId(), now.Year);
                        startDate = fyStart;
                        endDate = fyEnd;
                    }
                    break;
                case "last year":
                    {
                        var (fyStart, fyEnd) = GetFiscalYearBounds(GetTenantId(), now.Year - 1);
                        startDate = fyStart;
                        endDate = fyEnd;
                    }
                    break;
                default:
                    // Default to all dates for payment activity screens
                    startDate = new DateTime(2000, 1, 1);
                    endDate = now.Date.AddYears(1);
                    break;
            }

            return (startDate.Date, endDate.Date);
        }

        // Transaction Deletion Endpoints
        [HttpGet("CheckTransactionDeletionImpact")]
        public IActionResult CheckTransactionDeletionImpact([FromQuery] int transactionId, [FromQuery] int tenantId)
        {
            try
            {
                var transaction = _context.Transactions
                    .FirstOrDefault(t => t.TransactionID == transactionId && t.TenantId == tenantId);

                if (transaction == null)
                {
                    return NotFound(new { error = "Transaction not found" });
                }

                var result = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check Deposits (child records - will be deleted)
                var deposits = _context.Deposits
                    .Where(d => d.TransactionID == transactionId)
                    .ToList();
                if (deposits.Any())
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Deposits",
                        Count = deposits.Count,
                        Description = $"{deposits.Count} deposit(s) will be deleted"
                    });
                }

                // Check Withdrawals (child records - will be deleted)
                var withdrawals = _context.Withdrawals
                    .Where(w => w.TransactionID == transactionId)
                    .ToList();
                if (withdrawals.Any())
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Withdrawals",
                        Count = withdrawals.Count,
                        Description = $"{withdrawals.Count} withdrawal(s) will be deleted"
                    });
                }

                // Check TransCoa (child records - will be deleted)
                var transCoa = _context.TransCoa
                    .Where(tc => tc.Transid == transactionId)
                    .ToList();
                if (transCoa.Any())
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Transaction COA Mappings",
                        Count = transCoa.Count,
                        Description = $"{transCoa.Count} transaction COA mapping(s) will be deleted"
                    });
                }

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("DeleteTransaction")]
        public IActionResult DeleteTransaction([FromQuery] int transactionId, [FromQuery] int tenantId)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tid = tenantId > 0 ? tenantId : GetTenantId();
                var transaction = _context.Transactions
                    .FirstOrDefault(t => t.TransactionID == transactionId && t.TenantId == tid);

                if (transaction == null)
                {
                    return NotFound(new { error = "Transaction not found" });
                }

                if (transaction.IsReconciled)
                {
                    return BadRequest(new { error = "Cannot delete a reconciled bank transaction. Unreconcile it first." });
                }

                if (!string.IsNullOrWhiteSpace(transaction.AccountingPeriod) &&
                    GlWorkflowService.IsPeriodLocked(_context, tid, transaction.AccountingPeriod))
                {
                    return BadRequest(new { error = $"Accounting period {transaction.AccountingPeriod} is closed." });
                }

                // Block delete when a payment journal references this cash movement via invoice no.
                if (!string.IsNullOrWhiteSpace(transaction.invoiceNo))
                {
                    var linkedJe = _context.JournalEntries.Any(je =>
                        je.TenantId == tid &&
                        je.ReferenceNumber != null &&
                        (je.ReferenceNumber.Contains(transaction.invoiceNo) ||
                         (transaction.Description != null && je.Description != null &&
                          je.Description.Contains(transaction.invoiceNo))));
                    if (linkedJe)
                    {
                        return BadRequest(new
                        {
                            error = "This transaction is linked to a journal entry. Reverse the journal entry instead of deleting the cash row."
                        });
                    }
                }

                // Delete child records first
                var deposits = _context.Deposits
                    .Where(d => d.TransactionID == transactionId)
                    .ToList();
                _context.Deposits.RemoveRange(deposits);

                var withdrawals = _context.Withdrawals
                    .Where(w => w.WithdrawalID > 0 && w.TransactionID == transactionId)
                    .ToList();
                _context.Withdrawals.RemoveRange(withdrawals);

                var transCoa = _context.TransCoa
                    .Where(tc => tc.Transid == transactionId)
                    .ToList();
                _context.TransCoa.RemoveRange(transCoa);

                // Delete the transaction
                _context.Transactions.Remove(transaction);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Transaction deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // Journal Entry Deletion Endpoints
        [HttpGet("CheckJournalEntryDeletionImpact")]
        public IActionResult CheckJournalEntryDeletionImpact([FromQuery] int journalEntryId, [FromQuery] int tenantId)
        {
            try
            {
                var journalEntry = _context.JournalEntries
                    .FirstOrDefault(je => je.Id == journalEntryId && je.TenantId == tenantId);

                if (journalEntry == null)
                {
                    return NotFound(new { error = "Journal Entry not found" });
                }

                var result = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check JournalEntryFrom (child records - will be deleted)
                var journalFrom = _context.JournalEntryFrom
                    .Where(j => j.JournalEntryId == journalEntryId)
                    .ToList();
                if (journalFrom.Any())
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Journal Entry From Details",
                        Count = journalFrom.Count,
                        Description = $"{journalFrom.Count} journal entry 'from' detail(s) will be deleted"
                    });
                }

                // Check JournalEntryTo (child records - will be deleted)
                var journalTo = _context.JournalEntryTo
                    .Where(j => j.JournalEntryId == journalEntryId)
                    .ToList();
                if (journalTo.Any())
                {
                    result.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Journal Entry To Details",
                        Count = journalTo.Count,
                        Description = $"{journalTo.Count} journal entry 'to' detail(s) will be deleted"
                    });
                }

                // Warning about accounting period closure
                result.Warnings.Add("Deleting a journal entry may affect account balances and financial reports.");

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("DeleteJournalEntry")]
        public IActionResult DeleteJournalEntry([FromQuery] int journalEntryId, [FromQuery] int tenantId)
        {
            try
            {
                var journalEntry = _context.JournalEntries
                    .FirstOrDefault(je => je.Id == journalEntryId && je.TenantId == tenantId);

                if (journalEntry == null)
                {
                    return NotFound(new { error = "Journal Entry not found" });
                }

                var lockKey = GlWorkflowService.TryNormalizePeriodKey(journalEntry.AccountingPeriod, out var pk, out _)
                    ? pk
                    : GlWorkflowService.PeriodKeyFromDate(journalEntry.EntryDate);
                if (GlWorkflowService.IsPeriodLocked(_context, tenantId, lockKey))
                    return BadRequest(new { error = $"Period {lockKey} is closed; journal entries cannot be deleted." });

                if (journalEntry.ReversedByJournalEntryId.HasValue)
                    return BadRequest(new { error = "Delete the reversal entry first, then the original if still required." });

                using var tx = _context.Database.BeginTransaction();
                try
                {
                    GlWorkflowService.AddAudit(_context, tenantId, "JournalDelete", GetUserId(), journalEntryId, null,
                        lockKey, journalEntry.ReferenceNumber);

                    if (journalEntry.ReversesJournalEntryId.HasValue)
                    {
                        var original = _context.JournalEntries
                            .FirstOrDefault(j => j.Id == journalEntry.ReversesJournalEntryId.Value && j.TenantId == tenantId);
                        if (original != null)
                            original.ReversedByJournalEntryId = null;
                    }

                    var journalFrom = _context.JournalEntryFrom
                        .Where(j => j.JournalEntryId == journalEntryId)
                        .ToList();
                    _context.JournalEntryFrom.RemoveRange(journalFrom);

                    var journalTo = _context.JournalEntryTo
                        .Where(j => j.JournalEntryId == journalEntryId)
                        .ToList();
                    _context.JournalEntryTo.RemoveRange(journalTo);

                    _context.JournalEntries.Remove(journalEntry);
                    _context.SaveChanges();
                    tx.Commit();
                }
                catch
                {
                    tx.Rollback();
                    throw;
                }

                return Ok(new { result = new { message = "Journal Entry deleted successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("ListClosedPeriods")]
        public IActionResult ListClosedPeriods([FromQuery] int tenantId = 0)
        {
            try
            {
                var tid = tenantId > 0 ? tenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                var rows = _context.GlAccountingPeriodLocks.AsNoTracking()
                    .Where(x => x.TenantId == tid)
                    .OrderByDescending(x => x.PeriodKey)
                    .Select(x => new
                    {
                        x.PeriodKey,
                        closedUtc = x.ClosedUtc,
                        x.ClosedByUserId
                    })
                    .ToList();

                return Ok(new { result = rows });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("CloseAccountingPeriod")]
        public IActionResult CloseAccountingPeriod([FromBody] AccountingPeriodKeyRequest request)
        {
            try
            {
                if (request == null)
                    return BadRequest(new { error = "Request body is required." });
                var tid = request.TenantId > 0 ? request.TenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });
                if (!GlWorkflowService.TryNormalizePeriodKey(request.PeriodKey, out var pk, out var err))
                    return BadRequest(new { error = err });

                if (_context.GlAccountingPeriodLocks.Any(x => x.TenantId == tid && x.PeriodKey == pk))
                    return Conflict(new { error = $"Period {pk} is already closed." });

                if (!GlWorkflowService.TryEnsureBankReconsCompleteForGlPeriod(_context, tid, pk, out var bankErr))
                    return Conflict(new { error = bankErr });

                _context.GlAccountingPeriodLocks.Add(new GlAccountingPeriodLock
                {
                    TenantId = tid,
                    PeriodKey = pk,
                    ClosedUtc = DateTime.UtcNow,
                    ClosedByUserId = GetUserId()
                });
                GlWorkflowService.AddAudit(_context, tid, "PeriodClose", GetUserId(), null, null, pk,
                    "GL period closed after bank reconciliation check");
                _context.SaveChanges();

                return Ok(new { result = new { message = $"Period {pk} closed.", periodKey = pk } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("OpenAccountingPeriod")]
        public IActionResult OpenAccountingPeriod([FromBody] AccountingPeriodKeyRequest request)
        {
            try
            {
                if (request == null)
                    return BadRequest(new { error = "Request body is required." });
                var tid = request.TenantId > 0 ? request.TenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });
                if (!GlWorkflowService.TryNormalizePeriodKey(request.PeriodKey, out var pk, out var err))
                    return BadRequest(new { error = err });

                var row = _context.GlAccountingPeriodLocks
                    .FirstOrDefault(x => x.TenantId == tid && x.PeriodKey == pk);
                if (row == null)
                    return NotFound(new { error = $"Period {pk} is not closed." });

                _context.GlAccountingPeriodLocks.Remove(row);
                GlWorkflowService.AddAudit(_context, tid, "PeriodOpen", GetUserId(), null, null, pk, null);
                _context.SaveChanges();

                return Ok(new { result = new { message = $"Period {pk} reopened.", periodKey = pk } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("ListGlAuditTrail")]
        public IActionResult ListGlAuditTrail(
            [FromQuery] int tenantId = 0,
            [FromQuery] int skip = 0,
            [FromQuery] int take = 200)
        {
            try
            {
                var tid = tenantId > 0 ? tenantId : GetTenantId();
                if (tid <= 0)
                    return BadRequest(new { error = "Tenant id is required." });

                take = Math.Clamp(take, 1, 500);
                skip = Math.Max(0, skip);

                var q = _context.GlAuditEvents.AsNoTracking().Where(x => x.TenantId == tid);
                var total = q.Count();
                var rows = q
                    .OrderByDescending(x => x.OccurredUtc)
                    .ThenByDescending(x => x.Id)
                    .Skip(skip)
                    .Take(take)
                    .Select(x => new
                    {
                        x.Id,
                        x.Action,
                        occurredUtc = x.OccurredUtc,
                        x.ActorUserId,
                        x.JournalEntryId,
                        x.RelatedJournalEntryId,
                        x.PeriodKey,
                        x.Notes
                    })
                    .ToList();

                return Ok(new { result = new { items = rows, total, skip, take } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SendArReminder")]
        public async Task<IActionResult> SendArReminder([FromBody] SendArReminderRequest request)
        {
            try
            {
                await AccountingGapSchemaService.EnsureAsync(_context);
                await SystemSettingsSchemaService.EnsureTablesAsync(_context);
                var tenantId = GetTenantId();
                if (request == null || request.InvoiceId <= 0)
                    return BadRequest(new { error = "Invoice id is required." });

                if (!TryGetActiveLocationId(out var locationId, out var forbid))
                    return forbid!;

                var result = await SendOneArReminderAsync(tenantId, request.InvoiceId, locationId);
                if (!result.ok)
                    return BadRequest(new { error = result.error });

                return Ok(new
                {
                    result = new
                    {
                        message = "Payment reminder sent",
                        toEmail = result.toEmail,
                        attachedPdf = result.attachedPdf
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SendBulkArReminders")]
        public async Task<IActionResult> SendBulkArReminders([FromBody] BulkArReminderRequest? request)
        {
            try
            {
                await AccountingGapSchemaService.EnsureAsync(_context);
                await SystemSettingsSchemaService.EnsureTablesAsync(_context);
                var tenantId = GetTenantId();

                if (!TryGetActiveLocationId(out var locationId, out var forbid))
                    return forbid!;

                var invoiceIds = request?.InvoiceIds?.Where(id => id > 0).Distinct().ToList()
                    ?? _context.InvoiceMaster
                        .Where(im => im.TenantId == tenantId &&
                                     !im.IsVoided &&
                                     im.PaidAmount < im.TotalAmount - 0.009m &&
                                     im.DueDate.Date < DateTime.Now.Date)
                        .Select(im => im.Id)
                        .ToList();

                var sent = 0;
                var failures = new List<object>();
                foreach (var id in invoiceIds)
                {
                    var r = await SendOneArReminderAsync(tenantId, id, locationId);
                    if (r.ok) sent++;
                    else failures.Add(new { invoiceId = id, error = r.error });
                }

                return Ok(new { result = new { sent, failed = failures.Count, failures } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetGstStatus")]
        public IActionResult GetGstStatus()
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                var defaults = _context.AccountingDefaults.AsNoTracking()
                    .FirstOrDefault(d => d.TenantId == tenantId);
                return Ok(new
                {
                    result = new
                    {
                        gstEnabled = defaults?.GstEnabled ?? false,
                        taxRegistrationNumber = defaults?.TaxRegistrationNumber,
                        available = false,
                        message = "GST / multi-rate tax returns are not implemented yet. Tax registration fields are stored for future use."
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private async Task<(bool ok, string? error, string? toEmail, bool attachedPdf)> SendOneArReminderAsync(
            int tenantId,
            int invoiceId,
            int? locationId)
        {
            var invoice = await _context.InvoiceMaster
                .FirstOrDefaultAsync(im => im.Id == invoiceId && im.TenantId == tenantId);
            if (invoice == null)
                return (false, "Invoice not found", null, false);
            if (invoice.IsVoided)
                return (false, "Cannot send reminder for a voided invoice", null, false);

            var balance = invoice.TotalAmount - invoice.PaidAmount;
            if (balance <= 0.009m)
                return (false, "Invoice is fully paid", null, false);

            var orderId = await _context.InvoiceDetail
                .Where(d => d.InvoiceId == invoice.Id)
                .Select(d => d.OrderId)
                .FirstOrDefaultAsync();
            var order = await _context.CustomerOrder
                .AsNoTracking()
                .FirstOrDefaultAsync(o => o.OrderID == orderId && o.Tenantid == tenantId);
            string? toEmail = null;
            string customerName = order?.CustomerName ?? "Customer";
            if (order != null)
            {
                toEmail = await _context.CustomerMaster
                    .AsNoTracking()
                    .Where(c => c.Tenantid == tenantId && c.customer_id == order.CustomerID)
                    .Select(c => c.ContactEmail ?? c.email)
                    .FirstOrDefaultAsync();
            }

            var settings = await _context.SystemSettings.AsNoTracking()
                .FirstOrDefaultAsync(s => s.TenantId == tenantId);
            if (settings == null)
                return (false, "System settings are not configured for this tenant.", null, false);

            var company = await _context.AccountingDefaults.AsNoTracking()
                .Where(d => d.TenantId == tenantId)
                .Select(d => d.CompanyName)
                .FirstOrDefaultAsync();
            if (string.IsNullOrWhiteSpace(company))
                company = "Cimmple";

            var invoiceLabel = !string.IsNullOrWhiteSpace(invoice.PrefixInvoiceNo)
                ? invoice.PrefixInvoiceNo
                : invoice.InvoiceNo.ToString();

            var currencyCode = string.IsNullOrWhiteSpace(settings.DefaultCurrency) ? "USD" : settings.DefaultCurrency;
            var locale = string.IsNullOrWhiteSpace(settings.Locale) ? "en-US" : settings.Locale;
            var decimalPlaces = settings.DecimalPlaces > 0 ? settings.DecimalPlaces : 2;
            var decimalSep = string.IsNullOrWhiteSpace(settings.DecimalSeparator) ? "." : settings.DecimalSeparator;
            var thousandsSep = string.IsNullOrWhiteSpace(settings.ThousandsSeparator) ? "," : settings.ThousandsSeparator;
            var currencySymbol = CurrencyFormattingHelper.ResolveCurrencySymbol(
                currencyCode, settings.CurrencySymbol, locale);
            var balanceText = CurrencyFormattingHelper.FormatAmount(
                balance, currencyCode, currencySymbol, locale, decimalPlaces, decimalSep, thousandsSep);

            var subject = $"Payment reminder — Invoice {invoiceLabel}";
            var safeCustomer = WebUtility.HtmlEncode(customerName);
            var safeCompany = WebUtility.HtmlEncode(company);
            var safeLabel = WebUtility.HtmlEncode(invoiceLabel);
            var body =
                $"<p>Dear {safeCustomer},</p>" +
                $"<p>This is a friendly reminder that invoice <strong>{safeLabel}</strong> " +
                $"dated {invoice.InvoiceDate:yyyy-MM-dd} has an outstanding balance of " +
                $"<strong>{WebUtility.HtmlEncode(balanceText)}</strong> " +
                $"(due {invoice.DueDate:yyyy-MM-dd}).</p>" +
                "<p>Please find the invoice PDF attached.</p>" +
                $"<p>Thank you,<br/>{safeCompany}</p>";

            var attachments = new List<EmailAttachment>();
            var attachedPdf = false;
            try
            {
                var pdf = await _documentPdfService.BuildInvoiceAsync(invoiceId, tenantId, locationId);
                if (string.IsNullOrEmpty(pdf.Error) && pdf.Bytes is { Length: > 0 })
                {
                    attachments.Add(new EmailAttachment
                    {
                        FileName = string.IsNullOrWhiteSpace(pdf.FileName)
                            ? $"Invoice_{invoiceLabel}.pdf"
                            : pdf.FileName,
                        Content = pdf.Bytes,
                        ContentType = "application/pdf"
                    });
                    attachedPdf = true;
                }
            }
            catch (Exception ex)
            {
                // Reminder can still go out without the PDF; surface attach failure in log.
                Console.WriteLine($"[SendArReminder] PDF attach failed for invoice {invoiceId}: {ex.Message}");
            }

            if (!attachedPdf)
            {
                body =
                    $"<p>Dear {safeCustomer},</p>" +
                    $"<p>This is a friendly reminder that invoice <strong>{safeLabel}</strong> " +
                    $"dated {invoice.InvoiceDate:yyyy-MM-dd} has an outstanding balance of " +
                    $"<strong>{WebUtility.HtmlEncode(balanceText)}</strong> " +
                    $"(due {invoice.DueDate:yyyy-MM-dd}).</p>" +
                    $"<p>Thank you,<br/>{safeCompany}</p>";
            }

            var mail = new MailRequest
            {
                To = toEmail ?? "",
                Subject = subject,
                Body = body,
                IsHtml = true,
                Attachments = attachments
            };

            var (ok, error) = await _emailOutbox.EnqueueAsync(tenantId, mail);

            _context.ArReminderLogs.Add(new ArReminderLog
            {
                TenantId = tenantId,
                InvoiceId = invoiceId,
                SentUtc = DateTime.UtcNow,
                ToEmail = toEmail,
                Status = ok ? (attachedPdf ? "Queued" : "QueuedNoPdf") : "Failed",
                Error = ok
                    ? (attachedPdf ? null : "Reminder queued without invoice PDF attachment.")
                    : error,
                ActorUserId = GetUserId()
            });
            await _context.SaveChangesAsync();

            return (ok, error, toEmail, attachedPdf);
        }

        private (DateTime start, DateTime end) GetFiscalYearBounds(int tenantId, int calendarYearHint)
        {
            var fy = _context.AccountingDefaults.AsNoTracking()
                .Where(d => d.TenantId == tenantId)
                .Select(d => d.FiscalYearStart)
                .FirstOrDefault() ?? "01-01";

            return AccountingRules.GetFiscalYearBounds(fy, calendarYearHint, DateTime.Now.Date);
        }

        private void EnsureDefaultPaymentTerms(int tenantId)
        {
            if (_context.PaymentTerms.Any(p => p.TenantId == tenantId))
                return;

            var now = DateTime.UtcNow;
            var seeds = new[]
            {
                ("Net 15", 15, "Payment due within 15 days"),
                ("Net 30", 30, "Payment due within 30 days"),
                ("Net 45", 45, "Payment due within 45 days"),
                ("Net 60", 60, "Payment due within 60 days")
            };
            foreach (var (name, days, desc) in seeds)
            {
                _context.PaymentTerms.Add(new PaymentTerm
                {
                    TenantId = tenantId,
                    Name = name,
                    Days = days,
                    Description = desc,
                    IsActive = true,
                    CreatedDate = now,
                    UpdatedDate = now
                });
            }
            _context.SaveChanges();
        }

        private void EnsureDefaultApprovalLimits(int tenantId)
        {
            if (_context.ApApprovalLimits.Any(a => a.TenantId == tenantId))
                return;

            var roles = _context.UserRole
                .Where(r => r.TenantId == tenantId || r.TenantId == 0)
                .ToList();
            if (roles.Count == 0)
                return;

            var defaults = new Dictionary<string, (decimal limit, bool dual)>(StringComparer.OrdinalIgnoreCase)
            {
                ["Staff"] = (500m, false),
                ["Supervisor"] = (2500m, false),
                ["Manager"] = (10000m, true),
                ["Director"] = (50000m, true),
                ["Admin"] = (100000m, true),
                ["Administrator"] = (100000m, true)
            };

            var now = DateTime.UtcNow;
            var added = false;
            foreach (var role in roles)
            {
                var name = role.RoleName ?? "";
                if (!defaults.TryGetValue(name, out var cfg))
                    continue;
                if (_context.ApApprovalLimits.Any(a => a.TenantId == tenantId && a.RoleId == role.RoleID && a.IsActive))
                    continue;
                _context.ApApprovalLimits.Add(new ApApprovalLimit
                {
                    TenantId = tenantId,
                    RoleId = role.RoleID,
                    LimitAmount = cfg.limit,
                    RequiresDualApproval = cfg.dual,
                    IsActive = true,
                    CreatedDate = now,
                    UpdatedDate = now
                });
                added = true;
            }
            if (added)
                _context.SaveChanges();
        }

        private void UpsertPaymentTerms(int tenantId, PaymentTermRequest[] terms, DateTime now)
        {
            var existing = _context.PaymentTerms.Where(p => p.TenantId == tenantId).ToList();
            var keptNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var term in terms)
            {
                if (string.IsNullOrWhiteSpace(term.Name) || term.Days < 0)
                    continue;

                var name = term.Name.Trim();
                PaymentTerm? row = null;
                if (term.Id > 0)
                    row = existing.FirstOrDefault(p => p.Id == term.Id);
                row ??= existing.FirstOrDefault(p =>
                    string.Equals(p.Name, name, StringComparison.OrdinalIgnoreCase));

                if (row == null)
                {
                    row = new PaymentTerm
                    {
                        TenantId = tenantId,
                        CreatedDate = now
                    };
                    _context.PaymentTerms.Add(row);
                    existing.Add(row);
                }

                row.Name = name;
                row.Days = term.Days;
                row.Description = term.Description?.Trim();
                row.IsActive = true;
                row.UpdatedDate = now;
                keptNames.Add(name);
            }

            foreach (var row in existing.Where(p => p.Id > 0 && p.IsActive))
            {
                if (!keptNames.Contains(row.Name))
                {
                    row.IsActive = false;
                    row.UpdatedDate = now;
                }
            }
        }

        private void UpsertApprovalLimits(int tenantId, ApprovalLimitRequest[] limits, DateTime now)
        {
            var existing = _context.ApApprovalLimits.Where(a => a.TenantId == tenantId).ToList();
            var keepRoleIds = new HashSet<int>();

            foreach (var lim in limits)
            {
                var roleId = lim.RoleId;
                if (roleId <= 0 && !string.IsNullOrWhiteSpace(lim.Role))
                {
                    roleId = _context.UserRole
                        .Where(r => (r.TenantId == tenantId || r.TenantId == 0) &&
                                    r.RoleName == lim.Role)
                        .Select(r => r.RoleID)
                        .FirstOrDefault();
                }
                if (roleId <= 0)
                    continue;

                var row = existing.FirstOrDefault(a => a.RoleId == roleId)
                    ?? (lim.Id > 0 ? existing.FirstOrDefault(a => a.Id == lim.Id) : null);

                if (row == null)
                {
                    row = new ApApprovalLimit
                    {
                        TenantId = tenantId,
                        CreatedDate = now
                    };
                    _context.ApApprovalLimits.Add(row);
                    existing.Add(row);
                }

                row.RoleId = roleId;
                row.LimitAmount = lim.Limit;
                row.RequiresDualApproval = lim.RequiresDualApproval;
                row.IsActive = true;
                row.UpdatedDate = now;
                keepRoleIds.Add(roleId);
            }

            foreach (var row in existing.Where(a => a.IsActive && a.Id > 0 && !keepRoleIds.Contains(a.RoleId)))
            {
                row.IsActive = false;
                row.UpdatedDate = now;
            }
        }
    }

    // Request DTOs
    public class ReconciliationRequest
    {
        public int TransactionId { get; set; }
        public bool Reconciled { get; set; }
    }

    public class BulkReconciliationRequest
    {
        public int[] TransactionIds { get; set; }
    }

    public class StartBankReconciliationPeriodRequest
    {
        public int BankId { get; set; }
        public string StatementDate { get; set; }
        public decimal EndingBalance { get; set; }
    }

    public class UpdateBankReconciliationPeriodRequest
    {
        public int PeriodId { get; set; }
        public string StatementDate { get; set; }
        public decimal? EndingBalance { get; set; }
    }

    public class CompleteBankReconciliationPeriodRequest
    {
        public int PeriodId { get; set; }
    }

    public class AccountingSettingsRequest
    {
        public string CompanyName { get; set; }
        public string FiscalYearStart { get; set; }
        public string DefaultCurrency { get; set; }
        public decimal TaxRate { get; set; }
        public bool GstEnabled { get; set; }
        public string TaxRegistrationNumber { get; set; }
        public int? DefaultAccountsReceivableAccountId { get; set; }
        public int? DefaultAccountsPayableAccountId { get; set; }
        public int? DefaultRevenueAccountId { get; set; }
        public int? DefaultExpenseAccountId { get; set; }
        public int? DefaultInventoryAccountId { get; set; }
        public int? DefaultSalesTaxPayableAccountId { get; set; }
        public int? DefaultInputTaxAccountId { get; set; }
        public int? DefaultFreightOutAccountId { get; set; }
        public int? DefaultOtherChargeAccountId { get; set; }
        public int? DefaultFreightInAccountId { get; set; }
        public int? DefaultWageExpenseAccountId { get; set; }
        public int? DefaultEmployerPayrollTaxExpenseAccountId { get; set; }
        public int? DefaultEmployerPayrollTaxPayableAccountId { get; set; }
        public int? DefaultFederalTaxPayableAccountId { get; set; }
        public int? DefaultStateTaxPayableAccountId { get; set; }
        public int? DefaultLocalTaxPayableAccountId { get; set; }
        public int? DefaultSocialSecurityTaxPayableAccountId { get; set; }
        public int? DefaultMedicareTaxPayableAccountId { get; set; }
        public int? DefaultPreTaxDeductionsPayableAccountId { get; set; }
        public int? DefaultRetirementDeductionsPayableAccountId { get; set; }
        public int? DefaultPostTaxDeductionsPayableAccountId { get; set; }
        public int? DefaultGarnishmentsPayableAccountId { get; set; }
        public int? DefaultNetPayPayableAccountId { get; set; }
        public int? DefaultPayrollBankId { get; set; }
        public PaymentTermRequest[] PaymentTerms { get; set; }
        public ApprovalLimitRequest[] ApprovalLimits { get; set; }
    }

    public class PaymentTermRequest
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public int Days { get; set; }
        public string Description { get; set; }
    }

    public class ApprovalLimitRequest
    {
        public int Id { get; set; }
        public int RoleId { get; set; }
        public string Role { get; set; }
        public decimal Limit { get; set; }
        public bool RequiresDualApproval { get; set; }
    }

    public class SendArReminderRequest
    {
        public int InvoiceId { get; set; }
    }

    public class BulkArReminderRequest
    {
        public int[]? InvoiceIds { get; set; }
    }

    public class AccountingPeriodKeyRequest
    {
        public int TenantId { get; set; }
        public string PeriodKey { get; set; } = "";
    }

    public class ReportRequest
    {
        public string ReportType { get; set; }
        public string DateRange { get; set; }
        public string Format { get; set; }
        /// <summary>Preferred tenant when the client sends it in the body (matches UI).</summary>
        public int TenantId { get; set; }
        /// <summary>Optional site filter for location-scoped reports.</summary>
        public int? LocationId { get; set; }
        /// <summary>Used when <see cref="DateRange"/> is Custom (yyyy-MM-dd).</summary>
        public string CustomStartDate { get; set; }
        public string CustomEndDate { get; set; }
        public object Parameters { get; set; }
    }
}
