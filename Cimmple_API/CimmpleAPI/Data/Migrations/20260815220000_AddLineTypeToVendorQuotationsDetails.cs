using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <summary>
    /// Line type (and optional RM id) on vendor quotation lines so convert-to-PO keeps classification.
    /// </summary>
    public partial class AddLineTypeToVendorQuotationsDetails : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "LineType",
                table: "VendorQuotationsDetails",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RawMaterialId",
                table: "VendorQuotationsDetails",
                type: "int",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LineType",
                table: "VendorQuotationsDetails");

            migrationBuilder.DropColumn(
                name: "RawMaterialId",
                table: "VendorQuotationsDetails");
        }
    }
}
