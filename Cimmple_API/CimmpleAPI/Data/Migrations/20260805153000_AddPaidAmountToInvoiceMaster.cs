using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPaidAmountToInvoiceMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "PaidAmount",
                table: "InvoiceMaster",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            // Legacy fully-paid invoices used PaymentDate as the paid flag.
            migrationBuilder.Sql(@"
                UPDATE [InvoiceMaster]
                SET [PaidAmount] = [TotalAmount]
                WHERE [PaymentDate] IS NOT NULL
                  AND ([PaidAmount] IS NULL OR [PaidAmount] = 0)
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PaidAmount",
                table: "InvoiceMaster");
        }
    }
}
