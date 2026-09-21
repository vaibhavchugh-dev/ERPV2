using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CimmpleAPI.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSupportTicketMessagesAndProduct : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Product",
                schema: "CimmpleFlow",
                table: "SupportTickets",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "CimmpleFlow");

            migrationBuilder.AddColumn<DateTime>(
                name: "LastMessageAt",
                schema: "CimmpleFlow",
                table: "SupportTickets",
                type: "datetime2",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SupportTicketMessages",
                schema: "CimmpleFlow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TicketId = table.Column<int>(type: "int", nullable: false),
                    TenantId = table.Column<int>(type: "int", nullable: false),
                    AuthorType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    AuthorUserId = table.Column<int>(type: "int", nullable: true),
                    AuthorName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Body = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    EmailQueued = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    EmailError = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SupportTicketMessages", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SupportTickets_Product_Status_Updated",
                schema: "CimmpleFlow",
                table: "SupportTickets",
                columns: new[] { "Product", "Status", "UpdatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SupportTicketMessages_Ticket_Created",
                schema: "CimmpleFlow",
                table: "SupportTicketMessages",
                columns: new[] { "TicketId", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "SupportTicketMessages", schema: "CimmpleFlow");
            migrationBuilder.DropIndex(
                name: "IX_SupportTickets_Product_Status_Updated",
                schema: "CimmpleFlow",
                table: "SupportTickets");
            migrationBuilder.DropColumn(name: "LastMessageAt", schema: "CimmpleFlow", table: "SupportTickets");
            migrationBuilder.DropColumn(name: "Product", schema: "CimmpleFlow", table: "SupportTickets");
        }
    }
}
