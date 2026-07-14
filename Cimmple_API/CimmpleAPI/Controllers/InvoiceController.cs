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
                Console.WriteLine($"GetInvoiceableItems called - TenantId: {tenantId}, OrderId: {orderId}");

                var detailsList = _context.CustomerOrderDetails
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .ToList();

                Console.WriteLine($"Found {detailsList.Count} order details for order {orderId}");

                // Calculate InvoicedQty from InvoiceDetails (same as GetOrderById)
                // This ensures accuracy even if stored value is out of sync
                var orderDetailIds = detailsList.Select(d => d.ID).ToList();
                var invoiceDetails = _context.InvoiceDetail
                    .Where(id => id.OrderDetailID.HasValue && orderDetailIds.Contains(id.OrderDetailID.Value))
                    .Join(_context.InvoiceMaster,
                        id => id.InvoiceId,
                        im => im.Id,
                        (id, im) => new { id.OrderDetailID, id.QtyInvoiced, im.TenantId })
                    .Where(x => x.TenantId == tenantId)
                    .GroupBy(x => x.OrderDetailID.Value)
                    .ToDictionary(g => g.Key, g => g.Sum(x => x.QtyInvoiced));

                var invoiceableItems = detailsList.Select(d => {
                    var calculatedInvoicedQty = invoiceDetails.ContainsKey(d.ID) ? invoiceDetails[d.ID] : d.InvoicedQty;
                    var shippedQty = GetShippedQtyForOrderDetail(d.ID, tenantId);
                    var availableToInvoice = shippedQty - calculatedInvoicedQty;

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
                        hasJobOrder = _context.JobOrderMaster
                            .Any(jo => jo.CustomerOrderDetailID == d.ID && jo.Tenantid == tenantId),
                        jobOrderStatus = _context.JobOrderMaster
                            .Where(jo => jo.CustomerOrderDetailID == d.ID && jo.Tenantid == tenantId)
                            .Select(jo => jo.Status)
                            .FirstOrDefault() ?? "No Job Order"
                    };
                }).ToList();

                var itemsWithAvailableQty = invoiceableItems.Where(i => i.availableQty > 0).ToList();
                Console.WriteLine($"Found {itemsWithAvailableQty.Count} items with available quantity to invoice out of {invoiceableItems.Count} total items");
                if (itemsWithAvailableQty.Count > 0)
                {
                    Console.WriteLine($"Items with available quantity: {string.Join(", ", itemsWithAvailableQty.Select(i => $"Item {i.itemNo} ({i.partNo}): {i.availableQty} available (shipped: {i.shippedQty}, invoiced: {i.invoicedQty})"))}");
                }

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

                    // Calculate totals
                    decimal subtotal = 0;
                    foreach (var item in request.LineItems)
                    {
                        var lineTotal = (item.UnitPrice * item.QtyToInvoice) * (1 - item.Discount / 100);
                        subtotal += lineTotal;
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
                        ShippingCharge = 0,
                        OtherCharge = 0,
                        SaleTax = 0,
                        SaleTaxAmount = 0,
                        Amount = subtotal,
                        TotalAmount = subtotal, // Could add tax, shipping, etc. later
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
                    var receivableAccountId = ResolveAccountsReceivableGlAccountId(tenantId);
                    if (!receivableAccountId.HasValue)
                        return BadRequest(new { error = "Unable to determine Accounts Receivable GL account. Configure an active AR account in Chart of Accounts." });

                    var revenueAccountId = ResolveRevenueGlAccountId(tenantId);
                    if (!revenueAccountId.HasValue)
                        return BadRequest(new { error = "Unable to determine Revenue GL account. Configure an active Revenue account in Chart of Accounts." });

                    var invoicePeriodKey = !string.IsNullOrWhiteSpace(invoice.AccountingPeriod) &&
                                           GlWorkflowService.TryNormalizePeriodKey(invoice.AccountingPeriod, out var normalizedPeriod, out _)
                        ? normalizedPeriod
                        : GlWorkflowService.PeriodKeyFromDate(invoice.InvoiceDate);
                    if (GlWorkflowService.IsPeriodLocked(_context, tenantId, invoicePeriodKey))
                        return BadRequest(new { error = $"Accounting period {invoicePeriodKey} is closed. Open the period or choose a different invoice date." });

                    var postingRef = BuildAutoPostingReference("ARINV", invoice.PrefixInvoiceNo, invoice.Id);
                    var postingDesc = $"Auto-posted customer invoice {invoice.PrefixInvoiceNo ?? invoice.InvoiceNo.ToString()}";
                    var invoiceHeader = new JournalEntry
                    {
                        EntryDate = invoice.InvoiceDate.Date,
                        ReferenceNumber = postingRef,
                        Description = postingDesc,
                        AccountingPeriod = invoicePeriodKey,
                        TenantId = tenantId,
                        locationId = 1,
                        createdby = GetUserId(),
                        createdDate = DateTime.UtcNow
                    };
                    _context.JournalEntries.Add(invoiceHeader);
                    _context.SaveChanges();

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
                        Amount = invoice.TotalAmount,
                        Description = postingDesc
                    });

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
                    paymentMethod = invoice.PaymentMethod,
                    paymentDate = invoice.PaymentDate != null ? invoice.PaymentDate.Value.ToString("yyyy-MM-dd") : null,
                    checkNo = invoice.CheckNo,
                    internalNotes = invoice.InternalNotes,
                    status = invoice.PaymentDate != null ? "Paid" :
                            (invoice.DueDate < DateTime.Now && invoice.PaymentDate == null) ? "Overdue" : "Unpaid",
                    daysOverdue = invoice.PaymentDate == null && invoice.DueDate < DateTime.Now ?
                                 (int)(DateTime.Now - invoice.DueDate).TotalDays : (int?)null,
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
                    status = GetInvoiceStatus(im),
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
        public IActionResult GetAllInvoices([FromQuery] string status = "All", [FromQuery] string searchTerm = "", [FromQuery] int? customerId = null, [FromQuery] string dateRange = "Last 30 Days")
        {
            try
            {
                var tenantId = GetTenantId();
                Console.WriteLine($"GetAllInvoices called - TenantId: {tenantId}, Status: {status}, DateRange: {dateRange}");

                // Debug: Check if there are any invoices at all
                var totalInvoices = _context.InvoiceMaster.Where(im => im.TenantId == tenantId).Count();
                Console.WriteLine($"Total invoices in database for tenant {tenantId}: {totalInvoices}");

                var totalInvoiceDetails = _context.InvoiceDetail
                    .Join(_context.InvoiceMaster, id => id.InvoiceId, im => im.Id, (id, im) => new { id, im })
                    .Where(x => x.im.TenantId == tenantId)
                    .Count();
                Console.WriteLine($"Total invoice details in database for tenant {tenantId}: {totalInvoiceDetails}");

                // Debug: Check customer orders and their invoicing status
                var customerOrdersWithInvoicing = _context.CustomerOrderDetails
                    .Where(cod => cod.Tenantid == tenantId)
                    .Select(cod => new {
                        OrderId = cod.OrderID,
                        PartNo = cod.PartNo,
                        QtyOrdered = cod.QtyOrdered,
                        ShippedQty = cod.ShippedQty,
                        InvoicedQty = cod.InvoicedQty,
                        InvoiceStatus = cod.InvoiceStatus
                    })
                    .ToList();

                Console.WriteLine($"Customer order details for tenant {tenantId}:");
                foreach (var detail in customerOrdersWithInvoicing)
                {
                    Console.WriteLine($"  Order {detail.OrderId}, Part {detail.PartNo}: Ordered={detail.QtyOrdered}, Invoiced={detail.InvoicedQty}, Status={detail.InvoiceStatus}");
                }

                // Check if there are any shipped but not invoiced items
                var shippedNotInvoiced = customerOrdersWithInvoicing
                    .Where(d => d.InvoicedQty < d.QtyOrdered && d.ShippedQty > d.InvoicedQty)
                    .ToList();

                Console.WriteLine($"Items that can be invoiced (shipped but not fully invoiced): {shippedNotInvoiced.Count}");
                foreach (var item in shippedNotInvoiced)
                {
                    Console.WriteLine($"  Order {item.OrderId}, Part {item.PartNo}: Shipped={item.ShippedQty}, Invoiced={item.InvoicedQty}, Can invoice={item.ShippedQty - item.InvoicedQty}");
                }
                Console.WriteLine($"GetAllInvoices called - TenantId: {tenantId}, Status: {status}, DateRange: {dateRange}");

                // Get all customer invoices from database (simplified approach)
                var invoiceIds = _context.InvoiceMaster
                    .Where(im => im.TenantId == tenantId)
                    .Select(im => im.Id)
                    .ToList();

                var invoices = new List<dynamic>();
                foreach (var invoiceId in invoiceIds)
                {
                    var invoice = _context.InvoiceMaster
                        .Where(im => im.Id == invoiceId)
                        .First();

                    var invoiceDetails = _context.InvoiceDetail
                        .Where(id => id.InvoiceId == invoiceId)
                        .ToList();

                    var orderId = invoiceDetails.FirstOrDefault()?.OrderId ?? 0;
                    var customerOrder = _context.CustomerOrder
                        .Where(co => co.OrderID == orderId && co.Tenantid == tenantId)
                        .FirstOrDefault();

                    if (customerOrder != null)
                    {
                        invoices.Add(new
                        {
                            Invoice = invoice,
                            CustomerOrder = customerOrder,
                            TotalItems = invoiceDetails.Sum(id => id.qty),
                            ItemCount = invoiceDetails.Count(),
                            TotalAmount = invoice.TotalAmount
                        });
                    }
                }

                Console.WriteLine($"Found {invoices.Count} customer invoices in database");

                // Format the results
                var invoiceSummaries = invoices
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
                        totalAmount = x.TotalAmount,
                        status = x.Invoice.PaymentDate != null ? "Paid" :
                                (x.Invoice.DueDate < DateTime.Now && x.Invoice.PaymentDate == null) ? "Overdue" : "Unpaid",
                        daysOverdue = x.Invoice.PaymentDate == null && x.Invoice.DueDate < DateTime.Now ?
                                     (int)(DateTime.Now - x.Invoice.DueDate).TotalDays : (int?)null
                    })
                    .OrderByDescending(x => x.invoiceDate)
                    .ToList();

                Console.WriteLine($"GetAllInvoices - Found {invoiceSummaries.Count} customer invoices");

                // Apply filters
                if (!string.IsNullOrEmpty(searchTerm))
                {
                    invoiceSummaries = invoiceSummaries.Where(x =>
                        x.invoiceNo.Contains(searchTerm, StringComparison.OrdinalIgnoreCase) ||
                        x.customerName.Contains(searchTerm, StringComparison.OrdinalIgnoreCase) ||
                        x.orderNumber.Contains(searchTerm, StringComparison.OrdinalIgnoreCase)).ToList();
                }

                if (customerId.HasValue)
                {
                    // Filter by customer - we'd need to join with customer table
                    // For now, skip this filter
                }

                // Date range filter (simplified)
                var startDate = DateTime.Now.AddDays(-30);
                switch (dateRange.ToLower())
                {
                    case "Last 7 Days":
                        startDate = DateTime.Now.AddDays(-7);
                        break;
                    case "Last 30 Days":
                        startDate = DateTime.Now.AddDays(-30);
                        break;
                    case "This Month":
                        startDate = new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1);
                        break;
                    case "Last Month":
                        startDate = new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1).AddMonths(-1);
                        var endOfLastMonth = new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1).AddDays(-1);
                        invoiceSummaries = invoiceSummaries.Where(x =>
                            DateTime.Parse(x.invoiceDate) >= startDate &&
                            DateTime.Parse(x.invoiceDate) <= endOfLastMonth).ToList();
                        break;
                    case "All":
                    default:
                        startDate = DateTime.MinValue;
                        break;
                }

                if (startDate != DateTime.MinValue && dateRange.ToLower() != "last month")
                {
                    invoiceSummaries = invoiceSummaries.Where(x => DateTime.Parse(x.invoiceDate) >= startDate).ToList();
                }

                Console.WriteLine($"GetAllInvoices - Returning {invoiceSummaries.Count} filtered invoices");

                return Ok(new { result = invoiceSummaries });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetAllInvoices: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
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

                    if (invoice.PaymentDate.HasValue)
                        return BadRequest(new { error = "Customer invoice is already marked as paid." });

                    var paymentDate = request.PaymentDate ?? DateTime.Now;
                    var paymentAmount = request.PaymentAmount ?? invoice.TotalAmount;
                    if (paymentAmount <= 0)
                        return BadRequest(new { error = "Payment amount must be greater than 0." });

                    var bankId = request.BankId ?? invoice.Bankid;
                    var bankAccountId = ResolveBankGlAccountId(tenantId, bankId);
                    if (!bankAccountId.HasValue)
                    {
                        return BadRequest(new
                        {
                            error = "Unable to determine a bank GL account for this payment. Configure bank COA mapping first."
                        });
                    }

                    var accountsReceivableAccountId = ResolveAccountsReceivableGlAccountId(tenantId);
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

                    // Record the payment on the invoice.
                    invoice.PaymentMethod = request.PaymentMethod ?? "";
                    invoice.PaymentDate = paymentDate;
                    invoice.CheckNo = request.CheckNo ?? "";
                    invoice.Amount = paymentAmount;
                    invoice.Bankid = bankId;

                    var referenceNo = BuildAutoPaymentReference("ARPMT", invoice.PrefixInvoiceNo, invoice.Id);
                    var description = $"Auto-posted customer payment for invoice {invoice.PrefixInvoiceNo ?? invoice.InvoiceNo.ToString()}";
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

                    return Ok(new
                    {
                        result = new
                        {
                            message = "Customer payment recorded and posted to GL successfully",
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

        private int? ResolveAccountsReceivableGlAccountId(int tenantId)
        {
            return _context.ChartofAccounts
                .AsNoTracking()
                .Where(c => c.Tenantid == tenantId && c.IsActive)
                .OrderBy(c =>
                    c.AccountName != null && c.AccountName.ToLower().Contains("accounts receivable") ? 0 :
                    c.AccountType != null && c.AccountType.ToLower().Contains("receivable") ? 1 :
                    c.MainGroup != null && c.MainGroup.ToLower().Contains("receivable") ? 2 : 3)
                .ThenBy(c => c.AccountCode)
                .Where(c =>
                    (c.AccountName != null && c.AccountName.ToLower().Contains("receivable")) ||
                    (c.AccountType != null && c.AccountType.ToLower().Contains("receivable")) ||
                    (c.MainGroup != null && c.MainGroup.ToLower().Contains("receivable")))
                .Select(c => (int?)c.AccountID)
                .FirstOrDefault();
        }

        private int? ResolveRevenueGlAccountId(int tenantId)
        {
            return _context.ChartofAccounts
                .AsNoTracking()
                .Where(c => c.Tenantid == tenantId && c.IsActive)
                .OrderBy(c =>
                    c.AccountType != null && c.AccountType.ToLower().Contains("revenue") ? 0 :
                    c.AccountName != null && (c.AccountName.ToLower().Contains("revenue") || c.AccountName.ToLower().Contains("sales")) ? 1 :
                    c.MainGroup != null && (c.MainGroup.ToLower().Contains("revenue") || c.MainGroup.ToLower().Contains("sales")) ? 2 : 3)
                .ThenBy(c => c.AccountCode)
                .Where(c =>
                    (c.AccountType != null && c.AccountType.ToLower().Contains("revenue")) ||
                    (c.AccountName != null && (c.AccountName.ToLower().Contains("revenue") || c.AccountName.ToLower().Contains("sales"))) ||
                    (c.MainGroup != null && (c.MainGroup.ToLower().Contains("revenue") || c.MainGroup.ToLower().Contains("sales"))))
                .Select(c => (int?)c.AccountID)
                .FirstOrDefault();
        }

        private bool IsActiveAccountForTenant(int tenantId, int accountId)
        {
            return _context.ChartofAccounts
                .AsNoTracking()
                .Any(c => c.Tenantid == tenantId && c.AccountID == accountId && c.IsActive);
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

        private string GetInvoiceStatus(InvoiceMaster invoice)
        {
            // Simple status logic - could be expanded
            if (invoice.PaymentDate.HasValue)
                return "Paid";
            else if (DateTime.Now > invoice.DueDate)
                return "Overdue";
            else
                return "Sent";
        }
    }

    // DTOs
    public class CreateInvoiceRequest
    {
        public int OrderId { get; set; }
        public List<InvoiceLineItem> LineItems { get; set; } = new List<InvoiceLineItem>();
        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public string Notes { get; set; }
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
}
