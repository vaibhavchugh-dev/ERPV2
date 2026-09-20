using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>In-app support request raised by a tenant user.</summary>
    [Table("SupportTickets")]
    public class SupportTicket
    {
        public const string StatusOpen = "Open";
        public const string StatusWaiting = "WaitingOnUser";
        public const string StatusResolved = "Resolved";
        public const string StatusClosed = "Closed";

        public const string CategoryBug = "Bug";
        public const string CategoryHowTo = "HowTo";
        public const string CategoryBilling = "Billing";
        public const string CategoryAccess = "Access";
        public const string CategoryData = "DataIssue";
        public const string CategoryOther = "Other";

        public const string ProductCimmpleFlow = "CimmpleFlow";

        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        /// <summary><see cref="UserDetail.User_UniqueID"/>.</summary>
        public int CreatedByUserId { get; set; }

        /// <summary>Product line this ticket belongs to (e.g. CimmpleFlow).</summary>
        [MaxLength(40)]
        public string Product { get; set; } = ProductCimmpleFlow;

        [MaxLength(40)]
        public string Category { get; set; } = CategoryOther;

        [MaxLength(200)]
        public string Subject { get; set; } = "";

        [MaxLength(4000)]
        public string Description { get; set; } = "";

        [MaxLength(32)]
        public string Status { get; set; } = StatusOpen;

        /// <summary>UI, PWA, VPA, or Punch.</summary>
        [MaxLength(20)]
        public string AppSource { get; set; } = "UI";

        [MaxLength(40)]
        public string? AppVersion { get; set; }

        [MaxLength(500)]
        public string? UserAgent { get; set; }

        public int? LocationId { get; set; }

        [MaxLength(80)]
        public string? EntityType { get; set; }

        public int? EntityId { get; set; }

        [MaxLength(500)]
        public string? LinkPath { get; set; }

        [MaxLength(260)]
        public string? AttachmentBlobName { get; set; }

        [MaxLength(260)]
        public string? AttachmentFileName { get; set; }

        public bool EmailQueued { get; set; }

        [MaxLength(500)]
        public string? EmailError { get; set; }

        /// <summary>True when staff has replied and the client has not opened the ticket since.</summary>
        public bool ClientHasUnread { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? LastMessageAt { get; set; }
    }

    /// <summary>Message in a support ticket thread (client or staff).</summary>
    [Table("SupportTicketMessages")]
    public class SupportTicketMessage
    {
        public const string AuthorClient = "Client";
        public const string AuthorStaff = "Staff";

        [Key]
        public int Id { get; set; }

        public int TicketId { get; set; }

        public int TenantId { get; set; }

        /// <summary><see cref="AuthorClient"/> or <see cref="AuthorStaff"/>.</summary>
        [MaxLength(20)]
        public string AuthorType { get; set; } = AuthorClient;

        /// <summary>Client user id when AuthorType is Client; null for staff.</summary>
        public int? AuthorUserId { get; set; }

        [MaxLength(120)]
        public string AuthorName { get; set; } = "";

        [MaxLength(4000)]
        public string Body { get; set; } = "";

        public bool EmailQueued { get; set; }

        [MaxLength(500)]
        public string? EmailError { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
