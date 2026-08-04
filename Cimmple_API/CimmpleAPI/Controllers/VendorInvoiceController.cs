using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class VendorInvoiceController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public VendorInvoiceController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetVendorInvoices")]
        public IActionResult GetVendorInvoices([FromQuery] string status = "All", [FromQuery] string searchTerm = "", [FromQuery] int? vendorId = null, [FromQuery] string dateRange = "Last 30 Days")
        {
            try
            {
                var tenantId = GetTenantId();
                Console.WriteLine($"GetVendorInvoices called - TenantId: {tenantId}, Status: {status}, DateRange: {dateRange}");

                var invoices = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId)
                    .ToList();

                Console.WriteLine($"Found {invoices.Count} vendor invoices in database");

                // Format the results
                var invoiceSummaries = invoices
                    .Select(invoice => new
                    {
                        id = invoice.Id,
                        invoiceNo = invoice.prefixinvoiceno ?? invoice.InvoiceNo.ToString(),
                        vendorName = invoice.VendorName,
                        vendorCode = invoice.VendorCode,
                        invoiceDate = invoice.InvoiceDate.ToString("yyyy-MM-dd"),
                        dueDate = invoice.DueDate.ToString("yyyy-MM-dd"),
                        amount = invoice.Amount,
                        totalAmount = invoice.TotalAmount,
                        status = GetVendorInvoiceStatus(invoice),
                        isApproved = invoice.Approved,
                        paymentStatus = invoice.isPaid == 1 ? "Paid" :
                                       invoice.Paydate.HasValue ? "Paid" : "Unpaid",
                        daysOverdue = invoice.Paydate == null && invoice.DueDate < DateTime.Now ?
                                     (int)(DateTime.Now - invoice.DueDate).TotalDays : (int?)null
                    })
                    .OrderByDescending(x => x.invoiceDate)
                    .ToList();

                Console.WriteLine($"GetVendorInvoices - Returning {invoiceSummaries.Count} vendor invoices");

                return Ok(new { result = invoiceSummaries });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetVendorInvoices: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetVendorInvoiceById/{invoiceId}")]
        public IActionResult GetVendorInvoiceById(int invoiceId)
        {
            try
            {
                var tenantId = GetTenantId();

                var invoice = _context.VendorInvoiceMaster
                    .Where(vim => vim.Id == invoiceId && vim.TenantId == tenantId)
                    .FirstOrDefault();

                if (invoice == null)
                {
                    return NotFound(new { error = "Vendor invoice not found" });
                }

                // Get invoice details separately
                var invoiceDetails = _context.VendorInvoiceDetail
                    .Where(vid => vid.InvoiceId == invoiceId)
                    .ToList();

                var result = new
                {
                    id = invoice.Id,
                    invoiceNo = invoice.prefixinvoiceno ?? invoice.InvoiceNo.ToString(),
                    vendorName = invoice.VendorName,
                    vendorCode = invoice.VendorCode,
                    vendorId = invoice.vid,
                    invoiceDate = invoice.InvoiceDate.ToString("yyyy-MM-dd"),
                    dueDate = invoice.DueDate.ToString("yyyy-MM-dd"),
                    amount = invoice.Amount,
                    totalAmount = invoice.TotalAmount,
                    paymentMethod = invoice.PaymentMethod,
                    paymentDate = invoice.Paydate?.ToString("yyyy-MM-dd"),
                    checkNo = invoice.CkNo,
                    checkDate = invoice.CkDate?.ToString("yyyy-MM-dd"),
                    pvrNo = invoice.PvrNo,
                    series = invoice.Series,
                    isApproved = invoice.Approved,
                    approvalDate = invoice.Approved == true ? invoice.entrydate?.ToString("yyyy-MM-dd") : null,
                    internalNotes = invoice.Adj ?? "",
                    status = GetVendorInvoiceStatus(invoice),
                    locationId = invoice.locationId,
                    items = invoiceDetails.Select(detail => new
                    {
                        id = detail.Id,
                        description = detail.Description,
                        amount = detail.Amount,
                        quantity = detail.qty,
                        price = detail.price,
                        accountId = detail.accountid,
                        vendorOrderId = detail.OrderId,
                        vendorOrderDetailId = detail.VendorOrderDetailID
                    }).ToList()
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("CreateVendorInvoice")]
        public IActionResult CreateVendorInvoice([FromBody] CreateVendorInvoiceRecordRequest request)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var tenantId = GetTenantId();
                    Console.WriteLine($"CreateVendorInvoice called - TenantId: {tenantId}, VendorId: {request.VendorId}");

                    // Generate invoice number
                    var invoiceNumber = GenerateVendorInvoiceNumber(tenantId);

                    // Create vendor invoice header
                    var invoice = new VendorInvoiceMaster
                    {
                        TenantId = tenantId,
                        InvoiceNo = invoiceNumber.ToString(),
                        prefixinvoiceno = $"VINV-{DateTime.Now.Year}-{invoiceNumber:D4}",
                        InvoiceDate = request.InvoiceDate ?? DateTime.Now,
                        DueDate = request.DueDate ?? DateTime.Now.AddDays(30),
                        AccountingPeriod = $"{DateTime.Now.Year}{DateTime.Now.Month:D2}",
                        VendorCode = request.VendorCode,
                        VendorName = request.VendorName,
                        vid = request.VendorId,
                        locationId = request.LocationId ?? 1,
                        Amount = request.LineItems.Sum(item => item.Amount),
                        TotalAmount = request.LineItems.Sum(item => item.Amount),
                        PaymentMethod = "",
                        CkNo = "",
                        Approved = false,
                        entrytype = "Vendor Invoice",
                        Adj = request.Notes ?? "",
                        createdby = GetUserId(),
                        entrydate = DateTime.Now
                    };

                    _context.VendorInvoiceMaster.Add(invoice);
                    _context.SaveChanges();

                    // Create invoice details
                    foreach (var item in request.LineItems)
                    {
                        var invoiceDetail = new VendorInvoiceDetail
                        {
                            InvoiceId = invoice.Id,
                            OrderId = item.VendorOrderId,
                            VendorOrderDetailID = item.VendorOrderDetailId,
                            accountid = item.AccountId,
                            Description = item.Description,
                            Amount = item.Amount,
                            qty = item.Quantity,
                            price = item.UnitPrice,
                            VendorPoNumber = item.VendorPoNumber ?? "",
                            OrderDate = item.OrderDate ?? DateTime.Now
                        };

                        _context.VendorInvoiceDetail.Add(invoiceDetail);

                        // Create VendorInvoicing record to track invoiced quantities
                        if (item.VendorOrderDetailId.HasValue && item.Quantity.HasValue)
                        {
                            var vendorInvoicing = new VendorInvoicing
                            {
                                VendorInvoiceDetailID = invoiceDetail.Id, // This will be set after saving
                                VendorOrderDetailID = item.VendorOrderDetailId.Value,
                                InvoicedQty = item.Quantity.Value,
                                InvoicedDate = DateTime.Now,
                                InvoicedBy = GetUserId() ?? 0, // Default to 0 if null
                                LocationId = request.LocationId,
                                Notes = item.Description,
                                Tenantid = tenantId
                            };

                            _context.VendorInvoicing.Add(vendorInvoicing);
                        }
                    }

                    // Auto-post vendor bill to GL so P&L receives expense activity.
                    var payableAccountId = ResolveAccountsPayableGlAccountId(tenantId, invoice.vid);
                    if (!payableAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine Accounts Payable GL account. Configure vendor COA mapping or an active AP account in Chart of Accounts."
                        });
                    }

                    var defaultExpenseAccountId = ResolveExpenseGlAccountId(tenantId);
                    if (!defaultExpenseAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine an Expense GL account. Add at least one active Expense account in Chart of Accounts."
                        });
                    }

                    var billPeriodKey = !string.IsNullOrWhiteSpace(invoice.AccountingPeriod) &&
                                        GlWorkflowService.TryNormalizePeriodKey(invoice.AccountingPeriod, out var normalizedPeriod, out _)
                        ? normalizedPeriod
                        : GlWorkflowService.PeriodKeyFromDate(invoice.InvoiceDate);
                    if (GlWorkflowService.IsPeriodLocked(_context, tenantId, billPeriodKey))
                    {
                        return BadRequest(new
                        {
                            error = $"Accounting period {billPeriodKey} is closed. Open the period or choose a different invoice date."
                        });
                    }

                    var expenseLines = request.LineItems
                        .GroupBy(item => ResolveLineExpenseAccountId(tenantId, item.AccountId, defaultExpenseAccountId.Value))
                        .Select(g => new { AccountId = g.Key, Amount = g.Sum(x => x.Amount) })
                        .Where(x => x.Amount > 0)
                        .ToList();
                    if (!expenseLines.Any())
                        return BadRequest(new { error = "Vendor invoice has no positive line amounts to post." });

                    var postingRef = BuildAutoPostingReference("APBILL", invoice.prefixinvoiceno ?? invoice.InvoiceNo, invoice.Id);
                    var postingDesc = $"Auto-posted vendor invoice {invoice.prefixinvoiceno ?? invoice.InvoiceNo}";
                    var invoiceHeader = new JournalEntry
                    {
                        EntryDate = invoice.InvoiceDate.Date,
                        ReferenceNumber = postingRef,
                        Description = postingDesc,
                        AccountingPeriod = billPeriodKey,
                        TenantId = tenantId,
                        locationId = invoice.locationId > 0 ? invoice.locationId : 1,
                        createdby = GetUserId(),
                        createdDate = DateTime.UtcNow
                    };
                    _context.JournalEntries.Add(invoiceHeader);
                    _context.SaveChanges();

                    foreach (var line in expenseLines)
                    {
                        _context.JournalEntryFrom.Add(new JournalDetailsFrom
                        {
                            JournalEntryId = invoiceHeader.Id,
                            AccountId = line.AccountId,
                            Amount = line.Amount,
                            Description = postingDesc
                        });
                    }

                    _context.JournalEntryTo.Add(new JournalDetailsTo
                    {
                        JournalEntryId = invoiceHeader.Id,
                        AccountId = payableAccountId.Value,
                        Amount = expenseLines.Sum(x => x.Amount),
                        Description = postingDesc
                    });

                    GlWorkflowService.AddAudit(_context, tenantId, "VendorInvoiceAutoPost", GetUserId(), invoiceHeader.Id, null, billPeriodKey, postingRef);
                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new {
                        result = new {
                            invoiceId = invoice.Id,
                            invoiceNumber = invoice.prefixinvoiceno,
                            message = "Vendor invoice created successfully"
                        }
                    });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    var innerException = ex.InnerException != null ? ex.InnerException.Message : "No inner exception";
                    return StatusCode(500, new {
                        error = $"Vendor invoice creation failed: {ex.Message}",
                        innerException = innerException,
                        stackTrace = ex.StackTrace
                    });
                }
            }
        }

        [HttpPut("UpdateVendorInvoice/{invoiceId}")]
        public IActionResult UpdateVendorInvoice(int invoiceId, [FromBody] UpdateVendorInvoiceRecordRequest request)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var tenantId = GetTenantId();

                    var invoice = _context.VendorInvoiceMaster
                        .FirstOrDefault(vim => vim.Id == invoiceId && vim.TenantId == tenantId);

                    if (invoice == null)
                        return NotFound(new { error = "Vendor invoice not found" });

                    var billPostingRef = BuildAutoPostingReference("APBILL", invoice.prefixinvoiceno ?? invoice.InvoiceNo, invoice.Id);
                    var hasPostedGlEntry = _context.JournalEntries
                        .Any(je => je.TenantId == tenantId && je.ReferenceNumber == billPostingRef);
                    if (hasPostedGlEntry)
                    {
                        return BadRequest(new
                        {
                            error = "Cannot update vendor invoice because a GL entry already exists. Reverse/delete the journal entry first, then edit."
                        });
                    }

                    // Update header information
                    if (request.InvoiceDate.HasValue) invoice.InvoiceDate = request.InvoiceDate.Value;
                    if (request.DueDate.HasValue) invoice.DueDate = request.DueDate.Value;
                    if (!string.IsNullOrEmpty(request.Notes)) invoice.Adj = request.Notes;
                    if (request.LocationId.HasValue) invoice.locationId = request.LocationId.Value;

                    // Recalculate totals if line items changed
                    if (request.LineItems != null && request.LineItems.Any())
                    {
                        // Remove existing details and vendor invoicing records
                        var existingDetails = _context.VendorInvoiceDetail.Where(vid => vid.InvoiceId == invoiceId).ToList();
                        var detailIds = existingDetails.Select(d => d.Id).ToList();

                        var existingVendorInvoicing = _context.VendorInvoicing
                            .Where(vi => detailIds.Contains(vi.VendorInvoiceDetailID))
                            .ToList();

                        _context.VendorInvoicing.RemoveRange(existingVendorInvoicing);
                        _context.VendorInvoiceDetail.RemoveRange(existingDetails);

                        // Add new details
                        foreach (var item in request.LineItems)
                        {
                            var invoiceDetail = new VendorInvoiceDetail
                            {
                                InvoiceId = invoice.Id,
                                OrderId = item.VendorOrderId,
                                VendorOrderDetailID = item.VendorOrderDetailId,
                                accountid = item.AccountId,
                                Description = item.Description,
                                Amount = item.Amount,
                                qty = item.Quantity,
                                price = item.UnitPrice,
                                VendorPoNumber = item.VendorPoNumber ?? "",
                                OrderDate = item.OrderDate ?? DateTime.Now
                            };

                            _context.VendorInvoiceDetail.Add(invoiceDetail);

                            // Create VendorInvoicing record (will set VendorInvoiceDetailID after saving)
                            if (item.VendorOrderDetailId.HasValue && item.Quantity.HasValue)
                            {
                                var vendorInvoicing = new VendorInvoicing
                                {
                                    VendorInvoiceDetailID = 0, // Will be set after saving invoiceDetail
                                    VendorOrderDetailID = item.VendorOrderDetailId.Value,
                                    InvoicedQty = (int)item.Quantity.Value,
                                    InvoicedDate = DateTime.Now,
                                    InvoicedBy = GetUserId() ?? 0, // Default to 0 if null
                                    LocationId = request.LocationId,
                                    Notes = item.Description,
                                    Tenantid = tenantId
                                };

                                _context.VendorInvoicing.Add(vendorInvoicing);
                            }
                        }

                        // Recalculate totals
                        invoice.Amount = request.LineItems.Sum(item => item.Amount);
                        invoice.TotalAmount = invoice.Amount;
                    }

                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new { result = new { message = "Vendor invoice updated successfully" } });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
        }

        [HttpPost("ApproveVendorInvoice/{invoiceId}")]
        public IActionResult ApproveVendorInvoice(int invoiceId)
        {
            try
            {
                var tenantId = GetTenantId();

                var invoice = _context.VendorInvoiceMaster
                    .FirstOrDefault(vim => vim.Id == invoiceId && vim.TenantId == tenantId);

                if (invoice == null)
                    return NotFound(new { error = "Vendor invoice not found" });

                invoice.Approved = true;

                _context.SaveChanges();

                return Ok(new { result = new { message = "Vendor invoice approved successfully" } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("RecordVendorPayment/{invoiceId}")]
        public IActionResult RecordVendorPayment(int invoiceId, [FromBody] RecordVendorPaymentRequest request)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var tenantId = GetTenantId();

                    var invoice = _context.VendorInvoiceMaster
                        .FirstOrDefault(vim => vim.Id == invoiceId && vim.TenantId == tenantId);

                    if (invoice == null)
                        return NotFound(new { error = "Vendor invoice not found" });

                    if (invoice.isPaid == 1 || invoice.Paydate.HasValue)
                        return BadRequest(new { error = "Vendor invoice is already marked as paid." });

                    var paymentDate = request.PaymentDate ?? DateTime.Now;
                    var paymentAmount = invoice.TotalAmount;
                    if (paymentAmount <= 0)
                        return BadRequest(new { error = "Vendor invoice amount must be greater than 0." });

                    var bankId = request.BankId ?? invoice.Bankid;
                    var bankAccountId = ResolveBankGlAccountId(tenantId, bankId);
                    if (!bankAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine a bank GL account for this payment. Configure bank COA mapping first."
                        });
                    }

                    var accountsPayableAccountId = ResolveAccountsPayableGlAccountId(tenantId, invoice.vid);
                    if (!accountsPayableAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine Accounts Payable GL account. Configure vendor COA mapping or an active AP account in COA."
                        });
                    }

                    var periodKey = !string.IsNullOrWhiteSpace(invoice.AccountingPeriod) &&
                                    GlWorkflowService.TryNormalizePeriodKey(invoice.AccountingPeriod, out var normalizedPeriod, out _)
                        ? normalizedPeriod
                        : GlWorkflowService.PeriodKeyFromDate(paymentDate);
                    if (GlWorkflowService.IsPeriodLocked(_context, tenantId, periodKey))
                    {
                        return BadRequest(new
                        {
                            error = $"Accounting period {periodKey} is closed. Open the period or pick another payment date."
                        });
                    }

                    invoice.PaymentMethod = request.PaymentMethod ?? "";
                    invoice.Paydate = paymentDate;
                    invoice.CkNo = request.CheckNo ?? "";
                    invoice.CkDate = request.CheckDate;
                    invoice.PvrNo = request.PvrNo;
                    invoice.Series = request.Series ?? "";
                    invoice.Bankid = bankId;
                    invoice.isPaid = 1;

                    var referenceNo = BuildAutoPaymentReference("APPMT", invoice.prefixinvoiceno ?? invoice.InvoiceNo, invoice.Id);
                    var description = $"Auto-posted vendor payment for invoice {invoice.prefixinvoiceno ?? invoice.InvoiceNo}";
                    var locationId = invoice.locationId > 0 ? invoice.locationId : 1;
                    if (bankId.HasValue)
                    {
                        var bankLocation = _context.BankMaster
                            .Where(b => b.Id == bankId.Value && b.TenantId == tenantId)
                            .Select(b => (int?)b.locationId)
                            .FirstOrDefault();
                        if (bankLocation.HasValue && bankLocation.Value > 0)
                            locationId = bankLocation.Value;
                    }

                    var journalHeader = new JournalEntry
                    {
                        EntryDate = paymentDate.Date,
                        ReferenceNumber = referenceNo,
                        Description = description,
                        AccountingPeriod = periodKey,
                        TenantId = tenantId,
                        locationId = locationId,
                        createdby = GetUserId(),
                        createdDate = DateTime.UtcNow
                    };

                    _context.JournalEntries.Add(journalHeader);
                    _context.SaveChanges();

                    // Debit AP / credit bank.
                    _context.JournalEntryFrom.Add(new JournalDetailsFrom
                    {
                        JournalEntryId = journalHeader.Id,
                        AccountId = accountsPayableAccountId.Value,
                        Amount = paymentAmount,
                        Description = description
                    });
                    _context.JournalEntryTo.Add(new JournalDetailsTo
                    {
                        JournalEntryId = journalHeader.Id,
                        AccountId = bankAccountId.Value,
                        Amount = paymentAmount,
                        Description = description
                    });

                    _context.Transactions.Add(new Transactions
                    {
                        TransactionType = "Payment",
                        PaymentMethod = invoice.PaymentMethod,
                        Amount = paymentAmount,
                        TransactionDate = paymentDate,
                        dueDate = invoice.DueDate,
                        invoiceDate = invoice.InvoiceDate,
                        invoiceNo = invoice.prefixinvoiceno ?? invoice.InvoiceNo,
                        AccountingPeriod = periodKey,
                        Description = $"Vendor payment for {invoice.prefixinvoiceno ?? invoice.InvoiceNo}",
                        CheckNo = invoice.CkNo,
                        TenantId = tenantId,
                        locationId = locationId,
                        BankId = bankId,
                        vendorid = invoice.vid,
                        approved = true,
                        isCustomer = 0
                    });

                    GlWorkflowService.AddAudit(_context, tenantId, "VendorPaymentAutoPost", GetUserId(), journalHeader.Id, null, periodKey, referenceNo);
                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new
                    {
                        result = new
                        {
                            message = "Vendor payment recorded and posted to GL successfully",
                            journalEntryId = journalHeader.Id
                        }
                    });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
        }

        private int? ResolveBankGlAccountId(int tenantId, int? bankId)
        {
            if (bankId.HasValue && bankId.Value > 0)
            {
                var mappedAccountId = _context.BankCOAMapping
                    .Where(m => m.bankid == bankId.Value)
                    .Select(m => (int?)m.accountid)
                    .FirstOrDefault();

                if (mappedAccountId.HasValue && IsActiveAccountForTenant(tenantId, mappedAccountId.Value))
                    return mappedAccountId.Value;

                var bank = _context.BankMaster
                    .AsNoTracking()
                    .FirstOrDefault(b => b.Id == bankId.Value && b.TenantId == tenantId);
                if (bank != null && !string.IsNullOrWhiteSpace(bank.coa))
                {
                    if (int.TryParse(bank.coa.Trim(), out var parsedAccountId) &&
                        IsActiveAccountForTenant(tenantId, parsedAccountId))
                    {
                        return parsedAccountId;
                    }

                    var byCode = _context.ChartofAccounts
                        .AsNoTracking()
                        .Where(c => c.Tenantid == tenantId && c.IsActive && c.AccountCode == bank.coa.Trim())
                        .Select(c => (int?)c.AccountID)
                        .FirstOrDefault();
                    if (byCode.HasValue)
                        return byCode;
                }
            }

            // Final fallback: allow posting to the first active cash/bank account for the tenant.
            return _context.ChartofAccounts
                .AsNoTracking()
                .Where(c => c.Tenantid == tenantId && c.IsActive)
                .OrderBy(c =>
                    c.AccountType != null && c.AccountType.ToLower().Contains("bank") ? 0 :
                    c.AccountType != null && c.AccountType.ToLower().Contains("cash") ? 1 :
                    c.AccountName != null && c.AccountName.ToLower().Contains("bank") ? 2 :
                    c.AccountName != null && c.AccountName.ToLower().Contains("cash") ? 3 :
                    c.MainGroup != null && c.MainGroup.ToLower().Contains("bank") ? 4 :
                    c.MainGroup != null && c.MainGroup.ToLower().Contains("cash") ? 5 : 6)
                .ThenBy(c => c.AccountCode)
                .Where(c =>
                    (c.AccountType != null && (c.AccountType.ToLower().Contains("bank") || c.AccountType.ToLower().Contains("cash"))) ||
                    (c.AccountName != null && (c.AccountName.ToLower().Contains("bank") || c.AccountName.ToLower().Contains("cash"))) ||
                    (c.MainGroup != null && (c.MainGroup.ToLower().Contains("bank") || c.MainGroup.ToLower().Contains("cash"))))
                .Select(c => (int?)c.AccountID)
                .FirstOrDefault();
        }

        private int? ResolveAccountsPayableGlAccountId(int tenantId, int vendorId)
        {
            var vendorMappedAccountId = _context.VendorCOAMapping
                .AsNoTracking()
                .Where(v => v.vendorid == vendorId)
                .Select(v => (int?)v.accountid)
                .FirstOrDefault();
            if (vendorMappedAccountId.HasValue && IsActiveAccountForTenant(tenantId, vendorMappedAccountId.Value))
                return vendorMappedAccountId.Value;

            return _context.ChartofAccounts
                .AsNoTracking()
                .Where(c => c.Tenantid == tenantId && c.IsActive)
                .OrderBy(c =>
                    c.AccountName != null && c.AccountName.ToLower().Contains("accounts payable") ? 0 :
                    c.AccountType != null && c.AccountType.ToLower().Contains("payable") ? 1 :
                    c.MainGroup != null && c.MainGroup.ToLower().Contains("payable") ? 2 : 3)
                .ThenBy(c => c.AccountCode)
                .Where(c =>
                    (c.AccountName != null && c.AccountName.ToLower().Contains("payable")) ||
                    (c.AccountType != null && c.AccountType.ToLower().Contains("payable")) ||
                    (c.MainGroup != null && c.MainGroup.ToLower().Contains("payable")))
                .Select(c => (int?)c.AccountID)
                .FirstOrDefault();
        }

        private int? ResolveExpenseGlAccountId(int tenantId)
        {
            return _context.ChartofAccounts
                .AsNoTracking()
                .Where(c => c.Tenantid == tenantId && c.IsActive)
                .OrderBy(c =>
                    c.AccountType != null && c.AccountType.ToLower().Contains("expense") ? 0 :
                    c.AccountName != null && c.AccountName.ToLower().Contains("expense") ? 1 :
                    c.MainGroup != null && c.MainGroup.ToLower().Contains("expense") ? 2 : 3)
                .ThenBy(c => c.AccountCode)
                .Where(c =>
                    (c.AccountType != null && c.AccountType.ToLower().Contains("expense")) ||
                    (c.AccountName != null && c.AccountName.ToLower().Contains("expense")) ||
                    (c.MainGroup != null && c.MainGroup.ToLower().Contains("expense")))
                .Select(c => (int?)c.AccountID)
                .FirstOrDefault();
        }

        private int ResolveLineExpenseAccountId(int tenantId, int? requestedAccountId, int defaultExpenseAccountId)
        {
            if (requestedAccountId.HasValue && requestedAccountId.Value > 0 &&
                IsActiveAccountForTenant(tenantId, requestedAccountId.Value))
            {
                return requestedAccountId.Value;
            }

            return defaultExpenseAccountId;
        }

        private bool IsActiveAccountForTenant(int tenantId, int accountId)
        {
            return _context.ChartofAccounts
                .AsNoTracking()
                .Any(c => c.Tenantid == tenantId && c.AccountID == accountId && c.IsActive);
        }

        private static string BuildAutoPaymentReference(string prefix, string? invoiceNo, int invoiceId)
        {
            var safeInvoice = string.IsNullOrWhiteSpace(invoiceNo) ? invoiceId.ToString() : invoiceNo.Trim();
            var reference = $"{prefix}-{safeInvoice}";
            return reference.Length > 200 ? reference[..200] : reference;
        }

        private static string BuildAutoPostingReference(string prefix, string? invoiceNo, int invoiceId)
        {
            var safeInvoice = string.IsNullOrWhiteSpace(invoiceNo) ? invoiceId.ToString() : invoiceNo.Trim();
            var reference = $"{prefix}-{safeInvoice}";
            return reference.Length > 200 ? reference[..200] : reference;
        }

        [HttpDelete("DeleteVendorInvoice/{invoiceId}")]
        public IActionResult DeleteVendorInvoice(int invoiceId)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var tenantId = GetTenantId();

                    var invoice = _context.VendorInvoiceMaster
                        .FirstOrDefault(vim => vim.Id == invoiceId && vim.TenantId == tenantId);

                    if (invoice == null)
                        return NotFound(new { error = "Vendor invoice not found" });

                    // Check if invoice is already paid
                    if (invoice.isPaid == 1)
                        return BadRequest(new { error = "Cannot delete a paid invoice" });

                    var billPostingRef = BuildAutoPostingReference("APBILL", invoice.prefixinvoiceno ?? invoice.InvoiceNo, invoice.Id);
                    var hasPostedGlEntry = _context.JournalEntries
                        .Any(je => je.TenantId == tenantId && je.ReferenceNumber == billPostingRef);
                    if (hasPostedGlEntry)
                        return BadRequest(new { error = "Cannot delete vendor invoice because a GL entry exists. Reverse/delete the related journal entry first." });

                    // Remove vendor invoicing records
                    var invoiceDetails = _context.VendorInvoiceDetail.Where(vid => vid.InvoiceId == invoiceId).ToList();
                    var detailIds = invoiceDetails.Select(d => d.Id).ToList();

                    var vendorInvoicingRecords = _context.VendorInvoicing
                        .Where(vi => detailIds.Contains(vi.VendorInvoiceDetailID))
                        .ToList();

                    _context.VendorInvoicing.RemoveRange(vendorInvoicingRecords);
                    _context.VendorInvoiceDetail.RemoveRange(invoiceDetails);
                    _context.VendorInvoiceMaster.Remove(invoice);

                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new { result = new { message = "Vendor invoice deleted successfully" } });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
        }

        private int GenerateVendorInvoiceNumber(int tenantId)
        {
            var currentYear = DateTime.Now.Year;
            var existingInvoices = _context.VendorInvoiceMaster
                .Where(vim => vim.TenantId == tenantId && vim.InvoiceDate.Year == currentYear)
                .ToList();

            var maxInvoiceNo = existingInvoices.Any() ?
                existingInvoices.Max(vim => int.TryParse(vim.InvoiceNo, out int num) ? num : 0) : 0;
            return (maxInvoiceNo + 1);
        }

        private string GetVendorInvoiceStatus(VendorInvoiceMaster invoice)
        {
            if (invoice.isPaid == 1)
                return "Paid";
            else if (invoice.Approved == true)
                return "Approved";
            else if (DateTime.Now > invoice.DueDate)
                return "Overdue";
            else
                return "Pending Approval";
        }
    }

    // DTOs for backend-specific operations
    public class CreateVendorInvoiceRecordRequest
    {
        public int VendorId { get; set; }
        public string VendorCode { get; set; }
        public string VendorName { get; set; }
        public int? LocationId { get; set; }
        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public string Notes { get; set; }
        public List<VendorInvoiceRecordLineItem> LineItems { get; set; } = new List<VendorInvoiceRecordLineItem>();
    }

    public class VendorInvoiceRecordLineItem
    {
        public int VendorOrderId { get; set; }
        public int? VendorOrderDetailId { get; set; }
        public int? AccountId { get; set; }
        public string Description { get; set; }
        public decimal Amount { get; set; }
        public int? Quantity { get; set; }
        public decimal? UnitPrice { get; set; }
        public string VendorPoNumber { get; set; }
        public DateTime? OrderDate { get; set; }
    }

    public class UpdateVendorInvoiceRecordRequest
    {
        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public int? LocationId { get; set; }
        public string Notes { get; set; }
        public List<VendorInvoiceRecordLineItem> LineItems { get; set; }
    }

    public class RecordVendorPaymentRequest
    {
        public string PaymentMethod { get; set; }
        public DateTime? PaymentDate { get; set; }
        public string CheckNo { get; set; }
        public DateTime? CheckDate { get; set; }
        public int? PvrNo { get; set; }
        public string Series { get; set; }
        public int? BankId { get; set; }
    }
}
