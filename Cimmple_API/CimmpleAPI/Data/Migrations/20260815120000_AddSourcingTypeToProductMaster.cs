using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <summary>
    /// Classify Product Master as Make (shop), Buy (vendor PO), or Both.
    /// </summary>
    public partial class AddSourcingTypeToProductMaster : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SourcingType",
                table: "ProductMaster",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE ProductMaster SET SourcingType = N'Make' WHERE SourcingType IS NULL OR LTRIM(RTRIM(SourcingType)) = N''");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SourcingType",
                table: "ProductMaster");
        }
    }
}
