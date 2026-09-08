using Microsoft.EntityFrameworkCore;
using CimmpleAPI.Data;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Ensures DiscountType columns exist on CimmpleFlow detail tables.
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

            await EnsureColumnAsync(context, "InvoiceDetail", "DiscountType");
            await EnsureColumnAsync(context, "QuotationOrderDetails", "DiscountType");
            await EnsureColumnAsync(context, "CustomerOrderDetails", "DiscountType");
            await EnsureColumnAsync(context, "VendorQuotationsDetails", "DiscountType");
            await EnsureColumnAsync(context, "VendorOrderDetails", "DiscountType");

            lock (_lock)
            {
                _ensured = true;
            }
        }

        private static async Task EnsureColumnAsync(CimmpleDbContext context, string table, string column)
        {
            var schemaTable = $"CimmpleFlow.{table}";
            await context.Database.ExecuteSqlRawAsync($@"
IF OBJECT_ID(N'{schemaTable}', N'U') IS NOT NULL
   AND COL_LENGTH(N'{schemaTable}', N'{column}') IS NULL
BEGIN
    ALTER TABLE {schemaTable} ADD [{column}] NVARCHAR(20) NULL;
END");
        }
    }
}
