using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Make / Buy / Both classification and ProductMaster upsert for finished parts.
    /// </summary>
    public static class ProductSourcing
    {
        public const string Make = "Make";
        public const string Buy = "Buy";
        public const string Both = "Both";

        public static string Normalize(string? value)
        {
            var v = (value ?? "").Trim();
            if (string.Equals(v, Buy, StringComparison.OrdinalIgnoreCase)) return Buy;
            if (string.Equals(v, Both, StringComparison.OrdinalIgnoreCase)) return Both;
            if (string.Equals(v, Make, StringComparison.OrdinalIgnoreCase)) return Make;
            return Make;
        }

        /// <summary>Combine shop (Make) and purchased (Buy) into Both when both apply.</summary>
        public static string Merge(string? existing, string incoming)
        {
            var a = Normalize(existing);
            var b = Normalize(incoming);
            if (a == b) return a;
            if (a == Both || b == Both) return Both;
            if ((a == Make && b == Buy) || (a == Buy && b == Make)) return Both;
            return b;
        }

        public static bool LooksLikeJobPartNo(string? partNo)
        {
            var p = partNo ?? "";
            return p.Contains("#JO", StringComparison.OrdinalIgnoreCase)
                || p.Contains("JO#", StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Find or create ProductMaster by part number. Sets SourcingType via Merge.
        /// Returns the product id, or null if part no is empty/job-like.
        /// </summary>
        public static async Task<int?> EnsureFinishedProductAsync(
            CimmpleDbContext context,
            int tenantId,
            string? partNo,
            string? partName,
            string? unit,
            decimal? unitPrice,
            string incomingSourcing,
            CancellationToken cancellationToken = default)
        {
            var safePartNo = (partNo ?? "").Trim();
            if (string.IsNullOrWhiteSpace(safePartNo) || LooksLikeJobPartNo(safePartNo))
                return null;

            var existing = (await context.ProductMaster
                    .Where(p => p.tenantid == tenantId)
                    .ToListAsync(cancellationToken))
                .FirstOrDefault(p =>
                    string.Equals((p.partno ?? "").Trim(), safePartNo, StringComparison.OrdinalIgnoreCase));

            var safeName = string.IsNullOrWhiteSpace(partName) ? safePartNo : partName.Trim();
            var safeUnit = string.IsNullOrWhiteSpace(unit) ? "EA" : unit.Trim();
            var price = unitPrice ?? 0;

            if (existing != null)
            {
                existing.SourcingType = Merge(existing.SourcingType, incomingSourcing);
                if (string.IsNullOrWhiteSpace(existing.partname) && !string.IsNullOrWhiteSpace(safeName))
                    existing.partname = safeName;
                if (string.IsNullOrWhiteSpace(existing.Unit))
                    existing.Unit = safeUnit;
                return existing.Id;
            }

            var entity = new ProductMaster
            {
                partno = safePartNo,
                partname = safeName,
                Unit = safeUnit,
                UnitPrice = price,
                tenantid = tenantId,
                customerid = null,
                Noofday = null,
                pdescription = incomingSourcing == Buy
                    ? "Synced from vendor purchase orders"
                    : "Synced from orders",
                SourcingType = Normalize(incomingSourcing)
            };
            context.ProductMaster.Add(entity);
            await context.SaveChangesAsync(cancellationToken);
            return entity.Id;
        }
    }
}
