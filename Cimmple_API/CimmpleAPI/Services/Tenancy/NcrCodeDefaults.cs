using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using CimmpleAPI.Data.Seeds;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services.Tenancy
{
    public static class NcrCodeDefaults
    {
        public static Task LockNcrCodesAsync(CimmpleDbContext context, int tenantId) => context.Database.ExecuteSqlRawAsync(@"DECLARE @r int;
EXEC @r = sp_getapplock @Resource = {0}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 15000;
IF @r < 0 THROW 51000, 'NCR code master is busy, please try again.', 1;", $"ncr-code-master-{tenantId}");

        /// <summary>Inserts the default NCR codes the tenant does not have yet (matched by code).</summary>
        public static async Task<(int Inserted, int TotalForTenant)> EnsureForTenantAsync(
            CimmpleDbContext context, int tenantId, int createdBy)
        {
            await using var tx = context.Database.CurrentTransaction == null
                ? await context.Database.BeginTransactionAsync()
                : null;
            await LockNcrCodesAsync(context, tenantId);

            var existingCodes = await context.NCRCodeMaster
                .AsNoTracking()
                .Where(c => c.TenantId == tenantId && c.NCRCode != null)
                .Select(c => c.NCRCode!.ToLower())
                .ToListAsync();

            var existingSet = new HashSet<string>(existingCodes, StringComparer.OrdinalIgnoreCase);
            var now = DateTime.UtcNow;
            var toInsert = NCRCodeSeedData.DefaultCodes
                .Where(c => !existingSet.Contains(c.Code))
                .Select(c => new NCRCodeMaster
                {
                    NCRCode = c.Code,
                    Description = c.Description,
                    TenantId = tenantId,
                    CreatedBy = createdBy,
                    CreatedDate = now
                })
                .ToList();

            if (toInsert.Count > 0)
            {
                context.NCRCodeMaster.AddRange(toInsert);
                await context.SaveChangesAsync();
            }

            var total = await context.NCRCodeMaster.CountAsync(c => c.TenantId == tenantId);
            if (tx != null)
            {
                await tx.CommitAsync();
            }

            return (toInsert.Count, total);
        }
    }
}
