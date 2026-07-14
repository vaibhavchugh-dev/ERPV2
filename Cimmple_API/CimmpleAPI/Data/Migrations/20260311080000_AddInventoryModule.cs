using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RawMaterialMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    PartNo = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    PartName = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Unit = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    UnitCost = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    VendorId = table.Column<int>(type: "int", nullable: true),
                    ReorderPoint = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    ReorderQuantity = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RawMaterialMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InventoryTransactionType",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Code = table.Column<string>(type: "nvarchar(450)", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsPositive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransactionType", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InventoryLot",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LotNumber = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ProductId = table.Column<int>(type: "int", nullable: true),
                    RawMaterialId = table.Column<int>(type: "int", nullable: true),
                    ExpiryDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ReceivedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryLot", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryLot_ProductMaster_ProductId",
                        column: x => x.ProductId,
                        principalTable: "ProductMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryLot_RawMaterialMaster_RawMaterialId",
                        column: x => x.RawMaterialId,
                        principalTable: "RawMaterialMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryBalance",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProductId = table.Column<int>(type: "int", nullable: true),
                    RawMaterialId = table.Column<int>(type: "int", nullable: true),
                    LocationId = table.Column<int>(type: "int", nullable: false),
                    QuantityOnHand = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    QuantityReserved = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ReorderPoint = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    ReorderQuantity = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    MaxQuantity = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    LastCountDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UnitCost = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryBalance", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryBalance_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "LocationId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryBalance_ProductMaster_ProductId",
                        column: x => x.ProductId,
                        principalTable: "ProductMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryBalance_RawMaterialMaster_RawMaterialId",
                        column: x => x.RawMaterialId,
                        principalTable: "RawMaterialMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryLotBalance",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    LotId = table.Column<int>(type: "int", nullable: false),
                    LocationId = table.Column<int>(type: "int", nullable: false),
                    QuantityOnHand = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryLotBalance", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryLotBalance_InventoryLot_LotId",
                        column: x => x.LotId,
                        principalTable: "InventoryLot",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InventoryLotBalance_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "LocationId",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "InventoryTransaction",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    ProductId = table.Column<int>(type: "int", nullable: true),
                    RawMaterialId = table.Column<int>(type: "int", nullable: true),
                    LocationId = table.Column<int>(type: "int", nullable: false),
                    TransactionTypeId = table.Column<int>(type: "int", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    ReferenceType = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    ReferenceId = table.Column<int>(type: "int", nullable: true),
                    TransactionDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LotId = table.Column<int>(type: "int", nullable: true),
                    CreatedBy = table.Column<int>(type: "int", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryTransaction", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryTransaction_InventoryLot_LotId",
                        column: x => x.LotId,
                        principalTable: "InventoryLot",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_InventoryTransaction_InventoryTransactionType_TransactionTypeId",
                        column: x => x.TransactionTypeId,
                        principalTable: "InventoryTransactionType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransaction_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "LocationId",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransaction_ProductMaster_ProductId",
                        column: x => x.ProductId,
                        principalTable: "ProductMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_InventoryTransaction_RawMaterialMaster_RawMaterialId",
                        column: x => x.RawMaterialId,
                        principalTable: "RawMaterialMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InventoryBalance_LocationId",
                table: "InventoryBalance",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryBalance_ProductId_LocationId_Tenantid",
                table: "InventoryBalance",
                columns: new[] { "ProductId", "LocationId", "Tenantid" },
                filter: "[ProductId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryBalance_RawMaterialId_LocationId_Tenantid",
                table: "InventoryBalance",
                columns: new[] { "RawMaterialId", "LocationId", "Tenantid" },
                filter: "[RawMaterialId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryBalance_Tenantid",
                table: "InventoryBalance",
                column: "Tenantid");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLot_ProductId",
                table: "InventoryLot",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLot_RawMaterialId",
                table: "InventoryLot",
                column: "RawMaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLotBalance_LotId",
                table: "InventoryLotBalance",
                column: "LotId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLotBalance_LotId_LocationId_Tenantid",
                table: "InventoryLotBalance",
                columns: new[] { "LotId", "LocationId", "Tenantid" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_InventoryLotBalance_LocationId",
                table: "InventoryLotBalance",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransaction_LocationId",
                table: "InventoryTransaction",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransaction_LotId",
                table: "InventoryTransaction",
                column: "LotId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransaction_ProductId",
                table: "InventoryTransaction",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransaction_RawMaterialId",
                table: "InventoryTransaction",
                column: "RawMaterialId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransaction_TransactionTypeId",
                table: "InventoryTransaction",
                column: "TransactionTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransaction_Tenantid",
                table: "InventoryTransaction",
                column: "Tenantid");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryTransactionType_Code",
                table: "InventoryTransactionType",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RawMaterialMaster_Tenantid_PartNo",
                table: "RawMaterialMaster",
                columns: new[] { "Tenantid", "PartNo" });

            // Seed default transaction types
            migrationBuilder.InsertData(
                table: "InventoryTransactionType",
                columns: new[] { "Id", "Code", "Name", "IsPositive" },
                values: new object[,]
                {
                    { 1, "RECEIPT", "Receipt", true },
                    { 2, "ISSUE", "Issue", false },
                    { 3, "TRANSFER_IN", "Transfer In", true },
                    { 4, "TRANSFER_OUT", "Transfer Out", false },
                    { 5, "ADJUSTMENT", "Adjustment", true }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "InventoryTransaction");
            migrationBuilder.DropTable(name: "InventoryLotBalance");
            migrationBuilder.DropTable(name: "InventoryBalance");
            migrationBuilder.DropTable(name: "InventoryTransactionType");
            migrationBuilder.DropTable(name: "InventoryLot");
            migrationBuilder.DropTable(name: "RawMaterialMaster");
        }
    }
}
