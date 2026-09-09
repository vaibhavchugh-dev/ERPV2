using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAccountingGapTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PaymentTerm",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Days = table.Column<int>(type: "int", nullable: false),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedDate = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentTerm", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ApApprovalLimit",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    RoleId = table.Column<int>(type: "int", nullable: false),
                    LimitAmount = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    RequiresDualApproval = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedDate = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ApApprovalLimit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ArReminderLog",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    InvoiceId = table.Column<int>(type: "int", nullable: false),
                    SentUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ToEmail = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Error = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    ActorUserId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArReminderLog", x => x.Id);
                });

            migrationBuilder.AddColumn<bool>(
                name: "IsReconciled",
                schema: "CimmpleFlow",
                table: "Transactions",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "ReconciledUtc",
                schema: "CimmpleFlow",
                table: "Transactions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastReconciledDate",
                schema: "CimmpleFlow",
                table: "BankMaster",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PaymentTermId",
                schema: "CimmpleFlow",
                table: "InvoiceMaster",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PaymentTermId",
                schema: "CimmpleFlow",
                table: "VendorInvoiceMaster",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "GstEnabled",
                schema: "CimmpleFlow",
                table: "AccountingDefaults",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "TaxRegistrationNumber",
                schema: "CimmpleFlow",
                table: "AccountingDefaults",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ArReminderLog_TenantId_InvoiceId",
                schema: "CimmpleFlow",
                table: "ArReminderLog",
                columns: new[] { "TenantId", "InvoiceId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "PaymentTerm", schema: "CimmpleFlow");
            migrationBuilder.DropTable(name: "ApApprovalLimit", schema: "CimmpleFlow");
            migrationBuilder.DropTable(name: "ArReminderLog", schema: "CimmpleFlow");

            migrationBuilder.DropColumn(name: "IsReconciled", schema: "CimmpleFlow", table: "Transactions");
            migrationBuilder.DropColumn(name: "ReconciledUtc", schema: "CimmpleFlow", table: "Transactions");
            migrationBuilder.DropColumn(name: "LastReconciledDate", schema: "CimmpleFlow", table: "BankMaster");
            migrationBuilder.DropColumn(name: "PaymentTermId", schema: "CimmpleFlow", table: "InvoiceMaster");
            migrationBuilder.DropColumn(name: "PaymentTermId", schema: "CimmpleFlow", table: "VendorInvoiceMaster");
            migrationBuilder.DropColumn(name: "GstEnabled", schema: "CimmpleFlow", table: "AccountingDefaults");
            migrationBuilder.DropColumn(name: "TaxRegistrationNumber", schema: "CimmpleFlow", table: "AccountingDefaults");
        }
    }
}
