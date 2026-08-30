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
    public class InvoiceController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public InvoiceController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetInvoiceableItems/{orderId}")]
        public IActionResult GetInvoiceableItems(int orderId)
        {
            try
            {
                var tenantId = GetTenantId();

                var detailsList = _context.CustomerOrderDetails
                    .AsNoTracking()
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .ToList();

                var orderDetailIds = detailsList.Select(d => d.ID).ToList();
                var invoiceDetails = _context.InvoiceDetail
                    .Where(id => id.OrderDetailID.HasValue && orderDetailIds.Contains(id.OrderDetailID.Value))
                    .Join(_context.InvoiceMaster,
                        id => id.InvoiceId,
                        im => im.Id,
                        (id, im) => new { id.OrderDetailID, id.QtyInvoiced, im.TenantId })
                    .Where(x => x.TenantId == tenantId)
                    .GroupBy(x => x.OrderDetailID!.Value)
                    .ToDictionary(g => g.Key, g => g.Sum(x => x.QtyInvoiced));

                var shippedByDetail = _context.ShippingDetails
                    .Where(sd => sd.OrderDetailID.HasValue && orderDetailIds.Contains(sd.OrderDetailID.Value))
                    .Join(_context.Shipping,
                        sd => sd.ShipmentId,
                        s => s.Id,
                        (sd, s) => new { sd.OrderDetailID, sd.ShippedQty, s.TenantId })
                    .Where(x => x.TenantId == tenantId)
                    .GroupBy(x => x.OrderDetailID!.Value)
                    .ToDictionary(g => g.Key, g => g.Sum(x => x.ShippedQty));

                var jobOrdersByDetail = _context.JobOrderMaster
                    .AsNoTracking()
                    .Where(jo => jo.Tenantid == tenantId && orderDetailIds.Contains(jo.CustomerOrderDetailID))
                    .Select(jo => new { jo.CustomerOrderDetailID, jo.Status })
                    .ToList()
                    .GroupBy(jo => jo.CustomerOrderDetailID)
                    .ToDictionary(g => g.Key, g => g.First().Status ?? "Draft");

                var invoiceableItems = detailsList.Select(d =>
                {
                    var calculatedInvoicedQty = invoiceDetails.ContainsKey(d.ID) ? invoiceDetails[d.ID] : d.InvoicedQty;
                    var shippedQty = shippedByDetail.ContainsKey(d.ID) ? shippedByDetail[d.ID] : 0;
                    var availableToInvoice = shippedQty - calculatedInvoicedQty;
                    var hasJobOrder = jobOrdersByDetail.ContainsKey(d.ID);

                    return new
                    {
                        id = d.ID,
                        itemNo = d.ItemNo,
                        partNo = d.PartNo,
                        partName = d.partname,
                        qtyOrdered = d.QtyOrdered,
                        shippedQty = shippedQty,
                        invoicedQty = calculatedInvoicedQty,
                        availableQty = Math.Max(0, availableToInvoice),
                        invoiceStatus = d.InvoiceStatus ?? "Not Invoiced",
                        unitPrice = d.UnitPrice,
                        discount = d.Discount,
                        hasJobOrder,
                        jobOrderStatus = hasJobOrder ? jobOrdersByDetail[d.ID] : "No Job Order"
                    };
                }).ToList();

                return Ok(new { result = invoiceableItems });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("CreateInvoice")]
        public IActionResult CreateInvoice([FromBody] CreateInvoiceRequest request)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var tenantId = GetTenantId();
                    Console.WriteLine($"CreateInvoice called - TenantId: {tenantId}, OrderId: {request.OrderId}, LineItems: {request.LineItems.Count}");

                    // Validate all line items can be invoiced
                    foreach (var item in request.LineItems)
                    {
                        var detail = _context.CustomerOrderDetails
                            .FirstOrDefault(d => d.ID == item.OrderDetailId && d.Tenantid == tenantId);

                        if (detail == null)
                            return BadRequest(new { error = $"Order detail {item.OrderDetailId} not found" });

                        // Check if shipped quantity >= invoiced quantity + requested quantity
                        var shippedQty = GetShippedQtyForOrderDetail(detail.ID, tenantId);
                        var alreadyInvoiced = GetInvoicedQtyForOrderDetail(detail.ID, tenantId);
                        var availableToInvoice = shippedQty - alreadyInvoiced;

                        if (item.QtyToInvoice > availableToInvoice)
                            return BadRequest(new { error = $"Cannot invoice {item.QtyToInvoice} units of item {detail.ItemNo}. Only {availableToInvoice} available to invoice (shipped: {shippedQty}, already invoiced: {alreadyInvoiced})." });

                        if (item.QtyToInvoice <= 0)
                            return BadRequest(new { error = $"Quantity to invoice must be greater than 0 for item {detail.ItemNo}" });
                    }

                    // Generate invoice number
                    var invoiceNumber = GenerateInvoiceNumber(tenantId);

                    // Calculate totals (Amount = line net; TotalAmount = net + tax + shipping + other)
                    decimal subtotal = 0;
                    foreach (var item in request.LineItems)
                    {
                        var lineTotal = (item.UnitPrice * item.QtyToInvoice) * (1 - item.Discount / 100);
                        subtotal += lineTotal;
                    }
                    subtotal = Math.Round(subtotal, 2);

                    var saleTaxRate = request.SaleTax ?? 0m;
                    if (saleTaxRate < 0m || saleTaxRate > 100m)
                        return BadRequest(new { error = "Sale tax rate must be between 0 and 100." });

                    var saleTaxAmount = GlAccountResolutionService.ResolveTaxAmount(
                        subtotal, saleTaxRate, request.SaleTaxAmount);
                    if (saleTaxAmount > 0m)
                    {
                        var salesTaxAccountId = GlAccountResolutionService.ResolveSalesTaxPayable(_context, tenantId);
                        if (!salesTaxAccountId.HasValue)
                        {
                            return BadRequest(new
                            {
                                error = "Sales tax was entered but Sales Tax Payable is not configured. Set Default Sales Tax Payable in Accounting Setup → Default Accounts."
                            });
                        }
                    }

                    var shippingCharge = GlAccountResolutionService.NormalizeChargeAmount(request.ShippingCharge);
                    if (shippingCharge > 0m &&
                        !GlAccountResolutionService.ResolveFreightOut(_context, tenantId).HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Shipping/freight was entered but Freight Out is not configured. Set Default Freight Out in Accounting Setup → Default Accounts."
                        });
                    }

                    var otherCharge = GlAccountResolutionService.NormalizeChargeAmount(request.OtherCharge);
                    if (otherCharge > 0m &&
                        !GlAccountResolutionService.ResolveOtherCharge(_context, tenantId).HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Other charge was entered but Other Charge account is not configured. Set Default Other Charge in Accounting Setup → Default Accounts."
                        });
                    }

                    // Create invoice header
                    var invoice = new InvoiceMaster
                    {
                        TenantId = tenantId,
                        InvoiceNo = invoiceNumber,
                        PrefixInvoiceNo = $"INV-{DateTime.Now.Year}-{invoiceNumber:D4}",
                        InvoiceDate = request.InvoiceDate ?? DateTime.Now,
                        DueDate = request.DueDate ?? DateTime.Now.AddDays(30),
                        AccountingPeriod = $"{DateTime.Now.Year}{DateTime.Now.Month:D2}", // YYYYMM format
                        ShippingCharge = shippingCharge,
                        OtherCharge = otherCharge,
                        SaleTax = saleTaxRate,
                        SaleTaxAmount = saleTaxAmount,
                        Amount = subtotal,
                        TotalAmount = Math.Round(subtotal + saleTaxAmount + shippingCharge + otherCharge, 2),
                        PaidAmount = 0,
                        InternalNotes = request.Notes ?? "",
                        CheckNo = "", // Initialize required string field
                        PaymentMethod = "", // Initialize required string field
                        createdDate = DateTime.Now,
                        createdby = GetUserId()
                    };

                    _context.InvoiceMaster.Add(invoice);
                    _context.SaveChanges();

                    // Create invoice details and update order details
                    foreach (var item in request.LineItems)
                    {
                        var detail = _context.CustomerOrderDetails
                            .First(d => d.ID == item.OrderDetailId && d.Tenantid == tenantId);

                        var lineTotal = (item.UnitPrice * item.QtyToInvoice) * (1 - item.Discount / 100);

                        // Get order information (do this once per invoice, not per line item)
                        var orderInfo = _context.CustomerOrder
                            .Where(o => o.OrderID == request.OrderId && o.Tenantid == tenantId)
                            .Select(o => new { o.OrderDate, o.CustomerPoNumber })
                            .FirstOrDefault();

                        if (orderInfo == null)
                            return BadRequest(new { error = $"Order {request.OrderId} not found for tenant {tenantId}" });

                        var invoiceDetail = new InvoiceDetail
                        {
                            InvoiceId = invoice.Id,
                            OrderId = request.OrderId,
                            OrderDetailID = item.OrderDetailId,
                            ProductId = detail.productid,
                            OrderDate = orderInfo.OrderDate,
                            Description = $"{detail.partname ?? ""} - {detail.PartNo ?? ""}".Trim(' ', '-'),
                            CustomerPoNumber = orderInfo.CustomerPoNumber ?? "",
                            Amount = lineTotal,
                            price = item.UnitPrice,
                            discount = item.Discount,
                            qty = item.QtyToInvoice,
                            QtyInvoiced = item.QtyToInvoice,
                            ReconcileCL = "" // Initialize required string field
                        };

                        _context.InvoiceDetail.Add(invoiceDetail);

                        // Update CustomerOrderDetails
                        detail.InvoicedQty += item.QtyToInvoice;

                        if (detail.InvoicedQty >= detail.QtyOrdered)
                            detail.InvoiceStatus = "Fully Invoiced";
                        else if (detail.InvoicedQty > 0)
                            detail.InvoiceStatus = "Partially Invoiced";
                        else
                            detail.InvoiceStatus = "Not Invoiced";
                    }

                    // Update order status if needed
                    UpdateOrderInvoiceStatus(request.OrderId, tenantId);

                    // Auto-post invoice to GL so P&L receives revenue activity.
                    var receivableAccountId = GlAccountResolutionService.ResolveAccountsReceivable(_context, tenantId);
                    if (!receivableAccountId.HasValue)
                        return BadRequest(new { error = "Unable to determine Accounts Receivable GL account. Set Default Accounts Receivable in Accounting Setup, or configure an active AR account in Chart of Accounts." });

                    var revenueAccountId = GlAccountResolutionService.ResolveRevenue(_context, tenantId);
                    if (!revenueAccountId.HasValue)
                        return BadRequest(new { error = "Unable to determine Revenue GL account. Set Default Revenue in Accounting Setup, or configure an active Revenue account in Chart of Accounts." });

                    var invoicePeriodKey = !string.IsNullOrWhiteSpace(invoice.AccountingPeriod) &&
                                           GlWorkflowService.TryNormalizePeriodKey(invoice.AccountingPeriod, out var normalizedPeriod, out _)
                        ? normalizedPeriod
                        : GlWorkflowService.PeriodKeyFromDate(invoice.InvoiceDate);
                    if (GlWorkflowService.IsPeriodLocked(_context, tenantId, invoicePeriodKey))
                        return BadRequest(new { error = $"Accounting period {invoicePeriodKey} is closed. Open the period or choose a different invoice date." });

                    var postingRef = BuildAutoPostingReference("ARINV", invoice.PrefixInvoiceNo, invoice.Id);
                    var postingDesc = $"Auto-posted customer invoice {invoice.PrefixInvoiceNo ?? invoice.InvoiceNo.ToString()}";
                    if (!TryResolveLocationId(null, out var jeLocationId, out var forbidJeLoc, fallback: 1))
                        return forbidJeLoc!;
                    var invoiceHeader = new JournalEntry
                    {
                        EntryDate = invoice.InvoiceDate.Date,
                        ReferenceNumber = postingRef,
                        Description = postingDesc,
                        AccountingPeriod = invoicePeriodKey,
                        TenantId = tenantId,
                        locationId = jeLocationId,
                        createdby = GetUserId(),
                        createdDate = DateTime.UtcNow
                    };
                    _context.JournalEntries.Add(invoiceHeader);
                    _context.SaveChanges();

                    // Dr AR (gross). Cr Revenue (net). Cr tax / shipping / other when applicable.
                    _context.JournalEntryFrom.Add(new JournalDetailsFrom
                    {
                        JournalEntryId = invoiceHeader.Id,
                        AccountId = receivableAccountId.Value,
                        Amount = invoice.TotalAmount,
                        Description = postingDesc
                    });
                    _context.JournalEntryTo.Add(new JournalDetailsTo
                    {
                        JournalEntryId = invoiceHeader.Id,
                        AccountId = revenueAccountId.Value,
                        Amount = invoice.Amount,
                        Description = postingDesc
                    });
                    if (invoice.SaleTaxAmount > 0m)
                    {
                        var salesTaxAccountId = GlAccountResolutionService.ResolveSalesTaxPayable(_context, tenantId);
                        _context.JournalEntryTo.Add(new JournalDetailsTo
                        {
                            JournalEntryId = invoiceHeader.Id,
                            AccountId = salesTaxAccountId!.Value,
                            Amount = invoice.SaleTaxAmount,
                            Description = $"{postingDesc} (sales tax)"
                        });
                    }
                    if (invoice.ShippingCharge > 0m)
                    {
                        var freightOutAccountId = GlAccountResolutionService.ResolveFreightOut(_context, tenantId);
                        _context.JournalEntryTo.Add(new JournalDetailsTo
                        {
                            JournalEntryId = invoiceHeader.Id,
                            AccountId = freightOutAccountId!.Value,
                            Amount = invoice.ShippingCharge,
                            Description = $"{postingDesc} (shipping)"
                        });
                    }
                    if (invoice.OtherCharge > 0m)
                    {
                        var otherChargeAccountId = GlAccountResolutionService.ResolveOtherCharge(_context, tenantId);
                        _context.JournalEntryTo.Add(new JournalDetailsTo
                        {
                            JournalEntryId = invoiceHeader.Id,
                            AccountId = otherChargeAccountId!.Value,
                            Amount = invoice.OtherCharge,
                            Description = $"{postingDesc} (other charge)"
                        });
                    }

                    GlWorkflowService.AddAudit(_context, tenantId, "CustomerInvoiceAutoPost", GetUserId(), invoiceHeader.Id, null, invoicePeriodKey, postingRef);
                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new { result = new { invoiceId = invoice.Id, invoiceNumber = invoice.PrefixInvoiceNo, message = "Invoice created successfully" } });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    // Log more detailed error information
                    var innerException = ex.InnerException != null ? ex.InnerException.Message : "No inner exception";
                    return StatusCode(500, new {
                        error = $"Invoice creation failed: {ex.Message}",
                        innerException = innerException,
                        stackTrace = ex.StackTrace
                    });
                }
            }
        }

        [HttpGet("GetInvoiceDetails/{invoiceId}")]
        public IActionResult GetInvoiceDetails(int invoiceId)
        {
            try
            {
                var tenantId = GetTenantId();

                var invoice = _context.InvoiceMaster
                    .Where(im => im.Id == invoiceId && im.TenantId == tenantId)
                    .FirstOrDefault();

                if (invoice == null)
                {
                    return NotFound(new { error = "Invoice not found" });
                }

                var invoiceDetails = _context.InvoiceDetail
                    .Where(id => id.InvoiceId == invoiceId)
                    .ToList();

                var orderId = invoiceDetails.FirstOrDefault()?.OrderId ?? 0;
                var customerOrder = _context.CustomerOrder
                    .Where(co => co.OrderID == orderId && co.Tenantid == tenantId)
                    .FirstOrDefault();

                if (customerOrder == null)
                {
                    return NotFound(new { error = "Customer order not found" });
                }

                var items = invoiceDetails
                    .Join(_context.CustomerOrderDetails,
                        id => id.OrderDetailID,
                        cod => cod.ID,
                        (id, cod) => new
                        {
                            orderDetailId = id.OrderDetailID,
                            partNo = cod.PartNo,
                            partName = cod.partname,
                            description = id.Description,
                            qtyInvoiced = id.qty,
                            unitPrice = id.price,
                            discount = id.discount,
                            lineTotal = (id.price - id.discount) * id.qty
                        })
                    .ToList();

                var result = new
                {
                    id = invoice.Id,
                    invoiceNo = invoice.PrefixInvoiceNo ?? invoice.InvoiceNo.ToString(),
                    orderId = customerOrder.OrderID,
                    orderNumber = $"CO#{customerOrder.PONumber}",
                    customerName = customerOrder.CustomerName,
                    customerCode = customerOrder.customercode,
                    customerPoNumber = customerOrder.CustomerPoNumber,
                    invoiceDate = invoice.InvoiceDate.ToString("yyyy-MM-dd"),
                    dueDate = invoice.DueDate.ToString("yyyy-MM-dd"),
                    shippingCharge = invoice.ShippingCharge,
                    otherCharge = invoice.OtherCharge,
                    saleTax = invoice.SaleTax,
                    saleTaxAmount = invoice.SaleTaxAmount,
                    amount = invoice.Amount,
                    totalAmount = invoice.TotalAmount,
                    paidAmount = GetEffectivePaidAmount(invoice),
                    balanceDue = GetBalanceDue(invoice),
                    paymentMethod = invoice.PaymentMethod,
                    paymentDate = invoice.PaymentDate != null ? invoice.PaymentDate.Value.ToString("yyyy-MM-dd") : null,
                    checkNo = invoice.CheckNo,
                    internalNotes = invoice.InternalNotes,
                    status = ResolveCustomerInvoiceStatus(invoice),
                    daysOverdue = GetDaysOverdue(invoice),
                    items = items
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetInvoices/{orderId}")]
        public IActionResult GetInvoices(int orderId)
        {
            try
            {
                var tenantId = GetTenantId();
                Console.WriteLine($"GetInvoices called - TenantId: {tenantId}, OrderId: {orderId}");

                // Get all invoice details for this order
                var invoiceDetails = _context.InvoiceDetail
                    .Where(id => id.OrderId == orderId)
                    .ToList();

                Console.WriteLine($"Found {invoiceDetails.Count} invoice details for order {orderId}");

                // Get unique invoice IDs from the details
                var invoiceIds = invoiceDetails.Select(id => id.InvoiceId).Distinct().ToList();
                Console.WriteLine($"Found {invoiceIds.Count} unique invoice IDs");

                // Get invoice masters for these IDs
                var invoices = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId && invoiceIds.Contains(im.Id))
                    .ToList();

                Console.WriteLine($"Found {invoices.Count} invoice masters for tenant {tenantId}");

                // Build the response
                var result = invoices.Select(im => new
                {
                    id = im.Id,
                    invoiceNo = im.PrefixInvoiceNo,
                    invoiceDate = im.InvoiceDate,
                    dueDate = im.DueDate,
                    amount = im.Amount,
                    totalAmount = im.TotalAmount,
                    paidAmount = GetEffectivePaidAmount(im),
                    balanceDue = GetBalanceDue(im),
                    status = ResolveCustomerInvoiceStatus(im),
                    items = invoiceDetails
                        .Where(id => id.InvoiceId == im.Id)
                        .Select(id => new
                        {
                            orderDetailId = id.OrderDetailID,
                            qtyInvoiced = id.QtyInvoiced,
                            description = id.Description,
                            amount = id.Amount
                        }).ToList()
                })
                .OrderByDescending(i => i.invoiceDate)
                .ToList();

                Console.WriteLine($"Returning {result.Count} invoices for order {orderId}");
                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetInvoices: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetAllInvoices")]
        public IActionResult GetAllInvoices(
            [FromQuery] string status = "All",
            [FromQuery] string searchTerm = "",
            [FromQuery] int? customerId = null,
            [FromQuery] string dateRange = "Last 30 Days",
            [FromQuery] int? locationId = null)
        {
            try
            {
                var tenantId = GetTenantId();
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var now = DateTime.Now;

                DateTime? startDate = null;
                DateTime? endDate = null;
                switch ((dateRange ?? "").Trim().ToLowerInvariant())
                {
                    case "this week":
                        startDate = now.Date.AddDays(-(int)now.DayOfWeek);
                        endDate = startDate.Value.AddDays(6);
                        break;
                    case "last 7 days":
                        startDate = now.Date.AddDays(-7);
                        break;
                    case "last 30 days":
                        startDate = now.Date.AddDays(-30);
                        break;
                    case "last 90 days":
                        startDate = now.Date.AddDays(-90);
                        break;
                    case "this month":
                        startDate = new DateTime(now.Year, now.Month, 1);
                        break;
                    case "last month":
                        startDate = new DateTime(now.Year, now.Month, 1).AddMonths(-1);
                        endDate = new DateTime(now.Year, now.Month, 1).AddDays(-1);
                        break;
                    case "all":
                        break;
                    default:
                        // Unknown preset: do not silently rewrite to last 30 days
                        break;
                }

                var detailAggs = _context.InvoiceDetail.AsNoTracking()
                    .GroupBy(d => d.InvoiceId)
                    .Select(g => new
                    {
                        InvoiceId = g.Key,
                        TotalItems = g.Sum(x => x.qty),
                        ItemCount = g.Count(),
                        OrderId = g.Min(x => x.OrderId)
                    });

                var query =
                    from im in _context.InvoiceMaster.AsNoTracking()
                    where im.TenantId == tenantId
                    join agg in detailAggs on im.Id equals agg.InvoiceId
                    join co in _context.CustomerOrder.AsNoTracking()
                        on new { OrderID = agg.OrderId, Tenantid = tenantId }
                        equals new { co.OrderID, co.Tenantid }
                    select new
                    {
                        Invoice = im,
                        CustomerOrder = co,
                        agg.TotalItems,
                        agg.ItemCount
                    };

                if (startDate.HasValue)
                    query = query.Where(x => x.Invoice.InvoiceDate >= startDate.Value);
                if (endDate.HasValue)
                    query = query.Where(x => x.Invoice.InvoiceDate <= endDate.Value);
                if (filterLocationId.HasValue)
                    query = query.Where(x =>
                        x.CustomerOrder.locationId == filterLocationId.Value);
                if (customerId.HasValue)
                    query = query.Where(x => x.CustomerOrder.CustomerID == customerId.Value);
                if (!string.IsNullOrWhiteSpace(searchTerm))
                {
                    var term = searchTerm.Trim();
                    var numericMatch = int.TryParse(term, out var numericValue) ? numericValue : (int?)null;
                    query = query.Where(x =>
                        (x.Invoice.PrefixInvoiceNo != null && x.Invoice.PrefixInvoiceNo.Contains(term)) ||
                        (numericMatch.HasValue && x.Invoice.InvoiceNo == numericMatch.Value) ||
                        (numericMatch.HasValue && x.CustomerOrder.PONumber == numericMatch.Value) ||
                        (x.CustomerOrder.CustomerName != null && x.CustomerOrder.CustomerName.Contains(term)) ||
                        (x.CustomerOrder.customercode != null && x.CustomerOrder.customercode.Contains(term)));
                }

                var rows = query
                    .OrderByDescending(x => x.Invoice.InvoiceDate)
                    .ToList();

                var invoiceSummaries = rows
                    .Select(x => new
                    {
                        id = x.Invoice.Id,
                        invoiceNo = x.Invoice.PrefixInvoiceNo ?? x.Invoice.InvoiceNo.ToString(),
                        orderId = x.CustomerOrder.OrderID,
                        orderNumber = $"CO#{x.CustomerOrder.PONumber}",
                        customerName = x.CustomerOrder.CustomerName,
                        customerCode = x.CustomerOrder.customercode,
                        invoiceDate = x.Invoice.InvoiceDate.ToString("yyyy-MM-dd"),
                        dueDate = x.Invoice.DueDate.ToString("yyyy-MM-dd"),
                        totalItems = x.TotalItems,
                        itemCount = x.ItemCount,
                        amount = x.Invoice.Amount,
                        totalAmount = x.Invoice.TotalAmount,
                        paidAmount = GetEffectivePaidAmount(x.Invoice),
                        balanceDue = GetBalanceDue(x.Invoice),
                        status = ResolveCustomerInvoiceStatus(x.Invoice),
                        daysOverdue = GetDaysOverdue(x.Invoice)
                    })
                    .ToList();

                if (!string.IsNullOrWhiteSpace(status) &&
                    !string.Equals(status, "All", StringComparison.OrdinalIgnoreCase))
                {
                    invoiceSummaries = invoiceSummaries
                        .Where(x => string.Equals(x.status, status, StringComparison.OrdinalIgnoreCase))
                        .ToList();
                }

                return Ok(new { result = invoiceSummaries });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("CheckInvoiceDeletionImpact")]
        public IActionResult CheckInvoiceDeletionImpact([FromQuery] int invoiceId, [FromQuery] int tenantId)
        {
            try
            {
                var invoice = _context.InvoiceMaster
                    .FirstOrDefault(im => im.Id == invoiceId && im.TenantId == tenantId);

                if (invoice == null)
                {
                    return NotFound(new { error = "Invoice not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check if invoice is paid
                if (invoice.PaymentDate.HasValue)
                {
                    impact.BlockingReasons.Add(
                        $"Invoice has been paid on {invoice.PaymentDate.Value:yyyy-MM-dd}. Cannot delete paid invoices."
                    );
                    impact.CanDelete = false;
                }

                var invoicePostingRef = BuildAutoPostingReference("ARINV", invoice.PrefixInvoiceNo, invoice.Id);
                var hasPostedGlEntry = _context.JournalEntries
                    .Any(je => je.TenantId == tenantId && je.ReferenceNumber == invoicePostingRef);
                if (hasPostedGlEntry)
                {
                    impact.BlockingReasons.Add("Invoice has a posted GL entry. Reverse/delete the journal entry first.");
                    impact.CanDelete = false;
                }

                // Get invoice details
                var invoiceDetails = _context.InvoiceDetail
                    .Where(id => id.InvoiceId == invoiceId)
                    .ToList();

                if (invoiceDetails.Any())
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Invoice Details",
                        Count = invoiceDetails.Count,
                        Description = $"{invoiceDetails.Count} line item(s) will be deleted"
                    });

                    // Check which order details will be affected
                    var orderDetailIds = invoiceDetails
                        .Where(id => id.OrderDetailID.HasValue)
                        .Select(id => id.OrderDetailID.Value)
                        .Distinct()
                        .ToList();

                    if (orderDetailIds.Any())
                    {
                        var orderDetails = _context.CustomerOrderDetails
                            .Where(od => orderDetailIds.Contains(od.ID) && od.Tenantid == tenantId)
                            .ToList();

                        var totalQtyToRestore = invoiceDetails.Sum(id => id.QtyInvoiced);
                        impact.WillBeAffected.Add(new ImpactedEntity
                        {
                            EntityType = "Order Details",
                            Count = orderDetails.Count,
                            Description = $"Invoiced quantities will be restored for {orderDetails.Count} order line item(s) (total: {totalQtyToRestore} units)"
                        });
                    }
                }

                impact.Warnings.Add("This action cannot be undone");
                if (invoice.PaymentDate == null && invoice.DueDate < DateTime.Now)
                {
                    impact.Warnings.Add("This invoice is overdue");
                }

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("VoidInvoice/{invoiceId}")]
        public IActionResult VoidInvoice(int invoiceId)
        {
            return VoidInvoiceCore(invoiceId);
        }

        [HttpPut("VoidInvoice")]
        public IActionResult VoidInvoiceByBody([FromBody] VoidInvoiceRequest? body)
        {
            return VoidInvoiceCore(body?.invoiceId > 0 ? body.invoiceId : body?.InvoiceId ?? 0);
        }

        private IActionResult VoidInvoiceCore(int invoiceId)
        {
            if (invoiceId <= 0)
                return BadRequest(new { error = "Invoice id is required." });

            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var tenantId = GetTenantId();
                    var invoice = _context.InvoiceMaster
                        .FirstOrDefault(im => im.Id == invoiceId && im.TenantId == tenantId);

                    if (invoice == null)
                        return NotFound(new { error = "Invoice not found" });

                    if (invoice.IsVoided)
                        return BadRequest(new { error = "Invoice is already voided." });

                    var paid = GetEffectivePaidAmount(invoice);
                    if (paid > 0.009m)
                        return BadRequest(new { error = "Cannot void a paid or partially paid invoice. Reverse payments first." });

                    var invoicePostingRef = BuildAutoPostingReference("ARINV", invoice.PrefixInvoiceNo, invoice.Id);
                    if (!GlWorkflowService.TryReverseJournalByReference(
                        _context, tenantId, invoicePostingRef, GetUserId(), "CustomerInvoiceVoid", out var reverseError))
                    {
                        return BadRequest(new { error = reverseError });
                    }

                    var invoiceDetails = _context.InvoiceDetail
                        .Where(id => id.InvoiceId == invoiceId)
                        .ToList();

                    foreach (var detail in invoiceDetails)
                    {
                        if (!detail.OrderDetailID.HasValue)
                            continue;
                        var orderDetail = _context.CustomerOrderDetails
                            .FirstOrDefault(od => od.ID == detail.OrderDetailID.Value && od.Tenantid == tenantId);
                        if (orderDetail == null)
                            continue;
                        orderDetail.InvoicedQty = Math.Max(0, orderDetail.InvoicedQty - detail.QtyInvoiced);
                        if (orderDetail.InvoicedQty == 0)
                            orderDetail.InvoiceStatus = "Not Invoiced";
                        else if (orderDetail.InvoicedQty < orderDetail.QtyOrdered)
                            orderDetail.InvoiceStatus = "Partially Invoiced";
                        else
                            orderDetail.InvoiceStatus = "Fully Invoiced";
                    }

                    invoice.IsVoided = true;
                    invoice.PaidAmount = 0;

                    var orderId = invoiceDetails.FirstOrDefault()?.OrderId ?? 0;
                    if (orderId > 0)
                        UpdateOrderInvoiceStatus(orderId, tenantId);

                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new { result = new { message = "Invoice voided successfully" }, success = true });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
        }

        [HttpDelete("DeleteInvoice")]
        public IActionResult DeleteInvoice([FromQuery] int invoiceId, [FromQuery] int tenantId)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var invoice = _context.InvoiceMaster
                        .FirstOrDefault(im => im.Id == invoiceId && im.TenantId == tenantId);

                    if (invoice == null)
                    {
                        return NotFound(new { error = "Invoice not found" });
                    }

                    var invoicePostingRef = BuildAutoPostingReference("ARINV", invoice.PrefixInvoiceNo, invoice.Id);
                    var hasPostedGlEntry = _context.JournalEntries
                        .Any(je => je.TenantId == tenantId && je.ReferenceNumber == invoicePostingRef);
                    if (hasPostedGlEntry)
                        return BadRequest(new { error = "Cannot delete invoice because a GL entry exists. Reverse/delete the related journal entry first." });

                    // Get all invoice details for this invoice
                    var invoiceDetails = _context.InvoiceDetail
                        .Where(id => id.InvoiceId == invoiceId)
                        .ToList();

                    // Update CustomerOrderDetails - subtract invoiced quantities
                    foreach (var detail in invoiceDetails)
                    {
                        if (detail.OrderDetailID.HasValue)
                        {
                            var orderDetail = _context.CustomerOrderDetails
                                .FirstOrDefault(od => od.ID == detail.OrderDetailID.Value && od.Tenantid == tenantId);

                            if (orderDetail != null)
                            {
                                orderDetail.InvoicedQty = Math.Max(0, orderDetail.InvoicedQty - detail.QtyInvoiced);

                                // Update invoice status based on remaining invoiced quantity
                                if (orderDetail.InvoicedQty == 0)
                                    orderDetail.InvoiceStatus = "Not Invoiced";
                                else if (orderDetail.InvoicedQty < orderDetail.QtyOrdered)
                                    orderDetail.InvoiceStatus = "Partially Invoiced";
                                else if (orderDetail.InvoicedQty >= orderDetail.QtyOrdered)
                                    orderDetail.InvoiceStatus = "Fully Invoiced";
                            }
                        }
                    }

                    // Delete invoice details
                    _context.InvoiceDetail.RemoveRange(invoiceDetails);

                    // Delete invoice
                    _context.InvoiceMaster.Remove(invoice);

                    // Update order status
                    var orderId = invoiceDetails.FirstOrDefault()?.OrderId ?? 0;
                    if (orderId > 0)
                    {
                        UpdateOrderInvoiceStatus(orderId, tenantId);
                    }

                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new { result = new { message = "Invoice deleted successfully" } });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
        }

        private int GenerateInvoiceNumber(int tenantId)
        {
            var currentYear = DateTime.Now.Year;
            var existingInvoices = _context.InvoiceMaster
                .Where(im => im.TenantId == tenantId && im.InvoiceDate.Year == currentYear)
                .ToList();

            var maxInvoiceNo = existingInvoices.Any() ? existingInvoices.Max(im => im.InvoiceNo) : 0;
            return (maxInvoiceNo + 1);
        }

        private int GetShippedQtyForOrderDetail(int orderDetailId, int tenantId)
        {
            // Calculate from ShippingDetails (same logic as GetOrderById)
            var shippedQty = _context.ShippingDetails
                .Where(sd => sd.OrderDetailID == orderDetailId)
                .Join(_context.Shipping,
                    sd => sd.ShipmentId,
                    s => s.Id,
                    (sd, s) => new { sd.ShippedQty, s.TenantId })
                .Where(x => x.TenantId == tenantId)
                .Sum(x => x.ShippedQty);

            return shippedQty;
        }

        private int GetInvoicedQtyForOrderDetail(int orderDetailId, int tenantId)
        {
            // Calculate from InvoiceDetails
            var invoicedQty = _context.InvoiceDetail
                .Where(id => id.OrderDetailID == orderDetailId)
                .Join(_context.InvoiceMaster,
                    id => id.InvoiceId,
                    im => im.Id,
                    (id, im) => new { id.QtyInvoiced, im.TenantId })
                .Where(x => x.TenantId == tenantId)
                .Sum(x => x.QtyInvoiced);

            return invoicedQty;
        }

        private void UpdateOrderInvoiceStatus(int orderId, int tenantId)
        {
            var order = _context.CustomerOrder
                .FirstOrDefault(o => o.OrderID == orderId && o.Tenantid == tenantId);

            if (order == null) return;

            var details = _context.CustomerOrderDetails
                .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                .ToList();

            // Calculate InvoicedQty from InvoiceDetail records (same as GetOrderById)
            var orderDetailIds = details.Select(d => d.ID).ToList();
            var invoiceDetails = _context.InvoiceDetail
                .Where(id => id.OrderDetailID.HasValue && orderDetailIds.Contains(id.OrderDetailID.Value))
                .Join(_context.InvoiceMaster,
                    id => id.InvoiceId,
                    im => im.Id,
                    (id, im) => new { id.OrderDetailID, id.QtyInvoiced, im.TenantId })
                .Where(x => x.TenantId == tenantId)
                .GroupBy(x => x.OrderDetailID.Value)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.QtyInvoiced));

            var totalInvoiced = details.Sum(d => invoiceDetails.ContainsKey(d.ID) ? invoiceDetails[d.ID] : 0);
            var totalOrdered = details.Sum(d => d.QtyOrdered);

            // Note: This is a simplified status update. In a real system,
            // you might want more granular status tracking like:
            // "Shipped", "Partially Invoiced", "Fully Invoiced", "Paid", etc.
            if (totalInvoiced == 0)
            {
                // Keep existing status (likely "Shipped" or similar)
            }
            else if (totalInvoiced < totalOrdered)
            {
                order.Status = "Partially Invoiced";
            }
            else if (totalInvoiced == totalOrdered)
            {
                order.Status = "Fully Invoiced";
            }
        }

        [HttpPost("RecordCustomerPayment/{invoiceId}")]
        public IActionResult RecordCustomerPayment(int invoiceId, [FromBody] RecordCustomerPaymentRequest request)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var tenantId = GetTenantId();

                    var invoice = _context.InvoiceMaster
                        .FirstOrDefault(im => im.Id == invoiceId && im.TenantId == tenantId);

                    if (invoice == null)
                        return NotFound(new { error = "Customer invoice not found" });

                    if (invoice.IsVoided)
                        return BadRequest(new { error = "Cannot record payment on a voided customer invoice." });

                    var alreadyPaid = GetEffectivePaidAmount(invoice);
                    var balanceDue = Math.Round(invoice.TotalAmount - alreadyPaid, 2);
                    if (balanceDue <= 0.009m)
                        return BadRequest(new { error = "Customer invoice is already fully paid." });

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

                    var accountsReceivableAccountId = GlAccountResolutionService.ResolveAccountsReceivable(_context, tenantId);
                    if (!accountsReceivableAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine Accounts Receivable GL account. Configure an active COA account for AR first."
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

                    // Accumulate payment; never overwrite invoice Amount (subtotal).
                    invoice.PaymentMethod = request.PaymentMethod ?? invoice.PaymentMethod ?? "";
                    invoice.CheckNo = request.CheckNo ?? invoice.CheckNo ?? "";
                    invoice.Bankid = bankId;
                    invoice.PaidAmount = isFullyPaid ? invoice.TotalAmount : newPaidTotal;
                    invoice.PaymentDate = isFullyPaid ? paymentDate : (DateTime?)null;

                    if (!string.IsNullOrWhiteSpace(request.Notes))
                    {
                        var noteLine = $"[{paymentDate:yyyy-MM-dd}] Payment {paymentAmount:0.00}: {request.Notes.Trim()}";
                        invoice.InternalNotes = string.IsNullOrWhiteSpace(invoice.InternalNotes)
                            ? noteLine
                            : $"{invoice.InternalNotes}\n{noteLine}";
                    }

                    var referenceNo = BuildAutoPaymentReference("ARPMT", invoice.PrefixInvoiceNo, invoice.Id);
                    var description = isFullyPaid
                        ? $"Auto-posted customer payment for invoice {invoice.PrefixInvoiceNo ?? invoice.InvoiceNo.ToString()}"
                        : $"Auto-posted partial customer payment ({paymentAmount:0.00}) for invoice {invoice.PrefixInvoiceNo ?? invoice.InvoiceNo.ToString()}";
                    var locationId = 1;
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

                    // Debit bank / credit AR.
                    _context.JournalEntryFrom.Add(new JournalDetailsFrom
                    {
                        JournalEntryId = journalHeader.Id,
                        AccountId = bankAccountId.Value,
                        Amount = paymentAmount,
                        Description = description
                    });
                    _context.JournalEntryTo.Add(new JournalDetailsTo
                    {
                        JournalEntryId = journalHeader.Id,
                        AccountId = accountsReceivableAccountId.Value,
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
                        invoiceNo = invoice.PrefixInvoiceNo ?? invoice.InvoiceNo.ToString(),
                        AccountingPeriod = periodKey,
                        Description = $"Customer payment for {invoice.PrefixInvoiceNo ?? invoice.InvoiceNo.ToString()}",
                        CheckNo = invoice.CheckNo,
                        TenantId = tenantId,
                        locationId = locationId,
                        BankId = bankId,
                        approved = true,
                        isCustomer = 1
                    });

                    GlWorkflowService.AddAudit(_context, tenantId, "CustomerPaymentAutoPost", GetUserId(), journalHeader.Id, null, periodKey, referenceNo);
                    _context.SaveChanges();
                    transaction.Commit();

                    var remaining = Math.Round(invoice.TotalAmount - invoice.PaidAmount, 2);
                    return Ok(new
                    {
                        result = new
                        {
                            message = isFullyPaid
                                ? "Customer payment recorded and posted to GL successfully"
                                : $"Partial payment of {paymentAmount:0.00} recorded. Remaining balance: {remaining:0.00}",
                            journalEntryId = journalHeader.Id,
                            paidAmount = invoice.PaidAmount,
                            balanceDue = remaining,
                            status = ResolveCustomerInvoiceStatus(invoice)
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

        private static string BuildAutoPostingReference(string prefix, string? documentNo, int documentId)
        {
            var safeDoc = string.IsNullOrWhiteSpace(documentNo) ? documentId.ToString() : documentNo.Trim();
            var reference = $"{prefix}-{safeDoc}";
            return reference.Length > 200 ? reference[..200] : reference;
        }

        private static string BuildAutoPaymentReference(string prefix, string? invoiceNo, int invoiceId)
        {
            var safeInvoice = string.IsNullOrWhiteSpace(invoiceNo) ? invoiceId.ToString() : invoiceNo.Trim();
            var reference = $"{prefix}-{safeInvoice}";
            return reference.Length > 200 ? reference[..200] : reference;
        }

        /// <summary>
        /// Effective paid-to-date. Legacy rows used PaymentDate alone (PaidAmount = 0).
        /// </summary>
        private static decimal GetEffectivePaidAmount(InvoiceMaster invoice)
        {
            if (invoice.IsVoided)
                return 0m;
            if (invoice.PaidAmount > 0)
                return invoice.PaidAmount;
            if (invoice.PaymentDate.HasValue)
                return invoice.TotalAmount;
            return 0m;
        }

        private static decimal GetBalanceDue(InvoiceMaster invoice)
        {
            var balance = invoice.TotalAmount - GetEffectivePaidAmount(invoice);
            return balance < 0 ? 0m : Math.Round(balance, 2);
        }

        private static int? GetDaysOverdue(InvoiceMaster invoice)
        {
            if (GetBalanceDue(invoice) <= 0.009m)
                return null;
            if (invoice.DueDate >= DateTime.Now)
                return null;
            return (int)(DateTime.Now - invoice.DueDate).TotalDays;
        }

        private static string ResolveCustomerInvoiceStatus(InvoiceMaster invoice)
        {
            if (invoice.IsVoided)
                return "Void";

            var paid = GetEffectivePaidAmount(invoice);
            var total = invoice.TotalAmount;

            if (paid >= total - 0.009m && total > 0)
                return "Paid";
            if (paid > 0.009m)
                return "Partially Paid";
            if (invoice.DueDate < DateTime.Now)
                return "Overdue";
            return "Unpaid";
        }

        private string GetInvoiceStatus(InvoiceMaster invoice) => ResolveCustomerInvoiceStatus(invoice);
    }

    // DTOs
    public class CreateInvoiceRequest
    {
        public int OrderId { get; set; }
        public List<InvoiceLineItem> LineItems { get; set; } = new List<InvoiceLineItem>();
        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public string Notes { get; set; }
        /// <summary>Optional sales tax rate percent (0–100).</summary>
        public decimal? SaleTax { get; set; }
        /// <summary>Optional sales tax amount. When omitted, computed from SaleTax × net subtotal.</summary>
        public decimal? SaleTaxAmount { get; set; }
        /// <summary>Optional shipping / freight billed to customer.</summary>
        public decimal? ShippingCharge { get; set; }
        /// <summary>Optional other charges billed to customer.</summary>
        public decimal? OtherCharge { get; set; }
    }

    public class InvoiceLineItem
    {
        public int OrderDetailId { get; set; }
        public int QtyToInvoice { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal Discount { get; set; }
    }

    public class RecordCustomerPaymentRequest
    {
        public string PaymentMethod { get; set; }
        public DateTime? PaymentDate { get; set; }
        public string CheckNo { get; set; }
        public int? BankId { get; set; }
        public decimal? PaymentAmount { get; set; }
        public string Notes { get; set; }
    }

    public class VoidInvoiceRequest
    {
        public int invoiceId { get; set; }
        public int InvoiceId { get; set; }
    }
}
