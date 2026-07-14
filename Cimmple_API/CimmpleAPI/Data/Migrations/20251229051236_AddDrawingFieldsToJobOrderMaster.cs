using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDrawingFieldsToJobOrderMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DrawingNumber",
                table: "JobOrderMaster",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DrawingRevision",
                table: "JobOrderMaster",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DrawingNumber",
                table: "JobOrderMaster");

            migrationBuilder.DropColumn(
                name: "DrawingRevision",
                table: "JobOrderMaster");
        }
    }
}
