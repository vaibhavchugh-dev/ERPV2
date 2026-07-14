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
            string? notes)
        {
            if (quantity <= 0)
                return (false, "Quantity must be positive");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");
            if (productId.HasValue && rawMaterialId.HasValue)
                return (false, "Cannot specify both ProductId and RawMaterialId");

            try
            {
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
                    LotId = lotId,
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
            string? notes)
        {
            if (quantity <= 0)
                return (false, "Quantity must be positive");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");
            if (productId.HasValue && rawMaterialId.HasValue)
                return (false, "Cannot specify both ProductId and RawMaterialId");

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
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
                    LotId = lotId,
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
            string? notes)
        {
            if (quantity <= 0)
                return (false, "Quantity must be positive");
            if (!productId.HasValue && !rawMaterialId.HasValue)
                return (false, "Either ProductId or RawMaterialId is required");

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                var balance = await GetOrCreateBalanceAsync(tenantId, productId, rawMaterialId, locationId);
                var available = balance.QuantityOnHand - balance.QuantityReserved;
                if (available < quantity)
                    return (false, $"Insufficient stock. Available: {available}, Requested: {quantity}");

                balance.QuantityOnHand -= quantity;

                var invTransaction = new InventoryTransaction
                {
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    LocationId = locationId,
                    TransactionTypeId = ISSUE_TYPE_ID,
                    Quantity = -quantity,
                    ReferenceType = referenceType,
                    ReferenceId = referenceId,
                    TransactionDate = DateTime.UtcNow,
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
            string? notes)
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

                var outTx = new InventoryTransaction
                {
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    LocationId = fromLocationId,
                    TransactionTypeId = TRANSFER_OUT_TYPE_ID,
                    Quantity = -quantity,
                    ReferenceType = "Transfer",
                    ReferenceId = toLocationId,
                    TransactionDate = DateTime.UtcNow,
                    CreatedBy = createdBy,
                    Notes = notes,
                    Tenantid = tenantId
                };
                var inTx = new InventoryTransaction
                {
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    LocationId = toLocationId,
                    TransactionTypeId = TRANSFER_IN_TYPE_ID,
                    Quantity = quantity,
                    ReferenceType = "Transfer",
                    ReferenceId = fromLocationId,
                    TransactionDate = DateTime.UtcNow,
                    CreatedBy = createdBy,
                    Notes = notes,
                    Tenantid = tenantId
                };
                _context.InventoryTransaction.AddRange(outTx, inTx);
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
            string? notes)
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

                var invTransaction = new InventoryTransaction
                {
                    ProductId = productId,
                    RawMaterialId = rawMaterialId,
                    LocationId = locationId,
                    TransactionTypeId = ADJUSTMENT_TYPE_ID,
                    Quantity = quantity,
                    ReferenceType = "Adjustment",
                    TransactionDate = DateTime.UtcNow,
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

            return balance;
        }
    }
}
