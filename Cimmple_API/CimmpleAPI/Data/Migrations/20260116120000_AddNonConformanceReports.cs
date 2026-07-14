using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddNonConformanceReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "NonConformanceReports",
                columns: table => new
                {
                    NcrId = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    NcrNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    Category = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    JobOrderId = table.Column<int>(type: "int", nullable: true),
                    JobOrderNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    RoutingStepId = table.Column<int>(type: "int", nullable: true),
                    PartNo = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    PartName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CustomerId = table.Column<int>(type: "int", nullable: true),
                    CustomerName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    DefectLocation = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    DefectQuantity = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    TotalQuantity = table.Column<int>(type: "int", nullable: false, defaultValue: 0),
                    DefectDescription = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Photos = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    RootCause = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    RootCauseCategory = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    ImmediateAction = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CorrectiveAction = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    PreventiveAction = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ReportedBy = table.Column<int>(type: "int", nullable: false),
                    ReportedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ReportedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    InvestigatedBy = table.Column<int>(type: "int", nullable: true),
                    InvestigatedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    InvestigatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ApprovedBy = table.Column<int>(type: "int", nullable: true),
                    ApprovedByName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ApprovedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ClosedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CostImpact = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    TenantId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NonConformanceReports", x => x.NcrId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_NonConformanceReports_CustomerId",
                table: "NonConformanceReports",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_NonConformanceReports_JobOrderId",
                table: "NonConformanceReports",
                column: "JobOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_NonConformanceReports_ReportedDate",
                table: "NonConformanceReports",
                column: "ReportedDate");

            migrationBuilder.CreateIndex(
                name: "IX_NonConformanceReports_TenantId_Status",
                table: "NonConformanceReports",
                columns: new[] { "TenantId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "NonConformanceReports");
        }
    }
}























