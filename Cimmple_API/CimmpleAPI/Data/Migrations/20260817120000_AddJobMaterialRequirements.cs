using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    public partial class AddJobMaterialRequirements : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "JobTemplateMaterial",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JobTemplateId = table.Column<int>(type: "int", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    SequenceNumber = table.Column<int>(type: "int", nullable: false),
                    ProductId = table.Column<int>(type: "int", nullable: true),
                    RawMaterialId = table.Column<int>(type: "int", nullable: true),
                    Quantity = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobTemplateMaterial", x => x.Id);
                    table.ForeignKey(
                        name: "FK_JobTemplateMaterial_JobTemplateMaster_JobTemplateId",
                        column: x => x.JobTemplateId,
                        principalTable: "JobTemplateMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_JobTemplateMaterial_ProductMaster_ProductId",
                        column: x => x.ProductId,
                        principalTable: "ProductMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_JobTemplateMaterial_RawMaterialMaster_RawMaterialId",
                        column: x => x.RawMaterialId,
                        principalTable: "RawMaterialMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_JobTemplateMaterial_JobTemplateId_SequenceNumber",
                table: "JobTemplateMaterial",
                columns: new[] { "JobTemplateId", "SequenceNumber" });

            migrationBuilder.CreateTable(
                name: "JobMaterialRequirement",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JobOrderId = table.Column<int>(type: "int", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    SequenceNumber = table.Column<int>(type: "int", nullable: false),
                    ProductId = table.Column<int>(type: "int", nullable: true),
                    RawMaterialId = table.Column<int>(type: "int", nullable: true),
                    QuantityNeeded = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobMaterialRequirement", x => x.Id);
                    table.ForeignKey(
                        name: "FK_JobMaterialRequirement_JobOrderMaster_JobOrderId",
                        column: x => x.JobOrderId,
                        principalTable: "JobOrderMaster",
                        principalColumn: "JobOrderID",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_JobMaterialRequirement_ProductMaster_ProductId",
                        column: x => x.ProductId,
                        principalTable: "ProductMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_JobMaterialRequirement_RawMaterialMaster_RawMaterialId",
                        column: x => x.RawMaterialId,
                        principalTable: "RawMaterialMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_JobMaterialRequirement_JobOrderId",
                table: "JobMaterialRequirement",
                column: "JobOrderId");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "JobMaterialRequirement");
            migrationBuilder.DropTable(name: "JobTemplateMaterial");
        }
    }
}
