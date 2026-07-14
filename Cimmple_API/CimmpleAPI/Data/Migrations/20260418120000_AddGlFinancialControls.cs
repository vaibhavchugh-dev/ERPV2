using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddGlFinancialControls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ReversedByJournalEntryId",
                table: "JournalEntries",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReversesJournalEntryId",
                table: "JournalEntries",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "GlAccountingPeriodLocks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    PeriodKey = table.Column<string>(type: "nvarchar(6)", maxLength: 6, nullable: false),
                    ClosedUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ClosedByUserId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GlAccountingPeriodLocks", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GlAccountingPeriodLocks_TenantId_PeriodKey",
                table: "GlAccountingPeriodLocks",
                columns: new[] { "TenantId", "PeriodKey" },
                unique: true);

            migrationBuilder.CreateTable(
                name: "GlAuditEvents",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    OccurredUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ActorUserId = table.Column<int>(type: "int", nullable: true),
                    JournalEntryId = table.Column<int>(type: "int", nullable: true),
                    RelatedJournalEntryId = table.Column<int>(type: "int", nullable: true),
                    PeriodKey = table.Column<string>(type: "nvarchar(6)", maxLength: 6, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GlAuditEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GlAuditEvents_TenantId_OccurredUtc",
                table: "GlAuditEvents",
                columns: new[] { "TenantId", "OccurredUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GlAccountingPeriodLocks");

            migrationBuilder.DropTable(
                name: "GlAuditEvents");

            migrationBuilder.DropColumn(
                name: "ReversedByJournalEntryId",
                table: "JournalEntries");

            migrationBuilder.DropColumn(
                name: "ReversesJournalEntryId",
                table: "JournalEntries");
        }
    }
}
