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
using System.Threading.Tasks;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ShippingController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly InventoryService _inventoryService;

        public ShippingController(CimmpleDbContext context, InventoryService inventoryService)
        {
            _context = context;
            _inventoryService = inventoryService;
        }

        [HttpGet("GetShippableItems/{orderId}")]
        public IActionResult GetShippableItems(int orderId)
        {
            try
            {
                var tenantId = GetTenantId();

                var detailsList = _context.CustomerOrderDetails
                    .AsNoTracking()
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .ToList();

                var orderDetailIds = detailsList.Select(d => d.ID).ToList();
                var shippingDetails = _context.ShippingDetails
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
                    .Select(jo => new { jo.CustomerOrderDetailID, jo.Status, jo.JobOrderID })
                    .ToList()
                    .GroupBy(jo => jo.CustomerOrderDetailID)
                    .ToDictionary(g => g.Key, g => g.First());

                var productIds = detailsList
                    .Where(d => d.productid.HasValue && d.productid.Value > 0)
                    .Select(d => d.productid!.Value)
                    .Distinct()
                    .ToList();
                var onHandByProduct = productIds.Count == 0
                    ? new Dictionary<int, decimal>()
                    : _context.InventoryBalance
                        .AsNoTracking()
                        .Where(b => b.Tenantid == tenantId && b.ProductId != null && productIds.Contains(b.ProductId.Value))
                        .GroupBy(b => b.ProductId!.Value)
                        .Select(g => new { ProductId = g.Key, Qty = g.Sum(x => x.QuantityOnHand) })
                        .ToList()
                        .ToDictionary(x => x.ProductId, x => x.Qty);

                var shippableItems = detailsList.Select(d =>
                {
                    var calculatedShippedQty = shippingDetails.ContainsKey(d.ID) ? shippingDetails[d.ID] : d.ShippedQty;
                    var hasJobOrder = jobOrdersByDetail.ContainsKey(d.ID);
                    decimal? onHand = null;
                    if (d.productid.HasValue && onHandByProduct.TryGetValue(d.productid.Value, out var qtyOnHand))
                        onHand = qtyOnHand;
                    return new
                    {
                        id = d.ID,
                        itemNo = d.ItemNo,
                        partNo = d.PartNo,
                        partName = d.partname,
                        qtyOrdered = d.QtyOrdered,
                        shippedQty = calculatedShippedQty,
                        availableQty = d.QtyOrdered - calculatedShippedQty,
                        shippingStatus = d.ShippingStatus,
                        hasJobOrder,
                        jobOrderStatus = hasJobOrder ? (jobOrdersByDetail[d.ID].Status ?? "Draft") : "No Job Order",
                        quantityOnHand = onHand
                    };
                }).ToList();

                return Ok(new { result = shippableItems });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("CreateShipment")]
        public async Task<IActionResult> CreateShipment([FromBody] CreateShipmentRequest request)
        {
            await using (var transaction = await _context.Database.BeginTransactionAsync())
            {
                try
                {
                    var tenantId = GetTenantId();
                    var userId = GetUserId();

                    // Validate all line items are ready to ship
                    foreach (var item in request.LineItems)
                    {
                        var detail = _context.CustomerOrderDetails
                            .FirstOrDefault(d => d.ID == item.OrderDetailId && d.Tenantid == tenantId);

                        if (detail == null)
                            return BadRequest(new { error = $"Order detail {item.OrderDetailId} not found" });

                        // Check quantity availability
                        var availableQty = detail.QtyOrdered - detail.ShippedQty;
                        if (item.QtyToShip > availableQty)
                            return BadRequest(new { error = $"Cannot ship {item.QtyToShip} units of item {detail.ItemNo}. Only {availableQty} available." });

                        // If there's a job order, check if it's completed
                        var jobOrder = _context.JobOrderMaster
                            .FirstOrDefault(jo => jo.CustomerOrderDetailID == detail.ID && jo.Tenantid == tenantId);

                        if (jobOrder != null && jobOrder.Status != "Completed")
                            return BadRequest(new { error = $"Job Order for item {detail.ItemNo} is not completed. Status: {jobOrder.Status}" });
                    }

                    // Generate shipment number
                    var shipmentNumber = GenerateShipmentNumber(tenantId);

                    // Create shipment header
                    var shipment = new Shipping
                    {
                        ShipmentNo = shipmentNumber,
                        OrderId = request.OrderId,
                        ShipVia = request.Courier,
                        CourierTrackingNo = request.TrackingNumber,
                        TotalBoxNo = request.Boxes,
                        PackingType = request.PackingType ?? "Standard",
                        Terms = request.Terms ?? "",
                        ShipmentDate = request.ShipDate ?? DateTime.Now,
                        TenantId = tenantId,
                        Notes = request.Notes ?? ""
                    };

                    _context.Shipping.Add(shipment);
                    await _context.SaveChangesAsync();

                    var order = await _context.CustomerOrder
                        .FirstOrDefaultAsync(o => o.OrderID == request.OrderId && o.Tenantid == tenantId);
                    var orderLocationId = order != null && order.locationId > 0 ? order.locationId : (int?)null;

                    // Create shipment details
                    foreach (var item in request.LineItems)
                    {
                        var detail = _context.CustomerOrderDetails
                            .First(d => d.ID == item.OrderDetailId);

                        var shippingDetail = new ShippingDetails
                        {
                            ShipmentId = shipment.Id,
                            OrderDetailID = item.OrderDetailId,
                            JobId = GetJobIdForOrderDetail(item.OrderDetailId, tenantId) ?? 0,
                            ShippedQty = item.QtyToShip
                        };

                        _context.ShippingDetails.Add(shippingDetail);

                        // Update line item shipped quantity and status
                        detail.ShippedQty += item.QtyToShip;

                        if (detail.ShippedQty >= detail.QtyOrdered)
                            detail.ShippingStatus = "Shipped";
                        else if (detail.ShippedQty > 0)
                            detail.ShippingStatus = "Partially Shipped";
                        else
                            detail.ShippingStatus = "Ready to Ship";

                        var inventoryError = await IssueFinishedGoodsForShipmentAsync(
                            tenantId,
                            detail,
                            item.QtyToShip,
                            shipment.Id,
                            shipmentNumber,
                            orderLocationId,
                            userId);
                        if (!string.IsNullOrEmpty(inventoryError))
                        {
                            await transaction.RollbackAsync();
                            return BadRequest(new { error = inventoryError });
                        }
                    }

                    // Update order status
                    UpdateOrderShippingStatus(request.OrderId, tenantId);

                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();

                    return Ok(new { result = new { shipmentId = shipment.Id, shipmentNumber = shipmentNumber, message = "Shipment created successfully" } });
                }
                catch (Exception ex)
                {
                    await transaction.RollbackAsync();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
        }

        [HttpGet("GetShipmentDetails/{shipmentId}")]
        public IActionResult GetShipmentDetails(int shipmentId)
        {
            try
            {
                var tenantId = GetTenantId();

                var shipment = _context.Shipping
                    .Where(s => s.Id == shipmentId && s.TenantId == tenantId)
                    .Join(_context.CustomerOrder,
                        s => s.OrderId,
                        o => o.OrderID,
                        (s, o) => new { Shipment = s, Order = o })
                    .Select(so => new
                    {
                        id = so.Shipment.Id,
                        shipmentNo = so.Shipment.ShipmentNo,
                        orderId = so.Order.OrderID,
                        orderNumber = $"CO#{so.Order.PONumber}",
                        customerName = so.Order.CustomerName,
                        customerCode = so.Order.customercode,
                        courier = so.Shipment.ShipVia,
                        trackingNumber = so.Shipment.CourierTrackingNo,
                        shipmentDate = so.Shipment.ShipmentDate.ToString("yyyy-MM-dd"),
                        boxes = so.Shipment.TotalBoxNo,
                        packingType = so.Shipment.PackingType,
                        terms = so.Shipment.Terms,
                        notes = so.Shipment.Notes ?? "",
                        items = _context.ShippingDetails
                            .Where(sd => sd.ShipmentId == so.Shipment.Id)
                            .Join(_context.CustomerOrderDetails,
                                sd => sd.OrderDetailID,
                                od => od.ID,
                                (sd, od) => new
                                {
                                    orderDetailId = od.ID,
                                    partNo = od.PartNo,
                                    partName = od.partname,
                                    qtyShipped = sd.ShippedQty,
                                    unitPrice = od.UnitPrice,
                                    lineTotal = sd.ShippedQty * od.UnitPrice
                                })
                            .ToList(),
                        totalAmount = _context.ShippingDetails
                            .Where(sd => sd.ShipmentId == so.Shipment.Id)
                            .Join(_context.CustomerOrderDetails,
                                sd => sd.OrderDetailID,
                                od => od.ID,
                                (sd, od) => sd.ShippedQty * od.UnitPrice)
                            .Sum()
                    })
                    .FirstOrDefault();

                if (shipment == null)
                {
                    return NotFound(new { error = "Shipment not found" });
                }

                return Ok(new { result = shipment });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetShipments/{orderId}")]
        public IActionResult GetShipments(int orderId)
        {
            try
            {
                var tenantId = GetTenantId();

                var shipments = _context.Shipping
                    .Where(s => s.OrderId == orderId && s.TenantId == tenantId)
                    .OrderByDescending(s => s.ShipmentDate)
                    .Select(s => new
                    {
                        id = s.Id,
                        shipmentNo = s.ShipmentNo,
                        courier = s.ShipVia,
                        trackingNumber = s.CourierTrackingNo,
                        boxes = s.TotalBoxNo,
                        packingType = s.PackingType,
                        shipmentDate = s.ShipmentDate,
                        notes = s.Notes ?? "",
                        items = _context.ShippingDetails
                            .Where(sd => sd.ShipmentId == s.Id)
                            .Select(sd => new
                            {
                                orderDetailId = sd.OrderDetailID,
                                qtyShipped = sd.ShippedQty,
                                partNo = _context.CustomerOrderDetails
                                    .Where(d => d.ID == sd.OrderDetailID)
                                    .Select(d => d.PartNo)
                                    .FirstOrDefault()
                            })
                            .ToList()
                    })
                    .ToList();

                return Ok(new { result = shipments });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetAllShipments")]
        public IActionResult GetAllShipments([FromQuery] string status = "All", [FromQuery] string searchTerm = "", [FromQuery] int? customerId = null, [FromQuery] string dateRange = "Last 30 Days")
        {
            try
            {
                var tenantId = GetTenantId();

                // Build base query
                var shipmentsQuery = _context.Shipping
                    .Where(s => s.TenantId == tenantId)
                    .Join(_context.CustomerOrder,
                        s => s.OrderId,
                        o => o.OrderID,
                        (s, o) => new { Shipment = s, Order = o })
                    .Select(so => new
                    {
                        shipment = so.Shipment,
                        order = so.Order,
                        totalItems = _context.ShippingDetails
                            .Where(sd => sd.ShipmentId == so.Shipment.Id)
                            .Sum(sd => sd.ShippedQty),
                        itemCount = _context.ShippingDetails
                            .Where(sd => sd.ShipmentId == so.Shipment.Id)
                            .Count()
                    });

                // Apply filters
                if (!string.IsNullOrEmpty(searchTerm))
                {
                    shipmentsQuery = shipmentsQuery.Where(x =>
                        x.shipment.ShipmentNo.Contains(searchTerm) ||
                        x.order.CustomerName.Contains(searchTerm) ||
                        x.shipment.CourierTrackingNo.Contains(searchTerm));
                }

                if (customerId.HasValue)
                {
                    shipmentsQuery = shipmentsQuery.Where(x => x.order.CustomerID == customerId.Value);
                }

                // Date range filter
                var startDate = DateTime.Now.AddDays(-30); // Default to last 30 days
                switch (dateRange.ToLower())
                {
                    case "last 7 days":
                        startDate = DateTime.Now.AddDays(-7);
                        break;
                    case "last 30 days":
                        startDate = DateTime.Now.AddDays(-30);
                        break;
                    case "this month":
                        startDate = new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1);
                        break;
                    case "last month":
                        startDate = new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1).AddMonths(-1);
                        var endOfLastMonth = new DateTime(DateTime.Now.Year, DateTime.Now.Month, 1).AddDays(-1);
                        shipmentsQuery = shipmentsQuery.Where(x => x.shipment.ShipmentDate >= startDate && x.shipment.ShipmentDate <= endOfLastMonth);
                        break;
                    case "all":
                    default:
                        startDate = DateTime.MinValue;
                        break;
                }

                if (startDate != DateTime.MinValue && dateRange.ToLower() != "last month")
                {
                    shipmentsQuery = shipmentsQuery.Where(x => x.shipment.ShipmentDate >= startDate);
                }

                // Get results and format
                var shipments = shipmentsQuery
                    .OrderByDescending(x => x.shipment.ShipmentDate)
                    .Select(x => new
                    {
                        id = x.shipment.Id,
                        shipmentNo = x.shipment.ShipmentNo,
                        orderId = x.order.OrderID,
                        orderNumber = $"CO#{x.order.PONumber}",
                        customerName = x.order.CustomerName,
                        customerCode = x.order.customercode,
                        courier = x.shipment.ShipVia,
                        trackingNumber = x.shipment.CourierTrackingNo,
                        shipmentDate = x.shipment.ShipmentDate.ToString("yyyy-MM-dd"),
                        totalItems = x.totalItems,
                        itemCount = x.itemCount,
                        boxes = x.shipment.TotalBoxNo,
                        packingType = x.shipment.PackingType,
                        notes = x.shipment.Notes ?? "",
                        status = "Shipped" // All shipments are considered shipped
                    })
                    .ToList();

                return Ok(new { result = shipments });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("CheckShipmentDeletionImpact")]
        public IActionResult CheckShipmentDeletionImpact([FromQuery] int shipmentId, [FromQuery] int tenantId)
        {
            try
            {
                var shipment = _context.Shipping
                    .FirstOrDefault(s => s.Id == shipmentId && s.TenantId == tenantId);

                if (shipment == null)
                {
                    return NotFound(new { error = "Shipment not found" });
                }

                var impact = new DeletionImpactResult
                {
                    CanDelete = true,
                    BlockingReasons = new List<string>(),
                    WillBeDeleted = new List<ImpactedEntity>(),
                    WillBeAffected = new List<ImpactedEntity>(),
                    Warnings = new List<string>()
                };

                // Get shipping details
                var shippingDetails = _context.ShippingDetails
                    .Where(sd => sd.ShipmentId == shipmentId)
                    .ToList();

                if (shippingDetails.Any())
                {
                    impact.WillBeDeleted.Add(new ImpactedEntity
                    {
                        EntityType = "Shipping Details",
                        Count = shippingDetails.Count,
                        Description = $"{shippingDetails.Count} line item(s) will be deleted"
                    });

                    // Check which order details will be affected
                    var orderDetailIds = shippingDetails
                        .Where(sd => sd.OrderDetailID.HasValue)
                        .Select(sd => sd.OrderDetailID.Value)
                        .Distinct()
                        .ToList();

                    if (orderDetailIds.Any())
                    {
                        var orderDetails = _context.CustomerOrderDetails
                            .Where(od => orderDetailIds.Contains(od.ID) && od.Tenantid == tenantId)
                            .ToList();

                        var totalQtyToRestore = shippingDetails.Sum(sd => sd.ShippedQty);
                        impact.WillBeAffected.Add(new ImpactedEntity
                        {
                            EntityType = "Order Details",
                            Count = orderDetails.Count,
                            Description = $"Shipped quantities will be restored for {orderDetails.Count} order line item(s) (total: {totalQtyToRestore} units)"
                        });

                        // Check if any of these items have been invoiced
                        var invoicedDetails = _context.InvoiceDetail
                            .Where(id => id.OrderDetailID.HasValue && orderDetailIds.Contains(id.OrderDetailID.Value))
                            .Join(_context.InvoiceMaster,
                                id => id.InvoiceId,
                                im => im.Id,
                                (id, im) => new { id.OrderDetailID, id.QtyInvoiced, im.TenantId })
                            .Where(x => x.TenantId == tenantId)
                            .GroupBy(x => x.OrderDetailID.Value)
                            .ToDictionary(g => g.Key, g => g.Sum(x => x.QtyInvoiced));

                        if (invoicedDetails.Any())
                        {
                            impact.Warnings.Add(
                                $"Warning: Some items in this shipment have been invoiced. Deleting the shipment may affect invoice accuracy."
                            );
                        }
                    }
                }

                impact.Warnings.Add("This action cannot be undone");

                return Ok(new { result = impact });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpDelete("DeleteShipment")]
        public async Task<IActionResult> DeleteShipment([FromQuery] int shipmentId, [FromQuery] int tenantId)
        {
            await using (var transaction = await _context.Database.BeginTransactionAsync())
            {
                try
                {
                    var shipment = _context.Shipping
                        .FirstOrDefault(s => s.Id == shipmentId && s.TenantId == tenantId);

                    if (shipment == null)
                    {
                        return NotFound(new { error = "Shipment not found" });
                    }

                    var shippingDetails = _context.ShippingDetails
                        .Where(sd => sd.ShipmentId == shipmentId)
                        .ToList();

                    foreach (var detail in shippingDetails)
                    {
                        if (detail.OrderDetailID.HasValue)
                        {
                            var orderDetail = _context.CustomerOrderDetails
                                .FirstOrDefault(od => od.ID == detail.OrderDetailID.Value && od.Tenantid == tenantId);
                            
                            if (orderDetail != null)
                            {
                                orderDetail.ShippedQty = Math.Max(0, orderDetail.ShippedQty - detail.ShippedQty);
                                
                                if (orderDetail.ShippedQty == 0)
                                    orderDetail.ShippingStatus = "Not Started";
                                else if (orderDetail.ShippedQty < orderDetail.QtyOrdered)
                                    orderDetail.ShippingStatus = "Partially Shipped";
                                else if (orderDetail.ShippedQty >= orderDetail.QtyOrdered)
                                    orderDetail.ShippingStatus = "Shipped";
                            }
                        }
                    }

                    var issues = await _context.InventoryTransaction
                        .Where(t => t.Tenantid == tenantId
                            && t.ReferenceType == "CustomerShipment"
                            && t.ReferenceId == shipmentId
                            && t.TransactionTypeId == 2)
                        .ToListAsync();
                    foreach (var issue in issues)
                    {
                        var qty = Math.Abs(issue.Quantity);
                        if (qty <= 0)
                            continue;
                        var (ok, err) = await _inventoryService.ReceiveStockInTransactionAsync(
                            tenantId,
                            issue.ProductId,
                            issue.RawMaterialId,
                            issue.LocationId,
                            qty,
                            "CustomerShipment",
                            shipmentId,
                            lotId: null,
                            createdBy: GetUserId(),
                            notes: $"Shipment {shipment.ShipmentNo} deleted");
                        if (!ok)
                        {
                            await transaction.RollbackAsync();
                            return BadRequest(new { error = $"Could not restore inventory for deleted shipment: {err}" });
                        }
                    }

                    _context.ShippingDetails.RemoveRange(shippingDetails);
                    _context.Shipping.Remove(shipment);

                    UpdateOrderShippingStatus(shipment.OrderId, tenantId);

                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();

                    return Ok(new { result = new { message = "Shipment deleted successfully" } });
                }
                catch (Exception ex)
                {
                    await transaction.RollbackAsync();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
        }

        private async Task<string?> IssueFinishedGoodsForShipmentAsync(
            int tenantId,
            CustomerOrderDetails detail,
            decimal qtyToShip,
            int shipmentId,
            string shipmentNumber,
            int? orderLocationId,
            int? userId)
        {
            if (qtyToShip <= 0)
                return null;

            int? productId = detail.productid.HasValue && detail.productid.Value > 0
                ? detail.productid
                : await ProductSourcing.EnsureFinishedProductAsync(
                    _context,
                    tenantId,
                    detail.PartNo,
                    detail.partname,
                    detail.Unit,
                    detail.UnitPrice,
                    ProductSourcing.Make);
            if (!productId.HasValue)
                return null;

            if (!detail.productid.HasValue)
                detail.productid = productId;

            var job = await _context.JobOrderMaster
                .AsNoTracking()
                .FirstOrDefaultAsync(jo => jo.CustomerOrderDetailID == detail.ID && jo.Tenantid == tenantId);

            int? locationId = null;
            if (job != null)
            {
                locationId = await _context.InventoryTransaction
                    .AsNoTracking()
                    .Where(t => t.Tenantid == tenantId
                        && t.ReferenceType == "JobOrder"
                        && t.ReferenceId == job.JobOrderID
                        && t.TransactionTypeId == 1
                        && t.ProductId != null)
                    .OrderByDescending(t => t.TransactionDate)
                    .Select(t => (int?)t.LocationId)
                    .FirstOrDefaultAsync();
            }

            if (!locationId.HasValue || locationId.Value <= 0)
                locationId = orderLocationId;

            if (!locationId.HasValue || locationId.Value <= 0)
            {
                locationId = await _context.Locations
                    .AsNoTracking()
                    .Where(l => l.TenantId == tenantId)
                    .OrderBy(l => l.LocationId)
                    .Select(l => (int?)l.LocationId)
                    .FirstOrDefaultAsync();
            }

            if (!locationId.HasValue || locationId.Value <= 0)
                return "Location is required to ship from inventory. Set the customer order location.";

            var onHand = await _inventoryService.GetOnHandAsync(tenantId, productId.Value, locationId);
            var notes = onHand < qtyToShip
                ? $"Shipped {shipmentNumber} short (on hand {onHand})"
                : $"Shipped {shipmentNumber}";

            var (ok, err) = await _inventoryService.IssueStockInTransactionAsync(
                tenantId,
                productId,
                rawMaterialId: null,
                locationId.Value,
                qtyToShip,
                "CustomerShipment",
                shipmentId,
                userId,
                notes,
                allowShortage: true);
            return ok ? null : $"Shipment saved but inventory issue failed: {err}";
        }

        private string GenerateShipmentNumber(int tenantId)
        {
            var today = DateTime.Now.ToString("yyyyMMdd");
            var existingCount = _context.Shipping
                .Count(s => s.TenantId == tenantId && s.ShipmentNo.StartsWith($"SH-{today}"));

            return $"SH-{today}-{(existingCount + 1).ToString("D3")}";
        }

        private int? GetJobIdForOrderDetail(int orderDetailId, int tenantId)
        {
            // Try to find job order and get its associated job
            var jobOrder = _context.JobOrderMaster
                .FirstOrDefault(jo => jo.CustomerOrderDetailID == orderDetailId && jo.Tenantid == tenantId);

            if (jobOrder != null)
            {
                // Find the job associated with this job order
                // This is a simplified approach - you might need to adjust based on your job tracking logic
                var job = _context.jobMaster
                    .FirstOrDefault(j => j.orderid == jobOrder.JobOrderID && j.tenantid == tenantId);

                return job?.jobid;
            }

            return null;
        }

        private void UpdateOrderShippingStatus(int orderId, int tenantId)
        {
            var order = _context.CustomerOrder
                .First(o => o.OrderID == orderId && o.Tenantid == tenantId);

            var details = _context.CustomerOrderDetails
                .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                .ToList();

            var totalOrdered = details.Sum(d => d.QtyOrdered);
            var totalShipped = details.Sum(d => d.ShippedQty);

            if (totalShipped == 0)
                order.Status = "In Progress";
            else if (totalShipped < totalOrdered)
                order.Status = "Partially Shipped";
            else if (totalShipped == totalOrdered)
                order.Status = "Shipped";
        }
    }

    // DTOs
    public class CreateShipmentRequest
    {
        public int OrderId { get; set; }
        public List<ShipmentLineItem> LineItems { get; set; } = new List<ShipmentLineItem>();
        public string Courier { get; set; }
        public string TrackingNumber { get; set; }
        public int? Boxes { get; set; }
        public string PackingType { get; set; }
        public string Terms { get; set; }
        public DateTime? ShipDate { get; set; }
        public string Notes { get; set; }
    }

    public class ShipmentLineItem
    {
        public int OrderDetailId { get; set; }
        public int QtyToShip { get; set; }
    }
}
