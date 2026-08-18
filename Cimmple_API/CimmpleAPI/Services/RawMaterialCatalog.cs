using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Find or create Raw Material Master from a vendor PO line so purchasing
    /// does not require a separate master-screen visit first.
    /// </summary>
    public static class RawMaterialCatalog
    {
        public static async Task<int?> EnsureAsync(
            CimmpleDbContext context,
            int tenantId,
            string? partNo,
            string? partName,
            string? unit,
            decimal? unitCost,
            int? vendorId,
            CancellationToken cancellationToken = default)
        {
            var safePartNo = (partNo ?? "").Trim();
            if (string.IsNullOrWhiteSpace(safePartNo) || ProductSourcing.LooksLikeJobPartNo(safePartNo))
                return null;

            var existing = (await context.RawMaterialMaster
                    .Where(r => r.Tenantid == tenantId)
                    .ToListAsync(cancellationToken))
                .FirstOrDefault(r =>
                    string.Equals((r.PartNo ?? "").Trim(), safePartNo, StringComparison.OrdinalIgnoreCase));

            var safeName = string.IsNullOrWhiteSpace(partName) ? safePartNo : partName.Trim();
            var safeUnit = string.IsNullOrWhiteSpace(unit) ? "EA" : unit.Trim();
            var cost = unitCost ?? 0;

            int? validVendorId = null;
            if (vendorId.HasValue && vendorId.Value > 0)
            {
                var vendorOk = await context.VendorMaster.AnyAsync(
                    v => v.vendor_id == vendorId.Value && v.Tenantid == tenantId,
                    cancellationToken);
                if (vendorOk)
                    validVendorId = vendorId.Value;
            }

            if (existing != null)
            {
                if (string.IsNullOrWhiteSpace(existing.PartName))
                    existing.PartName = safeName;
                if (string.IsNullOrWhiteSpace(existing.Unit))
                    existing.Unit = safeUnit;
                if (existing.UnitCost <= 0 && cost > 0)
                    existing.UnitCost = cost;
                if (!existing.VendorId.HasValue && validVendorId.HasValue)
                    existing.VendorId = validVendorId;
                if (!existing.IsActive)
                    existing.IsActive = true;
                return existing.Id;
            }

            var entity = new RawMaterialMaster
            {
                PartNo = safePartNo,
                PartName = safeName,
                Description = "Created from vendor purchase order",
                Unit = safeUnit,
                UnitCost = cost,
                VendorId = validVendorId,
                IsActive = true,
                Tenantid = tenantId
            };
            context.RawMaterialMaster.Add(entity);
            await context.SaveChangesAsync(cancellationToken);
            return entity.Id;
        }
    }
}
