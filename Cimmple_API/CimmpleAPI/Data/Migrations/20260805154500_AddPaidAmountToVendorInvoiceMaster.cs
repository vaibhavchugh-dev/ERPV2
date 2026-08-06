using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPaidAmountToVendorInvoiceMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PaidAmount",
                table: "VendorInvoiceMaster",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.Sql(@"
                UPDATE [VendorInvoiceMaster]
                SET [PaidAmount] = [TotalAmount]
                WHERE ([isPaid] = 1 OR [Paydate] IS NOT NULL)
                  AND ([PaidAmount] IS NULL OR [PaidAmount] = 0)
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaidAmount",
                table: "VendorInvoiceMaster");
        }
    }
}
