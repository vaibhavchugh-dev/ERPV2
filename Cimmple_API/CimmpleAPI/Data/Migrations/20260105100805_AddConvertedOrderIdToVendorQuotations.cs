using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddConvertedOrderIdToVendorQuotations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "convertedOrderId",
                table: "VendorQuotations",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OrderDetailID",
                table: "ShippingDetails",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OrderDetailID",
                table: "InvoiceDetail",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "QtyInvoiced",
                table: "InvoiceDetail",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceStatus",
                table: "CustomerOrderDetails",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "InvoicedQty",
                table: "CustomerOrderDetails",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ShippedQty",
                table: "CustomerOrderDetails",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ShippingStatus",
                table: "CustomerOrderDetails",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "convertedOrderId",
                table: "VendorQuotations");

            migrationBuilder.DropColumn(
                name: "OrderDetailID",
                table: "ShippingDetails");

            migrationBuilder.DropColumn(
                name: "OrderDetailID",
                table: "InvoiceDetail");

            migrationBuilder.DropColumn(
                name: "QtyInvoiced",
                table: "InvoiceDetail");

            migrationBuilder.DropColumn(
                name: "InvoiceStatus",
                table: "CustomerOrderDetails");

            migrationBuilder.DropColumn(
                name: "InvoicedQty",
                table: "CustomerOrderDetails");

            migrationBuilder.DropColumn(
                name: "ShippedQty",
                table: "CustomerOrderDetails");

            migrationBuilder.DropColumn(
                name: "ShippingStatus",
                table: "CustomerOrderDetails");
        }
    }
}
