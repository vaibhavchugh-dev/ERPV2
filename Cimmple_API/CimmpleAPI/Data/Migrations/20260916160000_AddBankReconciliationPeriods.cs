using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBankReconciliationPeriods : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BankReconciliationPeriod",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    BankId = table.Column<int>(type: "int", nullable: false),
                    BeginningBalance = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    EndingBalance = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    StatementDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ClearedBalance = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    CompletedUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CompletedByUserId = table.Column<int>(type: "int", nullable: true),
                    CreatedUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankReconciliationPeriod", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BankReconciliationPeriodItem",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PeriodId = table.Column<int>(type: "int", nullable: false),
                    TransactionId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BankReconciliationPeriodItem", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BankReconPeriod_Tenant_Bank_Date",
                schema: "CimmpleFlow",
                table: "BankReconciliationPeriod",
                columns: new[] { "TenantId", "BankId", "StatementDate" });

            migrationBuilder.Sql(@"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_BankReconPeriod_Tenant_Bank_Status' AND object_id = OBJECT_ID(N'CimmpleFlow.BankReconciliationPeriod'))
BEGIN
    CREATE UNIQUE INDEX [IX_BankReconPeriod_Tenant_Bank_Status]
        ON CimmpleFlow.BankReconciliationPeriod ([TenantId], [BankId])
        WHERE [Status] = N'Open';
END
");

            migrationBuilder.CreateIndex(
                name: "IX_BankReconPeriodItem_Period_Txn",
                schema: "CimmpleFlow",
                table: "BankReconciliationPeriodItem",
                columns: new[] { "PeriodId", "TransactionId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BankReconPeriodItem_Txn",
                schema: "CimmpleFlow",
                table: "BankReconciliationPeriodItem",
                column: "TransactionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BankReconciliationPeriodItem",
                schema: "CimmpleFlow");

            migrationBuilder.DropTable(
                name: "BankReconciliationPeriod",
                schema: "CimmpleFlow");
        }
    }
}
