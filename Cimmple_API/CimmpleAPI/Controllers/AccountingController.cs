using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Services;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AccountingController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public AccountingController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetPaymentDashboardMetrics")]
        public IActionResult GetPaymentDashboardMetrics(
            [FromQuery] string dateRange = "All",
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                Console.WriteLine($"GetPaymentDashboardMetrics called - TenantId: {tenantId}, DateRange: {dateRange}, LocationId: {filterLocationId}");

                var dateFilter = GetDateRangeFilter(dateRange);

                // Calculate Accounts Receivable metrics
                var arMetrics = CalculateAccountsReceivableMetrics(tenantId, dateFilter, filterLocationId);

                // Calculate Accounts Payable metrics
                var apMetrics = CalculateAccountsPayableMetrics(tenantId, dateFilter, filterLocationId);

                // Calculate Cash Flow metrics
                var cashFlowMetrics = CalculateCashFlowMetrics(tenantId, dateFilter, filterLocationId);

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
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                Console.WriteLine($"GetRecentTransactions called - TenantId: {tenantId}, Limit: {limit}, DateRange: {dateRange}, LocationId: {filterLocationId}");
                var safeLimit = Math.Clamp(limit, 1, 200);
                var dateFilter = GetDateRangeFilter(dateRange);
                var rangeStart = dateFilter.startDate.Date;
                var rangeEnd = dateFilter.endDate.Date.AddDays(1).AddTicks(-1);

                // Get recent transactions from multiple sources
                var recentTransactions = new List<dynamic>();

                // 1. Recent customer payments (from Transactions table)
                var customerPaymentsQuery = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                                t.isCustomer == 1 &&
                                t.TransactionType != null &&
                                EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                t.TransactionDate >= rangeStart &&
                                t.TransactionDate <= rangeEnd);
                if (filterLocationId.HasValue)
                    customerPaymentsQuery = customerPaymentsQuery.Where(t => t.locationId == filterLocationId.Value);

                var customerPayments = customerPaymentsQuery
                    .OrderByDescending(t => t.TransactionDate)
                    .ThenByDescending(t => t.TransactionID)
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

                // 2. Recent vendor payments (from Transactions table)
                var vendorPaymentsQuery = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                                (t.isCustomer == 0 || t.isCustomer == null) &&
                                t.TransactionType != null &&
                                EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                t.TransactionDate >= rangeStart &&
                                t.TransactionDate <= rangeEnd);
                if (filterLocationId.HasValue)
                    vendorPaymentsQuery = vendorPaymentsQuery.Where(t => t.locationId == filterLocationId.Value);

                var vendorPayments = vendorPaymentsQuery
                    .OrderByDescending(t => t.TransactionDate)
                    .ThenByDescending(t => t.TransactionID)
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
                                      t.invoiceNo == (vim.prefixinvoiceno ?? vim.InvoiceNo)));
                if (filterLocationId.HasValue)
                    vendorInvoiceFallbackQuery = vendorInvoiceFallbackQuery.Where(vim => vim.locationId == filterLocationId.Value);

                var vendorInvoiceFallbackPayments = vendorInvoiceFallbackQuery
                    .OrderByDescending(vim => vim.Paydate)
                    .ThenByDescending(vim => vim.Id)
                    .Take(safeLimit)
                    .Select(vim => new
                    {
                        id = vim.Id,
                        type = "payment" as string,
                        description = $"Payment made to {(string.IsNullOrWhiteSpace(vim.VendorName) ? "Vendor" : vim.VendorName)} for invoice {vim.prefixinvoiceno ?? vim.InvoiceNo}",
                        amount = -vim.TotalAmount,
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
        public IActionResult GetBankTransactions([FromQuery] int bankAccountId, [FromQuery] string startDate, [FromQuery] string endDate)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                Console.WriteLine($"GetBankTransactions called - TenantId: {tenantId}, BankAccountId: {bankAccountId}, StartDate: {startDate}, EndDate: {endDate}");

                var start = DateTime.Parse(startDate).Date;
                var end = DateTime.Parse(endDate).Date.AddDays(1).AddTicks(-1);

                // Include Payment (AR/AP cash), plus legacy Deposit / Withdrawal rows.
                var bankTypeSet = new[] { "Payment", "Deposit", "Withdrawal" };
                var rows = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                                t.BankId == bankAccountId &&
                                t.TransactionDate >= start &&
                                t.TransactionDate <= end &&
                                t.TransactionType != null &&
                                bankTypeSet.Contains(t.TransactionType))
                    .OrderByDescending(t => t.TransactionDate)
                    .ThenByDescending(t => t.TransactionID)
                    .ToList()
                    .Select(t =>
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
                    })
                    .ToList();

                return Ok(new { result = rows });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetBankTransactions: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
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

                txn.IsReconciled = request.Reconciled;
                txn.ReconciledUtc = request.Reconciled ? DateTime.UtcNow : null;

                if (request.Reconciled && txn.BankId.HasValue)
                {
                    var bank = _context.BankMaster.FirstOrDefault(b => b.Id == txn.BankId.Value && b.TenantId == tenantId);
                    if (bank != null)
                        bank.LastReconciledDate = DateTime.UtcNow.Date;
                }

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

                var now = DateTime.UtcNow;
                foreach (var txn in txns)
                {
                    txn.IsReconciled = true;
                    txn.ReconciledUtc = now;
                }

                var bankIds = txns.Where(t => t.BankId.HasValue).Select(t => t.BankId!.Value).Distinct().ToList();
                if (bankIds.Count > 0)
                {
                    var banks = _context.BankMaster.Where(b => b.TenantId == tenantId && bankIds.Contains(b.Id)).ToList();
                    foreach (var bank in banks)
                        bank.LastReconciledDate = now.Date;
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

                object reportData;

                switch (request.ReportType.ToLower())
                {
                    case "balance-sheet":
                        reportData = GenerateBalanceSheet(tenantId, dateFilter.endDate);
                        break;
                    case "profit-loss":
                    case "income-statement":
                        reportData = GenerateProfitLossStatement(tenantId, dateFilter.startDate, dateFilter.endDate);
                        break;
                    case "cash-flow":
                        reportData = GenerateCashFlowStatement(tenantId, dateFilter.startDate, dateFilter.endDate);
                        break;
                    case "ar-aging":
                        reportData = GenerateARAgingReport(tenantId);
                        break;
                    case "ap-aging":
                        reportData = GenerateAPAgingReport(tenantId);
                        break;
                    case "trial-balance":
                        reportData = GenerateTrialBalance(tenantId, dateFilter.endDate);
                        break;
                    default:
                        return BadRequest(new { error = "Unsupported report type" });
                }

                return Ok(new { result = reportData });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GenerateFinancialReport: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private object GenerateBalanceSheet(int tenantId, DateTime asOfDate)
        {
            // Assets
            var currentAssets = CalculateAssetBalances(tenantId, asOfDate, true);
            var fixedAssets = CalculateAssetBalances(tenantId, asOfDate, false);

            // Liabilities
            var currentLiabilities = CalculateLiabilityBalances(tenantId, asOfDate, true);
            var longTermLiabilities = CalculateLiabilityBalances(tenantId, asOfDate, false);

            // Equity
            var equity = CalculateEquityBalance(tenantId, asOfDate);

            return new
            {
                reportType = "Balance Sheet",
                asOfDate = asOfDate.ToString("yyyy-MM-dd"),
                assets = new
                {
                    currentAssets,
                    fixedAssets,
                    totalAssets = currentAssets + fixedAssets
                },
                liabilitiesAndEquity = new
                {
                    currentLiabilities,
                    longTermLiabilities,
                    totalLiabilities = currentLiabilities + longTermLiabilities,
                    equity,
                    totalLiabilitiesAndEquity = currentLiabilities + longTermLiabilities + equity
                }
            };
        }

        private object GenerateProfitLossStatement(int tenantId, DateTime startDate, DateTime endDate)
        {
            // Accrual / GL basis: posted journal activity by COA (MainGroup drives sectioning).
            return ProfitLossGlReportService.Build(_context, tenantId, startDate, endDate);
        }

        private object GenerateCashFlowStatement(int tenantId, DateTime startDate, DateTime endDate)
        {
            // Operating Activities
            var operatingCashFlow = CalculateOperatingCashFlow(tenantId, startDate, endDate);

            // Investing Activities
            var investingCashFlow = CalculateInvestingCashFlow(tenantId, startDate, endDate);

            // Financing Activities
            var financingCashFlow = CalculateFinancingCashFlow(tenantId, startDate, endDate);

            var netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

            return new
            {
                reportType = "Cash Flow Statement",
                periodStart = startDate.ToString("yyyy-MM-dd"),
                periodEnd = endDate.ToString("yyyy-MM-dd"),
                operatingActivities = operatingCashFlow,
                investingActivities = investingCashFlow,
                financingActivities = financingCashFlow,
                netCashFlow
            };
        }

        private object GenerateARAgingReport(int tenantId)
        {
            var agingData = CalculateARAging(tenantId);

            return new
            {
                reportType = "AR Aging Report",
                asOfDate = DateTime.Now.ToString("yyyy-MM-dd"),
                agingBuckets = agingData
            };
        }

        private object GenerateAPAgingReport(int tenantId)
        {
            var agingData = CalculateAPAging(tenantId);

            return new
            {
                reportType = "AP Aging Report",
                asOfDate = DateTime.Now.ToString("yyyy-MM-dd"),
                agingBuckets = agingData
            };
        }

        private object GenerateTrialBalance(int tenantId, DateTime asOfDate)
        {
            // Materialize accounts first, then compute balances in memory.
            // CalculateAccountBalance is a C# method and cannot be translated to SQL.
            var accounts = _context.ChartofAccounts
                .Where(coa => coa.Tenantid == tenantId)
                .ToList();

            var accountBalances = accounts
                .Select(coa => new
                {
                    accountId = coa.AccountID,
                    accountCode = coa.AccountCode,
                    accountName = coa.AccountName,
                    accountType = coa.AccountType,
                    balance = CalculateAccountBalance(coa.AccountID, tenantId, asOfDate)
                })
                .Where(acc => acc.balance != 0) // Only show accounts with balances
                .OrderBy(acc => acc.accountCode)
                .ToList();

            var totalDebits = accountBalances.Where(acc => acc.balance > 0).Sum(acc => acc.balance);
            var totalCredits = Math.Abs(accountBalances.Where(acc => acc.balance < 0).Sum(acc => acc.balance));

            return new
            {
                reportType = "Trial Balance",
                asOfDate = asOfDate.ToString("yyyy-MM-dd"),
                accounts = accountBalances,
                totalDebits,
                totalCredits,
                isBalanced = Math.Abs(totalDebits - totalCredits) < 0.01m
            };
        }

        // Helper calculation methods using real data
        private decimal CalculateAccountBalance(int accountId, int tenantId, DateTime asOfDate)
        {
            try
            {
                decimal balance = 0;

                // Get valid transaction IDs up to asOfDate
                var validTransactionIds = _context.Transactions
                    .Where(t => t.TenantId == tenantId && 
                               t.TransactionDate != null && 
                               t.TransactionDate <= asOfDate)
                    .Select(t => t.TransactionID)
                    .ToList();

                // Calculate from Deposits (credits/increases)
                var deposits = _context.Deposits
                    .Where(d => d.AccountID == accountId && 
                               d.TenantID == tenantId &&
                               validTransactionIds.Contains(d.TransactionID))
                    .Sum(d => (decimal?)d.Amount) ?? 0;

                // Calculate from Withdrawals (debits/decreases)
                var withdrawals = _context.Withdrawals
                    .Where(w => w.AccountID == accountId && 
                               w.TenantID == tenantId &&
                               validTransactionIds.Contains(w.TransactionID))
                    .Sum(w => (decimal?)w.Amount) ?? 0;

                // Calculate from Journal Entries (From = debit, To = credit)
                var validJournalEntryIds = _context.JournalEntries
                    .Where(je => je.TenantId == tenantId && je.EntryDate <= asOfDate)
                    .Select(je => je.Id)
                    .ToList();

                var journalDebits = _context.JournalEntryFrom
                    .Where(j => j.AccountId == accountId &&
                               validJournalEntryIds.Contains(j.JournalEntryId))
                    .Sum(j => (decimal?)j.Amount) ?? 0;

                var journalCredits = _context.JournalEntryTo
                    .Where(j => j.AccountId == accountId &&
                               validJournalEntryIds.Contains(j.JournalEntryId))
                    .Sum(j => (decimal?)j.Amount) ?? 0;

                // Calculate from TransCoa (transaction to account mapping)
                var transCoaAmounts = _context.TransCoa
                    .Where(tc => tc.accountid == accountId && 
                                tc.Tenantid == tenantId &&
                                validTransactionIds.Contains(tc.Transid))
                    .Join(_context.Transactions.Where(t => validTransactionIds.Contains(t.TransactionID)),
                          tc => tc.Transid,
                          t => t.TransactionID,
                          (tc, t) => t.Amount ?? 0)
                    .Sum();

                // Determine if account is debit-normal (Assets, Expenses) or credit-normal (Liabilities, Equity, Revenue)
                var account = _context.ChartofAccounts
                    .FirstOrDefault(coa => coa.AccountID == accountId && coa.Tenantid == tenantId);

                if (account != null)
                {
                    var accountType = account.AccountType?.ToLower() ?? "";
                    bool isDebitNormal = accountType.Contains("asset") || accountType.Contains("expense");

                    if (isDebitNormal)
                    {
                        // Debit-normal: Deposits and Journal Credits increase, Withdrawals and Journal Debits decrease
                        balance = deposits + journalCredits - withdrawals - journalDebits + transCoaAmounts;
                    }
                    else
                    {
                        // Credit-normal: Withdrawals and Journal Debits increase, Deposits and Journal Credits decrease
                        balance = withdrawals + journalDebits - deposits - journalCredits - transCoaAmounts;
                    }
                }
                else
                {
                    // Default calculation if account not found
                    balance = deposits - withdrawals + journalCredits - journalDebits + transCoaAmounts;
                }

                return balance;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating account balance for account {accountId}: {ex.Message}");
                return 0; // Return 0 on error to prevent breaking the report
            }
        }

        private decimal CalculateAssetBalances(int tenantId, DateTime asOfDate, bool currentAssets)
        {
            try
            {
                // Get asset account types
                var assetTypes = currentAssets 
                    ? new[] { "Current Asset", "Cash", "Bank", "Accounts Receivable", "Inventory" }
                    : new[] { "Fixed Asset", "Property", "Equipment", "Plant" };

                var assetAccounts = _context.ChartofAccounts
                    .Where(coa => coa.Tenantid == tenantId && 
                                  coa.AccountType != null &&
                                  assetTypes.Any(at => coa.AccountType.Contains(at, StringComparison.OrdinalIgnoreCase)))
                    .Select(coa => coa.AccountID)
                    .ToList();

                decimal totalBalance = 0;
                foreach (var accountId in assetAccounts)
                {
                    var balance = CalculateAccountBalance(accountId, tenantId, asOfDate);
                    totalBalance += balance;
                }

                return totalBalance;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating asset balances: {ex.Message}");
                return 0;
            }
        }

        private decimal CalculateLiabilityBalances(int tenantId, DateTime asOfDate, bool currentLiabilities)
        {
            try
            {
                // Get liability account types
                var liabilityTypes = currentLiabilities
                    ? new[] { "Current Liability", "Accounts Payable", "Short Term Debt" }
                    : new[] { "Long Term Liability", "Long Term Debt", "Loan" };

                var liabilityAccounts = _context.ChartofAccounts
                    .Where(coa => coa.Tenantid == tenantId && 
                                  coa.AccountType != null &&
                                  liabilityTypes.Any(lt => coa.AccountType.Contains(lt, StringComparison.OrdinalIgnoreCase)))
                    .Select(coa => coa.AccountID)
                    .ToList();

                decimal totalBalance = 0;
                foreach (var accountId in liabilityAccounts)
                {
                    var balance = CalculateAccountBalance(accountId, tenantId, asOfDate);
                    // Liabilities are credit-normal, so negative balance means positive liability
                    totalBalance += Math.Abs(balance);
                }

                return totalBalance;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating liability balances: {ex.Message}");
                return 0;
            }
        }

        private decimal CalculateEquityBalance(int tenantId, DateTime asOfDate)
        {
            // Assets - Liabilities = Equity
            var assets = CalculateAssetBalances(tenantId, asOfDate, true) + CalculateAssetBalances(tenantId, asOfDate, false);
            var liabilities = CalculateLiabilityBalances(tenantId, asOfDate, true) + CalculateLiabilityBalances(tenantId, asOfDate, false);
            return assets - liabilities;
        }

        private decimal CalculateRevenue(int tenantId, DateTime startDate, DateTime endDate)
        {
            try
            {
                // Sum of all paid customer invoices in the period
                var revenue = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                                im.PaymentDate != null && // Paid invoices only
                                im.InvoiceDate >= startDate &&
                                im.InvoiceDate <= endDate)
                    .Sum(im => (decimal?)im.TotalAmount) ?? 0;

                return revenue;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating revenue: {ex.Message}");
                return 0;
            }
        }

        private decimal CalculateCOGS(int tenantId, DateTime startDate, DateTime endDate)
        {
            try
            {
                // Cost of goods sold - sum of paid vendor invoices (or use account type filtering)
                // For now, using all paid vendor invoices as COGS
                var cogs = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 (vim.isPaid == 1 || vim.Paydate != null) && // Paid invoices
                                 vim.InvoiceDate >= startDate &&
                                 vim.InvoiceDate <= endDate)
                    .Sum(vim => (decimal?)vim.TotalAmount) ?? 0;

                return cogs;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating COGS: {ex.Message}");
                return 0;
            }
        }

        private decimal CalculateOperatingExpenses(int tenantId, DateTime startDate, DateTime endDate)
        {
            try
            {
                // Operating expenses - sum of paid vendor invoices (could be filtered by expense account types)
                // For now, using all paid vendor invoices as operating expenses
                // In a full implementation, this would be filtered by expense account types
                var expenses = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 (vim.isPaid == 1 || vim.Paydate != null) && // Paid invoices
                                 vim.InvoiceDate >= startDate &&
                                 vim.InvoiceDate <= endDate)
                    .Sum(vim => (decimal?)vim.TotalAmount) ?? 0;

                return expenses;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating operating expenses: {ex.Message}");
                return 0;
            }
        }

        private decimal CalculateOperatingCashFlow(int tenantId, DateTime startDate, DateTime endDate)
        {
            try
            {
                // Operating cash flow = Cash received from customers - Cash paid to vendors
                var cashIn = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.isCustomer == 1 &&
                               t.TransactionType != null &&
                               t.TransactionType == "Payment" &&
                               t.TransactionDate != null &&
                               t.TransactionDate >= startDate &&
                               t.TransactionDate <= endDate)
                    .Sum(t => t.Amount ?? 0);

                var cashOut = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.isCustomer == 0 &&
                               t.TransactionType != null &&
                               t.TransactionType == "Payment" &&
                               t.TransactionDate != null &&
                               t.TransactionDate >= startDate &&
                               t.TransactionDate <= endDate)
                    .Sum(t => t.Amount ?? 0);

                return cashIn - cashOut;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating operating cash flow: {ex.Message}");
                return 0;
            }
        }

        private decimal CalculateInvestingCashFlow(int tenantId, DateTime startDate, DateTime endDate)
        {
            try
            {
                // Investing activities - typically asset purchases/sales
                // For now, using transactions marked as investing (could be enhanced with account type filtering)
                var investingTransactions = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.TransactionType != null &&
                               t.TransactionDate != null &&
                               (t.TransactionType.Contains("Investment", StringComparison.OrdinalIgnoreCase) ||
                                t.TransactionType.Contains("Asset", StringComparison.OrdinalIgnoreCase)) &&
                               t.TransactionDate >= startDate &&
                               t.TransactionDate <= endDate)
                    .Sum(t => t.Amount ?? 0);

                return -investingTransactions; // Negative for outflows
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating investing cash flow: {ex.Message}");
                return 0;
            }
        }

        private decimal CalculateFinancingCashFlow(int tenantId, DateTime startDate, DateTime endDate)
        {
            try
            {
                // Financing activities - loans, equity transactions
                // For now, using transactions marked as financing (could be enhanced with account type filtering)
                var financingTransactions = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.TransactionType != null &&
                               t.TransactionDate != null &&
                               (t.TransactionType.Contains("Loan", StringComparison.OrdinalIgnoreCase) ||
                                t.TransactionType.Contains("Financing", StringComparison.OrdinalIgnoreCase)) &&
                               t.TransactionDate >= startDate &&
                               t.TransactionDate <= endDate)
                    .Sum(t => t.Amount ?? 0);

                return -financingTransactions; // Negative for outflows
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating financing cash flow: {ex.Message}");
                return 0;
            }
        }

        private object CalculateARAging(int tenantId)
        {
            try
            {
                var today = DateTime.Now.Date;

                var unpaidInvoices = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                                 !im.IsVoided &&
                                 im.PaidAmount < im.TotalAmount - 0.009m)
                    .ToList();

                var items = unpaidInvoices.Select(im =>
                    new AccountingRules.AgingItem(
                        im.DueDate,
                        AccountingRules.OpenBalance(im.TotalAmount, im.PaidAmount)));

                var buckets = AccountingRules.CalculateAgingBuckets(items, today);
                var total = buckets.Sum(b => b.Amount);

                return buckets.Select(b => new
                {
                    bucket = b.Name,
                    amount = b.Amount,
                    percentage = b.Percentage(total)
                }).ToArray();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating AR aging: {ex.Message}");
                return new[]
                {
                    new { bucket = "Current", amount = 0m, percentage = 0m },
                    new { bucket = "1-30 Days", amount = 0m, percentage = 0m },
                    new { bucket = "31-60 Days", amount = 0m, percentage = 0m },
                    new { bucket = "61-90 Days", amount = 0m, percentage = 0m },
                    new { bucket = "Over 90 Days", amount = 0m, percentage = 0m }
                };
            }
        }

        private object CalculateAPAging(int tenantId)
        {
            try
            {
                var today = DateTime.Now.Date;

                var unpaidInvoices = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                  vim.voideddate == null &&
                                  vim.PaidAmount < vim.TotalAmount - 0.009m)
                    .ToList();

                var items = unpaidInvoices.Select(vim =>
                    new AccountingRules.AgingItem(
                        vim.DueDate,
                        AccountingRules.OpenBalance(vim.TotalAmount, vim.PaidAmount)));

                var buckets = AccountingRules.CalculateAgingBuckets(items, today);
                var total = buckets.Sum(b => b.Amount);

                return buckets.Select(b => new
                {
                    bucket = b.Name,
                    amount = b.Amount,
                    percentage = b.Percentage(total)
                }).ToArray();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error calculating AP aging: {ex.Message}");
                return new[]
                {
                    new { bucket = "Current", amount = 0m, percentage = 0m },
                    new { bucket = "1-30 Days", amount = 0m, percentage = 0m },
                    new { bucket = "31-60 Days", amount = 0m, percentage = 0m },
                    new { bucket = "61-90 Days", amount = 0m, percentage = 0m },
                    new { bucket = "Over 90 Days", amount = 0m, percentage = 0m }
                };
            }
        }

        private (decimal totalReceivables, decimal overdueReceivables, decimal receivablesDueThisWeek) CalculateAccountsReceivableMetrics(
            int tenantId,
            (DateTime startDate, DateTime endDate) dateFilter,
            int? locationId = null)
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
            int? locationId = null)
        {
            // Outstanding AP: exclude paid/voided; use remaining balance due.
            var vendorInvoiceQuery = _context.VendorInvoiceMaster
                .Where(vim => vim.TenantId == tenantId &&
                             vim.isPaid != 1 &&
                             vim.isPaid != 2 &&
                             vim.voideddate == null);
            if (locationId.HasValue)
                vendorInvoiceQuery = vendorInvoiceQuery.Where(vim => vim.locationId == locationId.Value);

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

        private (decimal cashIn, decimal cashOut) CalculateCashFlowMetrics(
            int tenantId,
            (DateTime startDate, DateTime endDate) dateFilter,
            int? locationId = null)
        {
            var rangeStart = dateFilter.startDate.Date;
            var rangeEnd = dateFilter.endDate.Date.AddDays(1).AddTicks(-1);

            // Calculate cash inflows (customer payments received)
            var cashInQuery = _context.Transactions
                .Where(t => t.TenantId == tenantId &&
                           t.isCustomer == 1 &&
                           t.TransactionType == "Payment" &&
                           t.TransactionDate >= rangeStart &&
                           t.TransactionDate <= rangeEnd);
            if (locationId.HasValue)
                cashInQuery = cashInQuery.Where(t => t.locationId == locationId.Value);
            var cashIn = cashInQuery.Sum(t => t.Amount ?? 0);

            // Calculate cash outflows (vendor payments made)
            var cashOutQuery = _context.Transactions
                .Where(t => t.TenantId == tenantId &&
                           t.isCustomer == 0 &&
                           t.TransactionType == "Payment" &&
                           t.TransactionDate >= rangeStart &&
                           t.TransactionDate <= rangeEnd);
            if (locationId.HasValue)
                cashOutQuery = cashOutQuery.Where(t => t.locationId == locationId.Value);
            var cashOut = cashOutQuery.Sum(t => t.Amount ?? 0);

            return (cashIn, cashOut);
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

                _context.GlAccountingPeriodLocks.Add(new GlAccountingPeriodLock
                {
                    TenantId = tid,
                    PeriodKey = pk,
                    ClosedUtc = DateTime.UtcNow,
                    ClosedByUserId = GetUserId()
                });
                GlWorkflowService.AddAudit(_context, tid, "PeriodClose", GetUserId(), null, null, pk, null);
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
        public IActionResult SendArReminder([FromBody] SendArReminderRequest request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                SystemSettingsSchemaService.EnsureTablesAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();
                if (request == null || request.InvoiceId <= 0)
                    return BadRequest(new { error = "Invoice id is required." });

                var result = SendOneArReminder(tenantId, request.InvoiceId);
                if (!result.ok)
                    return BadRequest(new { error = result.error });

                return Ok(new { result = new { message = "Payment reminder sent", toEmail = result.toEmail } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SendBulkArReminders")]
        public IActionResult SendBulkArReminders([FromBody] BulkArReminderRequest? request)
        {
            try
            {
                AccountingGapSchemaService.EnsureAsync(_context).GetAwaiter().GetResult();
                SystemSettingsSchemaService.EnsureTablesAsync(_context).GetAwaiter().GetResult();
                var tenantId = GetTenantId();

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
                    var r = SendOneArReminder(tenantId, id);
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

        private (bool ok, string? error, string? toEmail) SendOneArReminder(int tenantId, int invoiceId)
        {
            var invoice = _context.InvoiceMaster
                .FirstOrDefault(im => im.Id == invoiceId && im.TenantId == tenantId);
            if (invoice == null)
                return (false, "Invoice not found", null);
            if (invoice.IsVoided)
                return (false, "Cannot send reminder for a voided invoice", null);

            var balance = invoice.TotalAmount - invoice.PaidAmount;
            if (balance <= 0.009m)
                return (false, "Invoice is fully paid", null);

            var orderId = _context.InvoiceDetail
                .Where(d => d.InvoiceId == invoice.Id)
                .Select(d => d.OrderId)
                .FirstOrDefault();
            var order = _context.CustomerOrder
                .AsNoTracking()
                .FirstOrDefault(o => o.OrderID == orderId && o.Tenantid == tenantId);
            string? toEmail = null;
            string customerName = order?.CustomerName ?? "Customer";
            if (order != null)
            {
                toEmail = _context.CustomerMaster
                    .AsNoTracking()
                    .Where(c => c.Tenantid == tenantId && c.customer_id == order.CustomerID)
                    .Select(c => c.ContactEmail ?? c.email)
                    .FirstOrDefault();
            }

            var settings = _context.SystemSettings.AsNoTracking()
                .FirstOrDefault(s => s.TenantId == tenantId);
            var company = _context.AccountingDefaults.AsNoTracking()
                .FirstOrDefault(d => d.TenantId == tenantId)?.CompanyName ?? "Cimmple";

            var invoiceLabel = !string.IsNullOrWhiteSpace(invoice.PrefixInvoiceNo)
                ? invoice.PrefixInvoiceNo
                : invoice.InvoiceNo.ToString();
            var subject = $"Payment reminder — Invoice {invoiceLabel}";
            var body =
                $"Dear {customerName},\n\n" +
                $"This is a friendly reminder that invoice {invoiceLabel} dated {invoice.InvoiceDate:yyyy-MM-dd} " +
                $"has an outstanding balance of {balance:0.00} (due {invoice.DueDate:yyyy-MM-dd}).\n\n" +
                $"Thank you,\n{company}";

            var (ok, error) = AccountingEmailService.TrySend(settings!, toEmail ?? "", subject, body);
            _context.ArReminderLogs.Add(new ArReminderLog
            {
                TenantId = tenantId,
                InvoiceId = invoiceId,
                SentUtc = DateTime.UtcNow,
                ToEmail = toEmail,
                Status = ok ? "Sent" : "Failed",
                Error = error,
                ActorUserId = GetUserId()
            });
            _context.SaveChanges();

            return (ok, error, toEmail);
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
        /// <summary>Used when <see cref="DateRange"/> is Custom (yyyy-MM-dd).</summary>
        public string CustomStartDate { get; set; }
        public string CustomEndDate { get; set; }
        public object Parameters { get; set; }
    }
}
