using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures columns added in app code exist on CimmpleFlow tables.
    /// Manual SQL scripts historically targeted [dbo] while EF uses CimmpleFlow.
    /// </summary>
    public static class DiscountTypeSchemaService
    {
        private static bool _ensured;
        private static readonly object _lock = new();

        public static async Task EnsureColumnsAsync(CimmpleDbContext context)
        {
            if (_ensured) return;
            lock (_lock)
            {
                if (_ensured) return;
            }

            await EnsureNvarcharColumnAsync(context, "InvoiceDetail", "DiscountType", 20);
            await EnsureNvarcharColumnAsync(context, "QuotationOrderDetails", "DiscountType", 20);
            await EnsureNvarcharColumnAsync(context, "CustomerOrderDetails", "DiscountType", 20);
            await EnsureNvarcharColumnAsync(context, "VendorQuotationsDetails", "DiscountType", 20);
            await EnsureNvarcharColumnAsync(context, "VendorOrderDetails", "DiscountType", 20);

            // Convert VQ → VO writes these on VendorOrderDetails; Compare can succeed while Convert fails without them
            await EnsureNvarcharColumnAsync(context, "VendorOrderDetails", "LineType", 50);
            await EnsureNvarcharColumnAsync(context, "VendorQuotationsDetails", "LineType", 50);
            await EnsureIntColumnAsync(context, "VendorOrderDetails", "RawMaterialId");
            await EnsureIntColumnAsync(context, "VendorQuotationsDetails", "RawMaterialId");

            lock (_lock)
            {
                _ensured = true;
            }
        }

        private static async Task EnsureNvarcharColumnAsync(
            CimmpleDbContext context, string table, string column, int length)
        {
            var schemaTable = $"CimmpleFlow.{table}";
            await context.Database.ExecuteSqlRawAsync($@"
IF OBJECT_ID(N'{schemaTable}', N'U') IS NOT NULL
   AND COL_LENGTH(N'{schemaTable}', N'{column}') IS NULL
BEGIN
    ALTER TABLE {schemaTable} ADD [{column}] NVARCHAR({length}) NULL;
END");
        }

        private static async Task EnsureIntColumnAsync(
            CimmpleDbContext context, string table, string column)
        {
            var schemaTable = $"CimmpleFlow.{table}";
            await context.Database.ExecuteSqlRawAsync($@"
IF OBJECT_ID(N'{schemaTable}', N'U') IS NOT NULL
   AND COL_LENGTH(N'{schemaTable}', N'{column}') IS NULL
BEGIN
    ALTER TABLE {schemaTable} ADD [{column}] INT NULL;
END");
        }
    }
}
