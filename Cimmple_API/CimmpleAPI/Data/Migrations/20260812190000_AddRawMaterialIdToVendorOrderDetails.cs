using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <summary>
    /// Phase 1 inventory: vendor PO lines can reference RawMaterialMaster for stock receiving.
    /// </summary>
    public partial class AddRawMaterialIdToVendorOrderDetails : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "RawMaterialId",
                table: "VendorOrderDetails",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_VendorOrderDetails_RawMaterialId",
                table: "VendorOrderDetails",
                column: "RawMaterialId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_VendorOrderDetails_RawMaterialId",
                table: "VendorOrderDetails");

            migrationBuilder.DropColumn(
                name: "RawMaterialId",
                table: "VendorOrderDetails");
        }
    }
}
