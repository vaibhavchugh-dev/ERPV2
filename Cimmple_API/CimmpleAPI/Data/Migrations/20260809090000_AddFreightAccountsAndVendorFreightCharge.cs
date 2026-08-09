using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddFreightAccountsAndVendorFreightCharge : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DefaultFreightOutAccountId",
                table: "AccountingDefaults",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DefaultOtherChargeAccountId",
                table: "AccountingDefaults",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DefaultFreightInAccountId",
                table: "AccountingDefaults",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "FreightCharge",
                table: "VendorInvoiceMaster",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DefaultFreightOutAccountId",
                table: "AccountingDefaults");

            migrationBuilder.DropColumn(
                name: "DefaultOtherChargeAccountId",
                table: "AccountingDefaults");

            migrationBuilder.DropColumn(
                name: "DefaultFreightInAccountId",
                table: "AccountingDefaults");

            migrationBuilder.DropColumn(
                name: "FreightCharge",
                table: "VendorInvoiceMaster");
        }
    }
}
