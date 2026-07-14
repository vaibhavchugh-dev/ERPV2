using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddIsResponseOnlyToVendorQuotations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool?>(
                name: "IsResponseOnly",
                table: "VendorQuotations",
                type: "bit",
                nullable: true);

            // Mark existing child quotations as response-only
            migrationBuilder.Sql(@"
                UPDATE VendorQuotations 
                SET IsResponseOnly = 1 
                WHERE ParentQuotationID IS NOT NULL 
                  AND ParentQuotationID != OrderID
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsResponseOnly",
                table: "VendorQuotations");
        }
    }
}

