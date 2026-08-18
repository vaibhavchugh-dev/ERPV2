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
    public class ProductMasterController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;

        public ProductMasterController(CimmpleDbContext context)
        {
            _context = context;
        }

        [HttpGet("GetProductsFromOrders")]
        public IActionResult GetProductsFromOrders([FromQuery] int tenantid)
        {
            try
            {
                // Get all unique parts from CustomerOrderDetails
                // Filter out entries where PartNo is empty or contains Job Number patterns
                // Job Numbers typically start with '#JO' or 'JO#' - these should not be in PartNo field
                // Note: '#JO1006, JO#1005' is a Job Number, not a Part Number
                var partsFromOrders = _context.CustomerOrderDetails
                    .Where(d => d.Tenantid == tenantid 
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .GroupBy(d => new 
                    { 
                        PartNo = (d.PartNo ?? "").Trim(), 
                        partname = (d.partname ?? "").Trim(), 
                        Unit = (d.Unit ?? "").Trim() 
                    })
                    .Select(g => new
                    {
                        partNo = g.Key.PartNo,
                        partName = g.Key.partname,
                        unit = g.Key.Unit,
                        totalQtyOrdered = g.Sum(d => d.QtyOrdered),
                        // Average price: sum of all prices divided by count
                        avgUnitPrice = g.Average(d => d.UnitPrice),
                        // Min price: lowest UnitPrice value across all order lines for this part
                        minUnitPrice = g.Min(d => d.UnitPrice),
                        // Max price: highest UnitPrice value across all order lines for this part
                        maxUnitPrice = g.Max(d => d.UnitPrice),
                        orderCount = g.Count(),
                        firstOrderDate = g.Min(d => d.DueDate),
                        lastOrderDate = g.Max(d => d.DueDate),
                        // Get the most recent productid if available
                        productId = g.Where(d => d.productid.HasValue).Select(d => d.productid).FirstOrDefault()
                    })
                    .OrderBy(p => p.partNo)
                    .ThenBy(p => p.partName)
                    .ToList();

                // Also get parts from QuotationOrderDetails for completeness
                // Filter out entries where PartNo is empty or contains Job Number patterns
                var partsFromQuotations = _context.QuotationOrderDetails
                    .Where(d => d.Tenantid == tenantid 
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .GroupBy(d => new 
                    { 
                        PartNo = (d.PartNo ?? "").Trim(), 
                        partname = (d.partname ?? "").Trim(), 
                        Unit = (d.Unit ?? "").Trim() 
                    })
                    .Select(g => new
                    {
                        partNo = g.Key.PartNo,
                        partName = g.Key.partname,
                        unit = g.Key.Unit,
                        totalQtyOrdered = g.Sum(d => d.QtyOrdered),
                        avgUnitPrice = g.Average(d => d.UnitPrice),
                        minUnitPrice = g.Min(d => d.UnitPrice),
                        maxUnitPrice = g.Max(d => d.UnitPrice),
                        orderCount = g.Count(),
                        firstOrderDate = g.Min(d => d.DueDate),
                        lastOrderDate = g.Max(d => d.DueDate),
                        productId = g.Where(d => d.productid.HasValue).Select(d => d.productid).FirstOrDefault()
                    })
                    .ToList();

                // Combine and merge results from both orders and quotations
                var allParts = new Dictionary<string, dynamic>();

                // Process CustomerOrderDetails parts
                // Note: GroupBy already ensures uniqueness, so each part appears only once here
                foreach (var part in partsFromOrders)
                {
                    // Use normalized key (case-insensitive) for merging orders with quotations
                    // This ensures "PART-001" and "part-001" are treated as the same part
                    var key = $"{part.partNo.ToUpperInvariant()}|{part.partName.ToUpperInvariant()}|{part.unit.ToUpperInvariant()}";
                    allParts[key] = new
                    {
                        partNo = part.partNo,
                        partName = part.partName,
                        unit = part.unit,
                        totalQtyOrdered = part.totalQtyOrdered,
                        totalQtyQuoted = 0,
                        avgUnitPrice = part.avgUnitPrice,
                        minUnitPrice = part.minUnitPrice,
                        maxUnitPrice = part.maxUnitPrice,
                        orderCount = part.orderCount,
                        quotationCount = 0,
                        firstOrderDate = part.firstOrderDate,
                        lastOrderDate = part.lastOrderDate,
                        productId = part.productId
                    };
                }

                // Process QuotationOrderDetails parts
                // Merge with existing parts from orders if they exist
                foreach (var part in partsFromQuotations)
                {
                    // Use normalized key (case-insensitive) for merging orders with quotations
                    var key = $"{part.partNo.ToUpperInvariant()}|{part.partName.ToUpperInvariant()}|{part.unit.ToUpperInvariant()}";
                    if (!allParts.ContainsKey(key))
                    {
                        // New part only in quotations
                        allParts[key] = new
                        {
                            partNo = part.partNo,
                            partName = part.partName,
                            unit = part.unit,
                            totalQtyOrdered = 0,
                            totalQtyQuoted = part.totalQtyOrdered,
                            avgUnitPrice = part.avgUnitPrice,
                            minUnitPrice = part.minUnitPrice,
                            maxUnitPrice = part.maxUnitPrice,
                            orderCount = 0,
                            quotationCount = part.orderCount,
                            firstOrderDate = part.firstOrderDate,
                            lastOrderDate = part.lastOrderDate,
                            productId = part.productId
                        };
                    }
                    else
                    {
                        // Merge: part exists in both orders and quotations — keep qty streams separate
                        var existing = allParts[key];
                        var totalCount = existing.orderCount + part.orderCount;
                        
                        allParts[key] = new
                        {
                            partNo = part.partNo,
                            partName = part.partName,
                            unit = part.unit,
                            totalQtyOrdered = existing.totalQtyOrdered,
                            totalQtyQuoted = part.totalQtyOrdered,
                            // Weighted average: combine averages from orders and quotations
                            avgUnitPrice = totalCount > 0 ? (existing.avgUnitPrice * existing.orderCount + part.avgUnitPrice * part.orderCount) / totalCount : existing.avgUnitPrice,
                            // Min price: find the absolute minimum across both orders and quotations
                            minUnitPrice = Math.Min(existing.minUnitPrice, part.minUnitPrice),
                            // Max price: find the absolute maximum across both orders and quotations
                            maxUnitPrice = Math.Max(existing.maxUnitPrice, part.maxUnitPrice),
                            orderCount = existing.orderCount,
                            quotationCount = part.orderCount,
                            firstOrderDate = existing.firstOrderDate < part.firstOrderDate ? existing.firstOrderDate : part.firstOrderDate,
                            lastOrderDate = existing.lastOrderDate > part.lastOrderDate ? existing.lastOrderDate : part.lastOrderDate,
                            productId = existing.productId ?? part.productId
                        };
                    }
                }

                var result = allParts.Values
                    .OrderBy(p => p.partNo)
                    .ThenBy(p => p.partName)
                    .ToList();

                return Ok(new { result = result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        /// <summary>
        /// Returns all products from the ProductMaster table for the tenant.
        /// Use this to show products when order-derived list is empty or to merge with GetProductsFromOrders.
        /// </summary>
        [HttpGet("GetProductMasterList")]
        public async Task<IActionResult> GetProductMasterList([FromQuery] int tenantid)
        {
            try
            {
                var list = await _context.ProductMaster
                    .Where(p => p.tenantid == tenantid)
                    .OrderBy(p => p.partno)
                    .Select(p => new
                    {
                        partNo = p.partno ?? "",
                        partName = p.partname ?? "",
                        unit = p.Unit ?? "",
                        totalQtyOrdered = 0,
                        totalQtyQuoted = 0,
                        avgUnitPrice = p.UnitPrice,
                        minUnitPrice = p.UnitPrice,
                        maxUnitPrice = p.UnitPrice,
                        orderCount = 0,
                        quotationCount = 0,
                        firstOrderDate = "",
                        lastOrderDate = "",
                        productId = (int?)p.Id,
                        sourcingType = string.IsNullOrWhiteSpace(p.SourcingType) ? "Make" : p.SourcingType
                    })
                    .ToListAsync();
                return Ok(new { result = list });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        [HttpGet("GetProductById")]
        public IActionResult GetProductById([FromQuery] string partNo, [FromQuery] int tenantId)
        {
            try
            {
                if (string.IsNullOrEmpty(partNo))
                {
                    return BadRequest(new { error = "Part number is required" });
                }

                var partNoTrimmed = partNo.Trim();

                // Try to get from ProductMaster first (with trimmed comparison)
                var productMaster = _context.ProductMaster
                    .Where(p => p.tenantid == tenantId)
                    .AsEnumerable()
                    .FirstOrDefault(p => (p.partno ?? "").Trim() == partNoTrimmed);

                if (productMaster != null)
                {
                    var productData = new
                    {
                        id = productMaster.Id,
                        partNo = productMaster.partno ?? "",
                        partName = productMaster.partname ?? "",
                        unit = productMaster.Unit ?? "",
                        unitPrice = productMaster.UnitPrice,
                        noOfDays = productMaster.Noofday,
                        description = productMaster.pdescription ?? "",
                        customerId = productMaster.customerid,
                        sourcingType = string.IsNullOrWhiteSpace(productMaster.SourcingType) ? "Make" : productMaster.SourcingType,
                        reorderPoint = productMaster.ReorderPoint,
                        reorderQuantity = productMaster.ReorderQuantity,
                        source = "ProductMaster"
                    };

                    return Ok(new { result = productData });
                }

                // If not found in ProductMaster, get aggregated data from CustomerOrderDetails
                // Apply same filtering as GetProductsFromOrders (exclude Job Number patterns, trim for comparison)
                var partDetails = _context.CustomerOrderDetails
                    .Where(d => d.Tenantid == tenantId 
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .AsEnumerable()
                    .Where(d => (d.PartNo ?? "").Trim() == partNoTrimmed)
                    .ToList();

                if (partDetails.Any())
                {
                    var orderIds = partDetails.Select(d => d.OrderID).Distinct().ToList();
                    var orders = _context.CustomerOrder
                        .Where(o => orderIds.Contains(o.OrderID) && o.Tenantid == tenantId)
                        .ToList();

                    var partFromOrders = partDetails
                        .GroupBy(d => new 
                        { 
                            PartNo = (d.PartNo ?? "").Trim(), 
                            partname = (d.partname ?? "").Trim(), 
                            Unit = (d.Unit ?? "").Trim() 
                        })
                        .Select(g => new
                        {
                            partNo = g.Key.PartNo,
                            partName = g.Key.partname,
                            unit = g.Key.Unit,
                            avgUnitPrice = g.Average(d => d.UnitPrice),
                            minUnitPrice = g.Min(d => d.UnitPrice),
                            maxUnitPrice = g.Max(d => d.UnitPrice),
                            productId = g.Where(d => d.productid.HasValue).Select(d => d.productid).FirstOrDefault(),
                            source = "CustomerOrders",
                            customers = g.Select(d => d.OrderID)
                                .Distinct()
                                .Select(orderId => {
                                    var order = orders.FirstOrDefault(o => o.OrderID == orderId);
                                    if (order != null)
                                    {
                                        var orderDetails = partDetails.Where(pd => pd.OrderID == orderId);
                                        return new
                                        {
                                            customerId = order.CustomerID,
                                            customerName = order.CustomerName ?? "",
                                            customerCode = order.customercode ?? "",
                                            orderId = order.OrderID,
                                            orderNumber = order.PONumber,
                                            orderDate = order.OrderDate,
                                            totalQty = orderDetails.Sum(pd => pd.QtyOrdered),
                                            avgPrice = orderDetails.Average(pd => pd.UnitPrice)
                                        };
                                    }
                                    return null;
                                })
                                .Where(c => c != null)
                                .GroupBy(c => c.customerId)
                                .Select(cg => {
                                    var firstCustomer = cg.First();
                                    return new
                                    {
                                        customerId = cg.Key,
                                        customerName = firstCustomer.customerName,
                                        customerCode = firstCustomer.customerCode,
                                        orderCount = cg.Count(),
                                        totalQty = cg.Sum(c => c.totalQty),
                                        avgPrice = cg.Average(c => c.avgPrice),
                                        lastOrderDate = cg.Max(c => c.orderDate),
                                        orders = cg.Select(c => new
                                        {
                                            orderId = c.orderId,
                                            orderNumber = c.orderNumber,
                                            orderDate = c.orderDate,
                                            qty = c.totalQty,
                                            price = c.avgPrice
                                        }).ToList()
                                    };
                                })
                                .ToList()
                        })
                        .FirstOrDefault();

                    if (partFromOrders != null)
                    {
                        return Ok(new { result = partFromOrders });
                    }
                }

                // Also check QuotationOrderDetails
                var quotationDetails = _context.QuotationOrderDetails
                    .Where(d => d.Tenantid == tenantId 
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .AsEnumerable()
                    .Where(d => (d.PartNo ?? "").Trim() == partNoTrimmed)
                    .ToList();

                if (quotationDetails.Any())
                {
                    var quotationIds = quotationDetails.Select(d => d.OrderID).Distinct().ToList();
                    var quotations = _context.QuotationOrder
                        .Where(q => quotationIds.Contains(q.OrderID) && q.Tenantid == tenantId)
                        .ToList();

                    var partFromQuotations = quotationDetails
                        .GroupBy(d => new 
                        { 
                            PartNo = (d.PartNo ?? "").Trim(), 
                            partname = (d.partname ?? "").Trim(), 
                            Unit = (d.Unit ?? "").Trim() 
                        })
                        .Select(g => new
                        {
                            partNo = g.Key.PartNo,
                            partName = g.Key.partname,
                            unit = g.Key.Unit,
                            avgUnitPrice = g.Average(d => d.UnitPrice),
                            minUnitPrice = g.Min(d => d.UnitPrice),
                            maxUnitPrice = g.Max(d => d.UnitPrice),
                            productId = g.Where(d => d.productid.HasValue).Select(d => d.productid).FirstOrDefault(),
                            source = "Quotations",
                            customers = g.Select(d => d.OrderID)
                                .Distinct()
                                .Select(quotationId => {
                                    var quotation = quotations.FirstOrDefault(q => q.OrderID == quotationId);
                                    if (quotation != null)
                                    {
                                        var quotDetails = quotationDetails.Where(qd => qd.OrderID == quotationId);
                                        return new
                                        {
                                            customerId = quotation.CustomerID,
                                            customerName = quotation.CustomerName ?? "",
                                            customerCode = quotation.customercode ?? "",
                                            quotationId = quotation.OrderID,
                                            quotationNumber = quotation.PONumber,
                                            quotationDate = quotation.OrderDate,
                                            totalQty = quotDetails.Sum(qd => qd.QtyOrdered),
                                            avgPrice = quotDetails.Average(qd => qd.UnitPrice)
                                        };
                                    }
                                    return null;
                                })
                                .Where(c => c != null)
                                .GroupBy(c => c.customerId)
                                .Select(cg => {
                                    var firstCustomer = cg.First();
                                    return new
                                    {
                                        customerId = cg.Key,
                                        customerName = firstCustomer.customerName,
                                        customerCode = firstCustomer.customerCode,
                                        quotationCount = cg.Count(),
                                        totalQty = cg.Sum(c => c.totalQty),
                                        avgPrice = cg.Average(c => c.avgPrice),
                                        lastQuotationDate = cg.Max(c => c.quotationDate),
                                        quotations = cg.Select(c => new
                                        {
                                            quotationId = c.quotationId,
                                            quotationNumber = c.quotationNumber,
                                            quotationDate = c.quotationDate,
                                            qty = c.totalQty,
                                            price = c.avgPrice
                                        }).ToList()
                                    };
                                })
                                .ToList()
                        })
                        .FirstOrDefault();

                    if (partFromQuotations != null)
                    {
                        return Ok(new { result = partFromQuotations });
                    }
                }

                return NotFound(new { error = $"Product with part number '{partNoTrimmed}' not found" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        /// <summary>
        /// Distinct parts previously used for a customer (from quotations and orders),
        /// with last quote/order price, counts, and totals for combobox / history UX.
        /// </summary>
        [HttpGet("GetPartsByCustomer")]
        public IActionResult GetPartsByCustomer(
            [FromQuery] int tenantId,
            [FromQuery] int customerId,
            [FromQuery] string? q = null,
            [FromQuery] int limit = 50)
        {
            try
            {
                if (customerId <= 0)
                {
                    return BadRequest(new { error = "Customer is required" });
                }

                if (limit <= 0) limit = 50;
                if (limit > 200) limit = 200;

                var search = (q ?? "").Trim();

                var quotations = _context.QuotationOrder
                    .AsNoTracking()
                    .Where(x => x.Tenantid == tenantId && x.CustomerID == customerId)
                    .Select(x => new { x.OrderID, x.OrderDate })
                    .ToList();
                var quotationIds = quotations.Select(x => x.OrderID).ToList();
                var quotationDateById = quotations.ToDictionary(x => x.OrderID, x => x.OrderDate);

                var orders = _context.CustomerOrder
                    .AsNoTracking()
                    .Where(o => o.Tenantid == tenantId && o.CustomerID == customerId)
                    .Select(o => new { o.OrderID, o.OrderDate })
                    .ToList();
                var orderIds = orders.Select(o => o.OrderID).ToList();
                var orderDateById = orders.ToDictionary(o => o.OrderID, o => o.OrderDate);

                var quotationDetailsQuery = _context.QuotationOrderDetails
                    .AsNoTracking()
                    .Where(d => d.Tenantid == tenantId
                        && quotationIds.Contains(d.OrderID)
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"));

                var orderDetailsQuery = _context.CustomerOrderDetails
                    .AsNoTracking()
                    .Where(d => d.Tenantid == tenantId
                        && orderIds.Contains(d.OrderID)
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"));

                if (!string.IsNullOrEmpty(search))
                {
                    quotationDetailsQuery = quotationDetailsQuery.Where(d =>
                        (d.PartNo != null && d.PartNo.Contains(search)) ||
                        (d.partname != null && d.partname.Contains(search)));
                    orderDetailsQuery = orderDetailsQuery.Where(d =>
                        (d.PartNo != null && d.PartNo.Contains(search)) ||
                        (d.partname != null && d.partname.Contains(search)));
                }

                var fromQuotations = quotationDetailsQuery
                    .Select(d => new
                    {
                        partNo = (d.PartNo ?? "").Trim(),
                        partName = (d.partname ?? "").Trim(),
                        unit = (d.Unit ?? "").Trim(),
                        unitPrice = d.UnitPrice,
                        qty = d.QtyOrdered,
                        productId = d.productid,
                        orderId = d.OrderID,
                        dueDate = d.DueDate
                    })
                    .ToList();

                var fromOrders = orderDetailsQuery
                    .Select(d => new
                    {
                        partNo = (d.PartNo ?? "").Trim(),
                        partName = (d.partname ?? "").Trim(),
                        unit = (d.Unit ?? "").Trim(),
                        unitPrice = d.UnitPrice,
                        qty = d.QtyOrdered,
                        productId = d.productid,
                        orderId = d.OrderID,
                        dueDate = d.DueDate
                    })
                    .ToList();

                var allPartNos = fromQuotations.Select(p => p.partNo)
                    .Concat(fromOrders.Select(p => p.partNo))
                    .Where(p => !string.IsNullOrWhiteSpace(p))
                    .Select(p => p.ToUpperInvariant())
                    .Distinct()
                    .ToList();

                var parts = allPartNos
                    .Select(key =>
                    {
                        var qLines = fromQuotations
                            .Where(p => string.Equals(p.partNo, key, StringComparison.OrdinalIgnoreCase))
                            .ToList();
                        var oLines = fromOrders
                            .Where(p => string.Equals(p.partNo, key, StringComparison.OrdinalIgnoreCase))
                            .ToList();

                        var latestQuote = qLines
                            .Select(p =>
                            {
                                var docDate = quotationDateById.TryGetValue(p.orderId, out var od) ? od : p.dueDate;
                                return new { line = p, docDate };
                            })
                            .OrderByDescending(x => x.docDate)
                            .FirstOrDefault();

                        var latestOrder = oLines
                            .Select(p =>
                            {
                                var docDate = orderDateById.TryGetValue(p.orderId, out var od) ? od : p.dueDate;
                                return new { line = p, docDate };
                            })
                            .OrderByDescending(x => x.docDate)
                            .FirstOrDefault();

                        var identity = latestOrder?.line ?? latestQuote?.line;
                        if (identity == null)
                        {
                            return null;
                        }

                        var lastOrderedPrice = latestOrder?.line.unitPrice;
                        var lastQuotedPrice = latestQuote?.line.unitPrice;
                        var unitPrice = lastOrderedPrice ?? lastQuotedPrice ?? 0m;
                        var suggestedQty = latestOrder?.line.qty
                            ?? latestQuote?.line.qty
                            ?? 1;

                        return new
                        {
                            partNo = identity.partNo,
                            partName = identity.partName,
                            unit = string.IsNullOrWhiteSpace(identity.unit) ? "EA" : identity.unit,
                            unitPrice = unitPrice,
                            productId = identity.productId
                                ?? latestOrder?.line.productId
                                ?? latestQuote?.line.productId,
                            lastQuotedPrice = lastQuotedPrice,
                            lastQuotedDate = latestQuote != null
                                ? latestQuote.docDate.ToString("MM/dd/yyyy")
                                : (string?)null,
                            lastOrderedPrice = lastOrderedPrice,
                            lastOrderedQty = latestOrder?.line.qty,
                            lastOrderedDate = latestOrder != null
                                ? latestOrder.docDate.ToString("MM/dd/yyyy")
                                : (string?)null,
                            suggestedQty = suggestedQty,
                            orderCount = oLines.Select(l => l.orderId).Distinct().Count(),
                            quotationCount = qLines.Select(l => l.orderId).Distinct().Count(),
                            totalQtyOrdered = oLines.Sum(l => l.qty),
                            totalQtyQuoted = qLines.Sum(l => l.qty)
                        };
                    })
                    .Where(p => p != null)
                    .OrderBy(p => p!.partNo)
                    .Take(limit)
                    .ToList();

                return Ok(new { result = parts });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        private static bool IsJobPartNo(string? partNo)
        {
            if (string.IsNullOrWhiteSpace(partNo)) return false;
            var p = partNo.Trim();
            return p.Contains("JO#", StringComparison.OrdinalIgnoreCase)
                || p.Contains("#JO", StringComparison.OrdinalIgnoreCase)
                || p.StartsWith("JO", StringComparison.OrdinalIgnoreCase);
        }

        private static string FirstLine(string? value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            var s = value.Trim();
            var idx = s.IndexOfAny(new[] { '\r', '\n' });
            return (idx >= 0 ? s.Substring(0, idx) : s).Trim();
        }

        /// <summary>
        /// Distinct parts previously used for a vendor (from vendor quotations and vendor orders).
        /// </summary>
        [HttpGet("GetPartsByVendor")]
        public IActionResult GetPartsByVendor(
            [FromQuery] int tenantId,
            [FromQuery] int vendorId,
            [FromQuery] string? q = null,
            [FromQuery] int limit = 50)
        {
            try
            {
                if (vendorId <= 0)
                {
                    return BadRequest(new { error = "Vendor is required" });
                }

                if (limit <= 0) limit = 50;
                if (limit > 200) limit = 200;

                var search = (q ?? "").Trim();

                var quotations = _context.VendorQuotations
                    .AsNoTracking()
                    .Where(x => x.Tenantid == tenantId && x.VendorID == vendorId)
                    .Select(x => new { x.OrderID, x.OrderDate })
                    .ToList();
                var quotationIds = quotations.Select(x => x.OrderID).ToList();
                var quotationDateById = quotations.ToDictionary(x => x.OrderID, x => x.OrderDate);

                var orders = _context.VendorOrders
                    .AsNoTracking()
                    .Where(o => o.Tenantid == tenantId && o.VendorID == vendorId)
                    .Select(o => new { o.OrderID, o.OrderDate })
                    .ToList();
                var orderIds = orders.Select(o => o.OrderID).ToList();
                var orderDateById = orders.ToDictionary(o => o.OrderID, o => o.OrderDate);

                var quotationDetailsQuery = _context.VendorQuotationsDetails
                    .AsNoTracking()
                    .Where(d => d.Tenantid == tenantId && quotationIds.Contains(d.OrderID));

                var orderDetailsQuery = _context.VendorOrderDetails
                    .AsNoTracking()
                    .Where(d => d.Tenantid == tenantId && orderIds.Contains(d.OrderID));

                if (!string.IsNullOrEmpty(search))
                {
                    quotationDetailsQuery = quotationDetailsQuery.Where(d =>
                        (d.PartNo != null && d.PartNo.Contains(search)) ||
                        (d.itemname != null && d.itemname.Contains(search)));
                    orderDetailsQuery = orderDetailsQuery.Where(d =>
                        (d.PartNo != null && d.PartNo.Contains(search)) ||
                        (d.PartName != null && d.PartName.Contains(search)));
                }

                var fromQuotations = quotationDetailsQuery
                    .Select(d => new
                    {
                        partNo = (d.PartNo ?? "").Trim(),
                        partName = (d.itemname ?? "").Trim(),
                        unit = (d.Unit ?? "").Trim(),
                        unitPrice = d.UnitPrice,
                        qty = d.QtyOrdered,
                        productId = d.productid,
                        orderId = d.OrderID,
                        dueDate = d.DueDate
                    })
                    .ToList()
                    .Select(d =>
                    {
                        var historyKey = !IsJobPartNo(d.partNo) && !string.IsNullOrWhiteSpace(d.partNo)
                            ? d.partNo
                            : FirstLine(d.partName);
                        return new
                        {
                            historyKey,
                            partNo = !IsJobPartNo(d.partNo) && !string.IsNullOrWhiteSpace(d.partNo)
                                ? d.partNo
                                : FirstLine(d.partName),
                            partName = d.partName,
                            unit = d.unit,
                            unitPrice = d.unitPrice,
                            qty = d.qty,
                            productId = d.productId,
                            orderId = d.orderId,
                            dueDate = d.dueDate
                        };
                    })
                    .Where(d => !string.IsNullOrWhiteSpace(d.historyKey))
                    .ToList();

                var fromOrders = orderDetailsQuery
                    .Select(d => new
                    {
                        partNo = (d.PartNo ?? "").Trim(),
                        partName = (d.PartName ?? "").Trim(),
                        unit = (d.Unit ?? "").Trim(),
                        unitPrice = d.UnitPrice,
                        qty = d.QtyOrdered,
                        productId = d.ProductId,
                        orderId = d.OrderID,
                        dueDate = (DateTime?)d.DueDateDateTime
                    })
                    .ToList()
                    .Select(d =>
                    {
                        var historyKey = !IsJobPartNo(d.partNo) && !string.IsNullOrWhiteSpace(d.partNo)
                            ? d.partNo
                            : FirstLine(d.partName);
                        return new
                        {
                            historyKey,
                            partNo = !IsJobPartNo(d.partNo) && !string.IsNullOrWhiteSpace(d.partNo)
                                ? d.partNo
                                : FirstLine(d.partName),
                            partName = d.partName,
                            unit = d.unit,
                            unitPrice = d.unitPrice,
                            qty = d.qty,
                            productId = d.productId,
                            orderId = d.orderId,
                            dueDate = d.dueDate
                        };
                    })
                    .Where(d => !string.IsNullOrWhiteSpace(d.historyKey))
                    .ToList();

                var allKeys = fromQuotations.Select(p => p.historyKey)
                    .Concat(fromOrders.Select(p => p.historyKey))
                    .Where(p => !string.IsNullOrWhiteSpace(p))
                    .Select(p => p.ToUpperInvariant())
                    .Distinct()
                    .ToList();

                var parts = allKeys
                    .Select(key =>
                    {
                        var qLines = fromQuotations
                            .Where(p => string.Equals(p.historyKey, key, StringComparison.OrdinalIgnoreCase))
                            .ToList();
                        var oLines = fromOrders
                            .Where(p => string.Equals(p.historyKey, key, StringComparison.OrdinalIgnoreCase))
                            .ToList();

                        var latestQuote = qLines
                            .Select(p =>
                            {
                                var docDate = quotationDateById.TryGetValue(p.orderId, out var od) && od.HasValue
                                    ? od.Value
                                    : (p.dueDate ?? DateTime.MinValue);
                                return new { line = p, docDate };
                            })
                            .OrderByDescending(x => x.docDate)
                            .FirstOrDefault();

                        var latestOrder = oLines
                            .Select(p =>
                            {
                                var docDate = orderDateById.TryGetValue(p.orderId, out var od)
                                    ? od
                                    : (p.dueDate ?? DateTime.MinValue);
                                return new { line = p, docDate };
                            })
                            .OrderByDescending(x => x.docDate)
                            .FirstOrDefault();

                        var identity = latestOrder?.line ?? latestQuote?.line;
                        if (identity == null)
                        {
                            return null;
                        }

                        var lastOrderedPrice = latestOrder?.line.unitPrice;
                        var lastQuotedPrice = latestQuote?.line.unitPrice;
                        var unitPrice = lastOrderedPrice ?? lastQuotedPrice ?? 0m;
                        var suggestedQty = latestOrder?.line.qty
                            ?? latestQuote?.line.qty
                            ?? 1;

                        return new
                        {
                            partNo = identity.partNo,
                            partName = identity.partName,
                            unit = string.IsNullOrWhiteSpace(identity.unit) ? "EA" : identity.unit,
                            unitPrice = unitPrice,
                            productId = identity.productId
                                ?? latestOrder?.line.productId
                                ?? latestQuote?.line.productId,
                            lastQuotedPrice = lastQuotedPrice,
                            lastQuotedDate = latestQuote != null && latestQuote.docDate > DateTime.MinValue
                                ? latestQuote.docDate.ToString("MM/dd/yyyy")
                                : (string?)null,
                            lastOrderedPrice = lastOrderedPrice,
                            lastOrderedQty = latestOrder?.line.qty,
                            lastOrderedDate = latestOrder != null && latestOrder.docDate > DateTime.MinValue
                                ? latestOrder.docDate.ToString("MM/dd/yyyy")
                                : (string?)null,
                            suggestedQty = suggestedQty,
                            orderCount = oLines.Select(l => l.orderId).Distinct().Count(),
                            quotationCount = qLines.Select(l => l.orderId).Distinct().Count(),
                            totalQtyOrdered = oLines.Sum(l => l.qty),
                            totalQtyQuoted = qLines.Sum(l => l.qty)
                        };
                    })
                    .Where(p => p != null)
                    .OrderBy(p => p!.partNo)
                    .Take(limit)
                    .ToList();

                return Ok(new { result = parts });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message, stackTrace = ex.StackTrace });
            }
        }

        /// <summary>
        /// Syncs ProductMaster from customer orders/quotations (Make) and vendor PO finished-product lines (Buy).
        /// Existing part numbers are not duplicated; Make + Buy becomes Both.
        /// </summary>
        [HttpPost("SyncFromOrders")]
        public async Task<IActionResult> SyncFromOrders([FromQuery] int tenantid)
        {
            try
            {
                var existingProducts = await _context.ProductMaster
                    .Where(p => p.tenantid == tenantid)
                    .ToListAsync();
                var existingByPartNo = existingProducts
                    .Where(p => !string.IsNullOrWhiteSpace(p.partno))
                    .GroupBy(p => (p.partno ?? "").Trim(), StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

                var orderParts = await _context.CustomerOrderDetails
                    .Where(d => d.Tenantid == tenantid
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .Select(d => new
                    {
                        PartNo = d.PartNo.Trim(),
                        partname = d.partname ?? "",
                        Unit = d.Unit ?? "",
                        UnitPrice = d.UnitPrice,
                        OrderID = d.OrderID
                    })
                    .ToListAsync();

                var quotationParts = await _context.QuotationOrderDetails
                    .Where(d => d.Tenantid == tenantid
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .Select(d => new
                    {
                        PartNo = d.PartNo.Trim(),
                        partname = (d.partname ?? "").Trim(),
                        Unit = (d.Unit ?? "").Trim(),
                        UnitPrice = d.UnitPrice,
                        OrderID = d.OrderID
                    })
                    .ToListAsync();

                var orderGroups = orderParts
                    .GroupBy(p => p.PartNo.ToUpperInvariant())
                    .ToDictionary(g => g.Key, g => g.ToList());
                var quotationGroups = quotationParts
                    .GroupBy(p => p.PartNo.ToUpperInvariant())
                    .ToDictionary(g => g.Key, g => g.ToList());

                var salesKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var k in orderGroups.Keys) salesKeys.Add(k);
                foreach (var k in quotationGroups.Keys) salesKeys.Add(k);

                int added = 0;
                int updated = 0;

                foreach (var normalizedKey in salesKeys)
                {
                    string partNo = "";
                    string partName = "";
                    string unit = "";
                    decimal unitPrice = 0;
                    var allLines = new List<decimal>();

                    if (orderGroups.TryGetValue(normalizedKey, out var orderList))
                    {
                        var first = orderList.First();
                        partNo = first.PartNo;
                        partName = first.partname?.Trim() ?? "";
                        unit = first.Unit?.Trim() ?? "";
                        foreach (var x in orderList) allLines.Add(x.UnitPrice);
                    }
                    if (quotationGroups.TryGetValue(normalizedKey, out var quotList))
                    {
                        var first = quotList.First();
                        if (string.IsNullOrEmpty(partNo)) partNo = first.PartNo;
                        if (string.IsNullOrEmpty(partName)) partName = first.partname?.Trim() ?? "";
                        if (string.IsNullOrEmpty(unit)) unit = first.Unit?.Trim() ?? "";
                        foreach (var x in quotList) allLines.Add(x.UnitPrice);
                    }

                    if (string.IsNullOrWhiteSpace(partNo) || ProductSourcing.LooksLikeJobPartNo(partNo))
                        continue;

                    unitPrice = allLines.Count > 0 ? allLines.Average() : 0;
                    var safePartNo = partNo.Trim();
                    var lookupKey = safePartNo;

                    if (existingByPartNo.TryGetValue(lookupKey, out var existingMake))
                    {
                        var merged = ProductSourcing.Merge(existingMake.SourcingType, ProductSourcing.Make);
                        if (!string.Equals(existingMake.SourcingType, merged, StringComparison.OrdinalIgnoreCase))
                        {
                            existingMake.SourcingType = merged;
                            updated++;
                        }
                        else if (string.IsNullOrWhiteSpace(existingMake.SourcingType))
                        {
                            existingMake.SourcingType = ProductSourcing.Make;
                            updated++;
                        }
                        continue;
                    }

                    var entity = new ProductMaster
                    {
                        partno = safePartNo,
                        partname = string.IsNullOrWhiteSpace(partName) ? safePartNo : partName.Trim(),
                        Unit = string.IsNullOrWhiteSpace(unit) ? "EA" : unit.Trim(),
                        UnitPrice = unitPrice,
                        tenantid = tenantid,
                        customerid = null,
                        Noofday = null,
                        pdescription = "Synced from orders",
                        SourcingType = ProductSourcing.Make
                    };
                    _context.ProductMaster.Add(entity);
                    existingByPartNo[lookupKey] = entity;
                    added++;
                }

                var vendorFinished = await _context.VendorOrderDetails
                    .AsNoTracking()
                    .Where(d => d.Tenantid == tenantid
                        && d.LineType != null
                        && d.LineType.ToLower() == "finishedproduct"
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .Select(d => new
                    {
                        PartNo = d.PartNo.Trim(),
                        PartName = d.PartName ?? "",
                        Unit = d.Unit ?? "",
                        UnitPrice = d.UnitPrice,
                        Id = d.ID,
                        ProductId = d.ProductId
                    })
                    .ToListAsync();

                var buyGroups = vendorFinished
                    .GroupBy(p => p.PartNo, StringComparer.OrdinalIgnoreCase);

                int linkedPoLines = 0;
                var poLinesToLink = new List<(int DetailId, int ProductId)>();

                foreach (var group in buyGroups)
                {
                    var first = group.First();
                    if (string.IsNullOrWhiteSpace(first.PartNo) || ProductSourcing.LooksLikeJobPartNo(first.PartNo))
                        continue;

                    var avgPrice = group.Average(x => x.UnitPrice);
                    ProductMaster product;
                    if (existingByPartNo.TryGetValue(first.PartNo, out var existingBuy))
                    {
                        var merged = ProductSourcing.Merge(existingBuy.SourcingType, ProductSourcing.Buy);
                        if (!string.Equals(existingBuy.SourcingType, merged, StringComparison.OrdinalIgnoreCase)
                            || string.IsNullOrWhiteSpace(existingBuy.SourcingType))
                        {
                            existingBuy.SourcingType = merged;
                            updated++;
                        }
                        if (string.IsNullOrWhiteSpace(existingBuy.partname) && !string.IsNullOrWhiteSpace(first.PartName))
                            existingBuy.partname = first.PartName.Trim();
                        product = existingBuy;
                    }
                    else
                    {
                        product = new ProductMaster
                        {
                            partno = first.PartNo.Trim(),
                            partname = string.IsNullOrWhiteSpace(first.PartName) ? first.PartNo.Trim() : first.PartName.Trim(),
                            Unit = string.IsNullOrWhiteSpace(first.Unit) ? "EA" : first.Unit.Trim(),
                            UnitPrice = avgPrice,
                            tenantid = tenantid,
                            customerid = null,
                            Noofday = null,
                            pdescription = "Synced from vendor purchase orders",
                            SourcingType = ProductSourcing.Buy
                        };
                        _context.ProductMaster.Add(product);
                        existingByPartNo[first.PartNo] = product;
                        added++;
                    }

                }

                await _context.SaveChangesAsync();

                // After insert, new products have ids — link unmatched PO lines.
                foreach (var group in buyGroups)
                {
                    if (!existingByPartNo.TryGetValue(group.Key, out var product) || product.Id <= 0)
                        continue;
                    foreach (var line in group.Where(l => !l.ProductId.HasValue || l.ProductId.Value <= 0))
                    {
                        poLinesToLink.Add((line.Id, product.Id));
                    }
                }

                var linkIds = poLinesToLink.Where(x => x.ProductId > 0).Select(x => x.DetailId).Distinct().ToList();
                if (linkIds.Count > 0)
                {
                    var details = await _context.VendorOrderDetails
                        .Where(d => linkIds.Contains(d.ID) && d.Tenantid == tenantid)
                        .ToListAsync();
                    foreach (var d in details)
                    {
                        if (existingByPartNo.TryGetValue((d.PartNo ?? "").Trim(), out var product) && product.Id > 0)
                        {
                            d.ProductId = product.Id;
                            linkedPoLines++;
                        }
                    }
                    if (linkedPoLines > 0)
                        await _context.SaveChangesAsync();
                }

                return Ok(new
                {
                    added,
                    updated,
                    linkedPoLines,
                    message = $"Product Master synced: {added} new, {updated} sourcing updated, {linkedPoLines} PO line(s) linked (customer orders = Make, purchased finished goods = Buy)."
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new
                {
                    error = ex.Message,
                    inner = ex.InnerException?.Message,
                    stackTrace = ex.StackTrace
                });
            }
        }

        [HttpPost("SaveReorderPolicy")]
        public async Task<IActionResult> SaveReorderPolicy([FromBody] ProductReorderPolicyDto dto)
        {
            try
            {
                var tenantId = dto.Tenantid > 0 ? dto.Tenantid : GetTenantId();
                if (dto.Id <= 0)
                    return BadRequest(new { error = "Product id is required." });

                var entity = await _context.ProductMaster
                    .FirstOrDefaultAsync(p => p.Id == dto.Id && p.tenantid == tenantId);
                if (entity == null)
                    return NotFound(new { error = "Product not found." });

                if (dto.ReorderPoint.HasValue && dto.ReorderPoint.Value < 0)
                    return BadRequest(new { error = "Reorder point cannot be negative." });
                if (dto.ReorderQuantity.HasValue && dto.ReorderQuantity.Value < 0)
                    return BadRequest(new { error = "Reorder quantity cannot be negative." });

                entity.ReorderPoint = dto.ReorderPoint;
                entity.ReorderQuantity = dto.ReorderQuantity;
                await _context.SaveChangesAsync();

                var stockRows = await _context.InventoryBalance
                    .Where(b => b.Tenantid == tenantId && b.ProductId == entity.Id)
                    .ToListAsync();
                foreach (var row in stockRows)
                {
                    row.ReorderPoint = entity.ReorderPoint;
                    row.ReorderQuantity = entity.ReorderQuantity;
                }
                if (stockRows.Count > 0)
                    await _context.SaveChangesAsync();

                return Ok(new { result = new { id = entity.Id, reorderPoint = entity.ReorderPoint, reorderQuantity = entity.ReorderQuantity } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    public class ProductReorderPolicyDto
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }
        public decimal? ReorderPoint { get; set; }
        public decimal? ReorderQuantity { get; set; }
    }
}

