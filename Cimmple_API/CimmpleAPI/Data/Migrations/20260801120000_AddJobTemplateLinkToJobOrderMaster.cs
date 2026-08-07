using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddJobTemplateLinkToJobOrderMaster : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "JobTemplateId",
                table: "JobOrderMaster",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "JobTemplateCode",
                table: "JobOrderMaster",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "JobTemplateRevision",
                table: "JobOrderMaster",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "JobTemplateId",
                table: "JobOrderMaster");

            migrationBuilder.DropColumn(
                name: "JobTemplateCode",
                table: "JobOrderMaster");

            migrationBuilder.DropColumn(
                name: "JobTemplateRevision",
                table: "JobOrderMaster");
        }
    }
}
