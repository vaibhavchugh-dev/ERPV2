using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAccountingDefaultsAndVendorExpenseAccount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AccountingDefaults",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    CompanyName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    FiscalYearStart = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    DefaultCurrency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    TaxRate = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    DefaultAccountsReceivableAccountId = table.Column<int>(type: "int", nullable: true),
                    DefaultAccountsPayableAccountId = table.Column<int>(type: "int", nullable: true),
                    DefaultRevenueAccountId = table.Column<int>(type: "int", nullable: true),
                    DefaultExpenseAccountId = table.Column<int>(type: "int", nullable: true),
                    DefaultInventoryAccountId = table.Column<int>(type: "int", nullable: true),
                    DefaultSalesTaxPayableAccountId = table.Column<int>(type: "int", nullable: true),
                    DefaultInputTaxAccountId = table.Column<int>(type: "int", nullable: true),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedDate = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccountingDefaults", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AccountingDefaults_TenantId",
                table: "AccountingDefaults",
                column: "TenantId",
                unique: true);

            migrationBuilder.AddColumn<int>(
                name: "expenseAccountId",
                table: "VendorCOAMapping",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "expenseAccountId",
                table: "VendorCOAMapping");

            migrationBuilder.DropTable(
                name: "AccountingDefaults");
        }
    }
}
