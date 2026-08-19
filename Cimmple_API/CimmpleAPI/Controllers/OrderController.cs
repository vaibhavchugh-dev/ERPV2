using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using CimmpleAPI.Services;
using CimmpleAPI.Utilities;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class OrderController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly InventoryService _inventoryService;
        private readonly IConfiguration _configuration;

        public OrderController(CimmpleDbContext context, InventoryService inventoryService, IConfiguration configuration)
        {
            _context = context;
            _inventoryService = inventoryService;
            _configuration = configuration;
        }

        [HttpGet("GetOrders")]
        public IActionResult GetOrders([FromQuery] int tenantid, [FromQuery] int? locationId = null)
        {
            try
            {
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                // Shared multi-site: return all tenant orders unless an explicit location filter is passed.
                var ordersQuery = _context.CustomerOrder.AsNoTracking()
                    .Where(o => o.Tenantid == tenantid);
                if (filterLocationId.HasValue)
                {
                    ordersQuery = ordersQuery.Where(o => o.locationId == filterLocationId.Value);
                }

                // Project only list fields — avoid materializing large JSON columns on headers.
                var orders = ordersQuery
                    .OrderByDescending(o => o.OrderDate)
                    .Select(o => new
                    {
                        o.OrderID,
                        o.PONumber,
                        o.CustomerID,
                        o.customercode,
                        o.CustomerName,
                        o.OrderDate,
                        o.TotalAmount,
                        o.Status,
                        o.quotationId,
                        o.QuotationNo,
                        o.locationId
                    })
                    .ToList();

                if (!orders.Any())
                {
                    return Ok(new { result = new List<object>() });
                }

                var orderIds = orders.Select(o => o.OrderID).ToList();

                // Load only qty fields needed for status calculation
                var allDetails = _context.CustomerOrderDetails.AsNoTracking()
                    .Where(d => orderIds.Contains(d.OrderID) && d.Tenantid == tenantid)
                    .Select(d => new
                    {
                        d.ID,
                        d.OrderID,
                        d.QtyOrdered,
                        d.ShippedQty,
                        d.InvoicedQty
                    })
                    .ToList();

                // Get all order detail IDs
                var allOrderDetailIds = allDetails.Select(d => d.ID).ToList();

                // Get all shipping details in bulk
                var shippingDetailsDict = _context.ShippingDetails.AsNoTracking()
                    .Where(sd => sd.OrderDetailID.HasValue && allOrderDetailIds.Contains(sd.OrderDetailID.Value))
                    .Join(_context.Shipping.AsNoTracking(),
                        sd => sd.ShipmentId,
                        s => s.Id,
                        (sd, s) => new { sd.OrderDetailID, sd.ShippedQty, s.TenantId })
                    .Where(x => x.TenantId == tenantid)
                    .GroupBy(x => x.OrderDetailID!.Value)
                    .ToDictionary(g => g.Key, g => g.Sum(x => x.ShippedQty));

                // Get all invoice details in bulk
                var invoiceDetailsDict = _context.InvoiceDetail.AsNoTracking()
                    .Where(id => id.OrderDetailID.HasValue && allOrderDetailIds.Contains(id.OrderDetailID.Value))
                    .Join(_context.InvoiceMaster.AsNoTracking(),
                        id => id.InvoiceId,
                        im => im.Id,
                        (id, im) => new { id.OrderDetailID, id.QtyInvoiced, im.TenantId })
                    .Where(x => x.TenantId == tenantid)
                    .GroupBy(x => x.OrderDetailID!.Value)
                    .ToDictionary(g => g.Key, g => g.Sum(x => x.QtyInvoiced));

                // Group details by order ID
                var detailsByOrderId = allDetails.GroupBy(d => d.OrderID)
                    .ToDictionary(g => g.Key, g => g.ToList());

                // Calculate status for each order
                var ordersWithStatus = orders.Select(o =>
                {
                    detailsByOrderId.TryGetValue(o.OrderID, out var detailsList);
                    
                    var totalOrdered = detailsList?.Sum(d => d.QtyOrdered) ?? 0;
                    var totalShipped = detailsList?.Sum(d => shippingDetailsDict.ContainsKey(d.ID) ? shippingDetailsDict[d.ID] : d.ShippedQty) ?? 0;
                    var totalInvoiced = detailsList?.Sum(d => invoiceDetailsDict.ContainsKey(d.ID) ? invoiceDetailsDict[d.ID] : d.InvoicedQty) ?? 0;
                    
                    string calculatedStatus = o.Status ?? "Draft";
                    
                    // Determine status based on invoicing (highest priority)
                    if (totalInvoiced > 0)
                    {
                        if (totalInvoiced >= totalOrdered)
                        {
                            calculatedStatus = "Fully Invoiced";
                        }
                        else
                        {
                            calculatedStatus = "Partially Invoiced";
                        }
                    }
                    // If not invoiced, check shipping status
                    else if (totalShipped > 0)
                    {
                        if (totalShipped >= totalOrdered)
                        {
                            calculatedStatus = "Shipped";
                        }
                        else
                        {
                            calculatedStatus = "Partially Shipped";
                        }
                    }
                    // If shipped or invoiced, it's no longer Draft
                    else if (totalShipped > 0 || totalInvoiced > 0)
                    {
                        calculatedStatus = "In Progress";
                    }

                    return new
                    {
                        orderID = o.OrderID,
                        orderNumber = o.PONumber,
                        customerID = o.CustomerID,
                        customerCode = o.customercode ?? "",
                        customerName = o.CustomerName ?? "",
                        orderDate = o.OrderDate,
                        totalAmount = o.TotalAmount,
                        status = calculatedStatus,
                        quotationId = o.quotationId,
                        quotationNo = o.QuotationNo ?? "",
                        locationId = o.locationId
                    };
                }).ToList();

                return Ok(new { result = ordersWithStatus });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Returns line items from the customer's most recent customer order (for "Repeat last order").
        /// </summary>
        [HttpGet("GetLastOrderLinesByCustomer")]
        public IActionResult GetLastOrderLinesByCustomer([FromQuery] int tenantId, [FromQuery] int customerId)
        {
            try
            {
                if (customerId <= 0)
                {
                    return BadRequest(new { error = "Customer is required" });
                }

                var lastOrder = _context.CustomerOrder
                    .AsNoTracking()
                    .Where(o => o.Tenantid == tenantId && o.CustomerID == customerId)
                    .OrderByDescending(o => o.OrderDate)
                    .ThenByDescending(o => o.OrderID)
                    .Select(o => new
                    {
                        o.OrderID,
                        o.PONumber,
                        o.OrderDate
                    })
                    .FirstOrDefault();

                if (lastOrder == null)
                {
                    return Ok(new
                    {
                        result = new
                        {
                            found = false,
                            orderId = 0,
                            orderNumber = 0,
                            orderDate = "",
                            lines = Array.Empty<object>()
                        }
                    });
                }

                var lines = _context.CustomerOrderDetails
                    .AsNoTracking()
                    .Where(d => d.OrderID == lastOrder.OrderID && d.Tenantid == tenantId)
                    .OrderBy(d => d.ItemNo)
                    .Select(d => new
                    {
                        itemNo = d.ItemNo,
                        partNo = d.PartNo ?? "",
                        partName = d.partname ?? "",
                        unit = d.Unit ?? "EA",
                        qtyOrdered = d.QtyOrdered,
                        unitPrice = d.UnitPrice,
                        discount = d.Discount,
                        discountType = string.IsNullOrWhiteSpace(d.DiscountType) ? "Percent" : d.DiscountType,
                        productId = d.productid,
                        notes = d.notes ?? "",
                        leadTime = d.leadTime ?? "",
                        dueDate = d.DueDate
                    })
                    .ToList();

                return Ok(new
                {
                    result = new
                    {
                        found = true,
                        orderId = lastOrder.OrderID,
                        orderNumber = lastOrder.PONumber,
                        orderDate = lastOrder.OrderDate.ToString("MM/dd/yyyy"),
                        lines
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetOrderById")]
        public IActionResult GetOrderById([FromQuery] int orderId, [FromQuery] int tenantId)
        {
            try
            {
                var order = _context.CustomerOrder
                    .Where(o => o.OrderID == orderId && o.Tenantid == tenantId)
                    .FirstOrDefault();

                if (order == null)
                {
                    return NotFound(new { error = "Order not found" });
                }

                // Query details
                var detailsList = _context.CustomerOrderDetails
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .OrderBy(d => d.ItemNo)
                    .ToList();

                // Get all shipping details for this order to calculate accurate ShippedQty
                // Calculate from ShippingDetails to ensure accuracy even if stored value is out of sync
                var orderDetailIds = detailsList.Select(d => d.ID).ToList();
                var shippingDetails = _context.ShippingDetails
                    .Where(sd => sd.OrderDetailID.HasValue && orderDetailIds.Contains(sd.OrderDetailID.Value))
                    .Join(_context.Shipping,
                        sd => sd.ShipmentId,
                        s => s.Id,
                        (sd, s) => new { sd.OrderDetailID, sd.ShippedQty, s.TenantId })
                    .Where(x => x.TenantId == tenantId)
                    .GroupBy(x => x.OrderDetailID.Value)
                    .ToDictionary(g => g.Key, g => g.Sum(x => x.ShippedQty));

                // Get all invoice details for this order to calculate accurate InvoicedQty
                // Calculate from InvoiceDetail to ensure accuracy even if stored value is out of sync
                var invoiceDetails = _context.InvoiceDetail
                    .Where(id => id.OrderDetailID.HasValue && orderDetailIds.Contains(id.OrderDetailID.Value))
                    .Join(_context.InvoiceMaster,
                        id => id.InvoiceId,
                        im => im.Id,
                        (id, im) => new { id.OrderDetailID, id.QtyInvoiced, im.TenantId })
                    .Where(x => x.TenantId == tenantId)
                    .GroupBy(x => x.OrderDetailID.Value)
                    .ToDictionary(g => g.Key, g => g.Sum(x => x.QtyInvoiced));

                var details = detailsList.Select(d => new
                {
                    id = d.ID,
                    itemNo = d.ItemNo,
                    partName = d.partname ?? "",
                    partNo = d.PartNo ?? "",
                    dueDate = d.DueDate,
                    jobNumber = d.JobNumber ?? "",
                    jobDesc = d.JobDesc ?? "",
                    qtyOrdered = d.QtyOrdered,
                    unit = d.Unit ?? "",
                    unitPrice = d.UnitPrice,
                    jobPriority = d.JobPriority,
                    discount = d.Discount,
                    discountType = string.IsNullOrWhiteSpace(d.DiscountType) ? "Percent" : d.DiscountType,
                    productId = d.productid,
                    leadTime = d.leadTime ?? "",
                    notes = d.notes ?? "",
                    shippedQty = shippingDetails.ContainsKey(d.ID) ? shippingDetails[d.ID] : d.ShippedQty,
                    shippingStatus = d.ShippingStatus ?? "Not Started",
                    invoicedQty = invoiceDetails.ContainsKey(d.ID) ? invoiceDetails[d.ID] : d.InvoicedQty,
                    invoiceStatus = d.InvoiceStatus ?? "Not Invoiced"
                }).ToList();

                // Load attachments from JSON
                List<OrderAttachmentDto> attachments = null;
                try
                {
                    if (!string.IsNullOrEmpty(order.AttachmentsJson))
                    {
                        var options = new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            PropertyNameCaseInsensitive = true
                        };
                        attachments = JsonSerializer.Deserialize<List<OrderAttachmentDto>>(order.AttachmentsJson, options);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error deserializing attachments: {ex.Message}");
                    attachments = null;
                }

                // Load comments from JSON
                List<OrderCommentDto> comments = null;
                try
                {
                    if (!string.IsNullOrEmpty(order.CommentsJson))
                    {
                        var options = new JsonSerializerOptions
                        {
                            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                            PropertyNameCaseInsensitive = true
                        };
                        comments = JsonSerializer.Deserialize<List<OrderCommentDto>>(order.CommentsJson, options);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error deserializing comments: {ex.Message}");
                    comments = null;
                }

                // Calculate order status dynamically based on invoice and shipping data
                var totalOrdered = detailsList.Sum(d => d.QtyOrdered);
                var totalShipped = detailsList.Sum(d => shippingDetails.ContainsKey(d.ID) ? shippingDetails[d.ID] : d.ShippedQty);
                var totalInvoiced = detailsList.Sum(d => invoiceDetails.ContainsKey(d.ID) ? invoiceDetails[d.ID] : d.InvoicedQty);
                
                string calculatedStatus = order.Status ?? "Draft";
                
                // Determine status based on invoicing (highest priority)
                if (totalInvoiced > 0)
                {
                    if (totalInvoiced >= totalOrdered)
                    {
                        calculatedStatus = "Fully Invoiced";
                    }
                    else
                    {
                        calculatedStatus = "Partially Invoiced";
                    }
                }
                // If not invoiced, check shipping status
                else if (totalShipped > 0)
                {
                    if (totalShipped >= totalOrdered)
                    {
                        calculatedStatus = "Shipped";
                    }
                    else
                    {
                        calculatedStatus = "Partially Shipped";
                    }
                }
                // If shipped or invoiced, it's no longer Draft
                else if (totalShipped > 0 || totalInvoiced > 0)
                {
                    calculatedStatus = "In Progress";
                }

                var result = new
                {
                    orderID = order.OrderID,
                    customerID = order.CustomerID,
                    customerCode = order.customercode ?? "",
                    poNumber = order.PONumber,
                    customerName = order.CustomerName ?? "",
                    address = order.address ?? "",
                    customerPoNumber = order.CustomerPoNumber ?? "",
                    orderDate = order.OrderDate,
                    totalAmount = order.TotalAmount,
                    userId = order.UserId,
                    userToken = order.UserToken,
                    status = calculatedStatus,
                    tenantid = order.Tenantid,
                    shippingInstructions = order.shippingInstructions ?? "",
                    externalCustomerPO = order.ExternalCustomerPO ?? "",
                    externalOrderDate = order.ExternalOrderDate,
                    buyerName = order.BuyerName ?? "",
                    quotationId = order.quotationId,
                    quotationNo = order.QuotationNo ?? "",
                    locationId = order.locationId,
                    details = details,
                    attachments = attachments != null ? attachments.Select(a => new
                    {
                        id = a.Id,
                        name = a.Name,
                        size = a.Size,
                        fileUrl = a.FileUrl
                    }).ToList() : null,
                    comments = comments != null ? comments.Select(c => new
                    {
                        id = c.Id,
                        text = c.Text,
                        createdAt = c.CreatedAt,
                        createdBy = c.CreatedBy
                    }).ToList() : null
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveOrder")]
        public IActionResult SaveOrder([FromBody] OrderReq request)
        {
            try
            {
                if (request == null)
                {
                    var errors = ModelState
                        .Where(x => x.Value.Errors.Count > 0)
                        .Select(x => new { Field = x.Key, Errors = x.Value.Errors.Select(e => e.ErrorMessage) })
                        .ToList();
                    
                    Console.WriteLine($"Request is null. Model state errors: {System.Text.Json.JsonSerializer.Serialize(errors)}");
                    return BadRequest(new { error = "Request is null", modelErrors = errors });
                }

                Console.WriteLine($"Received SaveOrder request - OrderID: {request.OrderID}, CustomerID: {request.CustomerID}, Tenantid: {request.Tenantid}");

                // Validate required fields
                if (request.CustomerID <= 0)
                {
                    return BadRequest(new { error = "Customer is required" });
                }

                if (request.Details == null)
                {
                    return BadRequest(new { error = "Details cannot be null" });
                }

                CustomerOrder order;

                if (request.OrderID > 0)
                {
                    // Update existing order
                    order = _context.CustomerOrder
                        .FirstOrDefault(o => o.OrderID == request.OrderID && o.Tenantid == request.Tenantid);

                    if (order == null)
                    {
                        return NotFound(new { error = "Order not found" });
                    }
                }
                else
                {
                    // Get next PO Number - simple increment from existing max
                    var existingOrders = _context.CustomerOrder
                        .Where(o => o.Tenantid == request.Tenantid)
                        .ToList();

                    int nextPONumber;
                    if (existingOrders.Any())
                    {
                        var maxPONumber = existingOrders.Max(o => o.PONumber);
                        nextPONumber = Math.Max(1000, maxPONumber + 1);
                        Console.WriteLine($"Found {existingOrders.Count} existing orders. Max PONumber: {maxPONumber}, Next: {nextPONumber}");
                    }
                    else
                    {
                        nextPONumber = 1000;
                        Console.WriteLine("No existing orders found. Starting from 1000");
                    }

                    Console.WriteLine($"Assigning PONumber: {nextPONumber} to new order");

                    // Create new order with the calculated PONumber
                    order = new CustomerOrder
                    {
                        Tenantid = request.Tenantid,
                        OrderDate = request.OrderDate.Date,
                        UserId = request.UserId,
                        UserToken = request.UserToken,
                        PONumber = nextPONumber
                    };
                    _context.CustomerOrder.Add(order);
                }

                // Update fields
                order.OrderDate = request.OrderDate.Date;
                order.CustomerID = request.CustomerID;
                order.customercode = request.CustomerCode ?? "";
                order.CustomerName = request.CustomerName ?? "";
                order.address = request.Address ?? "";
                order.CustomerPoNumber = request.CustomerPoNumber ?? "";
                order.TotalAmount = request.TotalAmount;
                order.Status = request.Status ?? "Draft";
                order.shippingInstructions = request.ShippingInstructions ?? "";
                order.ExternalCustomerPO = request.ExternalCustomerPO ?? "";
                order.ExternalOrderDate = request.ExternalOrderDate;
                order.BuyerName = request.BuyerName ?? "";
                order.quotationId = request.QuotationId;
                order.QuotationNo = request.QuotationNo ?? "";
                if (!TryResolveLocationId(request.LocationId, out var resolvedLocationId, out var forbidLoc))
                    return forbidLoc!;
                order.locationId = resolvedLocationId;

                // Save attachments as JSON
                if (request.Attachments != null && request.Attachments.Count > 0)
                {
                    var attachmentOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        PropertyNameCaseInsensitive = true,
                        WriteIndented = false
                    };
                    order.AttachmentsJson = JsonSerializer.Serialize(request.Attachments, attachmentOptions);
                    Console.WriteLine($"Saved attachments JSON: {order.AttachmentsJson}");
                }
                else
                {
                    order.AttachmentsJson = null;
                }

                // Save comments as JSON
                if (request.Comments != null && request.Comments.Count > 0)
                {
                    var commentOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        WriteIndented = false
                    };
                    order.CommentsJson = JsonSerializer.Serialize(request.Comments, commentOptions);
                }
                else
                {
                    order.CommentsJson = null;
                }

                _context.SaveChanges();

                // If this order was created from a quotation, update the quotation
                if (request.QuotationId.HasValue && request.QuotationId.Value > 0)
                {
                    var quotation = _context.QuotationOrder
                        .FirstOrDefault(q => q.OrderID == request.QuotationId.Value && q.Tenantid == request.Tenantid);
                    if (quotation != null)
                    {
                        quotation.isConverted = 1;
                        quotation.convertedOrderId = order.OrderID; // Store the order ID
                        quotation.Status = "Converted";
                        _context.SaveChanges();
                    }
                }

                // Handle order details
                if (request.Details != null && request.Details.Count > 0)
                {
                    // Get existing details
                    var existingDetails = _context.CustomerOrderDetails
                        .Where(d => d.OrderID == order.OrderID && d.Tenantid == request.Tenantid)
                        .ToList();

                    // Get IDs of existing details that will be deleted
                    var existingDetailIds = existingDetails.Select(d => d.ID).ToList();
                    var newDetailIds = request.Details.Where(d => d.ID > 0).Select(d => d.ID).ToList();
                    var detailsToDelete = existingDetailIds.Except(newDetailIds).ToList();

                    // Before deleting order details, delete associated shipping details
                    if (detailsToDelete.Any())
                    {
                        var shippingDetailsToDelete = _context.ShippingDetails
                            .Where(sd => sd.OrderDetailID.HasValue && detailsToDelete.Contains(sd.OrderDetailID.Value))
                            .ToList();
                        
                        if (shippingDetailsToDelete.Any())
                        {
                            _context.ShippingDetails.RemoveRange(shippingDetailsToDelete);
                            _context.SaveChanges();
                        }
                    }

                    // Delete existing details that are not in the new list
                    var detailsToRemove = existingDetails.Where(d => detailsToDelete.Contains(d.ID)).ToList();
                    if (detailsToRemove.Any())
                    {
                        _context.CustomerOrderDetails.RemoveRange(detailsToRemove);
                    }

                    // Update or add details
                    var updatedDetailIds = request.Details.Where(d => d.ID > 0).Select(d => d.ID).ToList();
                    var linkedJobOrders = updatedDetailIds.Count > 0
                        ? _context.JobOrderMaster
                            .Where(j => j.Tenantid == request.Tenantid && updatedDetailIds.Contains(j.CustomerOrderDetailID))
                            .ToList()
                        : new List<JobOrderMaster>();
                    var jobOrdersByDetailId = linkedJobOrders
                        .GroupBy(j => j.CustomerOrderDetailID)
                        .ToDictionary(g => g.Key, g => g.ToList());

                    foreach (var detail in request.Details)
                    {
                        if (detail.ID > 0 && existingDetails.Any(d => d.ID == detail.ID))
                        {
                            // Update existing detail
                            var existingDetail = existingDetails.First(d => d.ID == detail.ID);
                            existingDetail.ItemNo = detail.ItemNo;
                            existingDetail.partname = detail.PartName ?? "";
                            existingDetail.PartNo = detail.PartNo ?? "";
                            existingDetail.DueDate = detail.DueDate.Date;
                            existingDetail.JobNumber = detail.JobNumber ?? "";
                            existingDetail.JobDesc = detail.JobDesc ?? "";
                            existingDetail.QtyOrdered = detail.QtyOrdered;
                            existingDetail.Unit = detail.Unit ?? "";
                            existingDetail.UnitPrice = detail.UnitPrice;
                            existingDetail.JobPriority = detail.JobPriority;
                            existingDetail.Discount = detail.Discount;
                            existingDetail.DiscountType = string.IsNullOrWhiteSpace(detail.DiscountType) ? "Percent" : detail.DiscountType;
                            existingDetail.productid = detail.ProductId;
                            existingDetail.leadTime = detail.LeadTime ?? "";
                            existingDetail.notes = detail.Notes ?? "";
                            existingDetail.ShippedQty = detail.ShippedQty;
                            existingDetail.ShippingStatus = detail.ShippingStatus ?? "Not Started";

                            // Keep linked Job Orders in sync (listing/detail read JO's own QtyOrdered snapshot).
                            if (jobOrdersByDetailId.TryGetValue(existingDetail.ID, out var jobsForDetail))
                            {
                                foreach (var jobOrder in jobsForDetail)
                                {
                                    jobOrder.QtyOrdered = detail.QtyOrdered;
                                    jobOrder.Unit = detail.Unit ?? "";
                                    jobOrder.UnitPrice = detail.UnitPrice;
                                    jobOrder.DueDate = detail.DueDate.Date;
                                    jobOrder.PartNo = detail.PartNo ?? "";
                                    jobOrder.PartName = detail.PartName ?? "";
                                    jobOrder.JobNumber = detail.JobNumber ?? "";
                                    jobOrder.JobDesc = detail.JobDesc ?? "";
                                    jobOrder.JobPriority = detail.JobPriority;
                                    jobOrder.ModifiedDate = DateTime.Now;
                                }
                            }
                        }
                        else
                        {
                            // Add new detail
                            var orderDetail = new CustomerOrderDetails
                            {
                                OrderID = order.OrderID,
                                ItemNo = detail.ItemNo,
                                partname = detail.PartName ?? "",
                                PartNo = detail.PartNo ?? "",
                                DueDate = detail.DueDate.Date,
                                JobNumber = detail.JobNumber ?? "",
                                JobDesc = detail.JobDesc ?? "",
                                QtyOrdered = detail.QtyOrdered,
                                Unit = detail.Unit ?? "",
                                UnitPrice = detail.UnitPrice,
                                JobPriority = detail.JobPriority,
                                Discount = detail.Discount,
                                DiscountType = string.IsNullOrWhiteSpace(detail.DiscountType) ? "Percent" : detail.DiscountType,
                                Tenantid = request.Tenantid,
                                productid = detail.ProductId,
                                leadTime = detail.LeadTime ?? "",
                                notes = detail.Notes ?? "",
                                ShippedQty = detail.ShippedQty,
                                ShippingStatus = detail.ShippingStatus ?? "Not Started"
                            };
                            _context.CustomerOrderDetails.Add(orderDetail);
                        }
                    }

                    _context.SaveChanges();
                }

                return Ok(new { result = new { id = order.OrderID, poNumber = order.PONumber, message = "Order saved successfully" } });
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("CheckOrderDeletionImpact")]
        public IActionResult CheckOrderDeletionImpact([FromQuery] int orderId, [FromQuery] int tenantId)
        {
            try
            {
                var order = _context.CustomerOrder
                    .FirstOrDefault(o => o.OrderID == orderId && o.Tenantid == tenantId);

                if (order == null)
                {
                    return NotFound(new { error = "Order not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check for invoices
                var invoiceDetails = _context.InvoiceDetail
                    .Where(id => id.OrderId == orderId)
                    .ToList();
                
                if (invoiceDetails.Any())
                {
                    var invoiceIds = invoiceDetails.Select(id => id.InvoiceId).Distinct().ToList();
                    var invoices = _context.InvoiceMaster
                        .Where(im => invoiceIds.Contains(im.Id) && im.TenantId == tenantId)
                        .ToList();
                    
                    var invoiceDependency = new BlockingDependency
                    {
                        EntityType = "Invoice",
                        Description = $"Order has {invoices.Count} invoice(s) associated",
                        Items = invoices.Select(im => new DependencyItem
                        {
                            Id = im.Id,
                            Name = im.PrefixInvoiceNo ?? im.InvoiceNo.ToString(),
                            DeleteEndpoint = $"/Invoice/DeleteInvoice?invoiceId={im.Id}&tenantId={tenantId}"
                        }).ToList()
                    };
                    
                    impact.BlockingDependencies.Add(invoiceDependency);
                    impact.BlockingReasons.Add(
                        $"Order has {invoices.Count} invoice(s) associated: {string.Join(", ", invoices.Select(im => im.PrefixInvoiceNo ?? im.InvoiceNo.ToString()))}. Delete invoices first."
                    );
                    impact.CanDelete = false;
                }

                // Check for shipments
                var shipments = _context.Shipping
                    .Where(s => s.OrderId == orderId && s.TenantId == tenantId)
                    .ToList();
                
                if (shipments.Any())
                {
                    var shipmentDependency = new BlockingDependency
                    {
                        EntityType = "Shipment",
                        Description = $"Order has {shipments.Count} shipment(s) associated",
                        Items = shipments.Select(s => new DependencyItem
                        {
                            Id = s.Id,
                            Name = s.ShipmentNo ?? $"Shipment #{s.Id}",
                            DeleteEndpoint = $"/Shipping/DeleteShipment?shipmentId={s.Id}&tenantId={tenantId}"
                        }).ToList()
                    };
                    
                    impact.BlockingDependencies.Add(shipmentDependency);
                    impact.BlockingReasons.Add(
                        $"Order has {shipments.Count} shipment(s) associated: {string.Join(", ", shipments.Select(s => s.ShipmentNo ?? $"Shipment #{s.Id}"))}. Delete shipments first."
                    );
                    impact.CanDelete = false;
                }

                // Check for job orders
                var jobOrders = _context.JobOrderMaster
                    .Where(jo => jo.CustomerOrderID == orderId && jo.Tenantid == tenantId)
                    .ToList();
                
                if (jobOrders.Any())
                {
                    var jobOrderDependency = new BlockingDependency
                    {
                        EntityType = "JobOrder",
                        Description = $"Order has {jobOrders.Count} job order(s) associated",
                        Items = jobOrders.Select(jo => new DependencyItem
                        {
                            Id = jo.JobOrderID,
                            Name = $"JO#{jo.JobOrderNumber}",
                            DeleteEndpoint = $"/JobOrder/DeleteJobOrder?jobOrderId={jo.JobOrderID}&tenantId={tenantId}"
                        }).ToList()
                    };
                    
                    impact.BlockingDependencies.Add(jobOrderDependency);
                    impact.BlockingReasons.Add(
                        $"Order has {jobOrders.Count} job order(s) associated: {string.Join(", ", jobOrders.Select(jo => $"JO#{jo.JobOrderNumber}"))}. Delete job orders first."
                    );
                    impact.CanDelete = false;
                }

                // If can delete, list what will be deleted
                if (impact.CanDelete)
                {
                    var detailCount = _context.CustomerOrderDetails
                        .Count(d => d.OrderID == orderId && d.Tenantid == tenantId);
                    if (detailCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Order Details",
                            Count = detailCount,
                            Description = $"{detailCount} line item(s) will be deleted"
                        });
                    }

                    var attachmentCount = _context.OrderAttachment
                        .Count(a => a.orderid == orderId && a.TenantID == tenantId);
                    if (attachmentCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Attachments",
                            Count = attachmentCount,
                            Description = $"{attachmentCount} attachment(s) will be deleted"
                        });
                    }

                    // Check if order references a quotation
                    if (order.quotationId.HasValue)
                    {
                        impact.WillBeAffected.Add(new ImpactedEntity
                        {
                            EntityType = "Quotation Reference",
                            Count = 1,
                            Description = "The quotation reference will be cleared from this order"
                        });
                    }

                    impact.Warnings.Add("This action cannot be undone");
                }

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteOrder")]
        public IActionResult DeleteOrder([FromQuery] int orderId, [FromQuery] int tenantId)
        {
            try
            {
                var order = _context.CustomerOrder
                    .FirstOrDefault(o => o.OrderID == orderId && o.Tenantid == tenantId);

                if (order == null)
                {
                    return NotFound(new { error = "Order not found" });
                }

                // Delete associated attachments first
                var attachments = _context.OrderAttachment
                    .Where(a => a.orderid == orderId && a.TenantID == tenantId)
                    .ToList();
                if (attachments.Any())
                {
                    _context.OrderAttachment.RemoveRange(attachments);
                }

                // Delete associated details
                var details = _context.CustomerOrderDetails
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .ToList();
                _context.CustomerOrderDetails.RemoveRange(details);

                // Clear converted-order reference on source quotation (if any)
                var linkedQuotations = _context.QuotationOrder
                    .Where(q => q.Tenantid == tenantId &&
                        (q.convertedOrderId == orderId ||
                         (order.quotationId.HasValue && q.OrderID == order.quotationId.Value)))
                    .ToList();
                foreach (var quotation in linkedQuotations)
                {
                    quotation.convertedOrderId = null;
                    quotation.isConverted = 0;
                    quotation.Status = "Draft";
                }

                // Delete the order
                _context.CustomerOrder.Remove(order);
                _context.SaveChanges();

                return Ok(new { result = new { message = "Order deleted successfully" } });
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("DuplicateOrder")]
        public async Task<IActionResult> DuplicateOrder([FromQuery] int orderId, [FromQuery] int tenantId)
        {
            try
            {
                var source = _context.CustomerOrder
                    .FirstOrDefault(o => o.OrderID == orderId && o.Tenantid == tenantId);
                if (source == null)
                {
                    return NotFound(new { error = "Order not found" });
                }

                var sourceDetails = _context.CustomerOrderDetails
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .OrderBy(d => d.ItemNo)
                    .ToList();

                var existingOrders = _context.CustomerOrder.Where(o => o.Tenantid == tenantId).ToList();
                int nextPONumber = existingOrders.Any()
                    ? Math.Max(1000, existingOrders.Max(o => o.PONumber) + 1)
                    : 1000;

                var duplicate = new CustomerOrder
                {
                    Tenantid = source.Tenantid,
                    CustomerID = source.CustomerID,
                    customercode = source.customercode ?? "",
                    CustomerName = source.CustomerName ?? "",
                    address = source.address ?? "",
                    CustomerPoNumber = source.CustomerPoNumber ?? "",
                    OrderDate = DateTime.Now.Date,
                    TotalAmount = source.TotalAmount,
                    UserId = source.UserId,
                    UserToken = source.UserToken,
                    Status = "Draft",
                    shippingInstructions = source.shippingInstructions ?? "",
                    ExternalCustomerPO = source.ExternalCustomerPO ?? "",
                    ExternalOrderDate = source.ExternalOrderDate,
                    BuyerName = source.BuyerName ?? "",
                    quotationId = null,
                    QuotationNo = "",
                    locationId = source.locationId,
                    CommentsJson = null,
                    AttachmentsJson = null,
                    PONumber = nextPONumber
                };
                _context.CustomerOrder.Add(duplicate);
                _context.SaveChanges();

                foreach (var detail in sourceDetails)
                {
                    _context.CustomerOrderDetails.Add(new CustomerOrderDetails
                    {
                        OrderID = duplicate.OrderID,
                        ItemNo = detail.ItemNo,
                        partname = detail.partname ?? "",
                        PartNo = detail.PartNo ?? "",
                        DueDate = detail.DueDate,
                        JobNumber = detail.JobNumber ?? "",
                        JobDesc = detail.JobDesc ?? "",
                        QtyOrdered = detail.QtyOrdered,
                        Unit = detail.Unit ?? "",
                        UnitPrice = detail.UnitPrice,
                        JobPriority = detail.JobPriority,
                        Discount = detail.Discount,
                        DiscountType = detail.DiscountType,
                        Tenantid = tenantId,
                        productid = detail.productid,
                        leadTime = detail.leadTime ?? "",
                        notes = detail.notes ?? "",
                        ShippedQty = 0,
                        ShippingStatus = "Not Started",
                        InvoicedQty = 0,
                        InvoiceStatus = "Not Invoiced"
                    });
                }
                _context.SaveChanges();

                var sourceAttachments = _context.OrderAttachment
                    .Where(a => a.orderid == orderId && a.TenantID == tenantId)
                    .OrderBy(a => a.Id)
                    .ToList();

                // Fallback: metadata-only attachments in JSON (may point at Orders folder blobs)
                if (sourceAttachments.Count == 0 && !string.IsNullOrEmpty(source.AttachmentsJson))
                {
                    try
                    {
                        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                        var jsonAtts = JsonSerializer.Deserialize<List<OrderAttachmentDto>>(source.AttachmentsJson, options)
                                       ?? new List<OrderAttachmentDto>();
                        foreach (var ja in jsonAtts)
                        {
                            if (string.IsNullOrEmpty(ja.FileUrl))
                            {
                                continue;
                            }
                            sourceAttachments.Add(new OrderAttachment
                            {
                                Name = ja.Name,
                                size = ja.Size,
                                UploadFile = ja.FileUrl,
                                FileUniqueno = 0,
                                Pageno = "0",
                                createdby = 0
                            });
                        }
                    }
                    catch { /* ignore */ }
                }

                int createdBy = GetUserId() ?? source.UserId;
                var copiedDtos = new List<object>();
                foreach (var srcAtt in sourceAttachments)
                {
                    if (string.IsNullOrEmpty(srcAtt.UploadFile))
                    {
                        continue;
                    }

                    int nextFileUniqueNo = _context.OrderAttachment.Any()
                        ? _context.OrderAttachment.Max(x => x.FileUniqueno) + 1
                        : 1;
                    var ext = Path.GetExtension(srcAtt.UploadFile) ?? "";
                    var blobName = $"{nextFileUniqueNo}{ext}";

                    var sourceInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId, ModuleFileStorage.OrdersFolder, srcAtt.UploadFile, createdBy);
                    var destInfo = ModuleFileStorage.CreateFileInfo(
                        tenantId, ModuleFileStorage.OrdersFolder, blobName, createdBy);

                    var copied = await ModuleFileStorage.CopyBlobAsync(_context, _configuration, sourceInfo, destInfo);
                    if (!copied)
                    {
                        // Try Quotations folder in case metadata still pointed at a CQ blob
                        sourceInfo = ModuleFileStorage.CreateFileInfo(
                            tenantId, ModuleFileStorage.QuotationsFolder, srcAtt.UploadFile, createdBy);
                        copied = await ModuleFileStorage.CopyBlobAsync(_context, _configuration, sourceInfo, destInfo);
                    }
                    if (!copied)
                    {
                        continue;
                    }

                    var orderAtt = new OrderAttachment
                    {
                        orderid = duplicate.OrderID,
                        Name = srcAtt.Name,
                        size = srcAtt.size,
                        FileUniqueno = nextFileUniqueNo,
                        UploadFile = blobName,
                        TenantID = tenantId,
                        FileCode = "",
                        Pageno = srcAtt.Pageno ?? "0",
                        createdby = createdBy
                    };
                    _context.OrderAttachment.Add(orderAtt);
                    _context.SaveChanges();
                    copiedDtos.Add(new
                    {
                        id = orderAtt.Id,
                        name = orderAtt.Name,
                        size = orderAtt.size,
                        fileUrl = orderAtt.UploadFile,
                        uploadFile = orderAtt.UploadFile
                    });
                }

                if (copiedDtos.Count > 0)
                {
                    var attachmentOptions = new JsonSerializerOptions
                    {
                        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                        WriteIndented = false
                    };
                    duplicate.AttachmentsJson = JsonSerializer.Serialize(copiedDtos, attachmentOptions);
                    _context.SaveChanges();
                }

                return Ok(new { result = new { id = duplicate.OrderID, message = "Order duplicated successfully" } });
            }
            catch (Exception ex)
            {
                var errorMessage = ex.Message;
                if (ex.InnerException != null)
                {
                    errorMessage += " | Inner Exception: " + ex.InnerException.Message;
                }
                return StatusCode(500, new { error = errorMessage, stackTrace = ex.StackTrace });
            }
        }

        // =============================================
        // VENDOR ORDER ENDPOINTS
        // =============================================

        [HttpGet("GetVendorOrders")]
        public async Task<IActionResult> GetVendorOrders([FromQuery] int tenantId, [FromQuery] int? locationId = null)
        {
            try
            {
                if (!TryResolveListLocationFilter(locationId, out var filterLocationId, out var forbid))
                    return forbid!;

                var vendorOrdersQuery = _context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.Tenantid == tenantId);

                if (filterLocationId.HasValue)
                {
                    vendorOrdersQuery = vendorOrdersQuery.Where(o => o.LocationId == filterLocationId.Value);
                }

                var vendorOrders = await vendorOrdersQuery
                    .OrderByDescending(o => o.OrderDate)
                    .Select(o => new
                    {
                        orderID = o.OrderID,
                        orderNumber = o.PONumber,
                        vendorID = o.VendorID,
                        vendorCode = o.VendorCode ?? "",
                        vendorName = o.VendorName ?? "",
                        orderDate = o.OrderDate,
                        totalAmount = o.TotalAmount,
                        status = o.Status ?? "Draft",
                        quotationId = o.QuotationId,
                        quotationNo = o.QuotationNo ?? "",
                        locationId = o.LocationId,
                        materialType = o.MaterialType ?? "Material",
                        vendorPoNumber = o.VendorPoNumber ?? "",
                        externalVendorPO = o.ExternalVendorPO ?? "",
                        externalOrderDate = o.ExternalOrderDate,
                        buyerName = o.BuyerName ?? "",
                        vendorRefNo = o.VendorRefNo ?? ""
                    })
                    .ToListAsync();

                // Get all order details for status recalculation
                var orderIds = vendorOrders.Select(o => o.orderID).ToList();
                var allDetails = await _context.VendorOrderDetails
                    .AsNoTracking()
                    .Where(d => orderIds.Contains(d.OrderID) && d.Tenantid == tenantId)
                    .ToListAsync();

                // Calculate receiving statistics for each order detail
                var receivingStats = await _context.VendorReceiving
                    .AsNoTracking()
                    .Where(r => orderIds.Contains(r.VendorOrderDetail.OrderID) && r.Tenantid == tenantId)
                    .GroupBy(r => r.VendorOrderDetailID)
                    .Select(g => new
                    {
                        detailID = g.Key,
                        totalReceivedQty = g.Sum(r => r.ReceivedQty)
                    })
                    .ToDictionaryAsync(x => x.detailID, x => x.totalReceivedQty);

                // Recalculate status for each order
                var ordersWithRecalculatedStatus = vendorOrders.Select(o =>
                {
                    var orderDetails = allDetails.Where(d => d.OrderID == o.orderID).ToList();
                    var materialType = DeriveVendorOrderMaterialType(orderDetails, o.materialType);

                    // Only recalculate status for orders that could be received (Sent, Partially Received, Fully Received)
                    if (o.status == "Sent" || o.status == "Partially Received" || o.status == "Fully Received")
                    {
                        bool allComplete = true;
                        bool anyReceived = false;
                        foreach (var detail in orderDetails)
                        {
                            var detailReceived = receivingStats.ContainsKey(detail.ID) ? receivingStats[detail.ID] : 0;
                            if (detailReceived > 0) anyReceived = true;
                            if (detailReceived < detail.QtyOrdered) allComplete = false;
                        }

                        string recalculatedStatus = o.status;
                        if (allComplete && anyReceived)
                        {
                            recalculatedStatus = "Fully Received";
                        }
                        else if (anyReceived)
                        {
                            recalculatedStatus = "Partially Received";
                        }
                        else
                        {
                            recalculatedStatus = "Sent";
                        }

                        return new
                        {
                            o.orderID,
                            o.orderNumber,
                            o.vendorID,
                            o.vendorCode,
                            o.vendorName,
                            o.orderDate,
                            o.totalAmount,
                            status = recalculatedStatus, // Use recalculated status
                            o.quotationId,
                            o.quotationNo,
                            o.locationId,
                            materialType,
                            o.vendorPoNumber,
                            o.externalVendorPO,
                            o.externalOrderDate,
                            o.buyerName,
                            o.vendorRefNo
                        };
                    }
                    else
                    {
                        // Return original data for other statuses
                        return new
                        {
                            o.orderID,
                            o.orderNumber,
                            o.vendorID,
                            o.vendorCode,
                            o.vendorName,
                            o.orderDate,
                            o.totalAmount,
                            o.status,
                            o.quotationId,
                            o.quotationNo,
                            o.locationId,
                            materialType,
                            o.vendorPoNumber,
                            o.externalVendorPO,
                            o.externalOrderDate,
                            o.buyerName,
                            o.vendorRefNo
                        };
                    }
                }).ToList();

                // Debug logging for quotation information
                var ordersWithQuotations = ordersWithRecalculatedStatus.Where(o => o.quotationId.HasValue && !string.IsNullOrEmpty(o.quotationNo)).ToList();
                if (ordersWithQuotations.Any())
                {
                    Console.WriteLine($"GetVendorOrders: Found {ordersWithQuotations.Count} orders with quotation info:");
                    foreach (var order in ordersWithQuotations)
                    {
                        Console.WriteLine($"  Order {order.orderID} (PO {order.orderNumber}): QuotationId={order.quotationId}, QuotationNo='{order.quotationNo}'");
                    }
                }
                else
                {
                    Console.WriteLine("GetVendorOrders: No orders found with quotation information");
                }

                return Ok(new { result = ordersWithRecalculatedStatus });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetVendorOrders: EXCEPTION - {ex.Message}");
                Console.WriteLine($"GetVendorOrders: Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"GetVendorOrders: Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetVendorOrderById")]
        public async Task<IActionResult> GetVendorOrderById(int orderId, int tenantId)
        {
            try
            {
                var order = await _context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.OrderID == orderId && o.Tenantid == tenantId)
                    .FirstOrDefaultAsync();

                if (order == null)
                    return NotFound(new { error = "Vendor order not found" });

                // Get details separately to avoid circular references
                // Use raw SQL to handle both DueDateString and DueDate columns safely
                var detailsList = await _context.VendorOrderDetails
                    .AsNoTracking()
                    .Where(d => d.OrderID == orderId)
                    .OrderBy(d => d.ItemNo)
                    .ToListAsync();

                var details = detailsList.Select(d => new
                {
                    id = d.ID,
                    itemNo = d.ItemNo,
                    partName = d.PartName ?? "",
                    partNo = d.PartNo ?? "",
                    lineType = NormalizeVendorOrderLineType(d.LineType, order.MaterialType),
                    dueDate = !string.IsNullOrEmpty(d.DueDate) ? d.DueDate : d.DueDateDateTime.ToString("yyyy-MM-dd"), // Use string if available, otherwise convert DateTime
                    jobNumber = d.JobNumber ?? "",
                    jobDesc = d.JobDesc ?? "",
                    qtyOrdered = d.QtyOrdered,
                    unit = d.Unit ?? "",
                    unitPrice = d.UnitPrice,
                    jobPriority = d.JobPriority,
                    discount = d.Discount,
                    discountType = string.IsNullOrWhiteSpace(d.DiscountType) ? "Percent" : d.DiscountType,
                    productId = d.ProductId,
                    rawMaterialId = d.RawMaterialId,
                    leadTime = d.LeadTime ?? "",
                    notes = d.Notes ?? "",
                    shippedQty = d.ShippedQty,
                    shippingStatus = d.ShippingStatus ?? "",
                    invoicedQty = d.InvoicedQty,
                    invoiceStatus = d.InvoiceStatus ?? "",
                    glcode = d.glcode ?? ""
                }).ToList();

                // Get attachments
                var attachments = await _context.VendorOrderAttachments
                    .AsNoTracking()
                    .Where(a => a.OrderID == orderId)
                    .Select(a => new
                    {
                        id = a.Id,
                        name = a.Name ?? "",
                        size = a.Size,
                        fileUrl = a.FileUrl ?? ""
                    })
                    .ToListAsync();

                // Get comments
                var comments = await _context.VendorOrderComments
                    .AsNoTracking()
                    .Where(c => c.OrderID == orderId)
                    .Select(c => new
                    {
                        id = c.Id,
                        text = c.Text ?? "",
                        createdAt = c.CreatedAt,
                        createdBy = c.CreatedBy ?? ""
                    })
                    .ToListAsync();

                var result = new
                {
                    orderID = order.OrderID,
                    vendorID = order.VendorID,
                    vendorCode = order.VendorCode ?? "",
                    poNumber = order.PONumber,
                    vendorName = order.VendorName ?? "",
                    address = order.Address ?? "",
                    vendorPoNumber = order.VendorPoNumber ?? "",
                    orderDate = order.OrderDate,
                    totalAmount = order.TotalAmount,
                    userId = order.UserId,
                    userToken = order.UserToken,
                    status = order.Status ?? "Draft",
                    tenantid = order.Tenantid,
                    shippingInstructions = order.ShippingInstructions ?? "",
                    externalVendorPO = order.ExternalVendorPO ?? "",
                    externalOrderDate = order.ExternalOrderDate,
                    buyerName = order.BuyerName ?? "",
                    vendorRefNo = order.VendorRefNo ?? "",
                    orderType = order.OrderType ?? "Vendor",
                    materialType = DeriveVendorOrderMaterialType(detailsList, order.MaterialType),
                    quotationId = order.QuotationId,
                    quotationNo = order.QuotationNo ?? "",
                    locationId = order.LocationId,
                    parentQuotationID = order.ParentQuotationID,
                    additionalNotes = order.AdditionalNotes ?? "",
                    details = details,
                    attachments = attachments,
                    comments = comments
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetVendorOrderById: EXCEPTION - {ex.Message}");
                Console.WriteLine($"GetVendorOrderById: Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"GetVendorOrderById: Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpPost("SaveVendorOrder")]
        public async Task<IActionResult> SaveVendorOrder([FromBody] JsonElement orderData)
        {
            try
            {
                if (orderData.ValueKind == JsonValueKind.Null || orderData.ValueKind == JsonValueKind.Undefined)
                {
                    return BadRequest(new { error = "Request is null" });
                }

                // Extract basic fields using TryGetProperty
                int orderID = orderData.TryGetProperty("OrderID", out JsonElement orderIDElem) ? orderIDElem.GetInt32() : 0;
                int tenantid = orderData.TryGetProperty("Tenantid", out JsonElement tenantidElem) ? tenantidElem.GetInt32() : 0;
                int vendorID = orderData.TryGetProperty("VendorID", out JsonElement vendorIDElem) ? vendorIDElem.GetInt32() : 0;

                if (vendorID <= 0)
                {
                    return BadRequest(new { error = "Vendor is required" });
                }

                // Extract QuotationId with detailed logging
                int? extractedQuotationId = null;
                if (orderData.TryGetProperty("QuotationId", out JsonElement quotationIdElem))
                {
                    if (quotationIdElem.ValueKind == JsonValueKind.Number)
                    {
                        int qId = quotationIdElem.GetInt32();
                        if (qId > 0)
                        {
                            extractedQuotationId = qId;
                            Console.WriteLine($"SaveVendorOrder: Found QuotationId in JSON: {qId}");
                        }
                        else
                        {
                            Console.WriteLine($"SaveVendorOrder: QuotationId is 0 or negative: {qId}");
                        }
                    }
                    else
                    {
                        Console.WriteLine($"SaveVendorOrder: QuotationId is not a number, ValueKind = {quotationIdElem.ValueKind}");
                    }
                }
                else
                {
                    Console.WriteLine($"SaveVendorOrder: QuotationId property not found in JSON");
                }

                // Extract QuotationNo with detailed logging
                string extractedQuotationNo = "";
                if (orderData.TryGetProperty("QuotationNo", out JsonElement quotationNoElem))
                {
                    if (quotationNoElem.ValueKind == JsonValueKind.String)
                    {
                        extractedQuotationNo = quotationNoElem.GetString() ?? "";
                        Console.WriteLine($"SaveVendorOrder: Found QuotationNo in JSON: '{extractedQuotationNo}'");
                    }
                    else
                    {
                        Console.WriteLine($"SaveVendorOrder: QuotationNo is not a string, ValueKind = {quotationNoElem.ValueKind}");
                    }
                }
                else
                {
                    Console.WriteLine($"SaveVendorOrder: QuotationNo property not found in JSON");
                    // Try alternative property names
                    if (orderData.TryGetProperty("quotationNo", out JsonElement quotationNoLowerElem))
                    {
                        extractedQuotationNo = quotationNoLowerElem.GetString() ?? "";
                        Console.WriteLine($"SaveVendorOrder: Found quotationNo (lowercase) in JSON: '{extractedQuotationNo}'");
                    }
                }

                var order = new VendorOrder
                {
                    OrderID = orderID,
                    Tenantid = tenantid,
                    VendorID = vendorID,
                    VendorCode = orderData.TryGetProperty("VendorCode", out JsonElement vendorCodeElem) ? vendorCodeElem.GetString() ?? "" : "",
                    PONumber = orderData.TryGetProperty("PONumber", out JsonElement poNumberElem) ? poNumberElem.GetInt32() : 0,
                    VendorName = orderData.TryGetProperty("VendorName", out JsonElement vendorNameElem) ? vendorNameElem.GetString() ?? "" : "",
                    Address = orderData.TryGetProperty("Address", out JsonElement addressElem) ? addressElem.GetString() ?? "" : "",
                    VendorPoNumber = orderData.TryGetProperty("VendorPoNumber", out JsonElement vendorPoNumberElem) ? vendorPoNumberElem.GetString() ?? "" : "",
                    OrderDate = orderData.TryGetProperty("OrderDate", out JsonElement orderDateElem) && orderDateElem.ValueKind == JsonValueKind.String && DateTime.TryParse(orderDateElem.GetString(), out DateTime parsedOrderDate) ? parsedOrderDate : DateTime.Now,
                    TotalAmount = orderData.TryGetProperty("TotalAmount", out JsonElement totalAmountElem) ? totalAmountElem.GetDecimal() : 0,
                    UserId = orderData.TryGetProperty("UserId", out JsonElement userIdElem) ? userIdElem.GetInt32() : 0,
                    UserToken = orderData.TryGetProperty("UserToken", out JsonElement userTokenElem) ? userTokenElem.GetInt32() : 0,
                    Status = orderData.TryGetProperty("Status", out JsonElement statusElem) ? statusElem.GetString() ?? "Draft" : "Draft",
                    ShippingInstructions = orderData.TryGetProperty("ShippingInstructions", out JsonElement shippingInstructionsElem) ? shippingInstructionsElem.GetString() ?? "" : "",
                    ExternalVendorPO = orderData.TryGetProperty("ExternalVendorPO", out JsonElement externalVendorPOElem) ? externalVendorPOElem.GetString() ?? "" : "",
                    ExternalOrderDate = orderData.TryGetProperty("ExternalOrderDate", out JsonElement externalOrderDateElem) && externalOrderDateElem.ValueKind == JsonValueKind.String && DateTime.TryParse(externalOrderDateElem.GetString(), out DateTime parsedExternalDate) ? parsedExternalDate : (DateTime?)null,
                    BuyerName = orderData.TryGetProperty("BuyerName", out JsonElement buyerNameElem) ? buyerNameElem.GetString() ?? "" : "",
                    VendorRefNo = orderData.TryGetProperty("VendorRefNo", out JsonElement vendorRefNoElem) ? vendorRefNoElem.GetString() ?? "" : "",
                    OrderType = orderData.TryGetProperty("OrderType", out JsonElement orderTypeElem) ? orderTypeElem.GetString() ?? "Vendor" : "Vendor",
                    MaterialType = orderData.TryGetProperty("MaterialType", out JsonElement materialTypeElem) ? materialTypeElem.GetString() ?? "Material" : "Material",
                    QuotationId = extractedQuotationId,
                    QuotationNo = extractedQuotationNo,
                    LocationId = orderData.TryGetProperty("LocationId", out JsonElement locationIdElem) && locationIdElem.ValueKind == JsonValueKind.Number ? locationIdElem.GetInt32() : (int?)null,
                    ParentQuotationID = orderData.TryGetProperty("ParentQuotationID", out JsonElement parentQuotationIDElem) && parentQuotationIDElem.ValueKind == JsonValueKind.Number ? parentQuotationIDElem.GetInt32() : (int?)null,
                    AdditionalNotes = orderData.TryGetProperty("AdditionalNotes", out JsonElement additionalNotesElem) ? additionalNotesElem.GetString() ?? "" : ""
                };

                if (!TryResolveLocationId(order.LocationId, out var resolvedVendorLocationId, out var forbidVendorLoc))
                    return forbidVendorLoc!;
                if (resolvedVendorLocationId > 0)
                    order.LocationId = resolvedVendorLocationId;

                Console.WriteLine($"SaveVendorOrder: Assigned to order - QuotationId = {order.QuotationId}, QuotationNo = '{order.QuotationNo}', TenantId = {order.Tenantid}");

                if (order.OrderID == 0)
                {
                    // Generate PO number for new orders - use safer query approach
                    if (order.PONumber == 0)
                    {
                        VendorOrder maxOrder = null;
                        try
                        {
                            maxOrder = await _context.VendorOrders
                                .AsNoTracking()
                                .Where(o => o.Tenantid == order.Tenantid)
                                .OrderByDescending(o => o.PONumber)
                                .FirstOrDefaultAsync();
                        }
                        catch (Exception queryEx)
                        {
                            Console.WriteLine($"SaveVendorOrder: Error querying for max PO number: {queryEx.Message}");
                            // Use SQL fallback
                            try
                            {
                                var sql = @"SELECT TOP 1 OrderID, Tenantid, VendorID, ISNULL(VendorCode, '') as VendorCode, PONumber,
                                                   ISNULL(VendorName, '') as VendorName, ISNULL(Address, '') as Address,
                                                   ISNULL(VendorPoNumber, '') as VendorPoNumber, OrderDate, TotalAmount,
                                                   UserId, UserToken, ISNULL(Status, '') as Status,
                                                   ISNULL(ShippingInstructions, '') as ShippingInstructions,
                                                   ISNULL(ExternalVendorPO, '') as ExternalVendorPO, ExternalOrderDate,
                                                   ISNULL(BuyerName, '') as BuyerName, ISNULL(VendorRefNo, '') as VendorRefNo,
                                                   ISNULL(OrderType, 'Vendor') as OrderType, ISNULL(MaterialType, 'Material') as MaterialType,
                                                   LocationId, convertedOrderId, ParentQuotationID, QuotationId,
                                                   ISNULL(QuotationNo, '') as QuotationNo, ISNULL(AdditionalNotes, '') as AdditionalNotes
                                            FROM VendorOrders WHERE Tenantid = {0} ORDER BY PONumber DESC";
                                var orders = await _context.VendorOrders.FromSqlRaw(sql, order.Tenantid).ToListAsync();
                                maxOrder = orders.FirstOrDefault();
                            }
                            catch (Exception sqlEx)
                            {
                                Console.WriteLine($"SaveVendorOrder: SQL fallback for PO number failed: {sqlEx.Message}");
                                maxOrder = null;
                            }
                        }
                        order.PONumber = (maxOrder?.PONumber ?? 0) + 1;
                        Console.WriteLine($"SaveVendorOrder: Auto-generated PONumber: {order.PONumber} (max was: {maxOrder?.PONumber ?? 0})");
                    }
                    else
                    {
                        Console.WriteLine($"SaveVendorOrder: Using provided PONumber: {order.PONumber}");
                    }

                    _context.VendorOrders.Add(order);
                    Console.WriteLine($"SaveVendorOrder: Before save - OrderID: {order.OrderID}, PONumber: {order.PONumber}, QuotationId: {order.QuotationId}");
                }
                else
                {
                    // Load existing order to preserve fields not in the request
                    var existingOrder = await _context.VendorOrders
                        .Where(o => o.OrderID == order.OrderID && o.Tenantid == tenantid)
                        .FirstOrDefaultAsync();

                    if (existingOrder == null)
                    {
                        return NotFound(new { error = "Vendor order not found" });
                    }

                    // Preserve QuotationNo if not provided or empty in the request
                    if (string.IsNullOrEmpty(extractedQuotationNo) && !string.IsNullOrEmpty(existingOrder.QuotationNo))
                    {
                        order.QuotationNo = existingOrder.QuotationNo;
                        Console.WriteLine($"SaveVendorOrder: Preserving existing QuotationNo: '{order.QuotationNo}'");
                    }

                    // Preserve QuotationId if not provided in the request
                    if (!extractedQuotationId.HasValue && existingOrder.QuotationId.HasValue)
                    {
                        order.QuotationId = existingOrder.QuotationId;
                        Console.WriteLine($"SaveVendorOrder: Preserving existing QuotationId: {order.QuotationId}");
                    }

                    // Update existing order properties
                    existingOrder.VendorID = order.VendorID;
                    existingOrder.VendorCode = order.VendorCode;
                    existingOrder.PONumber = order.PONumber;
                    existingOrder.VendorName = order.VendorName;
                    existingOrder.Address = order.Address;
                    existingOrder.VendorPoNumber = order.VendorPoNumber;
                    existingOrder.OrderDate = order.OrderDate;
                    existingOrder.TotalAmount = order.TotalAmount;
                    existingOrder.UserId = order.UserId;
                    existingOrder.UserToken = order.UserToken;
                    existingOrder.Status = order.Status;
                    existingOrder.ShippingInstructions = order.ShippingInstructions;
                    existingOrder.ExternalVendorPO = order.ExternalVendorPO;
                    existingOrder.ExternalOrderDate = order.ExternalOrderDate;
                    existingOrder.BuyerName = order.BuyerName;
                    existingOrder.VendorRefNo = order.VendorRefNo;
                    existingOrder.OrderType = order.OrderType;
                    existingOrder.MaterialType = order.MaterialType;
                    existingOrder.LocationId = order.LocationId;
                    existingOrder.ParentQuotationID = order.ParentQuotationID;
                    existingOrder.AdditionalNotes = order.AdditionalNotes;
                    
                    // Only update QuotationId and QuotationNo if they were provided
                    if (extractedQuotationId.HasValue)
                    {
                        existingOrder.QuotationId = order.QuotationId;
                    }
                    if (!string.IsNullOrEmpty(extractedQuotationNo))
                    {
                        existingOrder.QuotationNo = order.QuotationNo;
                    }

                    Console.WriteLine($"SaveVendorOrder: Updating existing order - OrderID: {existingOrder.OrderID}, PONumber: {existingOrder.PONumber}, QuotationId: {existingOrder.QuotationId}, QuotationNo: '{existingOrder.QuotationNo}'");
                    // Entity is already tracked, no need to call Update() - EF Core change tracking will detect changes
                }

                await _context.SaveChangesAsync();
                Console.WriteLine($"SaveVendorOrder: After save - OrderID: {order.OrderID}, PONumber: {order.PONumber}, QuotationId: {order.QuotationId}");

                // Handle Details - use safer approach that respects foreign key constraints
                if (orderData.TryGetProperty("Details", out JsonElement detailsElem) && detailsElem.ValueKind == JsonValueKind.Array && detailsElem.GetArrayLength() > 0)
                {
                    // Get existing details with their invoicing status
                    List<VendorOrderDetail> existingDetails = null;
                    try
                    {
                        existingDetails = await _context.VendorOrderDetails
                            .Include(d => d.VendorInvoicings)
                            .Where(d => d.OrderID == order.OrderID)
                            .ToListAsync();
                    }
                    catch (Exception detailsEx)
                    {
                        Console.WriteLine($"SaveVendorOrder: Error querying existing details: {detailsEx.Message}");
                        // Use SQL fallback
                        // Don't use SQL fallback for details - just use empty list if query fails
                        // The columns will be added via the SQL migration script
                        Console.WriteLine($"SaveVendorOrder: Will skip deleting existing details due to missing columns");
                        existingDetails = new List<VendorOrderDetail>();
                    }

                    // Process each detail from the request
                    var processedDetailIds = new HashSet<int>();
                    var detailsToAdd = new List<VendorOrderDetail>();

                    foreach (var detailElem in detailsElem.EnumerateArray())
                    {
                        // Extract JobId from JobNumber or use default
                        int jobId = 0;
                        if (detailElem.TryGetProperty("JobId", out JsonElement jobIdElem) && jobIdElem.ValueKind == JsonValueKind.Number)
                        {
                            jobId = jobIdElem.GetInt32();
                        }
                        else if (detailElem.TryGetProperty("JobNumber", out JsonElement jobNumberForIdElem))
                        {
                            // Try to extract numeric ID from JobNumber (e.g., "JO#1001" -> 1001)
                            string jobNumberStr = jobNumberForIdElem.GetString() ?? "";
                            if (jobNumberStr.StartsWith("JO#"))
                            {
                                string numPart = jobNumberStr.Substring(3);
                                if (int.TryParse(numPart, out int parsedJobId))
                                {
                                    jobId = parsedJobId;
                                }
                            }
                        }

                        // Get ItemNo for matching
                        int itemNo = detailElem.TryGetProperty("ItemNo", out JsonElement itemNoElem) ? itemNoElem.GetInt32() : 0;

                        // Try to find existing detail by JobId and ItemNo
                        var existingDetail = existingDetails.FirstOrDefault(d => d.JobId == jobId && d.ItemNo == itemNo);

                        if (existingDetail != null)
                        {
                            // Detail exists - check if it's invoiced
                            bool isInvoiced = existingDetail.VendorInvoicings != null && existingDetail.VendorInvoicings.Any();

                            if (!isInvoiced)
                            {
                                // Update non-invoiced detail
                                UpdateVendorOrderDetailFromJson(existingDetail, detailElem, jobId, order.MaterialType);
                                Console.WriteLine($"SaveVendorOrder: Updating existing non-invoiced detail (JobId: {jobId}, ItemNo: {itemNo})");
                            }
                            else
                            {
                                // Keep invoiced detail as-is
                                Console.WriteLine($"SaveVendorOrder: Keeping invoiced detail unchanged (JobId: {jobId}, ItemNo: {itemNo})");
                            }

                            processedDetailIds.Add(existingDetail.ID);
                        }
                        else
                        {
                            // New detail - add it
                            var newDetail = CreateVendorOrderDetailFromJson(detailElem, order.OrderID, tenantid, jobId, order.MaterialType);
                            detailsToAdd.Add(newDetail);
                            Console.WriteLine($"SaveVendorOrder: Adding new detail (JobId: {jobId}, ItemNo: {itemNo})");
                        }
                    }

                    // Add all new details
                    if (detailsToAdd.Any())
                    {
                        _context.VendorOrderDetails.AddRange(detailsToAdd);
                    }

                    // Delete details that are not in the request and not invoiced
                    var detailsToDelete = existingDetails
                        .Where(d => !processedDetailIds.Contains(d.ID) &&
                                   (d.VendorInvoicings == null || !d.VendorInvoicings.Any()))
                        .ToList();

                    if (detailsToDelete.Any())
                    {
                        _context.VendorOrderDetails.RemoveRange(detailsToDelete);
                        Console.WriteLine($"SaveVendorOrder: Deleting {detailsToDelete.Count} vendor order details that are not in request and not invoiced");
                    }
                }

                // Handle Attachments - use safer query approach
                if (orderData.TryGetProperty("Attachments", out JsonElement attachmentsElem) && attachmentsElem.ValueKind == JsonValueKind.Array && attachmentsElem.GetArrayLength() > 0)
                {
                    // Delete existing attachments
                    List<VendorOrderAttachment> existingAttachments = null;
                    try
                    {
                        existingAttachments = await _context.VendorOrderAttachments
                            .AsNoTracking()
                            .Where(a => a.OrderID == order.OrderID)
                            .ToListAsync();
                    }
                    catch (Exception attachmentsEx)
                    {
                        Console.WriteLine($"SaveVendorOrder: Error querying existing attachments: {attachmentsEx.Message}");
                        existingAttachments = new List<VendorOrderAttachment>();
                    }
                    
                    if (existingAttachments != null && existingAttachments.Any())
                    {
                        _context.VendorOrderAttachments.RemoveRange(existingAttachments);
                    }

                    // Add new attachments
                    foreach (var attachmentElem in attachmentsElem.EnumerateArray())
                    {
                        var attachment = new VendorOrderAttachment
                        {
                            OrderID = order.OrderID,
                            Name = attachmentElem.TryGetProperty("name", out JsonElement nameElem) ? nameElem.GetString() ?? "" : "",
                            Size = attachmentElem.TryGetProperty("size", out JsonElement sizeElem) ? sizeElem.GetInt64() : 0,
                            FileUrl = attachmentElem.TryGetProperty("fileUrl", out JsonElement fileUrlElem) ? fileUrlElem.GetString() ?? "" : ""
                        };
                        _context.VendorOrderAttachments.Add(attachment);
                    }
                }

                // Handle Comments - use safer query approach
                if (orderData.TryGetProperty("Comments", out JsonElement commentsElem) && commentsElem.ValueKind == JsonValueKind.Array && commentsElem.GetArrayLength() > 0)
                {
                    // Delete existing comments
                    List<VendorOrderComment> existingComments = null;
                    try
                    {
                        existingComments = await _context.VendorOrderComments
                            .AsNoTracking()
                            .Where(c => c.OrderID == order.OrderID)
                            .ToListAsync();
                    }
                    catch (Exception commentsEx)
                    {
                        Console.WriteLine($"SaveVendorOrder: Error querying existing comments: {commentsEx.Message}");
                        existingComments = new List<VendorOrderComment>();
                    }
                    
                    if (existingComments != null && existingComments.Any())
                    {
                        _context.VendorOrderComments.RemoveRange(existingComments);
                    }

                    // Add new comments
                    foreach (var commentElem in commentsElem.EnumerateArray())
                    {
                        var comment = new VendorOrderComment
                        {
                            OrderID = order.OrderID,
                            Text = commentElem.TryGetProperty("text", out JsonElement textElem) ? textElem.GetString() ?? "" : "",
                            CreatedAt = commentElem.TryGetProperty("createdAt", out JsonElement createdAtElem) && createdAtElem.ValueKind == JsonValueKind.String && DateTime.TryParse(createdAtElem.GetString(), out DateTime parsedCreatedAt) ? parsedCreatedAt : DateTime.Now,
                            CreatedBy = commentElem.TryGetProperty("createdBy", out JsonElement createdByElem) ? createdByElem.GetString() ?? "User" : "User"
                        };
                        _context.VendorOrderComments.Add(comment);
                    }
                }

                await _context.SaveChangesAsync();

                await LinkFinishedProductsOnVendorOrderAsync(order.OrderID, tenantid);
                await LinkRawMaterialsOnVendorOrderAsync(order.OrderID, tenantid, order.VendorID);

                var linkedDetails = await _context.VendorOrderDetails
                    .Where(d => d.OrderID == order.OrderID && d.Tenantid == tenantid)
                    .ToListAsync();
                var savedOrder = await _context.VendorOrders.FindAsync(order.OrderID);
                if (savedOrder != null)
                {
                    savedOrder.MaterialType = DeriveVendorOrderMaterialType(linkedDetails, savedOrder.MaterialType);
                    await _context.SaveChangesAsync();
                }

                // Verify what was saved
                Console.WriteLine($"SaveVendorOrder: After save - OrderID = {savedOrder?.OrderID}, QuotationId = {savedOrder?.QuotationId}, QuotationNo = '{savedOrder?.QuotationNo}'");
                
                // Also verify by querying directly from database
                var verifyFromDb = await _context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.OrderID == order.OrderID)
                    .Select(o => new { o.OrderID, o.QuotationId, o.QuotationNo })
                    .FirstOrDefaultAsync();
                Console.WriteLine($"SaveVendorOrder: Database verification - OrderID = {verifyFromDb?.OrderID}, QuotationId = {verifyFromDb?.QuotationId}, QuotationNo = '{verifyFromDb?.QuotationNo}'");

                // Update the vendor quotation status to "Converted" if this order was created from a quotation
                if (order.QuotationId.HasValue && order.QuotationId.Value > 0)
                {
                    try
                    {
                        // Reload order from database to ensure we have the latest PONumber (in case it was auto-generated)
                        // Use AsNoTracking to get a fresh copy from database, not the tracked entity
                        var reloadedOrder = await _context.VendorOrders
                            .AsNoTracking()
                            .FirstOrDefaultAsync(o => o.OrderID == order.OrderID);
                        
                        // Also try to get it directly from the tracked order entity
                        Console.WriteLine($"SaveVendorOrder: Tracked order - OrderID: {order.OrderID}, PONumber: {order.PONumber}");
                        
                        if (reloadedOrder == null)
                        {
                            Console.WriteLine($"SaveVendorOrder: ERROR - Could not reload order {order.OrderID} from database!");
                        }
                        else
                        {
                            Console.WriteLine($"SaveVendorOrder: Reloaded order (AsNoTracking) - OrderID: {reloadedOrder.OrderID}, PONumber: {reloadedOrder.PONumber}");
                            
                            // Use PONumber from reloaded order, but also check tracked order as backup
                            int poNumberToStore = reloadedOrder.PONumber;
                            if (poNumberToStore <= 0 && order.PONumber > 0)
                            {
                                Console.WriteLine($"SaveVendorOrder: Reloaded PONumber is 0, using tracked order PONumber: {order.PONumber}");
                                poNumberToStore = order.PONumber;
                            }
                            
                            Console.WriteLine($"SaveVendorOrder: Final PONumber to store: {poNumberToStore}, OrderID: {reloadedOrder.OrderID}");
                            
                            Console.WriteLine($"SaveVendorOrder: Attempting to update quotation {order.QuotationId.Value} for tenant {order.Tenantid}");
                            var quotation = await _context.VendorQuotations
                                .FirstOrDefaultAsync(q => q.OrderID == order.QuotationId.Value && q.Tenantid == order.Tenantid);
                            if (quotation != null)
                            {
                                Console.WriteLine($"SaveVendorOrder: Found quotation {quotation.OrderID}, current status: '{quotation.Status}', current convertedOrderId: {quotation.convertedOrderId}");
                                
                                // CRITICAL: Ensure we're using PONumber, NOT OrderID
                                if (poNumberToStore <= 0)
                                {
                                    Console.WriteLine($"SaveVendorOrder: ERROR - PONumber is {poNumberToStore}, cannot use this value!");
                                    Console.WriteLine($"SaveVendorOrder: OrderID = {reloadedOrder.OrderID}, PONumber = {reloadedOrder.PONumber}");
                                    // Don't update if PONumber is invalid
                                }
                                else if (poNumberToStore == reloadedOrder.OrderID)
                                {
                                    Console.WriteLine($"SaveVendorOrder: ERROR - PONumber equals OrderID ({poNumberToStore}), this should not happen!");
                                    Console.WriteLine($"SaveVendorOrder: This indicates PONumber was not set correctly during order creation.");
                                }
                                else
                                {
                                    Console.WriteLine($"SaveVendorOrder: Setting convertedOrderId to PONumber {poNumberToStore} (NOT OrderID {reloadedOrder.OrderID})");
                                    
                                    quotation.Status = "Converted";
                                    quotation.convertedOrderId = poNumberToStore; // Store PONumber instead of OrderID for display consistency
                                    quotation.isconverted = 1;
                                    
                                    // Force EF to update this entity
                                    _context.VendorQuotations.Update(quotation);
                                    await _context.SaveChangesAsync();
                                    
                                    Console.WriteLine($"SaveVendorOrder: Successfully updated quotation {quotation.OrderID} status to 'Converted' with order PONumber {poNumberToStore}");

                                    // Verify the update immediately
                                    var verifyQuotation = await _context.VendorQuotations
                                        .AsNoTracking()
                                        .FirstOrDefaultAsync(q => q.OrderID == order.QuotationId.Value);
                                    Console.WriteLine($"SaveVendorOrder: Verification - quotation status: '{verifyQuotation?.Status}', convertedOrderId: {verifyQuotation?.convertedOrderId}");
                                    
                                    if (verifyQuotation?.convertedOrderId != poNumberToStore)
                                    {
                                        Console.WriteLine($"SaveVendorOrder: ERROR - Verification failed! Expected convertedOrderId: {poNumberToStore}, but got: {verifyQuotation?.convertedOrderId}");
                                        Console.WriteLine($"SaveVendorOrder: This means the value was not saved correctly or was overwritten!");
                                        
                                        // Try to fix it one more time using direct SQL to bypass any EF tracking issues
                                        try
                                        {
                                            var sql = "UPDATE VendorQuotations SET convertedOrderId = {0} WHERE OrderID = {1}";
                                            var rowsAffected = await _context.Database.ExecuteSqlRawAsync(sql, poNumberToStore, order.QuotationId.Value);
                                            Console.WriteLine($"SaveVendorOrder: Direct SQL update affected {rowsAffected} row(s)");
                                            
                                            // Verify again
                                            var reVerify = await _context.VendorQuotations
                                                .AsNoTracking()
                                                .FirstOrDefaultAsync(q => q.OrderID == order.QuotationId.Value);
                                            Console.WriteLine($"SaveVendorOrder: After SQL fix - convertedOrderId: {reVerify?.convertedOrderId}");
                                        }
                                        catch (Exception sqlEx)
                                        {
                                            Console.WriteLine($"SaveVendorOrder: SQL fix failed: {sqlEx.Message}");
                                        }
                                    }
                                    else
                                    {
                                        Console.WriteLine($"SaveVendorOrder: ✓ Verification passed - convertedOrderId correctly set to {poNumberToStore}");
                                    }
                                }
                            }
                            else
                            {
                                Console.WriteLine($"SaveVendorOrder: Quotation {order.QuotationId.Value} not found for tenant {order.Tenantid}");
                            }
                        }
                    }
                    catch (Exception quoteUpdateEx)
                    {
                        Console.WriteLine($"SaveVendorOrder: Error updating quotation status: {quoteUpdateEx.Message}");
                        Console.WriteLine($"SaveVendorOrder: Stack trace: {quoteUpdateEx.StackTrace}");
                        // Don't fail the order save if quotation update fails
                    }
                }
                else
                {
                    Console.WriteLine($"SaveVendorOrder: No quotation ID provided (QuotationId: {order.QuotationId})");
                }

                // Ensure PONumber is set before returning
                var finalPoNumber = order.PONumber;
                if (finalPoNumber <= 0)
                {
                    Console.WriteLine($"SaveVendorOrder: WARNING - PONumber is {finalPoNumber}, this should not happen!");
                }
                
                Console.WriteLine($"SaveVendorOrder: Returning response - OrderID: {order.OrderID}, PONumber: {finalPoNumber}");
                
                return Ok(new
                {
                    result = new
                    {
                        id = order.OrderID,
                        poNumber = finalPoNumber, // Include PONumber for display purposes
                        message = "Vendor order saved successfully"
                    }
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"SaveVendorOrder: EXCEPTION - {ex.Message}");
                Console.WriteLine($"SaveVendorOrder: Stack trace: {ex.StackTrace}");
                
                string innerExceptionMessage = "";
                string innerStackTrace = "";
                if (ex.InnerException != null)
                {
                    innerExceptionMessage = ex.InnerException.Message;
                    innerStackTrace = ex.InnerException.StackTrace ?? "";
                    Console.WriteLine($"SaveVendorOrder: Inner exception: {innerExceptionMessage}");
                    Console.WriteLine($"SaveVendorOrder: Inner stack trace: {innerStackTrace}");
                    
                    // Check for SQL Server specific errors
                    if (ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx)
                    {
                        Console.WriteLine($"SaveVendorOrder: SQL Error Number: {sqlEx.Number}");
                        Console.WriteLine($"SaveVendorOrder: SQL Error State: {sqlEx.State}");
                        Console.WriteLine($"SaveVendorOrder: SQL Error Class: {sqlEx.Class}");
                        foreach (Microsoft.Data.SqlClient.SqlError error in sqlEx.Errors)
                        {
                            Console.WriteLine($"SaveVendorOrder: SQL Error - {error.Message}");
                        }
                    }
                }
                
                return BadRequest(new { 
                    error = ex.Message, 
                    innerError = innerExceptionMessage,
                    stackTrace = ex.StackTrace,
                    innerStackTrace = innerStackTrace
                });
            }
        }

        /// <summary>Valid PO line categories: raw stock, finished buy, tool, service/subcontract, or other.</summary>
        private static string NormalizeVendorOrderLineType(string? value, string? orderMaterialType)
        {
            var allowed = new[] { "RawMaterial", "FinishedProduct", "Tool", "Service", "Subcontract", "Other" };
            var v = (value ?? "").Trim();
            if (string.IsNullOrEmpty(v))
                return string.Equals(orderMaterialType, "Service", StringComparison.OrdinalIgnoreCase) ? "Service" : "RawMaterial";
            foreach (var a in allowed)
            {
                if (string.Equals(v, a, StringComparison.OrdinalIgnoreCase))
                    return a;
            }
            return "Other";
        }

        /// <summary>
        /// Header Material/Service/Mixed from line types. Blank lines use stored header as fallback
        /// so old Service POs without LineType still list as Service.
        /// </summary>
        private static string DeriveVendorOrderMaterialType(
            IReadOnlyCollection<VendorOrderDetail> details,
            string? storedMaterialType)
        {
            var types = details
                .Select(d => NormalizeVendorOrderLineType(d.LineType, storedMaterialType))
                .ToList();
            if (types.Count == 0)
                return string.Equals(storedMaterialType, "Service", StringComparison.OrdinalIgnoreCase)
                    ? "Service"
                    : "Material";

            static bool ServiceLike(string t) =>
                t.Equals("Service", StringComparison.OrdinalIgnoreCase)
                || t.Equals("Subcontract", StringComparison.OrdinalIgnoreCase);
            static bool GoodsLike(string t) =>
                t.Equals("RawMaterial", StringComparison.OrdinalIgnoreCase)
                || t.Equals("FinishedProduct", StringComparison.OrdinalIgnoreCase)
                || t.Equals("Tool", StringComparison.OrdinalIgnoreCase);

            var anyService = types.Any(ServiceLike);
            var anyGoods = types.Any(GoodsLike);
            if (anyService && anyGoods) return "Mixed";
            if (anyService && !anyGoods) return "Service";
            return "Material";
        }

        private static string? ReadLineTypeFromVendorDetailJson(JsonElement detailElem)
        {
            if (detailElem.TryGetProperty("LineType", out JsonElement lt) && lt.ValueKind == JsonValueKind.String)
                return lt.GetString();
            if (detailElem.TryGetProperty("lineType", out JsonElement lt2) && lt2.ValueKind == JsonValueKind.String)
                return lt2.GetString();
            return null;
        }

        private void UpdateVendorOrderDetailFromJson(VendorOrderDetail existingDetail, JsonElement detailElem, int jobId, string? orderMaterialType)
        {
            // Parse DueDate string to DateTime for required DueDate column
            DateTime dueDateDateTime = DateTime.Now;
            string dueDateString = DateTime.Now.ToString("yyyy-MM-dd");
            if (detailElem.TryGetProperty("DueDate", out JsonElement dueDateElem) && dueDateElem.ValueKind == JsonValueKind.String)
            {
                string dueDateStr = dueDateElem.GetString() ?? "";
                dueDateString = dueDateStr;
                if (!string.IsNullOrEmpty(dueDateStr) && DateTime.TryParse(dueDateStr, out DateTime parsedDate))
                {
                    dueDateDateTime = parsedDate;
                }
            }

            // Update existing detail properties
            existingDetail.JobId = jobId;
            existingDetail.ItemNo = detailElem.TryGetProperty("ItemNo", out JsonElement itemNoElem) ? itemNoElem.GetInt32() : 0;
            existingDetail.PartName = detailElem.TryGetProperty("PartName", out JsonElement partNameElem) ? partNameElem.GetString() ?? "" : "";
            existingDetail.PartNo = detailElem.TryGetProperty("PartNo", out JsonElement partNoElem) ? partNoElem.GetString() ?? "" : "";
            existingDetail.DueDate = dueDateString;
            existingDetail.DueDateDateTime = dueDateDateTime;
            existingDetail.JobNumber = detailElem.TryGetProperty("JobNumber", out JsonElement jobNumberElem) ? jobNumberElem.GetString() ?? "" : "";
            existingDetail.JobDesc = detailElem.TryGetProperty("JobDesc", out JsonElement jobDescElem) ? jobDescElem.GetString() ?? "" : "";
            existingDetail.QtyOrdered = detailElem.TryGetProperty("QtyOrdered", out JsonElement qtyOrderedElem) ? qtyOrderedElem.GetInt32() : 0;
            existingDetail.Unit = detailElem.TryGetProperty("Unit", out JsonElement unitElem) ? unitElem.GetString() ?? "EA" : "EA";
            existingDetail.UnitPrice = detailElem.TryGetProperty("UnitPrice", out JsonElement unitPriceElem) ? unitPriceElem.GetDecimal() : 0;
            existingDetail.JobPriority = detailElem.TryGetProperty("JobPriority", out JsonElement jobPriorityElem) ? jobPriorityElem.GetInt32() : 0;
            existingDetail.Discount = detailElem.TryGetProperty("Discount", out JsonElement discountElem) ? discountElem.GetDecimal() : 0;
            existingDetail.DiscountType = detailElem.TryGetProperty("DiscountType", out JsonElement discountTypeElem) && discountTypeElem.ValueKind == JsonValueKind.String
                ? (string.Equals(discountTypeElem.GetString(), "Amount", StringComparison.OrdinalIgnoreCase) ? "Amount" : "Percent")
                : (detailElem.TryGetProperty("discountType", out JsonElement discountTypeElemLower) && discountTypeElemLower.ValueKind == JsonValueKind.String
                    ? (string.Equals(discountTypeElemLower.GetString(), "Amount", StringComparison.OrdinalIgnoreCase) ? "Amount" : "Percent")
                    : "Percent");
            existingDetail.ProductId = detailElem.TryGetProperty("ProductId", out JsonElement productIdElem) && productIdElem.ValueKind == JsonValueKind.Number ? productIdElem.GetInt32() : (int?)null;
            existingDetail.RawMaterialId = ReadNullableIntFromVendorDetailJson(detailElem, "RawMaterialId", "rawMaterialId");
            existingDetail.LeadTime = detailElem.TryGetProperty("LeadTime", out JsonElement leadTimeElem) ? leadTimeElem.GetString() ?? "" : "";
            existingDetail.Notes = detailElem.TryGetProperty("Notes", out JsonElement notesElem) ? notesElem.GetString() ?? "" : "";
            existingDetail.ShippedQty = detailElem.TryGetProperty("ShippedQty", out JsonElement shippedQtyElem) ? shippedQtyElem.GetInt32() : 0;
            existingDetail.ShippingStatus = detailElem.TryGetProperty("ShippingStatus", out JsonElement shippingStatusElem) ? shippingStatusElem.GetString() ?? "" : "";
            existingDetail.InvoicedQty = detailElem.TryGetProperty("InvoicedQty", out JsonElement invoicedQtyElem) ? invoicedQtyElem.GetInt32() : 0;
            existingDetail.InvoiceStatus = detailElem.TryGetProperty("InvoiceStatus", out JsonElement invoiceStatusElem) ? invoiceStatusElem.GetString() ?? "" : "";
            existingDetail.glcode = detailElem.TryGetProperty("glcode", out JsonElement glcodeElem) ? glcodeElem.GetString() ?? "" : "";
            existingDetail.Received = detailElem.TryGetProperty("Received", out JsonElement receivedElem) ? receivedElem.GetString() ?? "No" : "No";
            existingDetail.LineType = NormalizeVendorOrderLineType(ReadLineTypeFromVendorDetailJson(detailElem), orderMaterialType);
            ApplyInventoryIdsForLineType(existingDetail);
        }

        private VendorOrderDetail CreateVendorOrderDetailFromJson(JsonElement detailElem, int orderId, int tenantid, int jobId, string? orderMaterialType)
        {
            // Parse DueDate string to DateTime for required DueDate column
            DateTime dueDateDateTime = DateTime.Now;
            string dueDateString = DateTime.Now.ToString("yyyy-MM-dd");
            if (detailElem.TryGetProperty("DueDate", out JsonElement dueDateElem) && dueDateElem.ValueKind == JsonValueKind.String)
            {
                string dueDateStr = dueDateElem.GetString() ?? "";
                dueDateString = dueDateStr;
                if (!string.IsNullOrEmpty(dueDateStr) && DateTime.TryParse(dueDateStr, out DateTime parsedDate))
                {
                    dueDateDateTime = parsedDate;
                }
            }

            var detail = new VendorOrderDetail
            {
                OrderID = orderId,
                Tenantid = tenantid, // Required field - use order's tenantid
                JobId = jobId, // Required field
                ItemNo = detailElem.TryGetProperty("ItemNo", out JsonElement itemNoElem) ? itemNoElem.GetInt32() : 0,
                PartName = detailElem.TryGetProperty("PartName", out JsonElement partNameElem) ? partNameElem.GetString() ?? "" : "",
                PartNo = detailElem.TryGetProperty("PartNo", out JsonElement partNoElem) ? partNoElem.GetString() ?? "" : "",
                DueDate = dueDateString, // Maps to DueDateString (new column, if exists)
                DueDateDateTime = dueDateDateTime, // Maps to DueDate (required DateTime column)
                JobNumber = detailElem.TryGetProperty("JobNumber", out JsonElement jobNumberElem) ? jobNumberElem.GetString() ?? "" : "",
                JobDesc = detailElem.TryGetProperty("JobDesc", out JsonElement jobDescElem) ? jobDescElem.GetString() ?? "" : "",
                QtyOrdered = detailElem.TryGetProperty("QtyOrdered", out JsonElement qtyOrderedElem) ? qtyOrderedElem.GetInt32() : 0,
                Unit = detailElem.TryGetProperty("Unit", out JsonElement unitElem) ? unitElem.GetString() ?? "EA" : "EA",
                UnitPrice = detailElem.TryGetProperty("UnitPrice", out JsonElement unitPriceElem) ? unitPriceElem.GetDecimal() : 0,
                JobPriority = detailElem.TryGetProperty("JobPriority", out JsonElement jobPriorityElem) ? jobPriorityElem.GetInt32() : 0,
                Discount = detailElem.TryGetProperty("Discount", out JsonElement discountElem) ? discountElem.GetDecimal() : 0,
                DiscountType = detailElem.TryGetProperty("DiscountType", out JsonElement discountTypeElem) && discountTypeElem.ValueKind == JsonValueKind.String
                    ? (string.Equals(discountTypeElem.GetString(), "Amount", StringComparison.OrdinalIgnoreCase) ? "Amount" : "Percent")
                    : (detailElem.TryGetProperty("discountType", out JsonElement discountTypeElemLower) && discountTypeElemLower.ValueKind == JsonValueKind.String
                        ? (string.Equals(discountTypeElemLower.GetString(), "Amount", StringComparison.OrdinalIgnoreCase) ? "Amount" : "Percent")
                        : "Percent"),
                ProductId = detailElem.TryGetProperty("ProductId", out JsonElement productIdElem) && productIdElem.ValueKind == JsonValueKind.Number ? productIdElem.GetInt32() : (int?)null,
                RawMaterialId = ReadNullableIntFromVendorDetailJson(detailElem, "RawMaterialId", "rawMaterialId"),
                LeadTime = detailElem.TryGetProperty("LeadTime", out JsonElement leadTimeElem) ? leadTimeElem.GetString() ?? "" : "",
                Notes = detailElem.TryGetProperty("Notes", out JsonElement notesElem) ? notesElem.GetString() ?? "" : "",
                ShippedQty = detailElem.TryGetProperty("ShippedQty", out JsonElement shippedQtyElem) ? shippedQtyElem.GetInt32() : 0,
                ShippingStatus = detailElem.TryGetProperty("ShippingStatus", out JsonElement shippingStatusElem) ? shippingStatusElem.GetString() ?? "" : "",
                InvoicedQty = detailElem.TryGetProperty("InvoicedQty", out JsonElement invoicedQtyElem) ? invoicedQtyElem.GetInt32() : 0,
                InvoiceStatus = detailElem.TryGetProperty("InvoiceStatus", out JsonElement invoiceStatusElem) ? invoiceStatusElem.GetString() ?? "" : "",
                glcode = detailElem.TryGetProperty("glcode", out JsonElement glcodeElem) ? glcodeElem.GetString() ?? "" : "", // Required field
                Received = detailElem.TryGetProperty("Received", out JsonElement receivedElem) ? receivedElem.GetString() ?? "No" : "No", // Required field, default to "No"
                LineType = NormalizeVendorOrderLineType(ReadLineTypeFromVendorDetailJson(detailElem), orderMaterialType)
            };

            ApplyInventoryIdsForLineType(detail);
            return detail;
        }

        private static int? ReadNullableIntFromVendorDetailJson(JsonElement detailElem, string pascalName, string camelName)
        {
            if (detailElem.TryGetProperty(pascalName, out JsonElement pascal) && pascal.ValueKind == JsonValueKind.Number)
                return pascal.GetInt32();
            if (detailElem.TryGetProperty(camelName, out JsonElement camel) && camel.ValueKind == JsonValueKind.Number)
                return camel.GetInt32();
            return null;
        }

        /// <summary>
        /// Keep ProductId / RawMaterialId consistent with line type.
        /// Legacy RawMaterial lines may still only have ProductId until re-picked from RM master.
        /// </summary>
        private static void ApplyInventoryIdsForLineType(VendorOrderDetail detail)
        {
            var lineType = (detail.LineType ?? "").Trim();
            if (string.Equals(lineType, "RawMaterial", StringComparison.OrdinalIgnoreCase))
            {
                if (detail.RawMaterialId.HasValue && detail.RawMaterialId.Value > 0)
                    detail.ProductId = null;
                return;
            }
            if (string.Equals(lineType, "FinishedProduct", StringComparison.OrdinalIgnoreCase))
            {
                detail.RawMaterialId = null;
                return;
            }
            // Tool / Service / Subcontract / Other: no inventory master link
            detail.ProductId = null;
            detail.RawMaterialId = null;
        }

        /// <summary>
        /// Finished-product PO lines get a Product Master row (Buy, or Both if already Make)
        /// and ProductId so receiving can book inventory.
        /// </summary>
        private async Task LinkFinishedProductsOnVendorOrderAsync(int orderId, int tenantId)
        {
            var details = await _context.VendorOrderDetails
                .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                .ToListAsync();

            foreach (var detail in details)
            {
                var lineType = NormalizeVendorOrderLineType(detail.LineType, null);
                if (!string.Equals(lineType, "FinishedProduct", StringComparison.OrdinalIgnoreCase))
                    continue;

                var productId = await ProductSourcing.EnsureFinishedProductAsync(
                    _context,
                    tenantId,
                    detail.PartNo,
                    detail.PartName,
                    detail.Unit,
                    detail.UnitPrice,
                    ProductSourcing.Buy);

                if (productId.HasValue && productId.Value > 0)
                    detail.ProductId = productId;
            }

            await _context.SaveChangesAsync();
        }

        /// <summary>
        /// Raw-material PO lines get a Raw Material Master row and RawMaterialId
        /// so receiving can book inventory without a prior master-screen visit.
        /// </summary>
        private async Task LinkRawMaterialsOnVendorOrderAsync(int orderId, int tenantId, int vendorId)
        {
            var details = await _context.VendorOrderDetails
                .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                .ToListAsync();

            foreach (var detail in details)
            {
                var lineType = NormalizeVendorOrderLineType(detail.LineType, null);
                if (!string.Equals(lineType, "RawMaterial", StringComparison.OrdinalIgnoreCase))
                    continue;

                var rawMaterialId = await RawMaterialCatalog.EnsureAsync(
                    _context,
                    tenantId,
                    detail.PartNo,
                    detail.PartName,
                    detail.Unit,
                    detail.UnitPrice,
                    vendorId > 0 ? vendorId : (int?)null);

                if (rawMaterialId.HasValue && rawMaterialId.Value > 0)
                {
                    detail.RawMaterialId = rawMaterialId;
                    detail.ProductId = null;
                }
            }

            await _context.SaveChangesAsync();
        }

        /// <summary>True when this PO line is buy-to-job (not warehouse stock).</summary>
        private static bool IsVendorOrderLineJobTied(VendorOrderDetail detail)
        {
            return detail.JobId > 0 || !string.IsNullOrWhiteSpace(detail.JobNumber);
        }

        private async Task<int?> ResolveJobOrderIdForInventoryAsync(int tenantId, VendorOrderDetail detail)
        {
            if (detail.JobId > 0)
            {
                var byPk = await _context.JobOrderMaster
                    .AsNoTracking()
                    .FirstOrDefaultAsync(j => j.Tenantid == tenantId && j.JobOrderID == detail.JobId);
                if (byPk != null)
                    return byPk.JobOrderID;

                var byNumber = await _context.JobOrderMaster
                    .AsNoTracking()
                    .FirstOrDefaultAsync(j => j.Tenantid == tenantId && j.JobOrderNumber == detail.JobId);
                if (byNumber != null)
                    return byNumber.JobOrderID;
            }

            var jobNo = (detail.JobNumber ?? "").Trim();
            if (string.IsNullOrEmpty(jobNo))
                return detail.JobId > 0 ? detail.JobId : null;

            var byName = await _context.JobOrderMaster
                .AsNoTracking()
                .FirstOrDefaultAsync(j => j.Tenantid == tenantId && j.JobNumber == jobNo);
            if (byName != null)
                return byName.JobOrderID;

            var digits = new string(jobNo.Where(char.IsDigit).ToArray());
            if (int.TryParse(digits, out var parsed) && parsed > 0)
            {
                var displayNumber = parsed >= 1000 ? parsed : parsed;
                var byParsed = await _context.JobOrderMaster
                    .AsNoTracking()
                    .FirstOrDefaultAsync(j => j.Tenantid == tenantId
                        && (j.JobOrderNumber == parsed || j.JobOrderNumber == displayNumber
                            || (parsed >= 1000 && j.JobOrderNumber == parsed - 999)));
                if (byParsed != null)
                    return byParsed.JobOrderID;
            }

            return detail.JobId > 0 ? detail.JobId : null;
        }

        [HttpGet("CheckVendorOrderDeletionImpact")]
        public async Task<IActionResult> CheckVendorOrderDeletionImpact([FromQuery] int orderId, [FromQuery] int tenantId)
        {
            try
            {
                var order = await _context.VendorOrders
                    .FirstOrDefaultAsync(o => o.OrderID == orderId && o.Tenantid == tenantId);

                if (order == null)
                {
                    return NotFound(new { error = "Vendor order not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    BlockingDependencies = new List<BlockingDependency>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Check for vendor invoices
                var vendorInvoiceDetails = await _context.VendorInvoiceDetail
                    .Where(vid => vid.OrderId == orderId)
                    .ToListAsync();
                
                if (vendorInvoiceDetails.Any())
                {
                    var invoiceIds = vendorInvoiceDetails.Select(vid => vid.InvoiceId).Distinct().ToList();
                    var invoices = await _context.VendorInvoiceMaster
                        .Where(vim => invoiceIds.Contains(vim.Id) && vim.TenantId == tenantId)
                        .ToListAsync();
                    
                    var invoiceDependency = new BlockingDependency
                    {
                        EntityType = "VendorInvoice",
                        Description = $"Vendor order has {invoices.Count} invoice(s) associated",
                        Items = invoices.Select(vim => new DependencyItem
                        {
                            Id = vim.Id,
                            Name = vim.InvoiceNo ?? $"Invoice #{vim.Id}",
                            DeleteEndpoint = $"/VendorInvoice/DeleteVendorInvoice/{vim.Id}"
                        }).ToList()
                    };
                    
                    impact.BlockingDependencies.Add(invoiceDependency);
                    impact.BlockingReasons.Add(
                        $"Vendor order has {invoices.Count} invoice(s) associated: {string.Join(", ", invoices.Select(vim => vim.InvoiceNo ?? $"Invoice #{vim.Id}"))}. Delete invoices first."
                    );
                    impact.CanDelete = false;
                }

                // Check for vendor receiving records
                var orderDetailIds = await _context.VendorOrderDetails
                    .Where(d => d.OrderID == orderId)
                    .Select(d => d.ID)
                    .ToListAsync();
                
                if (orderDetailIds.Any())
                {
                    var receivingRecords = await _context.VendorReceiving
                        .Where(vr => orderDetailIds.Contains(vr.VendorOrderDetailID) && vr.Tenantid == tenantId)
                        .ToListAsync();
                    
                    if (receivingRecords.Any())
                    {
                        var totalReceivedQty = receivingRecords.Sum(r => r.ReceivedQty);
                        impact.BlockingReasons.Add(
                            $"Vendor order has {receivingRecords.Count} receiving record(s) with {totalReceivedQty} total quantity received. Cannot delete order with receiving history."
                        );
                        impact.CanDelete = false;
                    }

                    // Check for vendor invoicing records (through VendorInvoicing)
                    var vendorInvoicingRecords = await _context.VendorInvoicing
                        .Where(vi => orderDetailIds.Contains(vi.VendorOrderDetailID) && vi.Tenantid == tenantId)
                        .ToListAsync();
                    
                    if (vendorInvoicingRecords.Any())
                    {
                        var totalInvoicedQty = vendorInvoicingRecords.Sum(vi => vi.InvoicedQty);
                        impact.BlockingReasons.Add(
                            $"Vendor order has {vendorInvoicingRecords.Count} invoicing record(s) with {totalInvoicedQty} total quantity invoiced. Delete related invoices first."
                        );
                        impact.CanDelete = false;
                    }
                }

                // If can delete, list what will be deleted
                if (impact.CanDelete)
                {
                    var detailCount = await _context.VendorOrderDetails
                        .CountAsync(d => d.OrderID == orderId);
                    if (detailCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Order Details",
                            Count = detailCount,
                            Description = $"{detailCount} line item(s) will be deleted"
                        });
                    }

                    var attachmentCount = await _context.VendorOrderAttachments
                        .CountAsync(a => a.OrderID == orderId);
                    if (attachmentCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Attachments",
                            Count = attachmentCount,
                            Description = $"{attachmentCount} attachment(s) will be deleted"
                        });
                    }

                    var commentCount = await _context.VendorOrderComments
                        .CountAsync(c => c.OrderID == orderId);
                    if (commentCount > 0)
                    {
                        impact.WillBeDeleted.Add(new ImpactedEntity
                        {
                            EntityType = "Comments",
                            Count = commentCount,
                            Description = $"{commentCount} comment(s) will be deleted"
                        });
                    }

                    var linkedQuotations = await GetVendorQuotationsLinkedToOrderAsync(order, tenantId);
                    var quotationsToRevert = new List<VendorQuotations>();
                    foreach (var quotation in linkedQuotations)
                    {
                        if (!await VendorQuotationHasOtherConvertedOrdersAsync(quotation, order.OrderID, tenantId))
                        {
                            quotationsToRevert.Add(quotation);
                        }
                    }

                    if (quotationsToRevert.Count > 0)
                    {
                        impact.WillBeAffected.Add(new ImpactedEntity
                        {
                            EntityType = "Vendor Quotation",
                            Count = quotationsToRevert.Count,
                            Description = quotationsToRevert.Count == 1
                                ? "The source quotation will be reverted from Converted"
                                : $"{quotationsToRevert.Count} source quotations will be reverted from Converted"
                        });
                    }

                    impact.Warnings.Add("This action cannot be undone");
                }

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteVendorOrder")]
        public async Task<IActionResult> DeleteVendorOrder(int orderId, int tenantId)
        {
            try
            {
                var order = await _context.VendorOrders
                    .FirstOrDefaultAsync(o => o.OrderID == orderId && o.Tenantid == tenantId);

                if (order == null)
                    return NotFound(new { error = "Vendor order not found" });

                await RevertVendorQuotationsForDeletedOrderAsync(order, tenantId);

                // Delete related records first to avoid foreign key constraint violations
                // 1. Delete attachments
                var attachments = await _context.VendorOrderAttachments
                    .Where(a => a.OrderID == orderId)
                    .ToListAsync();
                if (attachments.Any())
                {
                    _context.VendorOrderAttachments.RemoveRange(attachments);
                }

                // 2. Delete comments
                var comments = await _context.VendorOrderComments
                    .Where(c => c.OrderID == orderId)
                    .ToListAsync();
                if (comments.Any())
                {
                    _context.VendorOrderComments.RemoveRange(comments);
                }

                // 3. Delete details (this will cascade delete VendorReceiving and VendorInvoicing if configured)
                var details = await _context.VendorOrderDetails
                    .Where(d => d.OrderID == orderId)
                    .ToListAsync();
                if (details.Any())
                {
                    // Delete VendorReceiving records first
                    var detailIds = details.Select(d => d.ID).ToList();
                    var receivingRecords = await _context.VendorReceiving
                        .Where(vr => detailIds.Contains(vr.VendorOrderDetailID))
                        .ToListAsync();
                    if (receivingRecords.Any())
                    {
                        _context.VendorReceiving.RemoveRange(receivingRecords);
                    }

                    // Delete VendorInvoicing records
                    var invoicingRecords = await _context.VendorInvoicing
                        .Where(vi => detailIds.Contains(vi.VendorOrderDetailID))
                        .ToListAsync();
                    if (invoicingRecords.Any())
                    {
                        _context.VendorInvoicing.RemoveRange(invoicingRecords);
                    }

                    _context.VendorOrderDetails.RemoveRange(details);
                }

                _context.VendorOrders.Remove(order);

                await _context.SaveChangesAsync();

                return Ok(new { result = "Deleted successfully" });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"DeleteVendorOrder: EXCEPTION - {ex.Message}");
                Console.WriteLine($"DeleteVendorOrder: Stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    Console.WriteLine($"DeleteVendorOrder: Inner exception: {ex.InnerException.Message}");
                }
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        /// <summary>
        /// Find vendor quotations linked to this order via QuotationId or convertedOrderId
        /// (stored as PONumber, with OrderID as a fallback for older rows).
        /// </summary>
        private async Task<List<VendorQuotations>> GetVendorQuotationsLinkedToOrderAsync(VendorOrder order, int tenantId)
        {
            int? quotationId = order.QuotationId;
            int poNumber = order.PONumber;
            int orderPk = order.OrderID;

            return await _context.VendorQuotations
                .Where(q => q.Tenantid == tenantId &&
                    ((quotationId.HasValue && quotationId.Value > 0 && q.OrderID == quotationId.Value) ||
                     (q.convertedOrderId.HasValue && q.convertedOrderId.Value > 0 &&
                      (q.convertedOrderId.Value == poNumber || q.convertedOrderId.Value == orderPk))))
                .ToListAsync();
        }

        private async Task<bool> VendorQuotationHasOtherConvertedOrdersAsync(VendorQuotations quotation, int deletedOrderId, int tenantId)
        {
            return await _context.VendorOrders.AnyAsync(o =>
                o.Tenantid == tenantId &&
                o.OrderID != deletedOrderId &&
                o.QuotationId.HasValue &&
                o.QuotationId.Value == quotation.OrderID);
        }

        private async Task RevertVendorQuotationsForDeletedOrderAsync(VendorOrder order, int tenantId)
        {
            var linkedQuotations = await GetVendorQuotationsLinkedToOrderAsync(order, tenantId);
            foreach (var quotation in linkedQuotations)
            {
                if (await VendorQuotationHasOtherConvertedOrdersAsync(quotation, order.OrderID, tenantId))
                {
                    continue;
                }

                quotation.convertedOrderId = null;
                var wasConverted = quotation.isconverted == 1
                    || (quotation.Status ?? "").IndexOf("convert", StringComparison.OrdinalIgnoreCase) >= 0;
                quotation.isconverted = 0;
                if (wasConverted)
                {
                    quotation.Status = quotation.isSent ? "Sent" : "Draft";
                }
            }
        }

        [HttpGet("GetOrdersForReceiving")]
        public async Task<IActionResult> GetOrdersForReceiving([FromQuery] int tenantId)
        {
            try
            {
                var orders = await _context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.Tenantid == tenantId && (o.Status == "Sent" || o.Status == "Partially Received"))
                    .OrderByDescending(o => o.OrderDate)
                    .Select(o => new
                    {
                        orderID = o.OrderID,
                        orderNumber = o.PONumber,
                        vendorID = o.VendorID,
                        vendorCode = o.VendorCode ?? "",
                        vendorName = o.VendorName ?? "",
                        orderDate = o.OrderDate,
                        status = o.Status ?? "Draft",
                        locationId = o.LocationId
                    })
                    .ToListAsync();

                if (orders.Count == 0)
                    return Ok(new { result = orders });

                var orderIds = orders.Select(o => o.orderID).ToList();

                var allDetails = await _context.VendorOrderDetails
                    .AsNoTracking()
                    .Where(d => orderIds.Contains(d.OrderID) && d.Tenantid == tenantId)
                    .Select(d => new { d.ID, d.OrderID, d.QtyOrdered })
                    .ToListAsync();

                var receivingStats = allDetails.Count == 0
                    ? new Dictionary<int, int>()
                    : await _context.VendorReceiving
                        .AsNoTracking()
                        .Where(r => r.Tenantid == tenantId && orderIds.Contains(r.VendorOrderDetail.OrderID))
                        .GroupBy(r => r.VendorOrderDetailID)
                        .Select(g => new { detailID = g.Key, totalReceivedQty = g.Sum(r => r.ReceivedQty) })
                        .ToDictionaryAsync(x => x.detailID, x => x.totalReceivedQty);

                var detailsByOrder = allDetails.ToLookup(d => d.OrderID);

                var ordersWithStats = orders.Select(o =>
                {
                    var totalOrdered = 0;
                    var totalReceived = 0;
                    var totalItems = 0;
                    bool allComplete = true;
                    bool anyReceived = false;

                    foreach (var detail in detailsByOrder[o.orderID])
                    {
                        var detailReceived = receivingStats.TryGetValue(detail.ID, out var qty) ? qty : 0;
                        totalItems++;
                        totalOrdered += detail.QtyOrdered;
                        totalReceived += detailReceived;
                        if (detailReceived > 0) anyReceived = true;
                        if (detailReceived < detail.QtyOrdered) allComplete = false;
                    }

                    string recalculatedStatus;
                    if (allComplete && anyReceived)
                        recalculatedStatus = "Fully Received";
                    else if (anyReceived)
                        recalculatedStatus = "Partially Received";
                    else
                        recalculatedStatus = "Sent";

                    return new
                    {
                        o.orderID,
                        o.orderNumber,
                        o.vendorID,
                        o.vendorCode,
                        o.vendorName,
                        o.orderDate,
                        status = recalculatedStatus,
                        o.locationId,
                        totalItems,
                        totalOrdered,
                        totalReceived,
                        totalPending = totalOrdered - totalReceived
                    };
                }).ToList();

                return Ok(new { result = ordersWithStats });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetOrdersForReceiving: EXCEPTION - {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetOrderForReceiving")]
        public async Task<IActionResult> GetOrderForReceiving([FromQuery] int orderId, [FromQuery] int tenantId)
        {
            try
            {
                var order = await _context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.OrderID == orderId && o.Tenantid == tenantId)
                    .FirstOrDefaultAsync();

                if (order == null)
                    return NotFound(new { error = "Vendor order not found" });

                // Get order details — only fields the receiving UI needs
                var details = await _context.VendorOrderDetails
                    .AsNoTracking()
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .OrderBy(d => d.ItemNo)
                    .Select(d => new
                    {
                        d.ID,
                        d.ItemNo,
                        d.PartName,
                        d.PartNo,
                        d.LineType,
                        d.DueDate,
                        d.DueDateDateTime,
                        d.JobNumber,
                        d.JobDesc,
                        d.JobId,
                        d.ProductId,
                        d.RawMaterialId,
                        d.QtyOrdered,
                        d.ReceivedQty,
                        d.Unit,
                        d.UnitPrice
                    })
                    .ToListAsync();

                var detailIds = details.Select(d => d.ID).ToList();

                var receivedQtyByDetail = detailIds.Count == 0
                    ? new Dictionary<int, int>()
                    : await _context.VendorReceiving
                        .AsNoTracking()
                        .Where(r => detailIds.Contains(r.VendorOrderDetailID) && r.Tenantid == tenantId)
                        .GroupBy(r => r.VendorOrderDetailID)
                        .Select(g => new { Id = g.Key, Qty = g.Sum(r => r.ReceivedQty) })
                        .ToDictionaryAsync(x => x.Id, x => x.Qty);

                var detailsWithReceiving = details.Select(d =>
                {
                    var receivedQty = receivedQtyByDetail.ContainsKey(d.ID) ? receivedQtyByDetail[d.ID] : (d.ReceivedQty ?? 0);
                    var pendingQty = d.QtyOrdered - receivedQty;
                    string receivedStatus = "Pending";
                    if (receivedQty > 0)
                    {
                        receivedStatus = receivedQty >= d.QtyOrdered ? "Complete" : "Partial";
                    }

                    return new
                    {
                        id = d.ID,
                        itemNo = d.ItemNo,
                        partName = d.PartName ?? "",
                        partNo = d.PartNo ?? "",
                        lineType = NormalizeVendorOrderLineType(d.LineType, order.MaterialType),
                        dueDate = !string.IsNullOrEmpty(d.DueDate) ? d.DueDate : d.DueDateDateTime.ToString("yyyy-MM-dd"),
                        jobNumber = d.JobNumber ?? "",
                        jobDesc = d.JobDesc ?? "",
                        jobId = d.JobId,
                        productId = d.ProductId,
                        rawMaterialId = d.RawMaterialId,
                        qtyOrdered = d.QtyOrdered,
                        receivedQty = receivedQty,
                        pendingQty = pendingQty,
                        unit = d.Unit ?? "",
                        unitPrice = d.UnitPrice,
                        receivedStatus = receivedStatus
                    };
                }).ToList();

                var result = new
                {
                    orderID = order.OrderID,
                    orderNumber = order.PONumber,
                    vendorID = order.VendorID,
                    vendorCode = order.VendorCode ?? "",
                    vendorName = order.VendorName ?? "",
                    orderDate = order.OrderDate,
                    status = order.Status ?? "Draft",
                    locationId = order.LocationId,
                    details = detailsWithReceiving
                };

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetOrderForReceiving: EXCEPTION - {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("ReceiveLineItem")]
        public async Task<IActionResult> ReceiveLineItem([FromBody] JsonElement receivingData)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                int tenantId = receivingData.TryGetProperty("tenantid", out JsonElement tenantElem) ? tenantElem.GetInt32() : 0;
                int orderDetailId = receivingData.TryGetProperty("orderDetailId", out JsonElement detailElem) ? detailElem.GetInt32() : 0;
                int receivedQty = receivingData.TryGetProperty("receivedQty", out JsonElement qtyElem) ? qtyElem.GetInt32() : 0;
                DateTime receivedDate = receivingData.TryGetProperty("receivedDate", out JsonElement dateElem) && dateElem.ValueKind == JsonValueKind.String
                    ? DateTime.Parse(dateElem.GetString())
                    : DateTime.UtcNow;
                int? locationId = receivingData.TryGetProperty("locationId", out JsonElement locElem) && locElem.ValueKind == JsonValueKind.Number
                    ? locElem.GetInt32()
                    : null;
                string notes = receivingData.TryGetProperty("notes", out JsonElement notesElem) ? notesElem.GetString() ?? "" : "";
                string? lotNumber = receivingData.TryGetProperty("lotNumber", out JsonElement lotElem) && lotElem.ValueKind == JsonValueKind.String
                    ? lotElem.GetString()
                    : null;

                if (orderDetailId <= 0 || receivedQty <= 0)
                {
                    return BadRequest(new { error = "Order detail ID and received quantity are required" });
                }

                // Get the order detail
                var orderDetail = await _context.VendorOrderDetails
                    .Where(d => d.ID == orderDetailId && d.Tenantid == tenantId)
                    .FirstOrDefaultAsync();

                if (orderDetail == null)
                {
                    return NotFound(new { error = "Order detail not found" });
                }

                // Get current total received quantity from transactions
                var currentReceivedTotal = await _context.VendorReceiving
                    .Where(r => r.VendorOrderDetailID == orderDetailId && r.Tenantid == tenantId)
                    .SumAsync(r => (int?)r.ReceivedQty) ?? 0;

                // Also consider the ReceivedQty field if it exists
                if (orderDetail.ReceivedQty.HasValue && orderDetail.ReceivedQty.Value > currentReceivedTotal)
                {
                    currentReceivedTotal = orderDetail.ReceivedQty.Value;
                }

                var newTotal = currentReceivedTotal + receivedQty;

                // Validate that we're not receiving more than ordered
                if (newTotal > orderDetail.QtyOrdered)
                {
                    return BadRequest(new { error = $"Cannot receive {receivedQty}. Total received would be {newTotal}, but only {orderDetail.QtyOrdered} was ordered. Pending quantity: {orderDetail.QtyOrdered - currentReceivedTotal}" });
                }

                // Get user ID from header
                int userId = GetUserId() ?? 0;

                // Create receiving transaction
                var receiving = new VendorReceiving
                {
                    VendorOrderDetailID = orderDetailId,
                    ReceivedQty = receivedQty,
                    ReceivedDate = receivedDate,
                    ReceivedBy = userId,
                    LocationId = locationId,
                    Notes = notes,
                    Tenantid = tenantId
                };

                _context.VendorReceiving.Add(receiving);

                // Update order detail ReceivedQty and status
                orderDetail.ReceivedQty = newTotal;
                if (newTotal >= orderDetail.QtyOrdered)
                {
                    orderDetail.Received = "Complete";
                }
                else if (newTotal > 0)
                {
                    orderDetail.Received = "Partial";
                }
                else
                {
                    orderDetail.Received = "Pending";
                }

                _context.VendorOrderDetails.Update(orderDetail);

                // Update order status if needed
                var order = await _context.VendorOrders
                    .Where(o => o.OrderID == orderDetail.OrderID && o.Tenantid == tenantId)
                    .FirstOrDefaultAsync();

                if (order != null)
                {
                    var allDetails = await _context.VendorOrderDetails
                        .Where(d => d.OrderID == order.OrderID && d.Tenantid == tenantId)
                        .ToListAsync();

                    var allReceivedTotals = await _context.VendorReceiving
                        .Where(r => allDetails.Select(d => d.ID).Contains(r.VendorOrderDetailID) && r.Tenantid == tenantId)
                        .GroupBy(r => r.VendorOrderDetailID)
                        .ToDictionaryAsync(g => g.Key, g => g.Sum(r => r.ReceivedQty));

                    bool allComplete = true;
                    bool anyReceived = false;

                    foreach (var detail in allDetails)
                    {
                        // Use only VendorReceiving transactions as source of truth, not the legacy ReceivedQty field
                        var detailReceived = allReceivedTotals.ContainsKey(detail.ID) ? allReceivedTotals[detail.ID] : 0;
                        if (detailReceived > 0) anyReceived = true;
                        if (detailReceived < detail.QtyOrdered) allComplete = false;
                    }

                    if (allComplete && anyReceived)
                    {
                        order.Status = "Fully Received";
                    }
                    else if (anyReceived)
                    {
                        order.Status = "Partially Received";
                    }
                    // Keep existing status if no items received yet
                    // Note: No need to call Update() - entity is already tracked, EF Core change tracking will detect Status change
                }

                await _context.SaveChangesAsync();

                // Inventory:
                // - Stock buy (not job-tied): book RawMaterial or FinishedProduct onto the shelf.
                // - Job-tied buy (Phase 3): receive then immediately issue to the job (never stays on-hand).
                // - Service / Subcontract / Tool / Other: never touch inventory.
                var lineType = NormalizeVendorOrderLineType(orderDetail.LineType, order?.MaterialType);
                var isJobTied = IsVendorOrderLineJobTied(orderDetail);

                int? bookProductId = null;
                int? bookRawMaterialId = null;

                if (string.Equals(lineType, "RawMaterial", StringComparison.OrdinalIgnoreCase))
                {
                    if (orderDetail.RawMaterialId.HasValue && orderDetail.RawMaterialId.Value > 0)
                    {
                        bookRawMaterialId = orderDetail.RawMaterialId;
                    }
                    else
                    {
                        var ensuredRmId = await RawMaterialCatalog.EnsureAsync(
                            _context,
                            tenantId,
                            orderDetail.PartNo,
                            orderDetail.PartName,
                            orderDetail.Unit,
                            orderDetail.UnitPrice,
                            order?.VendorID > 0 ? order.VendorID : (int?)null);
                        if (ensuredRmId.HasValue && ensuredRmId.Value > 0)
                        {
                            orderDetail.RawMaterialId = ensuredRmId;
                            orderDetail.ProductId = null;
                            bookRawMaterialId = ensuredRmId;
                        }
                    }
                }
                else if (string.Equals(lineType, "FinishedProduct", StringComparison.OrdinalIgnoreCase))
                {
                    if (orderDetail.ProductId.HasValue && orderDetail.ProductId.Value > 0)
                    {
                        bookProductId = orderDetail.ProductId;
                    }
                    else
                    {
                        var ensuredId = await ProductSourcing.EnsureFinishedProductAsync(
                            _context,
                            tenantId,
                            orderDetail.PartNo,
                            orderDetail.PartName,
                            orderDetail.Unit,
                            orderDetail.UnitPrice,
                            ProductSourcing.Buy);
                        if (ensuredId.HasValue && ensuredId.Value > 0)
                        {
                            orderDetail.ProductId = ensuredId;
                            bookProductId = ensuredId;
                        }
                    }
                }
                else if (orderDetail.ProductId.HasValue
                         && orderDetail.ProductId.Value > 0
                         && !orderDetail.RawMaterialId.HasValue
                         && !string.Equals(lineType, "Service", StringComparison.OrdinalIgnoreCase)
                         && !string.Equals(lineType, "Subcontract", StringComparison.OrdinalIgnoreCase)
                         && !string.Equals(lineType, "Tool", StringComparison.OrdinalIgnoreCase)
                         && !string.Equals(lineType, "Other", StringComparison.OrdinalIgnoreCase))
                {
                    bookProductId = orderDetail.ProductId;
                }

                if (bookProductId.HasValue || bookRawMaterialId.HasValue)
                {
                    var effectiveLocationId = locationId ?? order?.LocationId;
                    if (!effectiveLocationId.HasValue || effectiveLocationId.Value <= 0)
                    {
                        await transaction.RollbackAsync();
                        return BadRequest(new
                        {
                            error = isJobTied
                                ? "Location is required to record job material from this receive. Select a receiving location or set the PO location."
                                : "Location is required to receive stock into inventory. Select a receiving location or set the PO location."
                        });
                    }

                    var (invSuccess, invError) = await _inventoryService.ReceiveStockInTransactionAsync(
                        tenantId,
                        productId: bookProductId,
                        rawMaterialId: bookRawMaterialId,
                        effectiveLocationId.Value,
                        receivedQty,
                        "VendorReceiving",
                        receiving.ID,
                        lotId: null,
                        userId > 0 ? userId : (int?)null,
                        string.IsNullOrEmpty(notes) ? null : notes,
                        lotNumber);

                    if (!invSuccess)
                    {
                        await transaction.RollbackAsync();
                        return BadRequest(new { error = $"Receiving saved but inventory update failed: {invError}" });
                    }

                    if (isJobTied)
                    {
                        var jobOrderId = await ResolveJobOrderIdForInventoryAsync(tenantId, orderDetail);
                        var jobLabel = !string.IsNullOrWhiteSpace(orderDetail.JobNumber)
                            ? orderDetail.JobNumber.Trim()
                            : (jobOrderId.HasValue ? $"JO#{jobOrderId.Value}" : "job");
                        var (issueOk, issueErr) = await _inventoryService.IssueStockInTransactionAsync(
                            tenantId,
                            productId: bookProductId,
                            rawMaterialId: bookRawMaterialId,
                            effectiveLocationId.Value,
                            receivedQty,
                            "JobOrder",
                            jobOrderId,
                            userId > 0 ? userId : (int?)null,
                            $"Used on {jobLabel} from vendor receive",
                            allowShortage: false,
                            lotId: null,
                            lotNumber: lotNumber);

                        if (!issueOk)
                        {
                            await transaction.RollbackAsync();
                            return BadRequest(new { error = $"Receiving saved but job consumption failed: {issueErr}" });
                        }
                    }

                    await _context.SaveChangesAsync();
                }

                await transaction.CommitAsync();

                return Ok(new { 
                    result = new { 
                        success = true,
                        receivingId = receiving.ID,
                        newTotalReceived = newTotal,
                        message = "Items received successfully"
                    } 
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                Console.WriteLine($"ReceiveLineItem: EXCEPTION - {ex.Message}");
                Console.WriteLine($"ReceiveLineItem: Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("RecalculateVendorOrderStatuses")]
        public async Task<IActionResult> RecalculateVendorOrderStatuses(int tenantId)
        {
            try
            {
                // Get all vendor orders that might need status updates
                var orders = await _context.VendorOrders
                    .Where(o => o.Tenantid == tenantId &&
                               (o.Status == "Sent" || o.Status == "Partially Received" || o.Status == "Fully Received"))
                    .ToListAsync();

                int updatedCount = 0;

                foreach (var order in orders)
                {
                    // Get all details for this order
                    var orderDetails = await _context.VendorOrderDetails
                        .Where(d => d.OrderID == order.OrderID && d.Tenantid == tenantId)
                        .ToListAsync();

                    // Calculate received quantities from VendorReceiving transactions
                    var receivedTotals = await _context.VendorReceiving
                        .Where(r => orderDetails.Select(d => d.ID).Contains(r.VendorOrderDetailID) && r.Tenantid == tenantId)
                        .GroupBy(r => r.VendorOrderDetailID)
                        .ToDictionaryAsync(g => g.Key, g => g.Sum(r => r.ReceivedQty));

                    bool allComplete = true;
                    bool anyReceived = false;

                    foreach (var detail in orderDetails)
                    {
                        var detailReceived = receivedTotals.ContainsKey(detail.ID) ? receivedTotals[detail.ID] : 0;
                        if (detailReceived > 0) anyReceived = true;
                        if (detailReceived < detail.QtyOrdered) allComplete = false;
                    }

                    string newStatus;
                    if (allComplete && anyReceived)
                    {
                        newStatus = "Fully Received";
                    }
                    else if (anyReceived)
                    {
                        newStatus = "Partially Received";
                    }
                    else
                    {
                        newStatus = "Sent"; // Keep as Sent if nothing received
                    }

                    if (order.Status != newStatus)
                    {
                        Console.WriteLine($"Recalculating status for Order {order.OrderID}: '{order.Status}' -> '{newStatus}'");
                        order.Status = newStatus;
                        updatedCount++;
                    }
                }

                await _context.SaveChangesAsync();

                return Ok(new {
                    success = true,
                    message = $"Status recalculation completed. Updated {updatedCount} orders.",
                    updatedCount
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"RecalculateVendorOrderStatuses: EXCEPTION - {ex.Message}");
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetReceivingHistory")]
        public async Task<IActionResult> GetReceivingHistory([FromQuery] int orderDetailId, [FromQuery] int tenantId)
        {
            try
            {
                var receivingHistory = await _context.VendorReceiving
                    .AsNoTracking()
                    .Where(r => r.VendorOrderDetailID == orderDetailId && r.Tenantid == tenantId)
                    .OrderByDescending(r => r.ReceivedDate)
                    .Select(r => new
                    {
                        id = r.ID,
                        receivedQty = r.ReceivedQty,
                        receivedDate = r.ReceivedDate,
                        receivedBy = r.ReceivedBy,
                        locationId = r.LocationId,
                        notes = r.Notes ?? ""
                    })
                    .ToListAsync();

                return Ok(new { result = receivingHistory });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetReceivingHistory: EXCEPTION - {ex.Message}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetInvoiceableItemsForVendorOrder/{orderId}")]
        public async Task<IActionResult> GetInvoiceableItemsForVendorOrder(int orderId)
        {
            try
            {
                var tenantId = GetTenantId();
                Console.WriteLine($"GetInvoiceableItemsForVendorOrder called - TenantId: {tenantId}, OrderId: {orderId}");

                var detailsList = await _context.VendorOrderDetails
                    .AsNoTracking()
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .ToListAsync();

                Console.WriteLine($"Found {detailsList.Count} order details for vendor order {orderId}");

                // Calculate received quantities from VendorReceiving transactions
                var orderDetailIds = detailsList.Select(d => d.ID).ToList();
                var receivedTotals = await _context.VendorReceiving
                    .AsNoTracking()
                    .Where(r => orderDetailIds.Contains(r.VendorOrderDetailID) && r.Tenantid == tenantId)
                    .GroupBy(r => r.VendorOrderDetailID)
                    .ToDictionaryAsync(g => g.Key, g => g.Sum(r => r.ReceivedQty));

                // Calculate invoiced quantities from VendorInvoicing transactions
                var invoicedTotals = await _context.VendorInvoicing
                    .AsNoTracking()
                    .Where(i => orderDetailIds.Contains(i.VendorOrderDetailID) && i.Tenantid == tenantId)
                    .GroupBy(i => i.VendorOrderDetailID)
                    .ToDictionaryAsync(g => g.Key, g => g.Sum(i => i.InvoicedQty));

                var invoiceableItems = detailsList.Select(d => {
                    var receivedQty = receivedTotals.ContainsKey(d.ID) ? receivedTotals[d.ID] : (d.ReceivedQty ?? 0);
                    var invoicedQty = invoicedTotals.ContainsKey(d.ID) ? invoicedTotals[d.ID] : d.InvoicedQty;
                    var availableToInvoice = receivedQty - invoicedQty;

                    return new
                    {
                        id = d.ID,
                        itemNo = d.ItemNo,
                        partNo = d.PartNo ?? "",
                        partName = d.PartName ?? "",
                        qtyOrdered = d.QtyOrdered,
                        receivedQty = receivedQty,
                        invoicedQty = invoicedQty,
                        availableQty = Math.Max(0, availableToInvoice),
                        invoiceStatus = d.InvoiceStatus ?? "Not Invoiced",
                        unitPrice = d.UnitPrice,
                        discount = d.Discount
                    };
                }).ToList();

                var itemsWithAvailableQty = invoiceableItems.Where(i => i.availableQty > 0).ToList();
                Console.WriteLine($"Found {itemsWithAvailableQty.Count} items with available quantity to invoice out of {invoiceableItems.Count} total items");

                return Ok(new { result = invoiceableItems });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetInvoiceableItemsForVendorOrder: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("CreateVendorInvoice")]
        public async Task<IActionResult> CreateVendorInvoice([FromBody] CreateVendorInvoiceFromOrderRequest request)
        {
            using (var transaction = await _context.Database.BeginTransactionAsync())
            {
                try
                {
                    var tenantId = GetTenantId();
                    var userId = GetUserId() ?? 0;
                    Console.WriteLine($"CreateVendorInvoice called - TenantId: {tenantId}, OrderId: {request.OrderId}, InvoiceNo: {request.InvoiceNo}");

                    // Get the vendor order
                    var vendorOrder = await _context.VendorOrders
                        .Where(o => o.OrderID == request.OrderId && o.Tenantid == tenantId)
                        .FirstOrDefaultAsync();

                    if (vendorOrder == null)
                        return NotFound(new { error = "Vendor order not found" });

                    var invoiceDateValue = request.InvoiceDate ?? DateTime.Now;
                    var dueDateValue = request.DueDate ?? invoiceDateValue.AddDays(30);
                    var accountingPeriod = $"{invoiceDateValue:yyyyMM}";

                    var accountsPayableAccountId = GlAccountResolutionService.ResolveAccountsPayable(
                        _context, tenantId, vendorOrder.VendorID);
                    if (!accountsPayableAccountId.HasValue)
                        return BadRequest(new { error = "Unable to determine Accounts Payable GL account. Set Default Accounts Payable in Accounting Setup, configure vendor AP mapping, or add an active AP account." });

                    var defaultExpenseAccountId = GlAccountResolutionService.ResolveDefaultExpense(
                        _context, tenantId, vendorOrder.VendorID);
                    if (!defaultExpenseAccountId.HasValue)
                        return BadRequest(new { error = "Unable to determine an Expense GL account. Set Default Expense in Accounting Setup or add an active Expense account in Chart of Accounts." });

                    var periodKey = GlWorkflowService.TryNormalizePeriodKey(accountingPeriod, out var normalizedPeriod, out _)
                        ? normalizedPeriod
                        : GlWorkflowService.PeriodKeyFromDate(invoiceDateValue);
                    if (GlWorkflowService.IsPeriodLocked(_context, tenantId, periodKey))
                        return BadRequest(new { error = $"Accounting period {periodKey} is closed. Open the period or choose another invoice date." });

                    // Validate all line items can be invoiced
                    foreach (var item in request.LineItems)
                    {
                        var detail = await _context.VendorOrderDetails
                            .FirstOrDefaultAsync(d => d.ID == item.OrderDetailId && d.Tenantid == tenantId);

                        if (detail == null)
                            return BadRequest(new { error = $"Order detail {item.OrderDetailId} not found" });

                        // Check if received quantity >= invoiced quantity + requested quantity
                        var receivedQty = await GetReceivedQtyForVendorOrderDetail(detail.ID, tenantId);
                        var alreadyInvoiced = await GetInvoicedQtyForVendorOrderDetail(detail.ID, tenantId);
                        var availableToInvoice = receivedQty - alreadyInvoiced;

                        if (item.QtyToInvoice > availableToInvoice)
                            return BadRequest(new { error = $"Cannot invoice {item.QtyToInvoice} units of item {detail.ItemNo}. Only {availableToInvoice} available to invoice (received: {receivedQty}, already invoiced: {alreadyInvoiced})." });

                        if (item.QtyToInvoice <= 0)
                            return BadRequest(new { error = $"Quantity to invoice must be greater than 0 for item {detail.ItemNo}" });
                    }

                    // Calculate totals (Amount = net, TotalAmount = gross including tax)
                    decimal subtotal = 0;
                    foreach (var item in request.LineItems)
                    {
                        var lineTotal = (item.UnitPrice * item.QtyToInvoice) * (1 - item.Discount / 100);
                        subtotal += lineTotal;
                    }
                    subtotal = Math.Round(subtotal, 2);

                    var taxRate = request.TaxRate ?? 0m;
                    if (taxRate < 0m || taxRate > 100m)
                        return BadRequest(new { error = "Tax rate must be between 0 and 100." });

                    var taxAmount = GlAccountResolutionService.ResolveTaxAmount(
                        subtotal, taxRate, request.TaxAmount);
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
                    var vendorInvoice = new VendorInvoiceMaster
                    {
                        TenantId = tenantId,
                        locationId = vendorOrder.LocationId ?? 0,
                        InvoiceNo = request.InvoiceNo ?? "",
                        PaymentMethod = request.PaymentMethod ?? "",
                        InvoiceDate = invoiceDateValue,
                        DueDate = dueDateValue,
                        VendorCode = vendorOrder.VendorCode ?? "",
                        VendorName = vendorOrder.VendorName ?? "",
                        AccountingPeriod = accountingPeriod,
                        Amount = subtotal,
                        FreightCharge = freightCharge,
                        TotalAmount = Math.Round(subtotal + taxAmount + freightCharge, 2),
                        PaidAmount = 0,
                        Approved = false,
                        CkNo = "",
                        Series = "",
                        iscustomer = false,
                        entrytype = "Invoice",
                        vid = vendorOrder.VendorID,
                        Adj = "",
                        isPaid = 0,
                        prefixinvoiceno = request.InvoiceNo ?? "",
                        createdby = userId,
                        entrydate = DateTime.Now
                    };

                    _context.VendorInvoiceMaster.Add(vendorInvoice);
                    await _context.SaveChangesAsync();

                    var expensePostings = new List<(int AccountId, decimal Amount)>();

                    // Create invoice details and invoicing transactions
                    foreach (var item in request.LineItems)
                    {
                        var detail = await _context.VendorOrderDetails
                            .FirstAsync(d => d.ID == item.OrderDetailId && d.Tenantid == tenantId);

                        var lineTotal = (item.UnitPrice * item.QtyToInvoice) * (1 - item.Discount / 100);
                        var expenseAccountId = GlAccountResolutionService.ResolveExpenseFromGlCode(
                            _context, tenantId, detail.glcode, defaultExpenseAccountId.Value);
                        expensePostings.Add((expenseAccountId, lineTotal));

                        // Create VendorInvoiceDetail
                        var invoiceDetail = new VendorInvoiceDetail
                        {
                            InvoiceId = vendorInvoice.Id,
                            OrderId = request.OrderId,
                            VendorOrderDetailID = item.OrderDetailId,
                            OrderDate = vendorOrder.OrderDate,
                            Description = $"{detail.PartName ?? ""} - {detail.PartNo ?? ""}".Trim(' ', '-'),
                            VendorPoNumber = vendorOrder.VendorPoNumber ?? "",
                            Amount = lineTotal,
                            qty = item.QtyToInvoice,
                            price = item.UnitPrice,
                            qtyordered = detail.QtyOrdered,
                            accountid = expenseAccountId,
                            ReconcileCL = ""
                        };

                        _context.VendorInvoiceDetail.Add(invoiceDetail);
                        await _context.SaveChangesAsync();

                        // Create VendorInvoicing transaction
                        var invoicing = new VendorInvoicing
                        {
                            VendorInvoiceDetailID = invoiceDetail.Id,
                            VendorOrderDetailID = item.OrderDetailId,
                            InvoicedQty = item.QtyToInvoice,
                            InvoicedDate = DateTime.Now,
                            InvoicedBy = userId,
                            LocationId = vendorOrder.LocationId,
                            Notes = request.Notes ?? "",
                            Tenantid = tenantId
                        };

                        _context.VendorInvoicing.Add(invoicing);

                        // Update VendorOrderDetail
                        var totalInvoiced = await GetInvoicedQtyForVendorOrderDetail(detail.ID, tenantId) + item.QtyToInvoice;
                        detail.InvoicedQty = totalInvoiced;

                        if (totalInvoiced >= detail.QtyOrdered)
                            detail.InvoiceStatus = "Fully Invoiced";
                        else if (totalInvoiced > 0)
                            detail.InvoiceStatus = "Partially Invoiced";
                        else
                            detail.InvoiceStatus = "Not Invoiced";
                    }

                    var postingRef = BuildAutoPostingReference("APBILL", vendorInvoice.prefixinvoiceno ?? vendorInvoice.InvoiceNo, vendorInvoice.Id);
                    var postingDesc = $"Auto-posted vendor invoice {vendorInvoice.prefixinvoiceno ?? vendorInvoice.InvoiceNo}";
                    var journalHeader = new JournalEntry
                    {
                        EntryDate = vendorInvoice.InvoiceDate.Date,
                        ReferenceNumber = postingRef,
                        Description = postingDesc,
                        AccountingPeriod = periodKey,
                        TenantId = tenantId,
                        locationId = vendorInvoice.locationId > 0 ? vendorInvoice.locationId : 1,
                        createdby = userId,
                        createdDate = DateTime.UtcNow
                    };
                    _context.JournalEntries.Add(journalHeader);
                    await _context.SaveChangesAsync();

                    foreach (var group in expensePostings
                        .Where(x => x.Amount > 0)
                        .GroupBy(x => x.AccountId)
                        .Select(g => new { AccountId = g.Key, Amount = g.Sum(x => x.Amount) }))
                    {
                        _context.JournalEntryFrom.Add(new JournalDetailsFrom
                        {
                            JournalEntryId = journalHeader.Id,
                            AccountId = group.AccountId,
                            Amount = group.Amount,
                            Description = postingDesc
                        });
                    }

                    // Dr Input Tax / Freight In when present; Cr AP for gross TotalAmount.
                    if (taxAmount > 0m)
                    {
                        var inputTaxAccountId = GlAccountResolutionService.ResolveInputTax(_context, tenantId);
                        _context.JournalEntryFrom.Add(new JournalDetailsFrom
                        {
                            JournalEntryId = journalHeader.Id,
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
                            JournalEntryId = journalHeader.Id,
                            AccountId = freightInAccountId!.Value,
                            Amount = freightCharge,
                            Description = $"{postingDesc} (freight)"
                        });
                    }

                    _context.JournalEntryTo.Add(new JournalDetailsTo
                    {
                        JournalEntryId = journalHeader.Id,
                        AccountId = accountsPayableAccountId.Value,
                        Amount = vendorInvoice.TotalAmount,
                        Description = postingDesc
                    });

                    GlWorkflowService.AddAudit(_context, tenantId, "VendorInvoiceAutoPost", userId, journalHeader.Id, null, periodKey, postingRef);

                    // Update order status if needed
                    await UpdateVendorOrderInvoiceStatus(request.OrderId, tenantId);

                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();

                    return Ok(new { result = new { invoiceId = vendorInvoice.Id, invoiceNumber = vendorInvoice.InvoiceNo, message = "Vendor invoice created successfully" } });
                }
                catch (Exception ex)
                {
                    await transaction.RollbackAsync();
                    Console.WriteLine($"Error in CreateVendorInvoice: {ex.Message}");
                    Console.WriteLine($"Stack trace: {ex.StackTrace}");
                    return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
                }
            }
        }

        [HttpGet("GetAllVendorInvoices")]
        public async Task<IActionResult> GetAllVendorInvoices([FromQuery] int tenantId, [FromQuery] string status = "All", [FromQuery] string searchTerm = "", [FromQuery] int? vendorId = null, [FromQuery] string dateRange = "Last 30 Days")
        {
            try
            {
                Console.WriteLine($"GetAllVendorInvoices called - TenantId: {tenantId}, Status: {status}, DateRange: {dateRange}");

                // Get real vendor invoices from database
                var invoices = await _context.VendorInvoiceMaster
                    .AsNoTracking()
                    .Where(i => i.TenantId == tenantId)
                    .Join(_context.VendorInvoiceDetail,
                        master => master.Id,
                        detail => detail.InvoiceId,
                        (master, detail) => new { Master = master, Detail = detail })
                    .GroupBy(x => x.Master)
                    .Select(g => new
                    {
                        Invoice = g.Key,
                        TotalAmount = g.Sum(x => x.Detail.Amount),
                        OrderIds = g.Select(x => x.Detail.OrderId).Distinct().ToList()
                    })
                    .ToListAsync();

                // Get PONumbers for the order IDs (OrderId field contains internal OrderID, need to lookup PONumber)
                var orderIds = invoices.SelectMany(i => i.OrderIds).Distinct().ToList();

                // Debug: Check all orders in the database for this tenant
                var allTenantOrders = await _context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.Tenantid == tenantId)
                    .OrderBy(o => o.OrderID)
                    .Take(10)
                    .ToListAsync();

                Console.WriteLine($"All vendor orders for tenant {tenantId}:");
                foreach (var order in allTenantOrders)
                {
                    Console.WriteLine($"  OrderID {order.OrderID} -> PONumber {order.PONumber} -> Status {order.Status}");
                }

                var orderMappings = await _context.VendorOrders
                    .AsNoTracking()
                    .Where(o => orderIds.Contains(o.OrderID) && o.Tenantid == tenantId)
                    .Select(o => new { OrderID = o.OrderID, PONumber = o.PONumber })
                    .ToDictionaryAsync(o => o.OrderID, o => o.PONumber);

                Console.WriteLine($"Order ID to PONumber mappings found: {orderMappings.Count}");
                foreach (var kvp in orderMappings)
                {
                    Console.WriteLine($"  OrderID {kvp.Key} -> PONumber {kvp.Value}");
                }

                Console.WriteLine($"GetAllVendorInvoices - Found {invoices.Count} invoices with details");

                // Debug: Log order IDs for each invoice
                foreach (var invoice in invoices.Take(5))
                {
                    var orderId = invoice.OrderIds.Count == 1 ? invoice.OrderIds[0] : 0;
                    var mappedPONumber = orderMappings.ContainsKey(orderId) ? orderMappings[orderId] : orderId;
                    Console.WriteLine($"  Invoice {invoice.Invoice.InvoiceNo}: Internal OrderId = {orderId}, Mapped PONumber = {mappedPONumber}");
                }

                // Convert to the expected format
                var now = DateTime.Now;
                var invoiceSummaries = new List<dynamic>();

                foreach (var invoice in invoices.OrderByDescending(x => x.Invoice.InvoiceDate))
                {
                    var orderId = invoice.OrderIds.Count == 1 ? invoice.OrderIds[0] : 0;
                    var hasMapping = orderMappings.ContainsKey(orderId);
                    var mappedPONumber = hasMapping ? orderMappings[orderId] : orderId;
                    // Apply the +1000 offset to get the actual order number
                    var actualOrderNumber = mappedPONumber < 1000 ? mappedPONumber + 999 : mappedPONumber;
                    var orderNumber = invoice.OrderIds.Count == 1
                        ? $"VO#{actualOrderNumber}"
                        : "Multiple Orders";

                    Console.WriteLine($"Invoice {invoice.Invoice.InvoiceNo}: orderId={orderId}, hasMapping={hasMapping}, mappedPONumber={mappedPONumber}, actualOrderNumber={actualOrderNumber}, orderNumber='{orderNumber}'");

                    invoiceSummaries.Add(new
                    {
                        id = invoice.Invoice.Id,
                        invoiceNo = invoice.Invoice.InvoiceNo,
                        vendorName = invoice.Invoice.VendorName ?? "",
                        vendorCode = invoice.Invoice.VendorCode ?? "",
                        orderNumber = orderNumber,
                        invoiceDate = invoice.Invoice.InvoiceDate.ToString("yyyy-MM-dd"),
                        dueDate = invoice.Invoice.DueDate.ToString("yyyy-MM-dd"),
                        amount = invoice.Invoice.Amount,
                        totalAmount = invoice.TotalAmount,
                        paidAmount = GetEffectiveVendorPaidAmount(invoice.Invoice),
                        balanceDue = GetVendorBalanceDue(invoice.Invoice),
                        status = ResolveVendorInvoiceListStatus(invoice.Invoice, now),
                        isApproved = invoice.Invoice.Approved == true,
                        paymentMethod = invoice.Invoice.PaymentMethod ?? "",
                        orderId = invoice.OrderIds.Count == 1 ? (int?)orderId : null,
                        daysOverdue = GetVendorDaysOverdue(invoice.Invoice, now)
                    });
                }

                Console.WriteLine($"GetAllVendorInvoices - Returning {invoiceSummaries.Count} invoice summaries");

                // Apply search filter (client-side for simplicity)
                if (!string.IsNullOrEmpty(searchTerm))
                {
                    var searchLower = searchTerm.ToLower();
                    invoiceSummaries = invoiceSummaries.Where(x =>
                        x.invoiceNo.ToLower().Contains(searchLower) ||
                        x.vendorName.ToLower().Contains(searchLower) ||
                        x.vendorCode.ToLower().Contains(searchLower) ||
                        x.orderNumber.ToLower().Contains(searchLower)
                    ).ToList();
                }

                return Ok(new { result = invoiceSummaries });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetAllVendorInvoices: EXCEPTION - {ex.Message}");
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetVendorInvoiceDetails/{invoiceId}")]
        public async Task<IActionResult> GetVendorInvoiceDetails(int invoiceId)
        {
            try
            {
                // Get the invoice master details
                var invoice = await _context.VendorInvoiceMaster
                    .AsNoTracking()
                    .Where(i => i.Id == invoiceId)
                    .FirstOrDefaultAsync();

                if (invoice == null)
                {
                    return NotFound(new { error = "Invoice not found" });
                }

                // Get the invoice detail items
                var invoiceDetails = await _context.VendorInvoiceDetail
                    .AsNoTracking()
                    .Where(d => d.InvoiceId == invoiceId)
                    .OrderBy(d => d.Id)
                    .ToListAsync();

                // Convert to the expected format
                var invoiceDetailResponse = new
                {
                    id = invoice.Id,
                    invoiceNo = invoice.InvoiceNo,
                    invoiceDate = invoice.InvoiceDate.ToString("yyyy-MM-dd"),
                    dueDate = invoice.DueDate.ToString("yyyy-MM-dd"),
                    amount = invoice.Amount,
                    totalAmount = invoice.TotalAmount,
                    paidAmount = GetEffectiveVendorPaidAmount(invoice),
                    balanceDue = GetVendorBalanceDue(invoice),
                    status = ResolveVendorInvoiceListStatus(invoice, DateTime.Now),
                    isApproved = invoice.Approved == true,
                    paymentMethod = invoice.PaymentMethod ?? "",
                    vendorName = invoice.VendorName ?? "",
                    vendorCode = invoice.VendorCode ?? "",
                    items = invoiceDetails.Select(d => new
                    {
                        orderDetailId = d.VendorOrderDetailID ?? 0,
                        qtyInvoiced = 1, // This would need to be calculated from the quantity field if available
                        description = d.Description ?? "",
                        amount = d.Amount
                    }).ToList()
                };

                return Ok(new { result = invoiceDetailResponse });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"GetVendorInvoiceDetails: EXCEPTION - {ex.Message}");
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetVendorInvoices/{orderId}")]
        public async Task<IActionResult> GetVendorInvoices(int orderId)
        {
            try
            {
                var tenantId = GetTenantId();
                Console.WriteLine($"GetVendorInvoices called - TenantId: {tenantId}, OrderId: {orderId}");

                // Get all invoice details for this order
                var invoiceDetails = await _context.VendorInvoiceDetail
                    .AsNoTracking()
                    .Where(id => id.OrderId == orderId)
                    .ToListAsync();

                Console.WriteLine($"Found {invoiceDetails.Count} invoice details for vendor order {orderId}");

                // Get unique invoice IDs from the details
                var invoiceIds = invoiceDetails.Select(id => id.InvoiceId).Distinct().ToList();
                Console.WriteLine($"Found {invoiceIds.Count} unique invoice IDs");

                // Get invoice masters for these IDs
                var invoices = await _context.VendorInvoiceMaster
                    .AsNoTracking()
                    .Where(im => im.TenantId == tenantId && invoiceIds.Contains(im.Id))
                    .ToListAsync();

                Console.WriteLine($"Found {invoices.Count} invoice masters for tenant {tenantId}");

                // Build the response
                var result = invoices.Select(im => new
                {
                    id = im.Id,
                    invoiceNo = im.InvoiceNo,
                    invoiceDate = im.InvoiceDate,
                    dueDate = im.DueDate,
                    amount = im.Amount,
                    totalAmount = im.TotalAmount,
                    status = GetVendorInvoiceStatus(im),
                    items = invoiceDetails
                        .Where(id => id.InvoiceId == im.Id)
                        .Select(id => new
                        {
                            orderDetailId = id.VendorOrderDetailID,
                            qtyInvoiced = id.qty ?? 0,
                            description = id.Description ?? "",
                            amount = id.Amount
                        }).ToList()
                })
                .OrderByDescending(i => i.invoiceDate)
                .ToList();

                Console.WriteLine($"Returning {result.Count} vendor invoices for order {orderId}");
                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetVendorInvoices: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // Helper methods
        private async Task<int> GetReceivedQtyForVendorOrderDetail(int orderDetailId, int tenantId)
        {
            var receivedQty = await _context.VendorReceiving
                .Where(r => r.VendorOrderDetailID == orderDetailId && r.Tenantid == tenantId)
                .SumAsync(r => (int?)r.ReceivedQty) ?? 0;

            return receivedQty;
        }

        private async Task<int> GetInvoicedQtyForVendorOrderDetail(int orderDetailId, int tenantId)
        {
            var invoicedQty = await _context.VendorInvoicing
                .Where(i => i.VendorOrderDetailID == orderDetailId && i.Tenantid == tenantId)
                .SumAsync(i => (int?)i.InvoicedQty) ?? 0;

            return invoicedQty;
        }

        private async Task UpdateVendorOrderInvoiceStatus(int orderId, int tenantId)
        {
            var order = await _context.VendorOrders
                .FirstOrDefaultAsync(o => o.OrderID == orderId && o.Tenantid == tenantId);

            if (order == null) return;

            var details = await _context.VendorOrderDetails
                .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                .ToListAsync();

            var orderDetailIds = details.Select(d => d.ID).ToList();

            // Calculate received quantities
            var receivedTotals = await _context.VendorReceiving
                .Where(r => orderDetailIds.Contains(r.VendorOrderDetailID) && r.Tenantid == tenantId)
                .GroupBy(r => r.VendorOrderDetailID)
                .ToDictionaryAsync(g => g.Key, g => g.Sum(r => r.ReceivedQty));

            // Calculate invoiced quantities
            var invoicedTotals = await _context.VendorInvoicing
                .Where(i => orderDetailIds.Contains(i.VendorOrderDetailID) && i.Tenantid == tenantId)
                .GroupBy(i => i.VendorOrderDetailID)
                .ToDictionaryAsync(g => g.Key, g => g.Sum(i => i.InvoicedQty));

            var totalReceived = details.Sum(d => receivedTotals.ContainsKey(d.ID) ? receivedTotals[d.ID] : (d.ReceivedQty ?? 0));
            var totalInvoiced = details.Sum(d => invoicedTotals.ContainsKey(d.ID) ? invoicedTotals[d.ID] : d.InvoicedQty);

            // Update status based on invoicing
            if (totalInvoiced == 0)
            {
                // Keep existing status (likely "Fully Received", "Partially Received", etc.)
            }
            else if (totalInvoiced < totalReceived)
            {
                // Don't change status if partially invoiced - keep receiving status
            }
            else if (totalInvoiced >= totalReceived && totalReceived > 0)
            {
                // All received items are invoiced
                // Status will remain "Fully Received" or "Partially Received" based on received quantities
            }
        }

        private static decimal GetEffectiveVendorPaidAmount(VendorInvoiceMaster invoice)
        {
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

        private static int? GetVendorDaysOverdue(VendorInvoiceMaster invoice, DateTime now)
        {
            if (GetVendorBalanceDue(invoice) <= 0.009m)
                return null;
            if (invoice.DueDate >= now)
                return null;
            return (int)(now - invoice.DueDate).TotalDays;
        }

        private static string ResolveVendorInvoiceListStatus(VendorInvoiceMaster invoice, DateTime now)
        {
            if (invoice.isPaid == 2)
                return "Void";
            var paid = GetEffectiveVendorPaidAmount(invoice);
            if (paid >= invoice.TotalAmount - 0.009m && invoice.TotalAmount > 0)
                return "Paid";
            if (paid > 0.009m)
                return "Partially Paid";
            if (invoice.DueDate < now)
                return "Overdue";
            return "Unpaid";
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
            return "Pending";
        }

        private static string BuildAutoPostingReference(string prefix, string? invoiceNo, int invoiceId)
        {
            var safeInvoice = string.IsNullOrWhiteSpace(invoiceNo) ? invoiceId.ToString() : invoiceNo.Trim();
            var reference = $"{prefix}-{safeInvoice}";
            return reference.Length > 200 ? reference[..200] : reference;
        }
    }

    public class OrderReq
    {
        public int OrderID { get; set; }
        public int Tenantid { get; set; }
        public int CustomerID { get; set; }
        public string CustomerCode { get; set; } = "";
        public int PONumber { get; set; }
        public string CustomerName { get; set; } = "";
        public string Address { get; set; } = "";
        public string CustomerPoNumber { get; set; } = "";
        public DateTime OrderDate { get; set; }
        public decimal TotalAmount { get; set; }
        public int UserId { get; set; }
        public int UserToken { get; set; }
        public string Status { get; set; } = "Draft";
        public string ShippingInstructions { get; set; } = "";
        public string ExternalCustomerPO { get; set; } = "";
        public DateTime? ExternalOrderDate { get; set; }
        public string BuyerName { get; set; } = "";
        public int? QuotationId { get; set; }
        public string QuotationNo { get; set; } = "";
        public int? LocationId { get; set; }
        public List<OrderDetailReq> Details { get; set; } = new List<OrderDetailReq>();
        public List<OrderAttachmentDto> Attachments { get; set; } = new List<OrderAttachmentDto>();
        public List<OrderCommentDto> Comments { get; set; } = new List<OrderCommentDto>();
    }

    public class OrderAttachmentDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public int Size { get; set; }
        public string FileUrl { get; set; } = "";
    }

    public class OrderCommentDto
    {
        public int Id { get; set; }
        public string Text { get; set; } = "";
        public string CreatedAt { get; set; } = "";
        public string CreatedBy { get; set; } = "";
    }

    public class OrderDetailReq
    {
        public int ID { get; set; }
        public int ItemNo { get; set; }
        public string PartName { get; set; } = "";
        public string PartNo { get; set; } = "";
        public DateTime DueDate { get; set; }
        public string JobNumber { get; set; } = "";
        public string JobDesc { get; set; } = "";
        public int QtyOrdered { get; set; }
        public string Unit { get; set; } = "";
        public decimal UnitPrice { get; set; }
        public int JobPriority { get; set; }
        public decimal Discount { get; set; }
        /// <summary>Percent (default) or Amount.</summary>
        public string DiscountType { get; set; } = "Percent";
        public int? ProductId { get; set; }
        public string LeadTime { get; set; } = "";
        public string Notes { get; set; } = "";
        public int ShippedQty { get; set; } = 0;
        public string ShippingStatus { get; set; } = "Not Started";
    }

    public class VendorInvoiceLineItemDto
    {
        public int OrderDetailId { get; set; }
        public int QtyToInvoice { get; set; }
        public decimal UnitPrice { get; set; }
        public decimal Discount { get; set; }
    }

    public class CreateVendorInvoiceFromOrderRequest
    {
        public int OrderId { get; set; }
        public string InvoiceNo { get; set; }
        public DateTime? InvoiceDate { get; set; }
        public DateTime? DueDate { get; set; }
        public string PaymentMethod { get; set; }
        public string Notes { get; set; }
        /// <summary>Optional input tax rate percent (0–100).</summary>
        public decimal? TaxRate { get; set; }
        /// <summary>Optional input tax amount. When omitted, computed from TaxRate × net subtotal.</summary>
        public decimal? TaxAmount { get; set; }
        /// <summary>Optional freight / shipping charged on the vendor bill.</summary>
        public decimal? FreightCharge { get; set; }
        public List<VendorInvoiceLineItemDto> LineItems { get; set; } = new List<VendorInvoiceLineItemDto>();
    }
}

