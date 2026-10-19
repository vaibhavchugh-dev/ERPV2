using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <summary>
    /// Tracks which vendor PO each vendor-quotation line was converted into (partial convert support).
    /// </summary>
    public partial class AddConvertedVendorOrderIdToVendorQuotationsDetails : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ConvertedVendorOrderId",
                table: "VendorQuotationsDetails",
                type: "int",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConvertedVendorOrderId",
                table: "VendorQuotationsDetails");
        }
    }
}
