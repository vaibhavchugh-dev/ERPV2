using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddVendorReceiving : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "VendorReceiving",
                columns: table => new
                {
                    ID = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    VendorOrderDetailID = table.Column<int>(type: "int", nullable: false),
                    ReceivedQty = table.Column<int>(type: "int", nullable: false),
                    ReceivedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ReceivedBy = table.Column<int>(type: "int", nullable: false),
                    LocationId = table.Column<int>(type: "int", nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VendorReceiving", x => x.ID);
                    table.ForeignKey(
                        name: "FK_VendorReceiving_VendorOrderDetails_VendorOrderDetailID",
                        column: x => x.VendorOrderDetailID,
                        principalTable: "VendorOrderDetails",
                        principalColumn: "ID",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_VendorReceiving_VendorOrderDetailID",
                table: "VendorReceiving",
                column: "VendorOrderDetailID");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VendorReceiving");
        }
    }
}
































