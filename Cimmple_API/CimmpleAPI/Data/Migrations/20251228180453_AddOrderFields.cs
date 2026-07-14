using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttachmentsJson",
                table: "CustomerOrder",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CommentsJson",
                table: "CustomerOrder",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "leadTime",
                table: "CustomerOrderDetails",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "notes",
                table: "CustomerOrderDetails",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttachmentsJson",
                table: "CustomerOrder");

            migrationBuilder.DropColumn(
                name: "CommentsJson",
                table: "CustomerOrder");

            migrationBuilder.DropColumn(
                name: "leadTime",
                table: "CustomerOrderDetails");

            migrationBuilder.DropColumn(
                name: "notes",
                table: "CustomerOrderDetails");
        }
    }
}

