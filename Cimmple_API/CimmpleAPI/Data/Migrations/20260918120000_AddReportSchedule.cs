using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddReportSchedule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ReportSchedule",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    CreatedByUserId = table.Column<int>(type: "int", nullable: false),
                    ReportCategory = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ReportType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ReportName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    DateRange = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    CustomStartDate = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    CustomEndDate = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    LocationId = table.Column<int>(type: "int", nullable: true),
                    ParametersJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Format = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Frequency = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    DayOfWeek = table.Column<int>(type: "int", nullable: true),
                    DayOfMonth = table.Column<int>(type: "int", nullable: true),
                    TimeOfDayMinutes = table.Column<int>(type: "int", nullable: false),
                    TimeZoneId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    ToEmails = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    CcEmails = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Subject = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    NextRunUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastRunUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastRunStatus = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    LastRunError = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReportSchedule", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReportSchedule_Tenant_Enabled_NextRun",
                schema: "CimmpleFlow",
                table: "ReportSchedule",
                columns: new[] { "TenantId", "IsEnabled", "NextRunUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ReportSchedule_Due",
                schema: "CimmpleFlow",
                table: "ReportSchedule",
                columns: new[] { "IsEnabled", "NextRunUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReportSchedule",
                schema: "CimmpleFlow");
        }
    }
}
