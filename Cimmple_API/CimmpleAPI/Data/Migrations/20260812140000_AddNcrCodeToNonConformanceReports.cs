using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    public partial class AddNcrCodeToNonConformanceReports : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NcrCode",
                table: "NonConformanceReports",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NcrCodeId",
                table: "NonConformanceReports",
                type: "int",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "NcrCode", table: "NonConformanceReports");
            migrationBuilder.DropColumn(name: "NcrCodeId", table: "NonConformanceReports");
        }
    }
}
