using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddDocumentLocationId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
IF COL_LENGTH('CimmpleFlow.Documents', 'LocationId') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.Documents ADD LocationId int NULL;
END
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
IF COL_LENGTH('CimmpleFlow.Documents', 'LocationId') IS NOT NULL
BEGIN
    ALTER TABLE CimmpleFlow.Documents DROP COLUMN LocationId;
END
");
        }
    }
}
