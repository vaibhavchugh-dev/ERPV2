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
    [AllowAnonymous]
    public class AccountingController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public AccountingController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetPaymentDashboardMetrics")]
        public IActionResult GetPaymentDashboardMetrics([FromQuery] string dateRange = "This Month")
        {
            try
            {
                var tenantId = GetTenantId();
                Console.WriteLine($"GetPaymentDashboardMetrics called - TenantId: {tenantId}, DateRange: {dateRange}");

                var dateFilter = GetDateRangeFilter(dateRange);

                // Calculate Accounts Receivable metrics
                var arMetrics = CalculateAccountsReceivableMetrics(tenantId, dateFilter);

                // Calculate Accounts Payable metrics
                var apMetrics = CalculateAccountsPayableMetrics(tenantId, dateFilter);

                // Calculate Cash Flow metrics
                var cashFlowMetrics = CalculateCashFlowMetrics(tenantId, dateFilter);

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
        public IActionResult GetRecentTransactions([FromQuery] int limit = 10)
        {
            try
            {
                var tenantId = GetTenantId();
                Console.WriteLine($"GetRecentTransactions called - TenantId: {tenantId}, Limit: {limit}");
                var safeLimit = Math.Clamp(limit, 1, 200);

                // Get recent transactions from multiple sources
                var recentTransactions = new List<dynamic>();

                // 1. Recent customer payments (from Transactions table)
                var customerPayments = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                                t.isCustomer == 1 &&
                                t.TransactionType != null &&
                                EF.Functions.Like(t.TransactionType, "%Payment%"))
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
                var vendorPayments = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                                (t.isCustomer == 0 || t.isCustomer == null) &&
                                t.TransactionType != null &&
                                EF.Functions.Like(t.TransactionType, "%Payment%"))
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
                var vendorInvoiceFallbackPayments = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                  vim.isPaid == 1 &&
                                  vim.Paydate != null &&
                                  !_context.Transactions.Any(t =>
                                      t.TenantId == tenantId &&
                                      (t.isCustomer == 0 || t.isCustomer == null) &&
                                      t.TransactionType != null &&
                                      EF.Functions.Like(t.TransactionType, "%Payment%") &&
                                      t.invoiceNo == (vim.prefixinvoiceno ?? vim.InvoiceNo)))
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

                // 3. Recent invoice creations
                var recentInvoices = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId)
                    .OrderByDescending(im => im.InvoiceDate)
                    .ThenByDescending(im => im.Id)
                    .Take(safeLimit)
                    .Select(im => new
                    {
                        id = im.Id,
                        type = "invoice" as string,
                        description = $"Invoice {im.InvoiceNo} created",
                        amount = im.TotalAmount,
                        date = im.InvoiceDate,
                        status = (im.PaymentDate != null ? "completed" : "pending") as string,
                        customerVendor = "Customer" as string
                    })
                    .ToList();

                recentTransactions.AddRange(recentInvoices);

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
                var tenantId = GetTenantId();
                Console.WriteLine($"GetBankTransactions called - TenantId: {tenantId}, BankAccountId: {bankAccountId}, StartDate: {startDate}, EndDate: {endDate}");

                var start = DateTime.Parse(startDate);
                var end = DateTime.Parse(endDate);

                // Get transactions for the specified bank account within the date range
                // For now, we'll simulate bank transactions based on existing transaction data
                // In a real implementation, this would pull from a dedicated bank transaction table
                var bankTransactions = new List<dynamic>();

                // Get deposits (cash inflows)
                var deposits = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.BankId == bankAccountId &&
                               t.TransactionDate >= start &&
                               t.TransactionDate <= end &&
                               t.TransactionType == "Deposit")
                    .Select(t => new
                    {
                        id = t.TransactionID,
                        date = t.TransactionDate.HasValue ? t.TransactionDate.Value.ToString("yyyy-MM-dd") : "",
                        description = t.Description ?? "Deposit",
                        amount = t.Amount ?? 0,
                        type = "credit" as string,
                        reconciled = false, // This would come from a reconciliation table
                        reference = t.CheckNo ?? ""
                    })
                    .ToList();

                bankTransactions.AddRange(deposits);

                // Get withdrawals/checks (cash outflows)
                var withdrawals = _context.Transactions
                    .Where(t => t.TenantId == tenantId &&
                               t.BankId == bankAccountId &&
                               t.TransactionDate >= start &&
                               t.TransactionDate <= end &&
                               t.TransactionType == "Withdrawal")
                    .Select(t => new
                    {
                        id = t.TransactionID,
                        date = t.TransactionDate.HasValue ? t.TransactionDate.Value.ToString("yyyy-MM-dd") : "",
                        description = t.Description ?? "Withdrawal",
                        amount = -(t.Amount ?? 0), // Negative for debits
                        type = "debit" as string,
                        reconciled = false, // This would come from a reconciliation table
                        reference = t.CheckNo ?? ""
                    })
                    .ToList();

                bankTransactions.AddRange(withdrawals);

                // Sort by date
                var sortedTransactions = bankTransactions
                    .OrderByDescending(t => t.date)
                    .ToList();

                return Ok(new { result = sortedTransactions });
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
                var tenantId = GetTenantId();
                Console.WriteLine($"ReconcileBankTransaction called - TenantId: {tenantId}, TransactionId: {request.TransactionId}, Reconciled: {request.Reconciled}");

                // In a real implementation, this would update a reconciliation status table
                // For now, we'll just return success
                return Ok(new { result = new { message = "Transaction reconciliation updated successfully" } });
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
                var tenantId = GetTenantId();
                Console.WriteLine($"BulkReconcileTransactions called - TenantId: {tenantId}, TransactionIds: {string.Join(",", request.TransactionIds)}");

                // In a real implementation, this would update multiple reconciliation statuses
                // For now, we'll just return success
                return Ok(new { result = new { message = $"{request.TransactionIds.Length} transactions reconciled successfully" } });
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
                var tenantId = GetTenantId();
                Console.WriteLine($"GetAccountingSettings called - TenantId: {tenantId}");

                // For now, return default settings. In a real implementation,
                // this would retrieve from a dedicated accounting settings table
                var defaultSettings = new
                {
                    companyName = "Cimmple Corp",
                    fiscalYearStart = "01-01",
                    defaultCurrency = "USD",
                    taxRate = 8.25,
                    paymentTerms = new[]
                    {
                        new { id = 1, name = "Net 15", days = 15, description = "Payment due within 15 days" },
                        new { id = 2, name = "Net 30", days = 30, description = "Payment due within 30 days" },
                        new { id = 3, name = "Net 45", days = 45, description = "Payment due within 45 days" },
                        new { id = 4, name = "Net 60", days = 60, description = "Payment due within 60 days" }
                    },
                    approvalLimits = new[]
                    {
                        new { id = 1, role = "Staff", limit = 500, requiresDualApproval = false },
                        new { id = 2, role = "Supervisor", limit = 2500, requiresDualApproval = false },
                        new { id = 3, role = "Manager", limit = 10000, requiresDualApproval = true },
                        new { id = 4, role = "Director", limit = 50000, requiresDualApproval = true }
                    }
                };

                return Ok(new { result = defaultSettings });
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
                var tenantId = GetTenantId();
                Console.WriteLine($"SaveAccountingSettings called - TenantId: {tenantId}");

                // In a real implementation, this would save to a dedicated accounting settings table
                // For now, we'll just validate and return success
                if (request == null)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                // Basic validation
                if (string.IsNullOrWhiteSpace(request.CompanyName))
                {
                    return BadRequest(new { error = "Company name is required" });
                }

                if (request.TaxRate < 0 || request.TaxRate > 100)
                {
                    return BadRequest(new { error = "Tax rate must be between 0 and 100" });
                }

                return Ok(new { result = new { message = "Accounting settings saved successfully" } });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in SaveAccountingSettings: {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
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
                
                // Get all unpaid customer invoices
                var unpaidInvoices = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId &&
                                im.PaymentDate == null) // Unpaid
                    .ToList();

                var current = unpaidInvoices
                    .Where(im => im.DueDate.Date >= today)
                    .Sum(im => im.TotalAmount);

                var days1to30 = unpaidInvoices
                    .Where(im => im.DueDate.Date < today && 
                                im.DueDate.Date >= today.AddDays(-30))
                    .Sum(im => im.TotalAmount);

                var days31to60 = unpaidInvoices
                    .Where(im => im.DueDate.Date < today.AddDays(-30) && 
                                im.DueDate.Date >= today.AddDays(-60))
                    .Sum(im => im.TotalAmount);

                var days61to90 = unpaidInvoices
                    .Where(im => im.DueDate.Date < today.AddDays(-60) && 
                                im.DueDate.Date >= today.AddDays(-90))
                    .Sum(im => im.TotalAmount);

                var over90Days = unpaidInvoices
                    .Where(im => im.DueDate.Date < today.AddDays(-90))
                    .Sum(im => im.TotalAmount);

                var total = current + days1to30 + days31to60 + days61to90 + over90Days;

                return new[]
                {
                    new { bucket = "Current", amount = current, percentage = total > 0 ? (current / total * 100) : 0 },
                    new { bucket = "1-30 Days", amount = days1to30, percentage = total > 0 ? (days1to30 / total * 100) : 0 },
                    new { bucket = "31-60 Days", amount = days31to60, percentage = total > 0 ? (days31to60 / total * 100) : 0 },
                    new { bucket = "61-90 Days", amount = days61to90, percentage = total > 0 ? (days61to90 / total * 100) : 0 },
                    new { bucket = "Over 90 Days", amount = over90Days, percentage = total > 0 ? (over90Days / total * 100) : 0 }
                };
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
                
                // Get all unpaid vendor invoices
                var unpaidInvoices = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId &&
                                 (vim.isPaid != 1 && vim.Paydate == null)) // Unpaid
                    .ToList();

                var current = unpaidInvoices
                    .Where(vim => vim.DueDate.Date >= today)
                    .Sum(vim => vim.TotalAmount);

                var days1to30 = unpaidInvoices
                    .Where(vim => vim.DueDate.Date < today && 
                                 vim.DueDate.Date >= today.AddDays(-30))
                    .Sum(vim => vim.TotalAmount);

                var days31to60 = unpaidInvoices
                    .Where(vim => vim.DueDate.Date < today.AddDays(-30) && 
                                 vim.DueDate.Date >= today.AddDays(-60))
                    .Sum(vim => vim.TotalAmount);

                var days61to90 = unpaidInvoices
                    .Where(vim => vim.DueDate.Date < today.AddDays(-60) && 
                                 vim.DueDate.Date >= today.AddDays(-90))
                    .Sum(vim => vim.TotalAmount);

                var over90Days = unpaidInvoices
                    .Where(vim => vim.DueDate.Date < today.AddDays(-90))
                    .Sum(vim => vim.TotalAmount);

                var total = current + days1to30 + days31to60 + days61to90 + over90Days;

                return new[]
                {
                    new { bucket = "Current", amount = current, percentage = total > 0 ? (current / total * 100) : 0 },
                    new { bucket = "1-30 Days", amount = days1to30, percentage = total > 0 ? (days1to30 / total * 100) : 0 },
                    new { bucket = "31-60 Days", amount = days31to60, percentage = total > 0 ? (days31to60 / total * 100) : 0 },
                    new { bucket = "61-90 Days", amount = days61to90, percentage = total > 0 ? (days61to90 / total * 100) : 0 },
                    new { bucket = "Over 90 Days", amount = over90Days, percentage = total > 0 ? (over90Days / total * 100) : 0 }
                };
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

        private (decimal totalReceivables, decimal overdueReceivables, decimal receivablesDueThisWeek) CalculateAccountsReceivableMetrics(int tenantId, (DateTime startDate, DateTime endDate) dateFilter)
        {
            // Outstanding AR should reflect all currently unpaid invoices (not limited by invoice date range).
            var unpaidInvoices = _context.InvoiceMaster
                .Where(im => im.TenantId == tenantId &&
                            im.PaymentDate == null)
                .ToList();

            var totalReceivables = unpaidInvoices.Sum(im => im.TotalAmount);

            var today = DateTime.Today;
            var weekFromToday = today.AddDays(7);

            // Overdue means due date before today.
            var overdueReceivables = unpaidInvoices
                .Where(im => im.DueDate.Date < today)
                .Sum(im => im.TotalAmount);

            // Due this week includes today through next 7 days.
            var receivablesDueThisWeek = unpaidInvoices
                .Where(im => im.DueDate.Date >= today && im.DueDate.Date <= weekFromToday)
                .Sum(im => im.TotalAmount);

            return (totalReceivables, overdueReceivables, receivablesDueThisWeek);
        }

        private (decimal totalPayables, decimal overduePayables, decimal payablesDueThisWeek) CalculateAccountsPayableMetrics(int tenantId, (DateTime startDate, DateTime endDate) dateFilter)
        {
            // Outstanding AP should reflect all currently unpaid invoices (not limited by invoice date range).
            var unpaidInvoices = _context.VendorInvoiceMaster
                .Where(vim => vim.TenantId == tenantId &&
                             vim.isPaid != 1 &&
                             vim.Paydate == null)
                .ToList();

            var totalPayables = unpaidInvoices.Sum(vim => vim.TotalAmount);

            var today = DateTime.Today;
            var weekFromToday = today.AddDays(7);

            // Overdue means due date before today.
            var overduePayables = unpaidInvoices
                .Where(vim => vim.DueDate.Date < today)
                .Sum(vim => vim.TotalAmount);

            // Due this week includes today through next 7 days.
            var payablesDueThisWeek = unpaidInvoices
                .Where(vim => vim.DueDate.Date >= today && vim.DueDate.Date <= weekFromToday)
                .Sum(vim => vim.TotalAmount);

            return (totalPayables, overduePayables, payablesDueThisWeek);
        }

        private (decimal cashIn, decimal cashOut) CalculateCashFlowMetrics(int tenantId, (DateTime startDate, DateTime endDate) dateFilter)
        {
            // Calculate cash inflows (customer payments received)
            var cashIn = _context.Transactions
                .Where(t => t.TenantId == tenantId &&
                           t.isCustomer == 1 &&
                           t.TransactionType == "Payment" &&
                           t.TransactionDate >= dateFilter.startDate &&
                           t.TransactionDate <= dateFilter.endDate)
                .Sum(t => t.Amount ?? 0);

            // Calculate cash outflows (vendor payments made)
            var cashOut = _context.Transactions
                .Where(t => t.TenantId == tenantId &&
                           t.isCustomer == 0 &&
                           t.TransactionType == "Payment" &&
                           t.TransactionDate >= dateFilter.startDate &&
                           t.TransactionDate <= dateFilter.endDate)
                .Sum(t => t.Amount ?? 0);

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

            switch (dateRange.ToLower())
            {
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
                    startDate = new DateTime(now.Year, 1, 1);
                    endDate = new DateTime(now.Year, 12, 31);
                    break;
                case "last year":
                    startDate = new DateTime(now.Year - 1, 1, 1);
                    endDate = new DateTime(now.Year - 1, 12, 31);
                    break;
                default:
                    // Default to this month
                    startDate = new DateTime(now.Year, now.Month, 1);
                    endDate = startDate.AddMonths(1).AddDays(-1);
                    break;
            }

            return (startDate, endDate);
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
                var transaction = _context.Transactions
                    .FirstOrDefault(t => t.TransactionID == transactionId && t.TenantId == tenantId);

                if (transaction == null)
                {
                    return NotFound(new { error = "Transaction not found" });
                }

                // Delete child records first
                var deposits = _context.Deposits
                    .Where(d => d.TransactionID == transactionId)
                    .ToList();
                _context.Deposits.RemoveRange(deposits);

                var withdrawals = _context.Withdrawals
                    .Where(w => w.TransactionID == transactionId)
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
        public string Role { get; set; }
        public decimal Limit { get; set; }
        public bool RequiresDualApproval { get; set; }
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
