using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class EnhanceProcessMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "ProcessName",
                table: "ProcessMaster",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ledgercode",
                table: "ProcessMaster",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProcessCode",
                table: "ProcessMaster",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProcessCategory",
                table: "ProcessMaster",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DefaultEstimatedTimeMinutes",
                table: "ProcessMaster",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "DefaultWorkstationId",
                table: "ProcessMaster",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "StandardCostPerHour",
                table: "ProcessMaster",
                type: "decimal(18,2)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProcessMaster_Tenantid_ProcessName",
                table: "ProcessMaster",
                columns: new[] { "Tenantid", "ProcessName" });

            migrationBuilder.CreateIndex(
                name: "IX_ProcessMaster_Tenantid_ProcessCode",
                table: "ProcessMaster",
                columns: new[] { "Tenantid", "ProcessCode" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ProcessMaster_Tenantid_ProcessName",
                table: "ProcessMaster");

            migrationBuilder.DropIndex(
                name: "IX_ProcessMaster_Tenantid_ProcessCode",
                table: "ProcessMaster");

            migrationBuilder.DropColumn(
                name: "ProcessCode",
                table: "ProcessMaster");

            migrationBuilder.DropColumn(
                name: "ProcessCategory",
                table: "ProcessMaster");

            migrationBuilder.DropColumn(
                name: "DefaultEstimatedTimeMinutes",
                table: "ProcessMaster");

            migrationBuilder.DropColumn(
                name: "DefaultWorkstationId",
                table: "ProcessMaster");

            migrationBuilder.DropColumn(
                name: "StandardCostPerHour",
                table: "ProcessMaster");

            migrationBuilder.AlterColumn<string>(
                name: "ProcessName",
                table: "ProcessMaster",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(200)",
                oldMaxLength: 200,
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "ledgercode",
                table: "ProcessMaster",
                type: "nvarchar(max)",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(50)",
                oldMaxLength: 50,
                oldNullable: true);
        }
    }
}
