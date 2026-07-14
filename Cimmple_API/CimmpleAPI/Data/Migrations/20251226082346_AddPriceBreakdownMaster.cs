using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPriceBreakdownMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Use SQL to drop tables only if they exist
            migrationBuilder.Sql(@"
                IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorBillingAddress]') AND type in (N'U'))
                    DROP TABLE [dbo].[VendorBillingAddress];
                
                IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VendorShippingAddress]') AND type in (N'U'))
                    DROP TABLE [dbo].[VendorShippingAddress];
            ");

            // Drop columns only if they exist
            migrationBuilder.Sql(@"
                IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorMaster]') AND name = 'Pointofcontact')
                    ALTER TABLE [dbo].[VendorMaster] DROP COLUMN [Pointofcontact];
                
                IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[VendorMaster]') AND name = 'purchasing_agent')
                    ALTER TABLE [dbo].[VendorMaster] DROP COLUMN [purchasing_agent];
            ");

            migrationBuilder.AlterColumn<string>(
                name: "country",
                table: "BankMaster",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "apartment",
                table: "BankMaster",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            // Create PriceBreakdownMaster table only if it doesn't exist
            migrationBuilder.Sql(@"
                IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PriceBreakdownMaster]') AND type in (N'U'))
                BEGIN
                    CREATE TABLE [dbo].[PriceBreakdownMaster] (
                        [Id] int NOT NULL IDENTITY(1,1),
                        [ItemName] nvarchar(max) NOT NULL,
                        [Srno] int NOT NULL,
                        [Status] int NOT NULL,
                        [Tenantid] int NOT NULL,
                        CONSTRAINT [PK_PriceBreakdownMaster] PRIMARY KEY ([Id])
                    );
                END
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Pointofcontact",
                table: "VendorMaster",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "purchasing_agent",
                table: "VendorMaster",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AlterColumn<string>(
                name: "country",
                table: "BankMaster",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "apartment",
                table: "BankMaster",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.CreateTable(
                name: "VendorBillingAddress",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IsDefault = table.Column<int>(type: "int", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    billingaddressline1 = table.Column<string>(name: "billing_address_line1", type: "nvarchar(max)", nullable: false),
                    billingaddressline2 = table.Column<string>(name: "billing_address_line2", type: "nvarchar(max)", nullable: false),
                    billingcity = table.Column<string>(name: "billing_city", type: "nvarchar(max)", nullable: false),
                    billingcountry = table.Column<string>(name: "billing_country", type: "nvarchar(max)", nullable: false),
                    billingpostalcode = table.Column<string>(name: "billing_postal_code", type: "nvarchar(max)", nullable: false),
                    billingstate = table.Column<string>(name: "billing_state", type: "nvarchar(max)", nullable: false),
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorBillingAddress", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "VendorShippingAddress",
                columns: table => new
                {
                    id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    IsDefault = table.Column<int>(type: "int", nullable: false),
                    customerid = table.Column<int>(name: "customer_id", type: "int", nullable: false),
                    firstname = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingAddress = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingApartment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingCountry = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingStates = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    shippingZipCode = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorShippingAddress", x => x.id);
                });

            migrationBuilder.DropTable(
                name: "PriceBreakdownMaster");
        }
    }
}
