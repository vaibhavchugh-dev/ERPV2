using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <summary>
    /// Reorder point / qty on Product Master so finished goods can drive Inventory low stock.
    /// </summary>
    public partial class AddReorderPolicyToProductMaster : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ReorderPoint",
                table: "ProductMaster",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ReorderQuantity",
                table: "ProductMaster",
                type: "decimal(18,2)",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReorderPoint",
                table: "ProductMaster");

            migrationBuilder.DropColumn(
                name: "ReorderQuantity",
                table: "ProductMaster");
        }
    }
}
