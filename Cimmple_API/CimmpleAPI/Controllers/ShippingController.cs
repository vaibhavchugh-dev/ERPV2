using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Dtos;
using System;
using System.Collections.Generic;
using System.Linq;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [AllowAnonymous]
    public class ShippingController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public ShippingController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetShippableItems/{orderId}")]
        public IActionResult GetShippableItems(int orderId)
        {
            try
            {
                var tenantId = GetTenantId();
                
                // Log for debugging
                Console.WriteLine($"[GetShippableItems] orderId: {orderId}, tenantId: {tenantId}");

                var detailsList = _context.CustomerOrderDetails
                    .Where(d => d.OrderID == orderId && d.Tenantid == tenantId)
                    .ToList();
                
                Console.WriteLine($"[GetShippableItems] Found {detailsList.Count} order details for orderId {orderId} and tenantId {tenantId}");

                // Calculate ShippedQty from ShippingDetails (same as GetOrderById)
                // This ensures accuracy even if stored value is out of sync
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

                var shippableItems = detailsList.Select(d => {
                    var calculatedShippedQty = shippingDetails.ContainsKey(d.ID) ? shippingDetails[d.ID] : d.ShippedQty;
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
                        hasJobOrder = _context.JobOrderMaster
                            .Any(jo => jo.CustomerOrderDetailID == d.ID && jo.Tenantid == tenantId),
                        jobOrderStatus = _context.JobOrderMaster
                            .Where(jo => jo.CustomerOrderDetailID == d.ID && jo.Tenantid == tenantId)
                            .Select(jo => jo.Status)
                            .FirstOrDefault() ?? "No Job Order"
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
        public IActionResult CreateShipment([FromBody] CreateShipmentRequest request)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var tenantId = GetTenantId();

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
                        TenantId = tenantId
                    };

                    _context.Shipping.Add(shipment);
                    _context.SaveChanges();

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
                    }

                    // Update order status
                    UpdateOrderShippingStatus(request.OrderId, tenantId);

                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new { result = new { shipmentId = shipment.Id, shipmentNumber = shipmentNumber, message = "Shipment created successfully" } });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
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
                        notes = "", // Notes could be added to Shipping model if needed
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
        public IActionResult DeleteShipment([FromQuery] int shipmentId, [FromQuery] int tenantId)
        {
            using (var transaction = _context.Database.BeginTransaction())
            {
                try
                {
                    var shipment = _context.Shipping
                        .FirstOrDefault(s => s.Id == shipmentId && s.TenantId == tenantId);

                    if (shipment == null)
                    {
                        return NotFound(new { error = "Shipment not found" });
                    }

                    // Get all shipping details for this shipment
                    var shippingDetails = _context.ShippingDetails
                        .Where(sd => sd.ShipmentId == shipmentId)
                        .ToList();

                    // Update CustomerOrderDetails - subtract shipped quantities
                    foreach (var detail in shippingDetails)
                    {
                        if (detail.OrderDetailID.HasValue)
                        {
                            var orderDetail = _context.CustomerOrderDetails
                                .FirstOrDefault(od => od.ID == detail.OrderDetailID.Value && od.Tenantid == tenantId);
                            
                            if (orderDetail != null)
                            {
                                orderDetail.ShippedQty = Math.Max(0, orderDetail.ShippedQty - detail.ShippedQty);
                                
                                // Update shipping status based on remaining shipped quantity
                                if (orderDetail.ShippedQty == 0)
                                    orderDetail.ShippingStatus = "Not Started";
                                else if (orderDetail.ShippedQty < orderDetail.QtyOrdered)
                                    orderDetail.ShippingStatus = "Partially Shipped";
                                else if (orderDetail.ShippedQty >= orderDetail.QtyOrdered)
                                    orderDetail.ShippingStatus = "Shipped";
                            }
                        }
                    }

                    // Delete shipping details
                    _context.ShippingDetails.RemoveRange(shippingDetails);

                    // Delete shipment
                    _context.Shipping.Remove(shipment);

                    // Update order status
                    UpdateOrderShippingStatus(shipment.OrderId, tenantId);

                    _context.SaveChanges();
                    transaction.Commit();

                    return Ok(new { result = new { message = "Shipment deleted successfully" } });
                }
                catch (Exception ex)
                {
                    transaction.Rollback();
                    return StatusCode(500, new { error = ex.Message });
                }
            }
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
