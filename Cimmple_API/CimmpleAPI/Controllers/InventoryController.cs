using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Services;

namespace CimmpleAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class InventoryController : ApiBaseController
    {
        private readonly CimmpleDbContext _context;
        private readonly InventoryService _inventoryService;

        public InventoryController(CimmpleDbContext context, InventoryService inventoryService)
        {
            _context = context;
            _inventoryService = inventoryService;
        }

        [HttpGet("GetBalanceList")]
        public async Task<IActionResult> GetBalanceList(
            [FromQuery] int tenantId,
            [FromQuery] int? locationId,
            [FromQuery] int? productId,
            [FromQuery] int? rawMaterialId,
            [FromQuery] bool? lowStockOnly)
        {
            try
            {
                var query = _context.InventoryBalance
                    .Include(b => b.Product)
                    .Include(b => b.RawMaterial)
                    .Include(b => b.Location)
                    .Where(b => b.Tenantid == tenantId);

                if (locationId.HasValue)
                    query = query.Where(b => b.LocationId == locationId.Value);
                if (productId.HasValue)
                    query = query.Where(b => b.ProductId == productId.Value);
                if (rawMaterialId.HasValue)
                    query = query.Where(b => b.RawMaterialId == rawMaterialId.Value);
                if (lowStockOnly == true)
                    query = query.Where(b => b.ReorderPoint.HasValue && b.QuantityOnHand <= b.ReorderPoint);

                var balances = await query
                    .OrderBy(b => b.LocationId)
                    .ThenBy(b => (b.Product != null ? b.Product.partno : null) ?? (b.RawMaterial != null ? b.RawMaterial.PartNo : null) ?? "")
                    .Select(b => new
                    {
                        id = b.Id,
                        productId = b.ProductId,
                        rawMaterialId = b.RawMaterialId,
                        productPartNo = b.Product != null ? b.Product.partno : null,
                        rawMaterialPartNo = b.RawMaterial != null ? b.RawMaterial.PartNo : null,
                        productName = b.Product != null ? b.Product.partname : null,
                        rawMaterialName = b.RawMaterial != null ? b.RawMaterial.PartName : null,
                        locationId = b.LocationId,
                        locationName = b.Location != null ? b.Location.Name : null,
                        quantityOnHand = b.QuantityOnHand,
                        quantityReserved = b.QuantityReserved,
                        quantityAvailable = b.QuantityOnHand - b.QuantityReserved,
                        reorderPoint = b.ReorderPoint,
                        reorderQuantity = b.ReorderQuantity,
                        unitCost = b.UnitCost
                    })
                    .ToListAsync();

                return Ok(new { result = balances });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetTransactionHistory")]
        public async Task<IActionResult> GetTransactionHistory(
            [FromQuery] int tenantId,
            [FromQuery] int? productId,
            [FromQuery] int? rawMaterialId,
            [FromQuery] int? locationId,
            [FromQuery] DateTime? fromDate,
            [FromQuery] DateTime? toDate,
            [FromQuery] int limit = 100)
        {
            try
            {
                var query = _context.InventoryTransaction
                    .Include(t => t.TransactionType)
                    .Include(t => t.Product)
                    .Include(t => t.RawMaterial)
                    .Include(t => t.Location)
                    .Where(t => t.Tenantid == tenantId);

                if (productId.HasValue)
                    query = query.Where(t => t.ProductId == productId.Value);
                if (rawMaterialId.HasValue)
                    query = query.Where(t => t.RawMaterialId == rawMaterialId.Value);
                if (locationId.HasValue)
                    query = query.Where(t => t.LocationId == locationId.Value);
                if (fromDate.HasValue)
                    query = query.Where(t => t.TransactionDate >= fromDate.Value);
                if (toDate.HasValue)
                    query = query.Where(t => t.TransactionDate <= toDate.Value);

                var transactions = await query
                    .OrderByDescending(t => t.TransactionDate)
                    .Take(limit)
                    .Select(t => new
                    {
                        id = t.Id,
                        productId = t.ProductId,
                        rawMaterialId = t.RawMaterialId,
                        productPartNo = t.Product != null ? t.Product.partno : null,
                        rawMaterialPartNo = t.RawMaterial != null ? t.RawMaterial.PartNo : null,
                        locationId = t.LocationId,
                        locationName = t.Location != null ? t.Location.Name : null,
                        transactionType = t.TransactionType != null ? t.TransactionType.Code : null,
                        quantity = t.Quantity,
                        referenceType = t.ReferenceType,
                        referenceId = t.ReferenceId,
                        transactionDate = t.TransactionDate,
                        notes = t.Notes
                    })
                    .ToListAsync();

                return Ok(new { result = transactions });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("ReceiveStock")]
        public async Task<IActionResult> ReceiveStock([FromBody] ReceiveStockRequest request)
        {
            try
            {
                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                var createdBy = request.CreatedBy ?? GetUserId();

                var (success, error) = await _inventoryService.ReceiveStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.LocationId,
                    request.Quantity,
                    request.ReferenceType,
                    request.ReferenceId,
                    request.LotId,
                    createdBy,
                    request.Notes);

                if (!success)
                    return BadRequest(new { error });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("IssueStock")]
        public async Task<IActionResult> IssueStock([FromBody] IssueStockRequest request)
        {
            try
            {
                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                var createdBy = request.CreatedBy ?? GetUserId();

                var (success, error) = await _inventoryService.IssueStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.LocationId,
                    request.Quantity,
                    request.ReferenceType,
                    request.ReferenceId,
                    createdBy,
                    request.Notes);

                if (!success)
                    return BadRequest(new { error });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("TransferStock")]
        public async Task<IActionResult> TransferStock([FromBody] TransferStockRequest request)
        {
            try
            {
                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                var createdBy = request.CreatedBy ?? GetUserId();

                var (success, error) = await _inventoryService.TransferStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.FromLocationId,
                    request.ToLocationId,
                    request.Quantity,
                    createdBy,
                    request.Notes);

                if (!success)
                    return BadRequest(new { error });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("AdjustStock")]
        public async Task<IActionResult> AdjustStock([FromBody] AdjustStockRequest request)
        {
            try
            {
                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                var createdBy = request.CreatedBy ?? GetUserId();

                var (success, error) = await _inventoryService.AdjustStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.LocationId,
                    request.Quantity,
                    createdBy,
                    request.Notes);

                if (!success)
                    return BadRequest(new { error });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetLowStockAlerts")]
        public async Task<IActionResult> GetLowStockAlerts([FromQuery] int tenantId)
        {
            try
            {
                var alerts = await _context.InventoryBalance
                    .Include(b => b.Product)
                    .Include(b => b.RawMaterial)
                    .Include(b => b.Location)
                    .Where(b => b.Tenantid == tenantId && b.ReorderPoint.HasValue && b.QuantityOnHand <= b.ReorderPoint)
                    .Select(b => new
                    {
                        id = b.Id,
                        productId = b.ProductId,
                        rawMaterialId = b.RawMaterialId,
                        partNo = b.ProductId != null ? b.Product!.partno : b.RawMaterial!.PartNo,
                        partName = b.ProductId != null ? b.Product!.partname : b.RawMaterial!.PartName,
                        locationName = b.Location != null ? b.Location.Name : null,
                        quantityOnHand = b.QuantityOnHand,
                        reorderPoint = b.ReorderPoint,
                        reorderQuantity = b.ReorderQuantity
                    })
                    .ToListAsync();

                return Ok(new { result = alerts });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Returns products for inventory dropdown. Includes ProductMaster plus products from
        /// orders/quotations that can be resolved (by productId or PartNo match).
        /// </summary>
        [HttpGet("GetProducts")]
        public async Task<IActionResult> GetProducts([FromQuery] int tenantId)
        {
            try
            {
                var productIds = new HashSet<int>();

                // 1. All products from ProductMaster
                var fromMaster = await _context.ProductMaster
                    .Where(p => p.tenantid == tenantId)
                    .Select(p => new { p.Id, p.partno, p.partname, p.Unit })
                    .ToListAsync();
                foreach (var p in fromMaster) productIds.Add(p.Id);

                // 2. Products from orders - resolve to ProductMaster.Id via productId or PartNo lookup
                var orderParts = await _context.CustomerOrderDetails
                    .Where(d => d.Tenantid == tenantId
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .Select(d => new { d.productid, PartNo = (d.PartNo ?? "").Trim() })
                    .ToListAsync();
                var quotParts = await _context.QuotationOrderDetails
                    .Where(d => d.Tenantid == tenantId
                        && !string.IsNullOrEmpty(d.PartNo)
                        && !d.PartNo.Contains("#JO")
                        && !d.PartNo.Contains("JO#"))
                    .Select(d => new { d.productid, PartNo = (d.PartNo ?? "").Trim() })
                    .ToListAsync();

                var allParts = orderParts.Concat(quotParts).ToList();
                foreach (var d in allParts)
                {
                    if (d.productid.HasValue)
                        productIds.Add(d.productid.Value);
                }
                var partNosToResolve = allParts
                    .Where(d => !d.productid.HasValue && !string.IsNullOrEmpty(d.PartNo))
                    .Select(d => d.PartNo.ToLower())
                    .Distinct()
                    .ToList();
                if (partNosToResolve.Count > 0)
                {
                    var pmByPartNo = await _context.ProductMaster
                        .Where(p => p.tenantid == tenantId && p.partno != null)
                        .Select(p => new { p.Id, PartNo = (p.partno ?? "").Trim().ToLower() })
                        .ToListAsync();
                    foreach (var partNo in partNosToResolve)
                    {
                        var match = pmByPartNo.FirstOrDefault(p => p.PartNo == partNo);
                        if (match != null && match.Id != 0)
                        {
                            productIds.Add(match.Id);
                        }
                    }
                }

                var products = await _context.ProductMaster
                    .Where(p => p.tenantid == tenantId && productIds.Contains(p.Id))
                    .OrderBy(p => p.partno)
                    .Select(p => new
                    {
                        id = p.Id,
                        partNo = p.partno,
                        partName = p.partname,
                        unit = p.Unit
                    })
                    .ToListAsync();

                return Ok(new { result = products });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetRawMaterials")]
        public async Task<IActionResult> GetRawMaterials([FromQuery] int tenantId, [FromQuery] bool includeInactive = false)
        {
            try
            {
                var materials = await _context.RawMaterialMaster
                    .AsNoTracking()
                    .Where(r => r.Tenantid == tenantId && (includeInactive || r.IsActive))
                    .OrderBy(r => r.PartNo)
                    .Select(r => new
                    {
                        id = r.Id,
                        partNo = r.PartNo,
                        partName = r.PartName,
                        description = r.Description,
                        unit = r.Unit,
                        unitCost = r.UnitCost,
                        vendorId = r.VendorId,
                        vendorName = r.VendorId != null
                            ? _context.VendorMaster
                                .Where(v => v.Tenantid == tenantId && v.vendor_id == r.VendorId)
                                .Select(v => v.company_name)
                                .FirstOrDefault()
                            : null,
                        reorderPoint = r.ReorderPoint,
                        reorderQuantity = r.ReorderQuantity,
                        sku = r.Sku,
                        warehouseLocation = r.WarehouseLocation,
                        bin = r.Bin,
                        box = r.Box,
                        materialGrade = r.MaterialGrade,
                        specification = r.Specification,
                        stockForm = r.StockForm,
                        thicknessMm = r.ThicknessMm,
                        widthMm = r.WidthMm,
                        lengthMm = r.LengthMm,
                        isRemnant = r.IsRemnant,
                        isActive = r.IsActive,
                        parentRawMaterialId = r.ParentRawMaterialId,
                        parentPartNo = r.ParentRawMaterial != null ? r.ParentRawMaterial.PartNo : null,
                        defaultLocationId = r.DefaultLocationId,
                        defaultLocationName = r.DefaultLocation != null ? r.DefaultLocation.Name : null
                    })
                    .ToListAsync();

                return Ok(new { result = materials });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SaveRawMaterial")]
        public async Task<IActionResult> SaveRawMaterial([FromBody] RawMaterialDto dto)
        {
            try
            {
                var tenantId = dto.Tenantid > 0 ? dto.Tenantid : GetTenantId();

                var partNoNorm = (dto.PartNo ?? "").Trim();
                if (string.IsNullOrWhiteSpace(partNoNorm))
                    return BadRequest(new { error = "Part number is required." });

                var partNameNorm = (dto.PartName ?? "").Trim();
                if (string.IsNullOrWhiteSpace(partNameNorm))
                    return BadRequest(new { error = "Part name is required." });

                var unitNorm = (dto.Unit ?? "").Trim();
                if (string.IsNullOrWhiteSpace(unitNorm))
                    return BadRequest(new { error = "Unit of measure is required." });

                var duplicatePart = await _context.RawMaterialMaster.AnyAsync(r =>
                    r.Tenantid == tenantId &&
                    r.Id != dto.Id &&
                    r.PartNo != null &&
                    r.PartNo.Trim().ToLower() == partNoNorm.ToLower());
                if (duplicatePart)
                    return BadRequest(new { error = "A raw material with this part number already exists for this tenant." });

                var skuNorm = (dto.Sku ?? "").Trim();
                if (!string.IsNullOrWhiteSpace(skuNorm))
                {
                    var duplicateSku = await _context.RawMaterialMaster.AnyAsync(r =>
                        r.Tenantid == tenantId &&
                        r.Id != dto.Id &&
                        r.Sku != null &&
                        r.Sku.Trim().ToLower() == skuNorm.ToLower());
                    if (duplicateSku)
                        return BadRequest(new { error = "A raw material with this SKU already exists for this tenant." });
                }

                if (dto.VendorId.HasValue)
                {
                    var vendorOk = await _context.VendorMaster.AnyAsync(v =>
                        v.vendor_id == dto.VendorId.Value && v.Tenantid == tenantId);
                    if (!vendorOk)
                        return BadRequest(new { error = "Vendor not found for this tenant. Choose a vendor from Vendor Master or clear the vendor field." });
                }

                if (dto.ParentRawMaterialId.HasValue && dto.Id > 0 && dto.ParentRawMaterialId.Value == dto.Id)
                    return BadRequest(new { error = "Parent raw material cannot be the same record." });

                if (dto.ParentRawMaterialId.HasValue)
                {
                    var parentOk = await _context.RawMaterialMaster
                        .AnyAsync(r => r.Id == dto.ParentRawMaterialId.Value && r.Tenantid == tenantId);
                    if (!parentOk)
                        return BadRequest(new { error = "Parent raw material not found for this tenant." });
                }

                if (dto.DefaultLocationId.HasValue)
                {
                    var locOk = await _context.Locations
                        .AnyAsync(l => l.LocationId == dto.DefaultLocationId.Value && l.TenantId == tenantId);
                    if (!locOk)
                        return BadRequest(new { error = "Default location not found for this tenant." });
                }

                RawMaterialMaster entity;
                if (dto.Id > 0)
                {
                    entity = await _context.RawMaterialMaster
                        .FirstOrDefaultAsync(r => r.Id == dto.Id && r.Tenantid == tenantId);
                    if (entity == null)
                        return NotFound(new { error = "Raw material not found" });
                }
                else
                {
                    entity = new RawMaterialMaster
                    {
                        Tenantid = tenantId,
                        IsActive = true,
                    };
                    _context.RawMaterialMaster.Add(entity);
                }

                entity.PartNo = partNoNorm;
                entity.PartName = partNameNorm;
                entity.Description = string.IsNullOrWhiteSpace(dto.Description) ? null : dto.Description.Trim();
                entity.Unit = unitNorm;
                entity.UnitCost = dto.UnitCost;
                entity.VendorId = dto.VendorId;
                entity.ReorderPoint = dto.ReorderPoint;
                entity.ReorderQuantity = dto.ReorderQuantity;
                entity.Sku = string.IsNullOrWhiteSpace(skuNorm) ? null : skuNorm;
                entity.WarehouseLocation = dto.WarehouseLocation;
                entity.Bin = dto.Bin;
                entity.Box = dto.Box;
                entity.MaterialGrade = dto.MaterialGrade;
                entity.Specification = dto.Specification;
                entity.StockForm = dto.StockForm;
                entity.ThicknessMm = dto.ThicknessMm;
                entity.WidthMm = dto.WidthMm;
                entity.LengthMm = dto.LengthMm;
                entity.IsRemnant = dto.IsRemnant;
                entity.ParentRawMaterialId = dto.ParentRawMaterialId;
                entity.DefaultLocationId = dto.DefaultLocationId;

                await _context.SaveChangesAsync();
                return Ok(new { result = new { id = entity.Id } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("SetRawMaterialStatus")]
        public async Task<IActionResult> SetRawMaterialStatus([FromBody] RawMaterialStatusDto dto)
        {
            try
            {
                var tenantId = dto.Tenantid > 0 ? dto.Tenantid : GetTenantId();
                var entity = await _context.RawMaterialMaster
                    .FirstOrDefaultAsync(r => r.Id == dto.Id && r.Tenantid == tenantId);
                if (entity == null)
                    return NotFound(new { error = "Raw material not found." });

                if (entity.IsActive == dto.IsActive)
                    return Ok(new { result = new { id = entity.Id, isActive = entity.IsActive } });

                if (!dto.IsActive)
                {
                    var hasStock = await _context.InventoryBalance.AnyAsync(b =>
                        b.Tenantid == tenantId &&
                        b.RawMaterialId == entity.Id &&
                        (b.QuantityOnHand > 0 || b.QuantityReserved > 0));
                    if (hasStock)
                    {
                        return BadRequest(new
                        {
                            error = "Cannot deactivate raw material with stock on hand/reserved. Issue or adjust stock to zero first."
                        });
                    }
                }

                entity.IsActive = dto.IsActive;
                await _context.SaveChangesAsync();
                return Ok(new { result = new { id = entity.Id, isActive = entity.IsActive } });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    public class ReceiveStockRequest
    {
        public int TenantId { get; set; }
        public int? ProductId { get; set; }
        public int? RawMaterialId { get; set; }
        public int LocationId { get; set; }
        public decimal Quantity { get; set; }
        public string? ReferenceType { get; set; }
        public int? ReferenceId { get; set; }
        public int? LotId { get; set; }
        public int? CreatedBy { get; set; }
        public string? Notes { get; set; }
    }

    public class IssueStockRequest
    {
        public int TenantId { get; set; }
        public int? ProductId { get; set; }
        public int? RawMaterialId { get; set; }
        public int LocationId { get; set; }
        public decimal Quantity { get; set; }
        public string? ReferenceType { get; set; }
        public int? ReferenceId { get; set; }
        public int? CreatedBy { get; set; }
        public string? Notes { get; set; }
    }

    public class TransferStockRequest
    {
        public int TenantId { get; set; }
        public int? ProductId { get; set; }
        public int? RawMaterialId { get; set; }
        public int FromLocationId { get; set; }
        public int ToLocationId { get; set; }
        public decimal Quantity { get; set; }
        public int? CreatedBy { get; set; }
        public string? Notes { get; set; }
    }

    public class AdjustStockRequest
    {
        public int TenantId { get; set; }
        public int? ProductId { get; set; }
        public int? RawMaterialId { get; set; }
        public int LocationId { get; set; }
        public decimal Quantity { get; set; }
        public int? CreatedBy { get; set; }
        public string? Notes { get; set; }
    }

    public class RawMaterialDto
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }
        public string? PartNo { get; set; }
        public string? PartName { get; set; }
        public string? Description { get; set; }
        public string? Unit { get; set; }
        public decimal UnitCost { get; set; }
        public int? VendorId { get; set; }
        public decimal? ReorderPoint { get; set; }
        public decimal? ReorderQuantity { get; set; }
        public string? Sku { get; set; }
        public string? WarehouseLocation { get; set; }
        public string? Bin { get; set; }
        public string? Box { get; set; }
        public string? MaterialGrade { get; set; }
        public string? Specification { get; set; }
        public string? StockForm { get; set; }
        public decimal? ThicknessMm { get; set; }
        public decimal? WidthMm { get; set; }
        public decimal? LengthMm { get; set; }
        public bool IsRemnant { get; set; }
        public int? ParentRawMaterialId { get; set; }
        public int? DefaultLocationId { get; set; }
    }

    public class RawMaterialStatusDto
    {
        public int Id { get; set; }
        public int Tenantid { get; set; }
        public bool IsActive { get; set; }
    }
}
