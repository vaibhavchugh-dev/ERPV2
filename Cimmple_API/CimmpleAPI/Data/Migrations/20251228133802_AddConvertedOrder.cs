using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddConvertedOrder : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Add QuantityTiers only if it doesn't exist (avoids error 2705 when column was added manually or by migration.sql)
            migrationBuilder.Sql(@"
                IF NOT EXISTS (SELECT 1 FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrderDetails]') 
                    AND name = 'QuantityTiers')
                BEGIN
                    ALTER TABLE [dbo].[QuotationOrderDetails] ADD [QuantityTiers] nvarchar(max) NULL;
                END
            ");

            // Add columns only if they don't exist (avoids error 2705 when columns were added manually)
            migrationBuilder.Sql(@"
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrder]') AND name = 'AttachmentsJson')
                    ALTER TABLE [dbo].[QuotationOrder] ADD [AttachmentsJson] nvarchar(max) NULL;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrder]') AND name = 'CommentsJson')
                    ALTER TABLE [dbo].[QuotationOrder] ADD [CommentsJson] nvarchar(max) NULL;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrder]') AND name = 'convertedOrderId')
                    ALTER TABLE [dbo].[QuotationOrder] ADD [convertedOrderId] int NULL;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrderDetails]') AND name = 'leadTime')
                    ALTER TABLE [dbo].[CustomerOrderDetails] ADD [leadTime] nvarchar(max) NOT NULL DEFAULT N'';
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrderDetails]') AND name = 'notes')
                    ALTER TABLE [dbo].[CustomerOrderDetails] ADD [notes] nvarchar(max) NOT NULL DEFAULT N'';
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrder]') AND name = 'AttachmentsJson')
                    ALTER TABLE [dbo].[CustomerOrder] ADD [AttachmentsJson] nvarchar(max) NULL;
                IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrder]') AND name = 'CommentsJson')
                    ALTER TABLE [dbo].[CustomerOrder] ADD [CommentsJson] nvarchar(max) NULL;
            ");

            migrationBuilder.CreateTable(
                name: "CreditCardMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    CardNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    LastFourDigits = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CardholderName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CardType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExpiryMonth = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ExpiryYear = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CVV = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BillingStreet = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BillingApartment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BillingCity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BillingState = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BillingZip = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BillingCountry = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Phone = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Email = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    NickName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsPrimary = table.Column<bool>(type: "bit", nullable: true),
                    COA = table.Column<string>(type: "nvarchar(max)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CreditCardMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PriceBreakdownMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ItemName = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Srno = table.Column<int>(type: "int", nullable: false),
                    Status = table.Column<int>(type: "int", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PriceBreakdownMaster", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CreditCardMaster");

            migrationBuilder.DropTable(
                name: "PriceBreakdownMaster");

            // Drop QuantityTiers only if it exists (safe rollback)
            migrationBuilder.Sql(@"
                IF EXISTS (SELECT 1 FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrderDetails]') 
                    AND name = 'QuantityTiers')
                BEGIN
                    ALTER TABLE [dbo].[QuotationOrderDetails] DROP COLUMN [QuantityTiers];
                END
            ");

            migrationBuilder.Sql(@"
                IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrder]') AND name = 'AttachmentsJson')
                    ALTER TABLE [dbo].[QuotationOrder] DROP COLUMN [AttachmentsJson];
                IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrder]') AND name = 'CommentsJson')
                    ALTER TABLE [dbo].[QuotationOrder] DROP COLUMN [CommentsJson];
                IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[QuotationOrder]') AND name = 'convertedOrderId')
                    ALTER TABLE [dbo].[QuotationOrder] DROP COLUMN [convertedOrderId];
                IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrderDetails]') AND name = 'leadTime')
                    ALTER TABLE [dbo].[CustomerOrderDetails] DROP COLUMN [leadTime];
                IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrderDetails]') AND name = 'notes')
                    ALTER TABLE [dbo].[CustomerOrderDetails] DROP COLUMN [notes];
                IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrder]') AND name = 'AttachmentsJson')
                    ALTER TABLE [dbo].[CustomerOrder] DROP COLUMN [AttachmentsJson];
                IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CustomerOrder]') AND name = 'CommentsJson')
                    ALTER TABLE [dbo].[CustomerOrder] DROP COLUMN [CommentsJson];
            ");
        }
    }
}
