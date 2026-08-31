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
        public IActionResult GetVendorInvoices(
            [FromQuery] string status = "All",
            [FromQuery] string searchTerm = "",
            [FromQuery] int? vendorId = null,
            [FromQuery] string dateRange = "Last 30 Days",
            [FromQuery] int? locationId = null,
            [FromQuery] string startDate = null,
            [FromQuery] string endDate = null)
        {
            try
            {
                var tenantId = GetTenantId();
                Console.WriteLine($"GetVendorInvoices called - TenantId: {tenantId}, Status: {status}, DateRange: {dateRange}");

                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var invoicesQuery = _context.VendorInvoiceMaster
                    .Where(vim => vim.TenantId == tenantId);

                if (filterLocationId.HasValue)
                {
                    invoicesQuery = invoicesQuery.Where(vim => vim.locationId == filterLocationId.Value);
                }

                var invoices = invoicesQuery.ToList();

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
                        freightCharge = invoice.FreightCharge,
                        taxAmount = Math.Max(0, Math.Round(invoice.TotalAmount - invoice.Amount - invoice.FreightCharge, 2)),
                        totalAmount = invoice.TotalAmount,
                        paidAmount = GetEffectiveVendorPaidAmount(invoice),
                        balanceDue = GetVendorBalanceDue(invoice),
                        status = GetVendorInvoiceStatus(invoice),
                        isApproved = invoice.Approved,
                        paymentStatus = GetEffectiveVendorPaidAmount(invoice) >= invoice.TotalAmount - 0.009m ? "Paid" :
                                       GetEffectiveVendorPaidAmount(invoice) > 0.009m ? "Partially Paid" : "Unpaid",
                        daysOverdue = GetVendorDaysOverdue(invoice)
                    })
                    .OrderByDescending(x => x.invoiceDate)
                    .ToList();

                if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase))
                {
                    invoiceSummaries = invoiceSummaries
                        .Where(x => string.Equals(x.status, status, StringComparison.OrdinalIgnoreCase)
                            || (status.Equals("Unpaid", StringComparison.OrdinalIgnoreCase)
                                && (x.status == "Unpaid" || x.status == "Pending" || x.status == "Approved" || x.status == "Pending Approval")))
                        .ToList();
                }

                if (!string.IsNullOrWhiteSpace(dateRange) && !dateRange.Equals("All", StringComparison.OrdinalIgnoreCase) || !string.IsNullOrWhiteSpace(startDate) || !string.IsNullOrWhiteSpace(endDate))
                {
                    var now = DateTime.Now;
                    DateTime? start = null;
                    DateTime? end = null;
                    var rangeLower = (dateRange ?? "").Trim().ToLowerInvariant();

                    if (rangeLower == "custom" || !string.IsNullOrWhiteSpace(startDate) || !string.IsNullOrWhiteSpace(endDate))
                    {
                        if (DateTime.TryParse(startDate, out DateTime parsedStart))
                        {
                            start = parsedStart.Date;
                        }
                        if (DateTime.TryParse(endDate, out DateTime parsedEnd))
                        {
                            end = parsedEnd.Date;
                        }
                    }
                    else
                    {
                        switch (rangeLower)
                        {
                            case "this week":
                                start = now.Date.AddDays(-(int)now.DayOfWeek);
                                end = start.Value.AddDays(6);
                                break;
                            case "last 7 days":
                                start = now.Date.AddDays(-7);
                                break;
                            case "last 30 days":
                                start = now.Date.AddDays(-30);
                                break;
                            case "last 90 days":
                                start = now.Date.AddDays(-90);
                                break;
                            case "this month":
                                start = new DateTime(now.Year, now.Month, 1);
                                break;
                            case "last month":
                                start = new DateTime(now.Year, now.Month, 1).AddMonths(-1);
                                end = new DateTime(now.Year, now.Month, 1).AddDays(-1);
                                break;
                            case "all":
                            case "all dates":
                                start = null;
                                end = null;
                                break;
                        }
                    }

                    if (start.HasValue || end.HasValue)
                    {
                        invoiceSummaries = invoiceSummaries.Where(x =>
                        {
                            if (!DateTime.TryParse(x.invoiceDate, out var d)) return false;
                            if (start.HasValue && d.Date < start.Value.Date) return false;
                            if (end.HasValue && d.Date > end.Value.Date) return false;
                            return true;
                        }).ToList();
                    }
                }

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
                    freightCharge = invoice.FreightCharge,
                    taxAmount = Math.Max(0, Math.Round(invoice.TotalAmount - invoice.Amount - invoice.FreightCharge, 2)),
                    totalAmount = invoice.TotalAmount,
                    paidAmount = GetEffectiveVendorPaidAmount(invoice),
                    balanceDue = GetVendorBalanceDue(invoice),
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

                    if (!TryResolveLocationId(request.LocationId, out var resolvedInvoiceLoc, out var forbidLoc, fallback: 1))
                        return forbidLoc!;

                    var netAmount = Math.Round(request.LineItems.Sum(item => item.Amount), 2);
                    var taxRate = request.TaxRate ?? 0m;
                    if (taxRate < 0m || taxRate > 100m)
                        return BadRequest(new { error = "Tax rate must be between 0 and 100." });

                    var taxAmount = GlAccountResolutionService.ResolveTaxAmount(
                        netAmount, taxRate, request.TaxAmount);
                    if (taxAmount > 0m)
                    {
                        var inputTaxAccountId = GlAccountResolutionService.ResolveInputTax(_context, tenantId);
                        if (!inputTaxAccountId.HasValue)
                        {
                            return BadRequest(new
                            {
                                error = "Input tax was entered but Input Tax Recoverable is not configured. Set Default Input Tax account in Accounting Setup → Default Accounts."
                            });
                        }
                    }

                    var freightCharge = GlAccountResolutionService.NormalizeChargeAmount(request.FreightCharge);
                    if (freightCharge > 0m &&
                        !GlAccountResolutionService.ResolveFreightIn(_context, tenantId).HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Freight was entered but Freight In is not configured. Set Default Freight In in Accounting Setup → Default Accounts."
                        });
                    }

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
                        locationId = resolvedInvoiceLoc,
                        Amount = netAmount,
                        FreightCharge = freightCharge,
                        TotalAmount = Math.Round(netAmount + taxAmount + freightCharge, 2),
                        PaidAmount = 0,
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
                    var payableAccountId = GlAccountResolutionService.ResolveAccountsPayable(_context, tenantId, invoice.vid);
                    if (!payableAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine Accounts Payable GL account. Set Default Accounts Payable in Accounting Setup, configure vendor AP mapping, or add an active AP account in Chart of Accounts."
                        });
                    }

                    var defaultExpenseAccountId = GlAccountResolutionService.ResolveDefaultExpense(_context, tenantId, invoice.vid);
                    if (!defaultExpenseAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine an Expense GL account. Set Default Expense in Accounting Setup or add an active Expense account in Chart of Accounts."
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
                        .GroupBy(item => GlAccountResolutionService.ResolveLineExpenseAccountId(
                            _context, tenantId, item.AccountId, defaultExpenseAccountId.Value))
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

                    if (taxAmount > 0m)
                    {
                        var inputTaxAccountId = GlAccountResolutionService.ResolveInputTax(_context, tenantId);
                        _context.JournalEntryFrom.Add(new JournalDetailsFrom
                        {
                            JournalEntryId = invoiceHeader.Id,
                            AccountId = inputTaxAccountId!.Value,
                            Amount = taxAmount,
                            Description = $"{postingDesc} (input tax)"
                        });
                    }

                    if (freightCharge > 0m)
                    {
                        var freightInAccountId = GlAccountResolutionService.ResolveFreightIn(_context, tenantId);
                        _context.JournalEntryFrom.Add(new JournalDetailsFrom
                        {
                            JournalEntryId = invoiceHeader.Id,
                            AccountId = freightInAccountId!.Value,
                            Amount = freightCharge,
                            Description = $"{postingDesc} (freight)"
                        });
                    }

                    _context.JournalEntryTo.Add(new JournalDetailsTo
                    {
                        JournalEntryId = invoiceHeader.Id,
                        AccountId = payableAccountId.Value,
                        Amount = invoice.TotalAmount,
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

                    if (invoice.isPaid == 2)
                        return BadRequest(new { error = "Cannot record payment on a voided vendor invoice." });

                    if (invoice.Approved != true)
                        return BadRequest(new { error = "Vendor invoice must be approved before payment can be recorded." });

                    var alreadyPaid = GetEffectiveVendorPaidAmount(invoice);
                    var balanceDue = Math.Round(invoice.TotalAmount - alreadyPaid, 2);
                    if (balanceDue <= 0.009m)
                        return BadRequest(new { error = "Vendor invoice is already fully paid." });

                    var paymentDate = request.PaymentDate ?? DateTime.Now;
                    var paymentAmount = Math.Round(request.PaymentAmount ?? balanceDue, 2);
                    if (paymentAmount <= 0)
                        return BadRequest(new { error = "Payment amount must be greater than 0." });
                    if (paymentAmount > balanceDue + 0.009m)
                        return BadRequest(new { error = $"Payment amount cannot exceed remaining balance of {balanceDue:0.00}." });

                    var bankId = request.BankId ?? invoice.Bankid;
                    var bankAccountId = GlAccountResolutionService.ResolveBank(_context, tenantId, bankId);
                    if (!bankAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine a bank GL account for this payment. Configure bank COA mapping first."
                        });
                    }

                    var accountsPayableAccountId = GlAccountResolutionService.ResolveAccountsPayable(_context, tenantId, invoice.vid);
                    if (!accountsPayableAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine Accounts Payable GL account. Set Default Accounts Payable in Accounting Setup, configure vendor AP mapping, or add an active AP account in COA."
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

                    var newPaidTotal = Math.Round(alreadyPaid + paymentAmount, 2);
                    var isFullyPaid = newPaidTotal >= invoice.TotalAmount - 0.009m;

                    invoice.PaymentMethod = request.PaymentMethod ?? invoice.PaymentMethod ?? "";
                    invoice.CkNo = request.CheckNo ?? invoice.CkNo ?? "";
                    invoice.CkDate = request.CheckDate ?? invoice.CkDate;
                    invoice.PvrNo = request.PvrNo ?? invoice.PvrNo;
                    invoice.Series = request.Series ?? invoice.Series ?? "";
                    invoice.Bankid = bankId;
                    invoice.PaidAmount = isFullyPaid ? invoice.TotalAmount : newPaidTotal;
                    invoice.isPaid = isFullyPaid ? 1 : 0;
                    invoice.Paydate = isFullyPaid ? paymentDate : (DateTime?)null;

                    var referenceNo = BuildAutoPaymentReference("APPMT", invoice.prefixinvoiceno ?? invoice.InvoiceNo, invoice.Id);
                    var description = isFullyPaid
                        ? $"Auto-posted vendor payment for invoice {invoice.prefixinvoiceno ?? invoice.InvoiceNo}"
                        : $"Auto-posted partial vendor payment ({paymentAmount:0.00}) for invoice {invoice.prefixinvoiceno ?? invoice.InvoiceNo}";
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

                    var remaining = Math.Round(invoice.TotalAmount - invoice.PaidAmount, 2);
                    return Ok(new
                    {
                        result = new
                        {
                            message = isFullyPaid
                                ? "Vendor payment recorded and posted to GL successfully"
                                : $"Partial payment of {paymentAmount:0.00} recorded. Remaining balance: {remaining:0.00}",
                            journalEntryId = journalHeader.Id,
                            paidAmount = invoice.PaidAmount,
                            balanceDue = remaining,
                            status = GetVendorInvoiceStatus(invoice)
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

        [HttpPost("VoidVendorInvoice/{invoiceId}")]
        public IActionResult VoidVendorInvoice(int invoiceId)
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

                    if (invoice.isPaid == 2)
                        return BadRequest(new { error = "Invoice is already voided." });

                    var paid = GetEffectiveVendorPaidAmount(invoice);
                    if (paid > 0.009m)
                        return BadRequest(new { error = "Cannot void a paid or partially paid invoice. Reverse payments first." });

                    var billPostingRef = BuildAutoPostingReference("APBILL", invoice.prefixinvoiceno ?? invoice.InvoiceNo, invoice.Id);
                    if (!GlWorkflowService.TryReverseJournalByReference(
                        _context, tenantId, billPostingRef, GetUserId(), "VendorInvoiceVoid", out var reverseError))
                    {
                        return BadRequest(new { error = reverseError });
                    }

                    var invoiceDetails = _context.VendorInvoiceDetail.Where(vid => vid.InvoiceId == invoiceId).ToList();
                    var detailIds = invoiceDetails.Select(d => d.Id).ToList();
                    var vendorInvoicingRecords = _context.VendorInvoicing
                        .Where(vi => detailIds.Contains(vi.VendorInvoiceDetailID))
                        .ToList();
                    ReverseVendorOrderInvoicedQuantities(vendorInvoicingRecords, tenantId);
                    _context.VendorInvoicing.RemoveRange(vendorInvoicingRecords);

                    invoice.isPaid = 2;
                    invoice.voidedby = GetUserId();
                    invoice.voideddate = DateTime.Now;
                    invoice.PaidAmount = 0;
                    invoice.Approved = false;

                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new { result = new { message = "Vendor invoice voided successfully" } });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
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

                    // Check if invoice is already paid / partially paid
                    if (invoice.isPaid == 1)
                        return BadRequest(new { error = "Cannot delete a paid invoice" });

                    var paid = GetEffectiveVendorPaidAmount(invoice);
                    if (paid > 0.009m)
                        return BadRequest(new { error = "Cannot delete a paid or partially paid invoice. Reverse payments first." });

                    if (invoice.isPaid == 2)
                        return BadRequest(new { error = "Cannot delete a voided invoice. It is already reversed in GL." });

                    var billPostingRef = BuildAutoPostingReference("APBILL", invoice.prefixinvoiceno ?? invoice.InvoiceNo, invoice.Id);
                    if (!GlWorkflowService.TryReverseJournalByReference(
                        _context, tenantId, billPostingRef, GetUserId(), "VendorInvoiceDelete", out var reverseError))
                    {
                        return BadRequest(new { error = reverseError ?? "Failed to reverse the related journal entry." });
                    }

                    // Remove vendor invoicing records
                    var invoiceDetails = _context.VendorInvoiceDetail.Where(vid => vid.InvoiceId == invoiceId).ToList();
                    var detailIds = invoiceDetails.Select(d => d.Id).ToList();

                    var vendorInvoicingRecords = _context.VendorInvoicing
                        .Where(vi => detailIds.Contains(vi.VendorInvoiceDetailID))
                        .ToList();

                    ReverseVendorOrderInvoicedQuantities(vendorInvoicingRecords, tenantId);
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

        private void ReverseVendorOrderInvoicedQuantities(IEnumerable<VendorInvoicing> vendorInvoicingRecords, int tenantId)
        {
            foreach (var vi in vendorInvoicingRecords)
            {
                var orderDetail = _context.VendorOrderDetails
                    .FirstOrDefault(d => d.ID == vi.VendorOrderDetailID && d.Tenantid == tenantId);

                if (orderDetail == null) continue;

                orderDetail.InvoicedQty = Math.Max(0, orderDetail.InvoicedQty - vi.InvoicedQty);

                if (orderDetail.InvoicedQty == 0)
                    orderDetail.InvoiceStatus = "Not Invoiced";
                else if (orderDetail.InvoicedQty < orderDetail.QtyOrdered)
                    orderDetail.InvoiceStatus = "Partially Invoiced";
                else
                    orderDetail.InvoiceStatus = "Fully Invoiced";
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

        private static decimal GetEffectiveVendorPaidAmount(VendorInvoiceMaster invoice)
        {
            if (invoice.isPaid == 2)
                return 0m;
            if (invoice.PaidAmount > 0)
                return invoice.PaidAmount;
            if (invoice.isPaid == 1 || invoice.Paydate.HasValue)
                return invoice.TotalAmount;
            return 0m;
        }

        private static decimal GetVendorBalanceDue(VendorInvoiceMaster invoice)
        {
            var balance = invoice.TotalAmount - GetEffectiveVendorPaidAmount(invoice);
            return balance < 0 ? 0m : Math.Round(balance, 2);
        }

        private static int? GetVendorDaysOverdue(VendorInvoiceMaster invoice)
        {
            if (GetVendorBalanceDue(invoice) <= 0.009m)
                return null;
            if (invoice.DueDate >= DateTime.Now)
                return null;
            return (int)(DateTime.Now - invoice.DueDate).TotalDays;
        }

        private string GetVendorInvoiceStatus(VendorInvoiceMaster invoice)
        {
            if (invoice.isPaid == 2)
                return "Void";

            var paid = GetEffectiveVendorPaidAmount(invoice);
            if (paid >= invoice.TotalAmount - 0.009m && invoice.TotalAmount > 0)
                return "Paid";
            if (paid > 0.009m)
                return "Partially Paid";
            if (invoice.Approved == true)
                return "Approved";
            if (DateTime.Now > invoice.DueDate)
                return "Overdue";
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
        public decimal? TaxRate { get; set; }
        public decimal? TaxAmount { get; set; }
        public decimal? FreightCharge { get; set; }
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
        public decimal? PaymentAmount { get; set; }
    }
}
