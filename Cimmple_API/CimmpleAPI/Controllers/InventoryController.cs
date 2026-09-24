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
                        .ThenInclude(r => r!.ParentRawMaterial)
                    .Include(b => b.Location)
                    .Where(b => b.Tenantid == tenantId);

                if (locationId.HasValue)
                    query = query.Where(b => b.LocationId == locationId.Value);
                if (productId.HasValue)
                    query = query.Where(b => b.ProductId == productId.Value);
                if (rawMaterialId.HasValue)
                    query = query.Where(b => b.RawMaterialId == rawMaterialId.Value);
                if (lowStockOnly == true)
                    query = query.Where(b =>
                        (b.ReorderPoint
                            ?? (b.RawMaterial != null ? b.RawMaterial.ReorderPoint : null)
                            ?? (b.Product != null ? b.Product.ReorderPoint : null)).HasValue
                        && b.QuantityOnHand <= (b.ReorderPoint
                            ?? (b.RawMaterial != null ? b.RawMaterial.ReorderPoint : null)
                            ?? b.Product!.ReorderPoint));

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
                        reorderPoint = b.ReorderPoint
                            ?? (b.RawMaterial != null ? b.RawMaterial.ReorderPoint : null)
                            ?? (b.Product != null ? b.Product.ReorderPoint : null),
                        reorderQuantity = b.ReorderQuantity
                            ?? (b.RawMaterial != null ? b.RawMaterial.ReorderQuantity : null)
                            ?? (b.Product != null ? b.Product.ReorderQuantity : null),
                        unitCost = b.UnitCost,
                        isRemnant = b.RawMaterial != null && b.RawMaterial.IsRemnant,
                        parentRawMaterialId = b.RawMaterial != null ? b.RawMaterial.ParentRawMaterialId : null,
                        parentPartNo = b.RawMaterial != null && b.RawMaterial.ParentRawMaterial != null
                            ? b.RawMaterial.ParentRawMaterial.PartNo
                            : null,
                        thicknessMm = b.RawMaterial != null ? b.RawMaterial.ThicknessMm : null,
                        widthMm = b.RawMaterial != null ? b.RawMaterial.WidthMm : null,
                        lengthMm = b.RawMaterial != null ? b.RawMaterial.LengthMm : null
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
                    .Include(t => t.Lot)
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

                var rows = await query
                    .OrderByDescending(t => t.TransactionDate)
                    .Take(limit)
                    .ToListAsync();

                var labels = await ResolveReferenceLabelsAsync(tenantId, rows);

                var transactions = rows.Select(t => new
                    {
                        id = t.Id,
                        productId = t.ProductId,
                        rawMaterialId = t.RawMaterialId,
                        productPartNo = t.Product != null ? t.Product.partno : null,
                        rawMaterialPartNo = t.RawMaterial != null ? t.RawMaterial.PartNo : null,
                        productName = t.Product != null ? t.Product.partname : null,
                        rawMaterialName = t.RawMaterial != null ? t.RawMaterial.PartName : null,
                        locationId = t.LocationId,
                        locationName = t.Location != null ? t.Location.Name : null,
                        transactionType = t.TransactionType != null ? t.TransactionType.Code : null,
                        transactionTypeName = t.TransactionType != null ? t.TransactionType.Name : null,
                        quantity = t.Quantity,
                        referenceType = t.ReferenceType,
                        referenceId = t.ReferenceId,
                        referenceLabel = labels.TryGetValue(t.Id, out var label) ? label : FormatFallbackReference(t.ReferenceType, t.ReferenceId),
                        transactionDate = t.TransactionDate,
                        notes = t.Notes,
                        lotId = t.LotId,
                        lotNumber = t.Lot != null ? t.Lot.LotNumber : null
                    })
                    .ToList();

                return Ok(new { result = transactions });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetJobMaterialUsage")]
        public async Task<IActionResult> GetJobMaterialUsage(
            [FromQuery] int tenantId,
            [FromQuery] int jobOrderId)
        {
            try
            {
                if (tenantId <= 0)
                    tenantId = GetTenantId();
                if (jobOrderId <= 0)
                    return BadRequest(new { error = "jobOrderId is required" });

                var job = await _context.JobOrderMaster
                    .AsNoTracking()
                    .FirstOrDefaultAsync(j => j.Tenantid == tenantId && j.JobOrderID == jobOrderId);

                var refIds = new HashSet<int> { jobOrderId };
                if (job != null)
                {
                    refIds.Add(job.JobOrderNumber);
                    if (job.JobOrderNumber > 0 && job.JobOrderNumber < 1000)
                        refIds.Add(job.JobOrderNumber + 999);
                }

                var rows = await _context.InventoryTransaction
                    .Include(t => t.TransactionType)
                    .Include(t => t.Product)
                    .Include(t => t.RawMaterial)
                    .Include(t => t.Location)
                    .Include(t => t.Lot)
                    .Where(t => t.Tenantid == tenantId
                        && t.ReferenceType == "JobOrder"
                        && t.ReferenceId.HasValue
                        && refIds.Contains(t.ReferenceId.Value))
                    .OrderByDescending(t => t.TransactionDate)
                    .Take(200)
                    .ToListAsync();

                var usage = rows.Select(t => new
                {
                    id = t.Id,
                    productId = t.ProductId,
                    rawMaterialId = t.RawMaterialId,
                    partNo = t.Product != null ? t.Product.partno : t.RawMaterial != null ? t.RawMaterial.PartNo : null,
                    partName = t.Product != null ? t.Product.partname : t.RawMaterial != null ? t.RawMaterial.PartName : null,
                    locationName = t.Location != null ? t.Location.Name : null,
                    transactionType = t.TransactionType != null ? t.TransactionType.Code : null,
                    transactionTypeName = t.TransactionType != null ? t.TransactionType.Name : null,
                    quantity = t.Quantity,
                    transactionDate = t.TransactionDate,
                    notes = t.Notes,
                    lotNumber = t.Lot != null ? t.Lot.LotNumber : null
                }).ToList();

                return Ok(new { result = usage });
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
                var (refType, refId) = NormalizeDocumentReference(request.ReferenceType, request.ReferenceId, null);
                var (docOk, docError) = await ValidateLinkedDocumentQtyAsync(
                    tenantId, refType, refId, request.Quantity, isReceive: true,
                    request.ProductId, request.RawMaterialId);
                if (!docOk)
                    return BadRequest(new { error = docError });

                var (success, error) = await _inventoryService.ReceiveStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.LocationId,
                    request.Quantity,
                    refType,
                    refId,
                    request.LotId,
                    createdBy,
                    request.Notes,
                    request.LotNumber);

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
                var (refType, refId) = NormalizeDocumentReference(request.ReferenceType, request.ReferenceId, null);
                var (docOk, docError) = await ValidateLinkedDocumentQtyAsync(
                    tenantId, refType, refId, request.Quantity, isReceive: false,
                    request.ProductId, request.RawMaterialId);
                if (!docOk)
                    return BadRequest(new { error = docError });

                var (success, error) = await _inventoryService.IssueStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.LocationId,
                    request.Quantity,
                    refType,
                    refId,
                    createdBy,
                    request.Notes,
                    allowShortage: false,
                    leftoverLengthMm: request.LeftoverLengthMm,
                    leftoverWidthMm: request.LeftoverWidthMm,
                    leftoverThicknessMm: request.LeftoverThicknessMm,
                    lotId: request.LotId,
                    lotNumber: request.LotNumber);

                if (!success)
                    return BadRequest(new { error });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("ReserveStock")]
        public async Task<IActionResult> ReserveStock([FromBody] ReserveStockRequest request)
        {
            try
            {
                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                var createdBy = request.CreatedBy ?? GetUserId();
                var (refType, refId) = NormalizeDocumentReference(request.ReferenceType, request.ReferenceId, null);

                var (success, error) = await _inventoryService.ReserveStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.LocationId,
                    request.Quantity,
                    refType,
                    refId,
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

        [HttpPost("ReleaseReservation")]
        public async Task<IActionResult> ReleaseReservation([FromBody] ReleaseReservationRequest request)
        {
            try
            {
                var tenantId = request.TenantId > 0 ? request.TenantId : GetTenantId();
                if (request.ReservationId <= 0)
                    return BadRequest(new { error = "Reservation is required." });

                var (success, error) = await _inventoryService.ReleaseReservationAsync(tenantId, request.ReservationId);
                if (!success)
                    return BadRequest(new { error });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetReservations")]
        public async Task<IActionResult> GetReservations(
            [FromQuery] int tenantId,
            [FromQuery] int? locationId,
            [FromQuery] int? productId,
            [FromQuery] int? rawMaterialId,
            [FromQuery] int? jobOrderId)
        {
            try
            {
                if (tenantId <= 0)
                    tenantId = GetTenantId();

                var query = _context.InventoryReservation
                    .Include(r => r.Product)
                    .Include(r => r.RawMaterial)
                    .Include(r => r.Location)
                    .Where(r => r.Tenantid == tenantId && r.Quantity > 0);

                if (locationId.HasValue)
                    query = query.Where(r => r.LocationId == locationId.Value);
                if (productId.HasValue)
                    query = query.Where(r => r.ProductId == productId.Value);
                if (rawMaterialId.HasValue)
                    query = query.Where(r => r.RawMaterialId == rawMaterialId.Value);
                if (jobOrderId.HasValue)
                    query = query.Where(r => r.ReferenceType == "JobOrder" && r.ReferenceId == jobOrderId.Value);

                var rows = await query
                    .OrderByDescending(r => r.CreatedDate)
                    .Take(200)
                    .ToListAsync();

                var jobIds = rows
                    .Where(r => r.ReferenceType == "JobOrder")
                    .Select(r => r.ReferenceId)
                    .Distinct()
                    .ToList();
                var jobs = await _context.JobOrderMaster
                    .AsNoTracking()
                    .Where(j => j.Tenantid == tenantId && jobIds.Contains(j.JobOrderID))
                    .ToDictionaryAsync(
                        j => j.JobOrderID,
                        j => !string.IsNullOrWhiteSpace(j.JobNumber) ? j.JobNumber : ("JO#" + j.JobOrderNumber));

                var result = rows.Select(r => new
                {
                    id = r.Id,
                    productId = r.ProductId,
                    rawMaterialId = r.RawMaterialId,
                    partNo = r.Product != null ? r.Product.partno : r.RawMaterial != null ? r.RawMaterial.PartNo : null,
                    partName = r.Product != null ? r.Product.partname : r.RawMaterial != null ? r.RawMaterial.PartName : null,
                    locationId = r.LocationId,
                    locationName = r.Location != null ? r.Location.Name : null,
                    quantity = r.Quantity,
                    jobOrderId = r.ReferenceType == "JobOrder" ? r.ReferenceId : (int?)null,
                    jobLabel = r.ReferenceType == "JobOrder" && jobs.TryGetValue(r.ReferenceId, out var label) ? label : null,
                    notes = r.Notes,
                    createdDate = r.CreatedDate
                }).ToList();

                return Ok(new { result });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("GetLots")]
        public async Task<IActionResult> GetLots(
            [FromQuery] int tenantId,
            [FromQuery] int? productId,
            [FromQuery] int? rawMaterialId,
            [FromQuery] int? locationId)
        {
            try
            {
                if (tenantId <= 0)
                    tenantId = GetTenantId();
                if (!productId.HasValue && !rawMaterialId.HasValue)
                    return Ok(new { result = Array.Empty<object>() });

                var query =
                    from b in _context.InventoryLotBalance.AsNoTracking()
                    join l in _context.InventoryLot.AsNoTracking() on b.LotId equals l.Id
                    where b.Tenantid == tenantId && b.QuantityOnHand > 0
                    select new { b, l };

                if (locationId.HasValue && locationId.Value > 0)
                    query = query.Where(x => x.b.LocationId == locationId.Value);
                if (productId.HasValue)
                    query = query.Where(x => x.l.ProductId == productId);
                else
                    query = query.Where(x => x.l.RawMaterialId == rawMaterialId);

                var lots = await query
                    .OrderBy(x => x.l.ReceivedDate)
                    .ThenBy(x => x.l.Id)
                    .Select(x => new
                    {
                        id = x.l.Id,
                        lotNumber = x.l.LotNumber,
                        locationId = x.b.LocationId,
                        quantityOnHand = x.b.QuantityOnHand,
                        receivedDate = x.l.ReceivedDate
                    })
                    .ToListAsync();

                return Ok(new { result = lots });
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
                var (refType, refId) = NormalizeDocumentReference(request.ReferenceType, request.ReferenceId, "Transfer");

                var (success, error) = await _inventoryService.TransferStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.FromLocationId,
                    request.ToLocationId,
                    request.Quantity,
                    createdBy,
                    request.Notes,
                    refType,
                    refId);

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
                var (refType, refId) = NormalizeDocumentReference(request.ReferenceType, request.ReferenceId, "Adjustment");

                var (success, error) = await _inventoryService.AdjustStockAsync(
                    tenantId,
                    request.ProductId,
                    request.RawMaterialId,
                    request.LocationId,
                    request.Quantity,
                    createdBy,
                    request.Notes,
                    refType,
                    refId);

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
        public async Task<IActionResult> GetLowStockAlerts(
            [FromQuery] int tenantId,
            [FromQuery] int? locationId)
        {
            try
            {
                var query = _context.InventoryBalance
                    .Include(b => b.Product)
                    .Include(b => b.RawMaterial)
                    .Include(b => b.Location)
                    .Where(b => b.Tenantid == tenantId
                        && (b.ReorderPoint
                            ?? (b.RawMaterial != null ? b.RawMaterial.ReorderPoint : null)
                            ?? (b.Product != null ? b.Product.ReorderPoint : null)).HasValue
                        && b.QuantityOnHand <= (b.ReorderPoint
                            ?? (b.RawMaterial != null ? b.RawMaterial.ReorderPoint : null)
                            ?? b.Product!.ReorderPoint));
                if (locationId.HasValue && locationId.Value > 0)
                    query = query.Where(b => b.LocationId == locationId.Value);

                var alerts = await query
                    .Select(b => new
                    {
                        id = b.Id,
                        productId = b.ProductId,
                        rawMaterialId = b.RawMaterialId,
                        partNo = b.ProductId != null ? b.Product!.partno : b.RawMaterial!.PartNo,
                        partName = b.ProductId != null ? b.Product!.partname : b.RawMaterial!.PartName,
                        locationName = b.Location != null ? b.Location.Name : null,
                        quantityOnHand = b.QuantityOnHand,
                        reorderPoint = b.ReorderPoint
                            ?? (b.RawMaterial != null ? b.RawMaterial.ReorderPoint : null)
                            ?? (b.Product != null ? b.Product.ReorderPoint : null),
                        reorderQuantity = b.ReorderQuantity
                            ?? (b.RawMaterial != null ? b.RawMaterial.ReorderQuantity : null)
                            ?? (b.Product != null ? b.Product.ReorderQuantity : null)
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
        public async Task<IActionResult> GetRawMaterials([FromQuery] int tenantId, [FromQuery] bool? includeInactive = null)
        {
            try
            {
                if (tenantId <= 0)
                    tenantId = GetTenantId();

                var include = includeInactive == true
                    || string.Equals(Request.Query["includeInactive"].ToString(), "true", StringComparison.OrdinalIgnoreCase)
                    || Request.Query["includeInactive"].ToString() == "1";

                var query = _context.RawMaterialMaster
                    .AsNoTracking()
                    .Include(r => r.ParentRawMaterial)
                    .Include(r => r.DefaultLocation)
                    .Where(r => r.Tenantid == tenantId);

                if (!include)
                    query = query.Where(r => r.IsActive);

                var materials = await query
                    .OrderBy(r => r.IsRemnant)
                    .ThenBy(r => r.PartNo)
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
                    var loc = await _context.Locations
                        .FirstOrDefaultAsync(l => l.LocationId == dto.DefaultLocationId.Value && l.TenantId == tenantId);
                    if (loc == null)
                        return BadRequest(new { error = "Default location not found for this tenant." });
                    if (!string.Equals(loc.Status, "Active", StringComparison.OrdinalIgnoreCase))
                        return BadRequest(new { error = "Default location must be an active location." });
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

                var stockRows = await _context.InventoryBalance
                    .Where(b => b.Tenantid == tenantId && b.RawMaterialId == entity.Id)
                    .ToListAsync();
                foreach (var row in stockRows)
                {
                    row.ReorderPoint = entity.ReorderPoint;
                    row.ReorderQuantity = entity.ReorderQuantity;
                }
                if (stockRows.Count > 0)
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

        [HttpGet("GetMovementDocuments")]
        public async Task<IActionResult> GetMovementDocuments([FromQuery] int tenantId)
        {
            try
            {
                if (tenantId <= 0)
                    tenantId = GetTenantId();

                var jobsRaw = await _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId)
                    .OrderByDescending(j => j.JobOrderID)
                    .Take(80)
                    .Select(j => new
                    {
                        j.JobOrderID,
                        j.JobNumber,
                        j.JobOrderNumber,
                        j.PartNo,
                        j.PartName,
                        j.QtyOrdered,
                        j.CustomerOrderDetailID
                    })
                    .ToListAsync();

                var jobPartNos = jobsRaw
                    .Select(j => (j.PartNo ?? "").Trim())
                    .Where(p => p.Length > 0)
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                var productsByPart = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                if (jobPartNos.Count > 0)
                {
                    var productRows = await _context.ProductMaster
                        .AsNoTracking()
                        .Where(p => p.tenantid == tenantId && p.partno != null && jobPartNos.Contains(p.partno))
                        .Select(p => new { p.partno, p.Id })
                        .ToListAsync();
                    foreach (var group in productRows.GroupBy(p => p.partno!, StringComparer.OrdinalIgnoreCase))
                        productsByPart[group.Key] = group.Min(x => x.Id);
                }

                var detailIds = jobsRaw.Where(j => j.CustomerOrderDetailID > 0)
                    .Select(j => j.CustomerOrderDetailID).Distinct().ToList();
                var detailProducts = detailIds.Count == 0
                    ? new Dictionary<int, int?>()
                    : await _context.CustomerOrderDetails
                        .AsNoTracking()
                        .Where(d => d.Tenantid == tenantId && detailIds.Contains(d.ID))
                        .ToDictionaryAsync(d => d.ID, d => d.productid);

                var jobIds = jobsRaw.Select(j => j.JobOrderID).ToList();
                var jobFgReceipts = jobIds.Count == 0
                    ? new Dictionary<int, decimal>()
                    : await _context.InventoryTransaction
                        .AsNoTracking()
                        .Where(t => t.Tenantid == tenantId
                            && t.ReferenceType == "JobOrder"
                            && t.ReferenceId.HasValue
                            && jobIds.Contains(t.ReferenceId.Value)
                            && t.TransactionTypeId == 1
                            && t.ProductId != null
                            && t.RawMaterialId == null)
                        .GroupBy(t => t.ReferenceId!.Value)
                        .Select(g => new { id = g.Key, qty = g.Sum(x => x.Quantity) })
                        .ToDictionaryAsync(x => x.id, x => x.qty);
                var jobFgIssues = jobIds.Count == 0
                    ? new Dictionary<int, decimal>()
                    : await _context.InventoryTransaction
                        .AsNoTracking()
                        .Where(t => t.Tenantid == tenantId
                            && t.ReferenceType == "JobOrder"
                            && t.ReferenceId.HasValue
                            && jobIds.Contains(t.ReferenceId.Value)
                            && t.TransactionTypeId == 2
                            && t.ProductId != null
                            && t.RawMaterialId == null)
                        .GroupBy(t => t.ReferenceId!.Value)
                        .Select(g => new { id = g.Key, qty = g.Sum(x => x.Quantity < 0 ? -x.Quantity : x.Quantity) })
                        .ToDictionaryAsync(x => x.id, x => x.qty);

                var bomByJob = jobIds.Count == 0
                    ? new Dictionary<int, List<(int? ProductId, int? RawMaterialId)>>()
                    : (await _context.JobMaterialRequirement
                        .AsNoTracking()
                        .Where(m => m.Tenantid == tenantId && jobIds.Contains(m.JobOrderId))
                        .Select(m => new { m.JobOrderId, m.ProductId, m.RawMaterialId })
                        .ToListAsync())
                        .GroupBy(m => m.JobOrderId)
                        .ToDictionary(
                            g => g.Key,
                            g => g.Select(x => (x.ProductId, x.RawMaterialId)).ToList());

                var jobs = jobsRaw.Select(j =>
                {
                    var partNo = (j.PartNo ?? "").Trim();
                    int? productId = null;
                    if (j.CustomerOrderDetailID > 0
                        && detailProducts.TryGetValue(j.CustomerOrderDetailID, out var dPid)
                        && dPid.HasValue && dPid.Value > 0)
                        productId = dPid;
                    else if (partNo.Length > 0 && productsByPart.TryGetValue(partNo, out var pid))
                        productId = pid;

                    var received = jobFgReceipts.TryGetValue(j.JobOrderID, out var r) ? r : 0;
                    var issued = jobFgIssues.TryGetValue(j.JobOrderID, out var i) ? i : 0;
                    var net = Math.Max(0, received - issued);
                    var remaining = Math.Max(0, j.QtyOrdered - net);
                    var bom = bomByJob.TryGetValue(j.JobOrderID, out var lines) ? lines : null;
                    return new
                    {
                        id = j.JobOrderID,
                        label = !string.IsNullOrWhiteSpace(j.JobNumber)
                            ? j.JobNumber
                            : ("JO#" + j.JobOrderNumber),
                        detail = partNo + (string.IsNullOrWhiteSpace(j.PartName) ? "" : " — " + j.PartName)
                            + " · remaining FG " + remaining.ToString("0.##"),
                        partNo,
                        productId,
                        qtyOrdered = j.QtyOrdered,
                        remainingQty = remaining,
                        bomProductIds = bom?.Where(b => b.ProductId.HasValue).Select(b => b.ProductId!.Value).Distinct().ToList()
                            ?? new List<int>(),
                        bomRawMaterialIds = bom?.Where(b => b.RawMaterialId.HasValue).Select(b => b.RawMaterialId!.Value).Distinct().ToList()
                            ?? new List<int>()
                    };
                }).ToList();

                var receivingRows = await (
                    from r in _context.VendorReceiving
                    join d in _context.VendorOrderDetails on r.VendorOrderDetailID equals d.ID
                    join o in _context.VendorOrders on d.OrderID equals o.OrderID
                    where r.Tenantid == tenantId
                    orderby r.ReceivedDate descending
                    select new
                    {
                        id = r.ID,
                        poNumber = o.PONumber,
                        partNo = d.PartNo,
                        partName = d.PartName,
                        productId = d.ProductId,
                        rawMaterialId = d.RawMaterialId,
                        receivedDate = r.ReceivedDate,
                        receivedQty = r.ReceivedQty
                    }
                ).Take(50).ToListAsync();

                var receivingIds = receivingRows.Select(r => r.id).ToList();
                var bookedReceives = receivingIds.Count == 0
                    ? new Dictionary<int, decimal>()
                    : await _context.InventoryTransaction
                        .Where(t => t.Tenantid == tenantId
                            && t.ReferenceType == "VendorReceiving"
                            && t.ReferenceId.HasValue
                            && receivingIds.Contains(t.ReferenceId.Value)
                            && t.TransactionTypeId == 1)
                        .GroupBy(t => t.ReferenceId!.Value)
                        .Select(g => new { id = g.Key, qty = g.Sum(x => x.Quantity) })
                        .ToDictionaryAsync(x => x.id, x => x.qty);

                var receivings = receivingRows.Select(r =>
                {
                    var booked = bookedReceives.TryGetValue(r.id, out var q) ? q : 0;
                    var remaining = Math.Max(0, r.receivedQty - booked);
                    return new
                    {
                        id = r.id,
                        label = "VO#" + FormatVendorPoNumber(r.poNumber),
                        remainingQty = remaining,
                        partNo = r.partNo,
                        productId = r.productId,
                        rawMaterialId = r.rawMaterialId,
                        detail = ((r.partNo ?? "") + (string.IsNullOrWhiteSpace(r.partName) ? "" : " — " + r.partName)).Trim(' ', '—')
                            + (r.receivedDate == default ? "" : " · " + r.receivedDate.ToString("yyyy-MM-dd"))
                            + " · remaining " + remaining.ToString("0.##")
                    };
                }).ToList();

                var shipmentRows = await _context.Shipping
                    .Where(s => s.TenantId == tenantId)
                    .OrderByDescending(s => s.ShipmentDate)
                    .Take(50)
                    .Select(s => new { s.Id, s.ShipmentNo, s.ShipmentDate })
                    .ToListAsync();

                var shipmentIds = shipmentRows.Select(s => s.Id).ToList();
                var shippedByShipment = shipmentIds.Count == 0
                    ? new Dictionary<int, int>()
                    : await _context.ShippingDetails
                        .Where(d => shipmentIds.Contains(d.ShipmentId))
                        .GroupBy(d => d.ShipmentId)
                        .Select(g => new { id = g.Key, qty = g.Sum(x => x.ShippedQty) })
                        .ToDictionaryAsync(x => x.id, x => x.qty);

                var bookedIssues = shipmentIds.Count == 0
                    ? new Dictionary<int, decimal>()
                    : await _context.InventoryTransaction
                        .Where(t => t.Tenantid == tenantId
                            && t.ReferenceType == "CustomerShipment"
                            && t.ReferenceId.HasValue
                            && shipmentIds.Contains(t.ReferenceId.Value)
                            && t.TransactionTypeId == 2)
                        .GroupBy(t => t.ReferenceId!.Value)
                        .Select(g => new { id = g.Key, qty = g.Sum(x => x.Quantity) })
                        .ToDictionaryAsync(x => x.id, x => Math.Abs(x.qty));

                var shipments = shipmentRows.Select(s =>
                {
                    var shipped = shippedByShipment.TryGetValue(s.Id, out var sq) ? sq : 0;
                    var booked = bookedIssues.TryGetValue(s.Id, out var q) ? q : 0;
                    var remaining = Math.Max(0, shipped - booked);
                    return new
                    {
                        id = s.Id,
                        label = string.IsNullOrWhiteSpace(s.ShipmentNo) ? ("SHIP#" + s.Id) : s.ShipmentNo,
                        remainingQty = remaining,
                        detail = s.ShipmentDate.ToString("yyyy-MM-dd")
                            + " · remaining " + remaining.ToString("0.##")
                    };
                }).ToList();

                return Ok(new
                {
                    result = new
                    {
                        jobs,
                        vendorReceivings = receivings,
                        shipments
                    }
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        private async Task<(bool Ok, string Error)> ValidateLinkedDocumentQtyAsync(
            int tenantId,
            string? referenceType,
            int? referenceId,
            decimal quantity,
            bool isReceive,
            int? productId = null,
            int? rawMaterialId = null)
        {
            if (!referenceId.HasValue || referenceId.Value <= 0 || string.IsNullOrWhiteSpace(referenceType))
                return (true, "");

            if (isReceive && referenceType.Equals("VendorReceiving", StringComparison.OrdinalIgnoreCase))
            {
                var line = await (
                    from r in _context.VendorReceiving.AsNoTracking()
                    join d in _context.VendorOrderDetails.AsNoTracking() on r.VendorOrderDetailID equals d.ID
                    where r.Tenantid == tenantId && r.ID == referenceId.Value
                    select new
                    {
                        r.ReceivedQty,
                        d.ProductId,
                        d.RawMaterialId,
                        d.PartNo
                    }
                ).FirstOrDefaultAsync();
                if (line == null)
                    return (false, "Vendor receive not found.");

                var partMatches = false;
                if (productId.HasValue && productId.Value > 0)
                {
                    if (line.ProductId.HasValue && line.ProductId.Value == productId.Value)
                        partMatches = true;
                    else if (!string.IsNullOrWhiteSpace(line.PartNo))
                    {
                        var partNo = line.PartNo.Trim();
                        partMatches = await _context.ProductMaster.AsNoTracking()
                            .AnyAsync(p => p.tenantid == tenantId
                                && p.Id == productId.Value
                                && p.partno != null
                                && p.partno.Trim() == partNo);
                    }
                }
                else if (rawMaterialId.HasValue && rawMaterialId.Value > 0)
                {
                    if (line.RawMaterialId.HasValue && line.RawMaterialId.Value == rawMaterialId.Value)
                        partMatches = true;
                    else if (!string.IsNullOrWhiteSpace(line.PartNo))
                    {
                        var partNo = line.PartNo.Trim();
                        partMatches = await _context.RawMaterialMaster.AsNoTracking()
                            .AnyAsync(rm => rm.Tenantid == tenantId
                                && rm.Id == rawMaterialId.Value
                                && rm.PartNo != null
                                && rm.PartNo.Trim() == partNo);
                    }
                }

                if (!partMatches)
                    return (false, "Selected part does not match the linked vendor receive line.");

                var booked = await _context.InventoryTransaction
                    .Where(t => t.Tenantid == tenantId
                        && t.ReferenceType == "VendorReceiving"
                        && t.ReferenceId == referenceId.Value
                        && t.TransactionTypeId == 1)
                    .SumAsync(t => (decimal?)t.Quantity) ?? 0;
                var remaining = (decimal)line.ReceivedQty - booked;
                if (quantity > remaining + 0.0001m)
                    return (false, remaining <= 0
                        ? "This vendor receive already posted its quantity to inventory."
                        : $"Quantity cannot exceed remaining {remaining:0.##} on that vendor receive.");
            }

            if (isReceive && referenceType.Equals("JobOrder", StringComparison.OrdinalIgnoreCase))
            {
                var job = await _context.JobOrderMaster.AsNoTracking()
                    .FirstOrDefaultAsync(j => j.Tenantid == tenantId && j.JobOrderID == referenceId.Value);
                if (job == null)
                    return (false, "Job order not found.");

                var jobPartNo = (job.PartNo ?? "").Trim();
                int? finishedProductId = null;
                if (job.CustomerOrderDetailID > 0)
                {
                    finishedProductId = await _context.CustomerOrderDetails.AsNoTracking()
                        .Where(d => d.ID == job.CustomerOrderDetailID && d.Tenantid == tenantId)
                        .Select(d => d.productid)
                        .FirstOrDefaultAsync();
                }
                if ((!finishedProductId.HasValue || finishedProductId.Value <= 0) && jobPartNo.Length > 0)
                {
                    finishedProductId = await _context.ProductMaster.AsNoTracking()
                        .Where(p => p.tenantid == tenantId && p.partno != null && p.partno.Trim() == jobPartNo)
                        .Select(p => (int?)p.Id)
                        .FirstOrDefaultAsync();
                }

                var matchesFinished = productId.HasValue && productId.Value > 0
                    && (
                        (finishedProductId.HasValue && finishedProductId.Value == productId.Value)
                        || (jobPartNo.Length > 0 && await _context.ProductMaster.AsNoTracking()
                            .AnyAsync(p => p.tenantid == tenantId
                                && p.Id == productId.Value
                                && p.partno != null
                                && p.partno.Trim() == jobPartNo))
                    );

                var matchesBom = false;
                if (!matchesFinished)
                {
                    if (productId.HasValue && productId.Value > 0)
                    {
                        matchesBom = await _context.JobMaterialRequirement.AsNoTracking()
                            .AnyAsync(m => m.Tenantid == tenantId
                                && m.JobOrderId == job.JobOrderID
                                && m.ProductId == productId.Value);
                    }
                    else if (rawMaterialId.HasValue && rawMaterialId.Value > 0)
                    {
                        matchesBom = await _context.JobMaterialRequirement.AsNoTracking()
                            .AnyAsync(m => m.Tenantid == tenantId
                                && m.JobOrderId == job.JobOrderID
                                && m.RawMaterialId == rawMaterialId.Value);
                    }
                }

                if (!matchesFinished && !matchesBom)
                    return (false, "Selected part is not the finished part or a material on this job order.");

                if (matchesFinished)
                {
                    var received = await _context.InventoryTransaction
                        .Where(t => t.Tenantid == tenantId
                            && t.ReferenceType == "JobOrder"
                            && t.ReferenceId == job.JobOrderID
                            && t.TransactionTypeId == 1
                            && t.ProductId != null
                            && t.RawMaterialId == null)
                        .SumAsync(t => (decimal?)t.Quantity) ?? 0;
                    var issued = await _context.InventoryTransaction
                        .Where(t => t.Tenantid == tenantId
                            && t.ReferenceType == "JobOrder"
                            && t.ReferenceId == job.JobOrderID
                            && t.TransactionTypeId == 2
                            && t.ProductId != null
                            && t.RawMaterialId == null)
                        .SumAsync(t => (decimal?)(t.Quantity < 0 ? -t.Quantity : t.Quantity)) ?? 0;
                    var net = Math.Max(0, received - issued);
                    var remaining = job.QtyOrdered - net;
                    if (quantity > remaining + 0.0001m)
                        return (false, remaining <= 0
                            ? "This job already has its full finished-goods quantity in inventory."
                            : $"Quantity cannot exceed remaining finished goods {remaining:0.##} on that job.");
                }
            }

            if (!isReceive && referenceType.Equals("CustomerShipment", StringComparison.OrdinalIgnoreCase))
            {
                var shipped = await _context.ShippingDetails
                    .Where(d => d.ShipmentId == referenceId.Value)
                    .SumAsync(d => (decimal?)d.ShippedQty) ?? 0;
                var booked = Math.Abs(await _context.InventoryTransaction
                    .Where(t => t.Tenantid == tenantId
                        && t.ReferenceType == "CustomerShipment"
                        && t.ReferenceId == referenceId.Value
                        && t.TransactionTypeId == 2)
                    .SumAsync(t => (decimal?)t.Quantity) ?? 0);
                var remaining = shipped - booked;
                if (quantity > remaining + 0.0001m)
                    return (false, remaining <= 0
                        ? "This shipment already took that quantity off the shelf."
                        : $"Quantity cannot exceed remaining {remaining:0.##} on that shipment.");
            }

            return (true, "");
        }

        private static (string? type, int? id) NormalizeDocumentReference(string? referenceType, int? referenceId, string? fallbackType)
        {
            var t = (referenceType ?? "").Trim();
            if (string.IsNullOrEmpty(t) || t.Equals("None", StringComparison.OrdinalIgnoreCase))
                return (fallbackType, null);

            if (referenceId.HasValue && referenceId.Value > 0
                && (t.Equals("JobOrder", StringComparison.OrdinalIgnoreCase)
                    || t.Equals("VendorReceiving", StringComparison.OrdinalIgnoreCase)
                    || t.Equals("CustomerShipment", StringComparison.OrdinalIgnoreCase)))
            {
                if (t.Equals("JobOrder", StringComparison.OrdinalIgnoreCase))
                    return ("JobOrder", referenceId);
                if (t.Equals("VendorReceiving", StringComparison.OrdinalIgnoreCase))
                    return ("VendorReceiving", referenceId);
                return ("CustomerShipment", referenceId);
            }

            return (fallbackType, null);
        }

        private static string FormatVendorPoNumber(int poNumber) =>
            (poNumber < 1000 ? poNumber + 999 : poNumber).ToString();

        private static string? FormatFallbackReference(string? referenceType, int? referenceId)
        {
            var t = (referenceType ?? "").Trim();
            if (string.IsNullOrEmpty(t) || t.Equals("Transfer", StringComparison.OrdinalIgnoreCase)
                || t.Equals("Adjustment", StringComparison.OrdinalIgnoreCase))
                return null;
            if (t.Equals("RemnantSplit", StringComparison.OrdinalIgnoreCase))
                return "Offcut";
            if (referenceId.HasValue && referenceId.Value > 0)
                return t + " #" + referenceId.Value;
            return t;
        }

        private async Task<Dictionary<int, string?>> ResolveReferenceLabelsAsync(
            int tenantId,
            List<InventoryTransaction> rows)
        {
            var labels = new Dictionary<int, string?>();
            var jobIds = rows
                .Where(t => string.Equals(t.ReferenceType, "JobOrder", StringComparison.OrdinalIgnoreCase) && t.ReferenceId > 0)
                .Select(t => t.ReferenceId!.Value)
                .Distinct()
                .ToList();
            var receivingIds = rows
                .Where(t => string.Equals(t.ReferenceType, "VendorReceiving", StringComparison.OrdinalIgnoreCase) && t.ReferenceId > 0)
                .Select(t => t.ReferenceId!.Value)
                .Distinct()
                .ToList();
            var shipmentIds = rows
                .Where(t => string.Equals(t.ReferenceType, "CustomerShipment", StringComparison.OrdinalIgnoreCase) && t.ReferenceId > 0)
                .Select(t => t.ReferenceId!.Value)
                .Distinct()
                .ToList();

            var jobs = new Dictionary<int, string>();
            if (jobIds.Count > 0)
            {
                var jobRows = await _context.JobOrderMaster
                    .Where(j => j.Tenantid == tenantId && jobIds.Contains(j.JobOrderID))
                    .Select(j => new { j.JobOrderID, j.JobNumber, j.JobOrderNumber })
                    .ToListAsync();
                foreach (var j in jobRows)
                    jobs[j.JobOrderID] = string.IsNullOrWhiteSpace(j.JobNumber) ? ("JO#" + j.JobOrderNumber) : j.JobNumber!;
            }

            var receivings = new Dictionary<int, string>();
            if (receivingIds.Count > 0)
            {
                var recRows = await (
                    from r in _context.VendorReceiving
                    join d in _context.VendorOrderDetails on r.VendorOrderDetailID equals d.ID
                    join o in _context.VendorOrders on d.OrderID equals o.OrderID
                    where r.Tenantid == tenantId && receivingIds.Contains(r.ID)
                    select new { r.ID, o.PONumber }
                ).ToListAsync();
                foreach (var rec in recRows)
                    receivings[rec.ID] = "VO#" + FormatVendorPoNumber(rec.PONumber);
            }

            var shipments = new Dictionary<int, string>();
            if (shipmentIds.Count > 0)
            {
                var shipRows = await _context.Shipping
                    .Where(s => s.TenantId == tenantId && shipmentIds.Contains(s.Id))
                    .Select(s => new { s.Id, s.ShipmentNo })
                    .ToListAsync();
                foreach (var s in shipRows)
                    shipments[s.Id] = string.IsNullOrWhiteSpace(s.ShipmentNo) ? ("SHIP#" + s.Id) : s.ShipmentNo!;
            }

            foreach (var t in rows)
            {
                string? label = null;
                if (t.ReferenceId.HasValue && t.ReferenceId.Value > 0)
                {
                    if (string.Equals(t.ReferenceType, "JobOrder", StringComparison.OrdinalIgnoreCase)
                        && jobs.TryGetValue(t.ReferenceId.Value, out var jobLabel))
                        label = jobLabel;
                    else if (string.Equals(t.ReferenceType, "VendorReceiving", StringComparison.OrdinalIgnoreCase)
                        && receivings.TryGetValue(t.ReferenceId.Value, out var recLabel))
                        label = recLabel;
                    else if (string.Equals(t.ReferenceType, "CustomerShipment", StringComparison.OrdinalIgnoreCase)
                        && shipments.TryGetValue(t.ReferenceId.Value, out var shipLabel))
                        label = shipLabel;
                    else
                        label = FormatFallbackReference(t.ReferenceType, t.ReferenceId);
                }
                labels[t.Id] = label;
            }

            return labels;
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
        public string? LotNumber { get; set; }
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
        public int? LotId { get; set; }
        public string? LotNumber { get; set; }
        public int? CreatedBy { get; set; }
        public string? Notes { get; set; }
        public decimal? LeftoverLengthMm { get; set; }
        public decimal? LeftoverWidthMm { get; set; }
        public decimal? LeftoverThicknessMm { get; set; }
    }

    public class ReserveStockRequest
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

    public class ReleaseReservationRequest
    {
        public int TenantId { get; set; }
        public int ReservationId { get; set; }
    }

    public class TransferStockRequest
    {
        public int TenantId { get; set; }
        public int? ProductId { get; set; }
        public int? RawMaterialId { get; set; }
        public int FromLocationId { get; set; }
        public int ToLocationId { get; set; }
        public decimal Quantity { get; set; }
        public string? ReferenceType { get; set; }
        public int? ReferenceId { get; set; }
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
        public string? ReferenceType { get; set; }
        public int? ReferenceId { get; set; }
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
