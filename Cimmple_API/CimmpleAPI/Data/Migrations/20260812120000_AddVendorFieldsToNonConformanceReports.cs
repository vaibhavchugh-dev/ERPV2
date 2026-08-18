using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddVendorFieldsToNonConformanceReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "VendorId",
                table: "NonConformanceReports",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VendorName",
                table: "NonConformanceReports",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "VendorOrderId",
                table: "NonConformanceReports",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PoNumber",
                table: "NonConformanceReports",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "VendorId", table: "NonConformanceReports");
            migrationBuilder.DropColumn(name: "VendorName", table: "NonConformanceReports");
            migrationBuilder.DropColumn(name: "VendorOrderId", table: "NonConformanceReports");
            migrationBuilder.DropColumn(name: "PoNumber", table: "NonConformanceReports");
        }
    }
}
