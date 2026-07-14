using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddApartmentAndCountryToBankMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "apartment",
                table: "BankMaster",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "country",
                table: "BankMaster",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.Sql("UPDATE [BankMaster] SET [country] = 'US' WHERE [country] IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "apartment",
                table: "BankMaster");

            migrationBuilder.DropColumn(
                name: "country",
                table: "BankMaster");
        }
    }
}



