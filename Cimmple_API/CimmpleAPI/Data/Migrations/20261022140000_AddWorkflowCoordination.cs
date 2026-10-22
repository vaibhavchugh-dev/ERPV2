using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    [Migration("20261022140000_AddWorkflowCoordination")]
    public partial class AddWorkflowCoordination : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorkflowInstance",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    CustomerOrderId = table.Column<int>(type: "int", nullable: true),
                    QuotationId = table.Column<int>(type: "int", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PrincipalStageCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowInstance", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowTask",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    WorkflowInstanceId = table.Column<int>(type: "int", nullable: false),
                    StageCode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    TaskType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SourceType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SourceId = table.Column<int>(type: "int", nullable: false),
                    OwnerUserId = table.Column<int>(type: "int", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Priority = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DueDateIsManual = table.Column<bool>(type: "bit", nullable: false),
                    Blocker = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    BlockerIsManual = table.Column<bool>(type: "bit", nullable: false),
                    NextAction = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    NextActionIsManual = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowTask", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowHandoff",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    WorkflowTaskId = table.Column<int>(type: "int", nullable: false),
                    FromUserId = table.Column<int>(type: "int", nullable: true),
                    ToUserId = table.Column<int>(type: "int", nullable: true),
                    Instruction = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    DueDate = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowHandoff", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkflowEvent",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    WorkflowInstanceId = table.Column<int>(type: "int", nullable: false),
                    WorkflowTaskId = table.Column<int>(type: "int", nullable: true),
                    EventType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Summary = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    ActorUserId = table.Column<int>(type: "int", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkflowEvent", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "UX_WorkflowInstance_Tenant_Order",
                schema: "CimmpleFlow",
                table: "WorkflowInstance",
                columns: new[] { "TenantId", "CustomerOrderId" },
                unique: true,
                filter: "[CustomerOrderId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_WorkflowInstance_Tenant_Quotation",
                schema: "CimmpleFlow",
                table: "WorkflowInstance",
                columns: new[] { "TenantId", "QuotationId" },
                unique: true,
                filter: "[CustomerOrderId] IS NULL AND [QuotationId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_WorkflowTask_Tenant_Source_Type",
                schema: "CimmpleFlow",
                table: "WorkflowTask",
                columns: new[] { "TenantId", "SourceType", "SourceId", "TaskType" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowTask_Instance",
                schema: "CimmpleFlow",
                table: "WorkflowTask",
                column: "WorkflowInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowHandoff_Task",
                schema: "CimmpleFlow",
                table: "WorkflowHandoff",
                column: "WorkflowTaskId");

            migrationBuilder.CreateIndex(
                name: "IX_WorkflowEvent_Instance_Created",
                schema: "CimmpleFlow",
                table: "WorkflowEvent",
                columns: new[] { "WorkflowInstanceId", "CreatedAt" });
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "WorkflowEvent", schema: "CimmpleFlow");
            migrationBuilder.DropTable(name: "WorkflowHandoff", schema: "CimmpleFlow");
            migrationBuilder.DropTable(name: "WorkflowTask", schema: "CimmpleFlow");
            migrationBuilder.DropTable(name: "WorkflowInstance", schema: "CimmpleFlow");
        }
    }
}
