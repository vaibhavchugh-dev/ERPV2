using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Service for inventory operations: Receive, Issue, Transfer, Adjust.
    /// </summary>
    public class InventoryService
    {
        private readonly CimmpleDbContext _context;

        public InventoryService(CimmpleDbContext context)
        {
            _context = context;
        }

        private const int RECEIPT_TYPE_ID = 1;
        private const int ISSUE_TYPE_ID = 2;
        private const int TRANSFER_IN_TYPE_ID = 3;
        private const int TRANSFER_OUT_TYPE_ID = 4;
        private const int ADJUSTMENT_TYPE_ID = 5;

        /// <summary>
        /// Receive stock within an existing transaction (e.g. from Vendor Receiving).
        /// Does NOT begin/commit a transaction - caller must manage transaction.
        /// </summary>
        public async Task<(bool Success, string Error)> ReceiveStockInTransactionAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            string? referenceType,
            int? referenceId,
            int? lotId,
            int? createdBy,
            string? notes,
            string? lotNumber = null)
        {
            if (quantity <= 0)
                return (false, "Quantity must be positive");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");
            if (productId.HasValue && rawMaterialId.HasValue)
                return (false, "Cannot specify both ProductId and RawMaterialId");

            try
            {
                var (lotOk, lotErr, resolvedLotId) = await ResolveAndApplyLotReceiptAsync(
                    tenantId, productId, rawMaterialId, locationId, quantity, lotId, lotNumber);
                if (!lotOk)
                    return (false, lotErr);

                var balance = await GetOrCreateBalanceAsync(tenantId, productId, rawMaterialId, locationId);
                balance.QuantityOnHand += quantity;

                var invTransaction = new InventoryTransaction
                {
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    LocationId = locationId,
                    TransactionTypeId = RECEIPT_TYPE_ID,
                    Quantity = quantity,
                    ReferenceType = referenceType,
                    ReferenceId = referenceId,
                    TransactionDate = DateTime.UtcNow,
                    LotId = resolvedLotId,
                    CreatedBy = createdBy,
                    Notes = notes,
                    Tenantid = tenantId
                };
                _context.InventoryTransaction.Add(invTransaction);
                return (true, "");
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        /// <summary>
        /// Receive stock (add to inventory). Creates transaction and updates balance.
        /// </summary>
        public async Task<(bool Success, string Error)> ReceiveStockAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            string? referenceType,
            int? referenceId,
            int? lotId,
            int? createdBy,
            string? notes,
            string? lotNumber = null)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var (ok, err) = await ReceiveStockInTransactionAsync(
                    tenantId, productId, rawMaterialId, locationId, quantity,
                    referenceType, referenceId, lotId, createdBy, notes, lotNumber);
                if (!ok)
                    return (false, err);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return (true, "");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return (false, ex.Message);
            }
        }

        /// <summary>
        /// Issue stock within an existing transaction. Caller must manage begin/commit.
        /// </summary>
        public async Task<(bool Success, string Error)> IssueStockInTransactionAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            string? referenceType,
            int? referenceId,
            int? createdBy,
            string? notes,
            bool allowShortage = false,
            int? lotId = null,
            string? lotNumber = null)
        {
            if (quantity <= 0)
                return (false, "Quantity must be positive");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");

            try
            {
                var (ok, err, _) = await ApplyIssueCoreAsync(
                    tenantId, productId, rawMaterialId, locationId, quantity,
                    referenceType, referenceId, createdBy, notes, allowShortage, lotId, lotNumber);
                return (ok, err);
            }
            catch (Exception ex)
            {
                return (false, ex.Message);
            }
        }

        /// <summary>
        /// Issue stock (remove from inventory). Validates availability before deducting.
        /// </summary>
        public async Task<(bool Success, string Error)> IssueStockAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            string? referenceType,
            int? referenceId,
            int? createdBy,
            string? notes,
            bool allowShortage = false,
            decimal? leftoverLengthMm = null,
            decimal? leftoverWidthMm = null,
            decimal? leftoverThicknessMm = null,
            int? lotId = null,
            string? lotNumber = null)
        {
            if (quantity <= 0)
                return (false, "Quantity must be positive");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var (ok, err, consumedLotId) = await ApplyIssueCoreAsync(
                    tenantId, productId, rawMaterialId, locationId, quantity,
                    referenceType, referenceId, createdBy, notes, allowShortage, lotId, lotNumber);
                if (!ok)
                    return (false, err);

                if (leftoverLengthMm.HasValue || leftoverWidthMm.HasValue || leftoverThicknessMm.HasValue)
                {
                    var (remnantOk, remnantErr) = await BookRemnantOffcutAsync(
                        tenantId,
                        rawMaterialId,
                        locationId,
                        quantity,
                        leftoverLengthMm,
                        leftoverWidthMm,
                        leftoverThicknessMm,
                        referenceType,
                        referenceId,
                        createdBy,
                        consumedLotId);
                    if (!remnantOk)
                        return (false, remnantErr);
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return (true, "");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return (false, ex.Message);
            }
        }

        /// <summary>
        /// Transfer stock between locations. Creates out transaction at source, in at destination.
        /// </summary>
        public async Task<(bool Success, string Error)> TransferStockAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int fromLocationId,
            int toLocationId,
            decimal quantity,
            int? createdBy,
            string? notes,
            string? referenceType = null,
            int? referenceId = null)
        {
            if (quantity <= 0)
                return (false, "Quantity must be positive");
            if (fromLocationId == toLocationId)
                return (false, "Source and destination locations must be different");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var fromBalance = await GetOrCreateBalanceAsync(tenantId, productId, rawMaterialId, fromLocationId);
                var available = fromBalance.QuantityOnHand - fromBalance.QuantityReserved;
                if (available < quantity)
                    return (false, $"Insufficient stock at source. Available: {available}, Requested: {quantity}");

                fromBalance.QuantityOnHand -= quantity;

                var toBalance = await GetOrCreateBalanceAsync(tenantId, productId, rawMaterialId, toLocationId);
                toBalance.QuantityOnHand += quantity;

                var (lotOk, lotErr, allocations) = await AllocateLotsForIssueAsync(
                    tenantId, productId, rawMaterialId, fromLocationId, quantity, preferredLotId: null, preferredLotNumber: null, allowShortage: false);
                if (!lotOk)
                    return (false, lotErr);

                foreach (var alloc in allocations)
                {
                    if (alloc.LotId.HasValue)
                    {
                        var (fromLotOk, fromLotErr) = await ApplyLotQuantityChangeAsync(
                            tenantId, alloc.LotId.Value, fromLocationId, -alloc.Quantity);
                        if (!fromLotOk)
                            return (false, fromLotErr);
                        var (toLotOk, toLotErr) = await ApplyLotQuantityChangeAsync(
                            tenantId, alloc.LotId.Value, toLocationId, alloc.Quantity);
                        if (!toLotOk)
                            return (false, toLotErr);
                    }

                    _context.InventoryTransaction.Add(new InventoryTransaction
                    {
                        ProductId = productId,
                        RawMaterialId = rawMaterialId,
                        LocationId = fromLocationId,
                        TransactionTypeId = TRANSFER_OUT_TYPE_ID,
                        Quantity = -alloc.Quantity,
                        ReferenceType = string.IsNullOrWhiteSpace(referenceType) ? "Transfer" : referenceType,
                        ReferenceId = referenceId,
                        TransactionDate = DateTime.UtcNow,
                        LotId = alloc.LotId,
                        CreatedBy = createdBy,
                        Notes = notes,
                        Tenantid = tenantId
                    });
                    _context.InventoryTransaction.Add(new InventoryTransaction
                    {
                        ProductId = productId,
                        RawMaterialId = rawMaterialId,
                        LocationId = toLocationId,
                        TransactionTypeId = TRANSFER_IN_TYPE_ID,
                        Quantity = alloc.Quantity,
                        ReferenceType = string.IsNullOrWhiteSpace(referenceType) ? "Transfer" : referenceType,
                        ReferenceId = referenceId,
                        TransactionDate = DateTime.UtcNow,
                        LotId = alloc.LotId,
                        CreatedBy = createdBy,
                        Notes = notes,
                        Tenantid = tenantId
                    });
                }
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return (true, "");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return (false, ex.Message);
            }
        }

        /// <summary>
        /// Adjust stock (manual correction). Quantity can be positive or negative.
        /// </summary>
        public async Task<(bool Success, string Error)> AdjustStockAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            int? createdBy,
            string? notes,
            string? referenceType = null,
            int? referenceId = null)
        {
            if (quantity == 0)
                return (false, "Quantity cannot be zero");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var balance = await GetOrCreateBalanceAsync(tenantId, productId, rawMaterialId, locationId);
                balance.QuantityOnHand += quantity;
                if (balance.QuantityOnHand < 0)
                    return (false, "Adjustment would result in negative stock");

                int? adjustLotId = null;
                if (quantity > 0)
                {
                    var (lotOk, lotErr, resolvedLotId) = await ResolveAndApplyLotReceiptAsync(
                        tenantId, productId, rawMaterialId, locationId, quantity, lotId: null, lotNumber: null);
                    if (!lotOk)
                        return (false, lotErr);
                    adjustLotId = resolvedLotId;
                }
                else
                {
                    var (lotOk, lotErr, allocations) = await AllocateLotsForIssueAsync(
                        tenantId, productId, rawMaterialId, locationId, -quantity,
                        preferredLotId: null, preferredLotNumber: null, allowShortage: false);
                    if (!lotOk)
                        return (false, lotErr);
                    foreach (var alloc in allocations)
                    {
                        if (!alloc.LotId.HasValue)
                            continue;
                        var (chgOk, chgErr) = await ApplyLotQuantityChangeAsync(
                            tenantId, alloc.LotId.Value, locationId, -alloc.Quantity);
                        if (!chgOk)
                            return (false, chgErr);
                        adjustLotId ??= alloc.LotId;
                    }
                }

                var invTransaction = new InventoryTransaction
                {
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    LocationId = locationId,
                    TransactionTypeId = ADJUSTMENT_TYPE_ID,
                    Quantity = quantity,
                    ReferenceType = string.IsNullOrWhiteSpace(referenceType) ? "Adjustment" : referenceType,
                    ReferenceId = referenceId,
                    TransactionDate = DateTime.UtcNow,
                    LotId = adjustLotId,
                    CreatedBy = createdBy,
                    Notes = notes,
                    Tenantid = tenantId
                };
                _context.InventoryTransaction.Add(invTransaction);
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return (true, "");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return (false, ex.Message);
            }
        }

        public async Task<(bool Success, string Error)> ReserveStockAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            string? referenceType,
            int? referenceId,
            int? createdBy,
            string? notes)
        {
            if (quantity <= 0)
                return (false, "Quantity must be positive");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");
            if (productId.HasValue && rawMaterialId.HasValue)
                return (false, "Cannot specify both ProductId and RawMaterialId");
            if (!string.Equals(referenceType, "JobOrder", StringComparison.OrdinalIgnoreCase)
                || !referenceId.HasValue || referenceId.Value <= 0)
                return (false, "Select a job to reserve stock for.");
            if (locationId <= 0)
                return (false, "Location is required.");

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var jobExists = await _context.JobOrderMaster
                    .AnyAsync(j => j.Tenantid == tenantId && j.JobOrderID == referenceId.Value);
                if (!jobExists)
                    return (false, "Job not found.");

                var balance = await GetOrCreateBalanceAsync(tenantId, productId, rawMaterialId, locationId);
                var available = balance.QuantityOnHand - balance.QuantityReserved;
                if (available < quantity)
                    return (false, $"Not enough available stock. Available: {available}, Requested: {quantity}");

                var existing = await OpenReservationsQuery(tenantId, productId, rawMaterialId, locationId)
                    .Where(r => r.ReferenceType == "JobOrder" && r.ReferenceId == referenceId.Value)
                    .OrderBy(r => r.CreatedDate)
                    .FirstOrDefaultAsync();
                if (existing != null)
                {
                    existing.Quantity += quantity;
                    if (!string.IsNullOrWhiteSpace(notes))
                        existing.Notes = notes;
                }
                else
                {
                    _context.InventoryReservation.Add(new InventoryReservation
                    {
                        ProductId = productId,
                        RawMaterialId = rawMaterialId,
                        LocationId = locationId,
                        Quantity = quantity,
                        ReferenceType = "JobOrder",
                        ReferenceId = referenceId.Value,
                        Notes = notes,
                        CreatedBy = createdBy,
                        CreatedDate = DateTime.UtcNow,
                        Tenantid = tenantId
                    });
                }

                balance.QuantityReserved += quantity;
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return (true, "");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return (false, ex.Message);
            }
        }

        public async Task<(bool Success, string Error)> ReleaseReservationAsync(
            int tenantId,
            int reservationId)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var reservation = await _context.InventoryReservation
                    .FirstOrDefaultAsync(r => r.Id == reservationId && r.Tenantid == tenantId);
                if (reservation == null)
                    return (false, "Reservation not found.");
                if (reservation.Quantity <= 0)
                    return (true, "");

                var balance = await GetOrCreateBalanceAsync(
                    tenantId, reservation.ProductId, reservation.RawMaterialId, reservation.LocationId);
                var releaseQty = reservation.Quantity;
                balance.QuantityReserved = Math.Max(0, balance.QuantityReserved - releaseQty);
                reservation.Quantity = 0;
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return (true, "");
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return (false, ex.Message);
            }
        }

        public async Task ReleaseOpenReservationsForJobInTransactionAsync(int tenantId, int jobOrderId)
        {
            var open = await _context.InventoryReservation
                .Where(r => r.Tenantid == tenantId
                    && r.ReferenceType == "JobOrder"
                    && r.ReferenceId == jobOrderId
                    && r.Quantity > 0)
                .ToListAsync();
            foreach (var reservation in open)
            {
                var balance = await GetOrCreateBalanceAsync(
                    tenantId, reservation.ProductId, reservation.RawMaterialId, reservation.LocationId);
                balance.QuantityReserved = Math.Max(0, balance.QuantityReserved - reservation.Quantity);
                reservation.Quantity = 0;
            }
        }

        private static bool SameMm(decimal? a, decimal? b)
        {
            if (!a.HasValue && !b.HasValue) return true;
            if (!a.HasValue || !b.HasValue) return false;
            return Math.Abs(a.Value - b.Value) < 0.005m;
        }

        private async Task<string> NextRemnantPartNoAsync(int tenantId, string parentPartNo)
        {
            var prefix = parentPartNo.Trim() + "-R";
            var existing = await _context.RawMaterialMaster
                .AsNoTracking()
                .Where(r => r.Tenantid == tenantId && r.PartNo != null && r.PartNo.StartsWith(prefix))
                .Select(r => r.PartNo!)
                .ToListAsync();
            var max = 0;
            foreach (var partNo in existing)
            {
                var suffix = partNo.Length > prefix.Length ? partNo.Substring(prefix.Length) : "";
                if (int.TryParse(suffix, out var n) && n > max)
                    max = n;
            }
            return prefix + (max + 1);
        }

        private async Task<(bool Success, string Error)> BookRemnantOffcutAsync(
            int tenantId,
            int? rawMaterialId,
            int locationId,
            decimal issuedQty,
            decimal? leftoverLengthMm,
            decimal? leftoverWidthMm,
            decimal? leftoverThicknessMm,
            string? referenceType,
            int? referenceId,
            int? createdBy,
            int? sourceLotId)
        {
            if (!rawMaterialId.HasValue)
                return (false, "Leftover size is only for raw material.");
            if (issuedQty != 1)
                return (false, "Leftover applies when issuing 1 piece.");
            if (!leftoverLengthMm.HasValue || leftoverLengthMm.Value <= 0)
                return (false, "Enter leftover length in mm.");
            if (leftoverWidthMm.HasValue && leftoverWidthMm.Value < 0)
                return (false, "Leftover width cannot be negative.");
            if (leftoverThicknessMm.HasValue && leftoverThicknessMm.Value < 0)
                return (false, "Leftover thickness cannot be negative.");

            var source = await _context.RawMaterialMaster
                .FirstOrDefaultAsync(r => r.Id == rawMaterialId.Value && r.Tenantid == tenantId);
            if (source == null)
                return (false, "Raw material not found.");

            if (source.LengthMm.HasValue && leftoverLengthMm.Value >= source.LengthMm.Value)
                return (false, "Leftover length must be less than the piece you cut.");

            var millParentId = source.ParentRawMaterialId ?? source.Id;
            var millParent = millParentId == source.Id
                ? source
                : await _context.RawMaterialMaster
                    .FirstOrDefaultAsync(r => r.Id == millParentId && r.Tenantid == tenantId)
                    ?? source;

            var thickness = leftoverThicknessMm ?? source.ThicknessMm ?? millParent.ThicknessMm;
            var width = leftoverWidthMm ?? source.WidthMm ?? millParent.WidthMm;
            var length = leftoverLengthMm.Value;

            var reuse = (await _context.RawMaterialMaster
                    .Where(r => r.Tenantid == tenantId && r.IsActive && r.IsRemnant && r.ParentRawMaterialId == millParent.Id)
                    .ToListAsync())
                .FirstOrDefault(r => SameMm(r.ThicknessMm, thickness) && SameMm(r.WidthMm, width) && SameMm(r.LengthMm, length));

            int remnantId;
            string remnantPartNo;
            if (reuse != null)
            {
                remnantId = reuse.Id;
                remnantPartNo = reuse.PartNo ?? ("#" + reuse.Id);
            }
            else
            {
                var parentNo = (millParent.PartNo ?? source.PartNo ?? "RM").Trim();
                remnantPartNo = await NextRemnantPartNoAsync(tenantId, parentNo);
                var sizeLabel = (thickness.HasValue ? thickness.Value.ToString("0.##") + "×" : "")
                    + (width.HasValue ? width.Value.ToString("0.##") + "×" : "")
                    + length.ToString("0.##") + " mm";
                var remnant = new RawMaterialMaster
                {
                    PartNo = remnantPartNo,
                    PartName = (millParent.PartName ?? millParent.PartNo ?? "Remnant").Trim() + " remnant " + sizeLabel,
                    Description = "Offcut from " + (source.PartNo ?? millParent.PartNo),
                    Unit = string.IsNullOrWhiteSpace(source.Unit) ? "EA" : source.Unit,
                    UnitCost = source.UnitCost,
                    VendorId = source.VendorId,
                    MaterialGrade = source.MaterialGrade ?? millParent.MaterialGrade,
                    Specification = source.Specification ?? millParent.Specification,
                    StockForm = source.StockForm ?? millParent.StockForm,
                    ThicknessMm = thickness,
                    WidthMm = width,
                    LengthMm = length,
                    IsRemnant = true,
                    ParentRawMaterialId = millParent.Id,
                    DefaultLocationId = locationId,
                    WarehouseLocation = source.WarehouseLocation,
                    Bin = source.Bin,
                    Box = source.Box,
                    IsActive = true,
                    Tenantid = tenantId
                };
                _context.RawMaterialMaster.Add(remnant);
                await _context.SaveChangesAsync();
                remnantId = remnant.Id;
                remnantPartNo = remnant.PartNo ?? remnantPartNo;
            }

            var jobNote = "";
            if (string.Equals(referenceType, "JobOrder", StringComparison.OrdinalIgnoreCase) && referenceId.HasValue)
                jobNote = " for job";

            string? remnantLotNumber = null;
            if (sourceLotId.HasValue)
            {
                remnantLotNumber = await _context.InventoryLot
                    .AsNoTracking()
                    .Where(l => l.Id == sourceLotId.Value && l.Tenantid == tenantId)
                    .Select(l => l.LotNumber)
                    .FirstOrDefaultAsync();
            }

            var (ok, err) = await ReceiveStockInTransactionAsync(
                tenantId,
                productId: null,
                rawMaterialId: remnantId,
                locationId,
                1,
                "RemnantSplit",
                rawMaterialId,
                lotId: null,
                createdBy,
                "Offcut from " + (source.PartNo ?? remnantPartNo) + jobNote + " (" + length.ToString("0.##") + " mm leftover)",
                remnantLotNumber);
            return ok ? (true, "") : (false, err);
        }

        private async Task<int?> FindShortestRemnantWithStockAsync(
            int tenantId,
            int millOrRemnantId,
            int locationId,
            decimal quantity)
        {
            var source = await _context.RawMaterialMaster
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == millOrRemnantId && r.Tenantid == tenantId);
            if (source == null || source.IsRemnant)
                return null;

            var remnants = await (
                from r in _context.RawMaterialMaster.AsNoTracking()
                join b in _context.InventoryBalance on r.Id equals b.RawMaterialId
                where r.Tenantid == tenantId
                    && r.IsRemnant
                    && r.ParentRawMaterialId == millOrRemnantId
                    && b.Tenantid == tenantId
                    && b.LocationId == locationId
                    && (b.QuantityOnHand - b.QuantityReserved) >= quantity
                orderby r.LengthMm ?? 999999m, r.Id
                select r.Id
            ).FirstOrDefaultAsync();

            return remnants > 0 ? remnants : null;
        }

        private async Task<(bool Success, string Error, int? ConsumedLotId)> ApplyIssueCoreAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            string? referenceType,
            int? referenceId,
            int? createdBy,
            string? notes,
            bool allowShortage,
            int? lotId = null,
            string? lotNumber = null)
        {
            var balance = await GetOrCreateBalanceAsync(tenantId, productId, rawMaterialId, locationId);
            decimal jobReserved = 0;
            var isJobIssue = string.Equals(referenceType, "JobOrder", StringComparison.OrdinalIgnoreCase)
                && referenceId.HasValue && referenceId.Value > 0;
            if (isJobIssue)
            {
                jobReserved = await OpenReservationsQuery(tenantId, productId, rawMaterialId, locationId)
                    .Where(r => r.ReferenceType == "JobOrder" && r.ReferenceId == referenceId.Value)
                    .SumAsync(r => (decimal?)r.Quantity) ?? 0;
            }

            var free = balance.QuantityOnHand - balance.QuantityReserved;
            var canIssue = free + jobReserved;
            if (!allowShortage && canIssue < quantity)
            {
                if (isJobIssue && rawMaterialId.HasValue)
                {
                    var remnantId = await FindShortestRemnantWithStockAsync(
                        tenantId, rawMaterialId.Value, locationId, quantity);
                    if (remnantId.HasValue && remnantId.Value != rawMaterialId.Value)
                    {
                        return await ApplyIssueCoreAsync(
                            tenantId, productId, remnantId, locationId, quantity,
                            referenceType, referenceId, createdBy, notes, allowShortage, lotId, lotNumber);
                    }
                }
                return (false, $"Insufficient stock. Available: {free}"
                    + (jobReserved > 0 ? $" plus {jobReserved} reserved for this job" : "")
                    + $", Requested: {quantity}", null);
            }

            if (isJobIssue && jobReserved > 0)
                await ConsumeReservationsAsync(tenantId, productId, rawMaterialId, locationId, referenceId!.Value, quantity, balance);

            var (lotOk, lotErr, allocations) = await AllocateLotsForIssueAsync(
                tenantId, productId, rawMaterialId, locationId, quantity, lotId, lotNumber, allowShortage);
            if (!lotOk)
                return (false, lotErr, null);

            balance.QuantityOnHand -= quantity;

            int? consumedLotId = null;
            foreach (var alloc in allocations)
            {
                if (alloc.LotId.HasValue)
                {
                    var (chgOk, chgErr) = await ApplyLotQuantityChangeAsync(
                        tenantId, alloc.LotId.Value, locationId, -alloc.Quantity);
                    if (!chgOk)
                        return (false, chgErr, null);
                    consumedLotId ??= alloc.LotId;
                }

                _context.InventoryTransaction.Add(new InventoryTransaction
                {
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    LocationId = locationId,
                    TransactionTypeId = ISSUE_TYPE_ID,
                    Quantity = -alloc.Quantity,
                    ReferenceType = referenceType,
                    ReferenceId = referenceId,
                    TransactionDate = DateTime.UtcNow,
                    LotId = alloc.LotId,
                    CreatedBy = createdBy,
                    Notes = notes,
                    Tenantid = tenantId
                });
            }
            return (true, "", consumedLotId);
        }

        private sealed class LotAllocation
        {
            public int? LotId { get; init; }
            public decimal Quantity { get; init; }
        }

        private static string? NormalizeLotNumber(string? lotNumber)
        {
            var t = (lotNumber ?? "").Trim();
            return t.Length == 0 ? null : t;
        }

        private async Task<(bool Success, string Error, int? LotId)> ResolveAndApplyLotReceiptAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            int? lotId,
            string? lotNumber)
        {
            var number = NormalizeLotNumber(lotNumber);
            if (!lotId.HasValue && number == null)
                return (true, "", null);

            InventoryLot? lot = null;
            if (lotId.HasValue)
            {
                lot = await _context.InventoryLot.FirstOrDefaultAsync(l =>
                    l.Id == lotId.Value && l.Tenantid == tenantId);
                if (lot == null)
                    return (false, "Lot not found.", null);
            }
            else
            {
                var query = _context.InventoryLot.Where(l =>
                    l.Tenantid == tenantId && l.LotNumber.ToLower() == number!.ToLower());
                if (productId.HasValue)
                    query = query.Where(l => l.ProductId == productId);
                else
                    query = query.Where(l => l.RawMaterialId == rawMaterialId);
                lot = await query.FirstOrDefaultAsync();
                if (lot == null)
                {
                    lot = new InventoryLot
                    {
                        LotNumber = number!,
                        ProductId = productId,
                        RawMaterialId = rawMaterialId,
                        ReceivedDate = DateTime.UtcNow,
                        Status = "Active",
                        Tenantid = tenantId
                    };
                    _context.InventoryLot.Add(lot);
                    await _context.SaveChangesAsync();
                }
            }

            var (ok, err) = await ApplyLotQuantityChangeAsync(tenantId, lot.Id, locationId, quantity);
            return ok ? (true, "", lot.Id) : (false, err, null);
        }

        private async Task<(bool Success, string Error, List<LotAllocation> Allocations)> AllocateLotsForIssueAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            decimal quantity,
            int? preferredLotId,
            string? preferredLotNumber,
            bool allowShortage)
        {
            var allocations = new List<LotAllocation>();
            var remaining = quantity;
            var number = NormalizeLotNumber(preferredLotNumber);

            int? forcedLotId = preferredLotId;
            if (!forcedLotId.HasValue && number != null)
            {
                var query = _context.InventoryLot.Where(l =>
                    l.Tenantid == tenantId && l.LotNumber.ToLower() == number.ToLower());
                if (productId.HasValue)
                    query = query.Where(l => l.ProductId == productId);
                else
                    query = query.Where(l => l.RawMaterialId == rawMaterialId);
                forcedLotId = await query.Select(l => (int?)l.Id).FirstOrDefaultAsync();
                if (!forcedLotId.HasValue)
                    return (false, $"Lot / heat {number} was not found for this item.", allocations);
            }

            if (forcedLotId.HasValue)
            {
                var lotQty = await LotQtyAtLocationAsync(tenantId, forcedLotId.Value, locationId);
                if (lotQty < remaining && !allowShortage)
                    return (false, $"Not enough qty on that lot / heat. On lot: {lotQty}, requested: {remaining}.", allocations);
                var take = Math.Min(lotQty, remaining);
                if (take > 0)
                    allocations.Add(new LotAllocation { LotId = forcedLotId, Quantity = take });
                remaining -= take;
                if (remaining > 0)
                    allocations.Add(new LotAllocation { LotId = null, Quantity = remaining });
                if (allocations.Count == 0)
                    allocations.Add(new LotAllocation { LotId = forcedLotId, Quantity = quantity });
                return (true, "", allocations);
            }

            var fifo = await (
                from b in _context.InventoryLotBalance
                join l in _context.InventoryLot on b.LotId equals l.Id
                where b.Tenantid == tenantId
                    && b.LocationId == locationId
                    && b.QuantityOnHand > 0
                    && (productId.HasValue ? l.ProductId == productId : l.RawMaterialId == rawMaterialId)
                orderby l.ReceivedDate, l.Id
                select new { b.LotId, b.QuantityOnHand }
            ).ToListAsync();

            foreach (var row in fifo)
            {
                if (remaining <= 0)
                    break;
                var take = Math.Min(row.QuantityOnHand, remaining);
                allocations.Add(new LotAllocation { LotId = row.LotId, Quantity = take });
                remaining -= take;
            }

            if (remaining > 0)
                allocations.Add(new LotAllocation { LotId = null, Quantity = remaining });
            if (allocations.Count == 0)
                allocations.Add(new LotAllocation { LotId = null, Quantity = quantity });
            return (true, "", allocations);
        }

        private async Task<decimal> LotQtyAtLocationAsync(int tenantId, int lotId, int locationId)
        {
            return await _context.InventoryLotBalance
                .Where(b => b.Tenantid == tenantId && b.LotId == lotId && b.LocationId == locationId)
                .Select(b => (decimal?)b.QuantityOnHand)
                .FirstOrDefaultAsync() ?? 0;
        }

        private async Task<(bool Success, string Error)> ApplyLotQuantityChangeAsync(
            int tenantId,
            int lotId,
            int locationId,
            decimal delta)
        {
            var row = await _context.InventoryLotBalance.FirstOrDefaultAsync(b =>
                b.Tenantid == tenantId && b.LotId == lotId && b.LocationId == locationId);
            if (row == null)
            {
                if (delta < 0)
                    return (false, "No quantity on that lot / heat at this location.");
                row = new InventoryLotBalance
                {
                    LotId = lotId,
                    LocationId = locationId,
                    QuantityOnHand = 0,
                    Tenantid = tenantId
                };
                _context.InventoryLotBalance.Add(row);
            }

            var next = row.QuantityOnHand + delta;
            if (next < 0)
                return (false, "Lot / heat quantity cannot go negative.");
            row.QuantityOnHand = next;
            return (true, "");
        }

        private IQueryable<InventoryReservation> OpenReservationsQuery(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId)
        {
            var query = _context.InventoryReservation.Where(r =>
                r.Tenantid == tenantId
                && r.LocationId == locationId
                && r.Quantity > 0);
            if (productId.HasValue)
                query = query.Where(r => r.ProductId == productId);
            else
                query = query.Where(r => r.RawMaterialId == rawMaterialId);
            return query;
        }

        private async Task ConsumeReservationsAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId,
            int jobOrderId,
            decimal quantity,
            InventoryBalance balance)
        {
            var remaining = quantity;
            var rows = await OpenReservationsQuery(tenantId, productId, rawMaterialId, locationId)
                .Where(r => r.ReferenceType == "JobOrder" && r.ReferenceId == jobOrderId)
                .OrderBy(r => r.CreatedDate)
                .ToListAsync();
            foreach (var row in rows)
            {
                if (remaining <= 0)
                    break;
                var take = Math.Min(row.Quantity, remaining);
                row.Quantity -= take;
                balance.QuantityReserved = Math.Max(0, balance.QuantityReserved - take);
                remaining -= take;
            }
        }

        private async Task<InventoryBalance> GetOrCreateBalanceAsync(
            int tenantId,
            int? productId,
            int? rawMaterialId,
            int locationId)
        {
            InventoryBalance? balance;
            if (productId.HasValue)
                balance = await _context.InventoryBalance
                    .FirstOrDefaultAsync(b => b.Tenantid == tenantId && b.LocationId == locationId && b.ProductId == productId);
            else
                balance = await _context.InventoryBalance
                    .FirstOrDefaultAsync(b => b.Tenantid == tenantId && b.LocationId == locationId && b.RawMaterialId == rawMaterialId);

            if (balance == null)
            {
                balance = new InventoryBalance
                {
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    LocationId = locationId,
                    QuantityOnHand = 0,
                    QuantityReserved = 0,
                    Tenantid = tenantId
                };
                _context.InventoryBalance.Add(balance);
                await _context.SaveChangesAsync();
            }

            if (rawMaterialId.HasValue)
            {
                var rm = await _context.RawMaterialMaster
                    .AsNoTracking()
                    .FirstOrDefaultAsync(r => r.Id == rawMaterialId.Value && r.Tenantid == tenantId);
                if (rm != null)
                {
                    balance.ReorderPoint = rm.ReorderPoint;
                    balance.ReorderQuantity = rm.ReorderQuantity;
                }
            }
            else if (productId.HasValue)
            {
                var product = await _context.ProductMaster
                    .AsNoTracking()
                    .FirstOrDefaultAsync(p => p.Id == productId.Value && p.tenantid == tenantId);
                if (product != null)
                {
                    balance.ReorderPoint = product.ReorderPoint;
                    balance.ReorderQuantity = product.ReorderQuantity;
                }
            }

            return balance;
        }

        public async Task<decimal> GetOnHandAsync(int tenantId, int productId, int? locationId = null)
        {
            var query = _context.InventoryBalance.Where(b =>
                b.Tenantid == tenantId && b.ProductId == productId);
            if (locationId.HasValue && locationId.Value > 0)
                query = query.Where(b => b.LocationId == locationId.Value);
            return await query.SumAsync(b => (decimal?)b.QuantityOnHand) ?? 0;
        }
    }
}
