using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
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
                            totalQtyOrdered = part.totalQtyOrdered,
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
                        // Merge: part exists in both orders and quotations
                        var existing = allParts[key];
                        var totalCount = existing.orderCount + part.orderCount;
                        
                        allParts[key] = new
                        {
                            partNo = part.partNo,
                            partName = part.partName,
                            unit = part.unit,
                            totalQtyOrdered = existing.totalQtyOrdered + part.totalQtyOrdered,
                            // Weighted average: combine averages from orders and quotations
                            avgUnitPrice = totalCount > 0 ? (existing.avgUnitPrice * existing.orderCount + part.avgUnitPrice * part.orderCount) / totalCount : existing.avgUnitPrice,
                            // Min price: find the absolute minimum across both orders and quotations
                            minUnitPrice = Math.Min(existing.minUnitPrice, part.minUnitPrice),
                            // Max price: find the absolute maximum across both orders and quotations
                            maxUnitPrice = Math.Max(existing.maxUnitPrice, part.maxUnitPrice),
                            orderCount = existing.orderCount,
                            quotationCount = existing.quotationCount + part.orderCount,
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
                        avgUnitPrice = p.UnitPrice,
                        minUnitPrice = p.UnitPrice,
                        maxUnitPrice = p.UnitPrice,
                        orderCount = 0,
                        quotationCount = 0,
                        firstOrderDate = "",
                        lastOrderDate = "",
                        productId = (int?)p.Id
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
        /// Syncs ProductMaster with distinct parts from CustomerOrderDetails and QuotationOrderDetails.
        /// Inserts new products that appear on orders/quotations but do not yet exist in ProductMaster.
        /// </summary>
        [HttpPost("SyncFromOrders")]
        public async Task<IActionResult> SyncFromOrders([FromQuery] int tenantid)
        {
            try
            {
                var existingPartNos = await _context.ProductMaster
                    .Where(p => p.tenantid == tenantid)
                    .Select(p => new { partno = (p.partno ?? "").Trim() })
                    .ToListAsync();
                var existingSet = new HashSet<string>(existingPartNos.Select(p => p.partno), StringComparer.OrdinalIgnoreCase);

                // Distinct parts from CustomerOrderDetails (same filters as GetProductsFromOrders)
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

                // Distinct parts from QuotationOrderDetails
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

                // Group order parts by PartNo (case-insensitive) to get first OrderID for customer lookup and avg price
                var orderGroups = orderParts
                    .GroupBy(p => p.PartNo.ToUpperInvariant())
                    .ToDictionary(g => g.Key, g => g.ToList());
                var quotationGroups = quotationParts
                    .GroupBy(p => p.PartNo.ToUpperInvariant())
                    .ToDictionary(g => g.Key, g => g.ToList());

                var allNormalizedKeys = new HashSet<string>();
                foreach (var k in orderGroups.Keys) allNormalizedKeys.Add(k);
                foreach (var k in quotationGroups.Keys) allNormalizedKeys.Add(k);

                int added = 0;

                foreach (var normalizedKey in allNormalizedKeys)
                {
                    if (existingSet.Contains(normalizedKey)) continue;

                    string partNo = "";
                    string partName = "";
                    string unit = "";
                    decimal unitPrice = 0;
                    var allLines = new List<(decimal UnitPrice, int OrderID, bool isOrder)>();

                    if (orderGroups.TryGetValue(normalizedKey, out var orderList))
                    {
                        var first = orderList.First();
                        partNo = first.PartNo;
                        partName = first.partname?.Trim() ?? "";
                        unit = first.Unit?.Trim() ?? "";
                        foreach (var x in orderList) allLines.Add((x.UnitPrice, x.OrderID, true));
                    }
                    if (quotationGroups.TryGetValue(normalizedKey, out var quotList))
                    {
                        var first = quotList.First();
                        if (string.IsNullOrEmpty(partNo)) partNo = first.PartNo;
                        if (string.IsNullOrEmpty(partName)) partName = first.partname?.Trim() ?? "";
                        if (string.IsNullOrEmpty(unit)) unit = first.Unit?.Trim() ?? "";
                        foreach (var x in quotList) allLines.Add((x.UnitPrice, x.OrderID, false));
                    }

                    if (string.IsNullOrWhiteSpace(partNo)) continue;
                    unitPrice = allLines.Count > 0 ? allLines.Average(x => x.UnitPrice) : 0;
                    var safePartNo = partNo.Trim();
                    var safePartName = string.IsNullOrWhiteSpace(partName) ? safePartNo : partName.Trim();
                    var safeUnit = string.IsNullOrWhiteSpace(unit) ? "EA" : unit.Trim();
                    _context.ProductMaster.Add(new ProductMaster
                    {
                        partno = safePartNo,
                        partname = safePartName,
                        Unit = safeUnit,
                        UnitPrice = unitPrice,
                        tenantid = tenantid,
                        // Some order header customer IDs may not be valid in ProductMaster FK context.
                        // Keep this null during sync to avoid save failures and keep product creation resilient.
                        customerid = null,
                        Noofday = null,
                        // ProductMaster.pdescription is NOT NULL in DB schema.
                        // Use a non-empty value to avoid DB-side null/empty normalization.
                        pdescription = "Synced from orders"
                    });
                    existingSet.Add(normalizedKey);
                    added++;
                }

                await _context.SaveChangesAsync();
                return Ok(new { added, message = $"Product Master synced: {added} new product(s) added from customer orders and quotations." });
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
    }
}

