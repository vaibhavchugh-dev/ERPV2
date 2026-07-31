using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddJobTemplateMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CategoryType",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    AllowUserValues = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    IsSystem = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CategoryType", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "JobTemplateMaster",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    TemplateCode = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    TemplateName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Status = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    Revision = table.Column<int>(type: "int", nullable: false, defaultValue: 1),
                    EffectiveFrom = table.Column<DateTime>(type: "datetime2", nullable: true),
                    EffectiveTo = table.Column<DateTime>(type: "datetime2", nullable: true),
                    PrimaryProcessId = table.Column<int>(type: "int", nullable: true),
                    WorkstationId = table.Column<int>(type: "int", nullable: true),
                    EstimatedSetupTimeMinutes = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    EstimatedCycleTimeMinutes = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    EstimatedLabourTimeMinutes = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    EstimatedMachineTimeMinutes = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    DefaultMaterial = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    MaterialGrade = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    RawMaterialSize = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    MaterialNotes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Tool = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Fixture = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Workholding = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Gauge = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ToolingNotes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    InspectionType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    FirstArticleRequired = table.Column<bool>(type: "bit", nullable: false),
                    InProcessInspection = table.Column<bool>(type: "bit", nullable: false),
                    FinalInspection = table.Column<bool>(type: "bit", nullable: false),
                    CmmRequired = table.Column<bool>(type: "bit", nullable: false),
                    InspectionNotes = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsSystem = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    CreatedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatedBy = table.Column<int>(type: "int", nullable: true),
                    ModifiedDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ModifiedBy = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobTemplateMaster", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CategoryValue",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    CategoryTypeId = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true),
                    Description = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    DisplayOrder = table.Column<int>(type: "int", nullable: false),
                    IsSystem = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false, defaultValue: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CategoryValue", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CategoryValue_CategoryType_CategoryTypeId",
                        column: x => x.CategoryTypeId,
                        principalTable: "CategoryType",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "JobTemplateAttachment",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JobTemplateId = table.Column<int>(type: "int", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    AttachmentType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    FileName = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    FileUrl = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    FileSize = table.Column<long>(type: "bigint", nullable: false),
                    UploadedDate = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UploadedBy = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobTemplateAttachment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_JobTemplateAttachment_JobTemplateMaster_JobTemplateId",
                        column: x => x.JobTemplateId,
                        principalTable: "JobTemplateMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "JobTemplateOperation",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JobTemplateId = table.Column<int>(type: "int", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false),
                    SequenceNumber = table.Column<int>(type: "int", nullable: false),
                    ProcessId = table.Column<int>(type: "int", nullable: true),
                    WorkstationId = table.Column<int>(type: "int", nullable: true),
                    SetupTimeMinutes = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    CycleTimeMinutes = table.Column<decimal>(type: "decimal(18,2)", nullable: true),
                    Instructions = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsMandatory = table.Column<bool>(type: "bit", nullable: false, defaultValue: true),
                    QualityCheckRequired = table.Column<bool>(type: "bit", nullable: false, defaultValue: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobTemplateOperation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_JobTemplateOperation_JobTemplateMaster_JobTemplateId",
                        column: x => x.JobTemplateId,
                        principalTable: "JobTemplateMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "JobTemplateCategory",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    JobTemplateId = table.Column<int>(type: "int", nullable: false),
                    CategoryValueId = table.Column<int>(type: "int", nullable: false),
                    Tenantid = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JobTemplateCategory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_JobTemplateCategory_CategoryValue_CategoryValueId",
                        column: x => x.CategoryValueId,
                        principalTable: "CategoryValue",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_JobTemplateCategory_JobTemplateMaster_JobTemplateId",
                        column: x => x.JobTemplateId,
                        principalTable: "JobTemplateMaster",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CategoryType_Tenantid_Name",
                table: "CategoryType",
                columns: new[] { "Tenantid", "Name" },
                unique: true,
                filter: "[Name] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CategoryValue_CategoryTypeId_Name",
                table: "CategoryValue",
                columns: new[] { "CategoryTypeId", "Name" },
                unique: true,
                filter: "[Name] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CategoryValue_Tenantid_CategoryTypeId",
                table: "CategoryValue",
                columns: new[] { "Tenantid", "CategoryTypeId" });

            migrationBuilder.CreateIndex(
                name: "IX_JobTemplateAttachment_JobTemplateId",
                table: "JobTemplateAttachment",
                column: "JobTemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_JobTemplateCategory_CategoryValueId",
                table: "JobTemplateCategory",
                column: "CategoryValueId");

            migrationBuilder.CreateIndex(
                name: "IX_JobTemplateCategory_JobTemplateId_CategoryValueId",
                table: "JobTemplateCategory",
                columns: new[] { "JobTemplateId", "CategoryValueId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_JobTemplateMaster_Tenantid_Status",
                table: "JobTemplateMaster",
                columns: new[] { "Tenantid", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_JobTemplateMaster_Tenantid_TemplateCode",
                table: "JobTemplateMaster",
                columns: new[] { "Tenantid", "TemplateCode" },
                unique: true,
                filter: "[TemplateCode] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_JobTemplateMaster_Tenantid_TemplateName",
                table: "JobTemplateMaster",
                columns: new[] { "Tenantid", "TemplateName" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "JobTemplateAttachment");

            migrationBuilder.DropTable(
                name: "JobTemplateCategory");

            migrationBuilder.DropTable(
                name: "JobTemplateOperation");

            migrationBuilder.DropTable(
                name: "CategoryValue");

            migrationBuilder.DropTable(
                name: "JobTemplateMaster");

            migrationBuilder.DropTable(
                name: "CategoryType");
        }
    }
}
