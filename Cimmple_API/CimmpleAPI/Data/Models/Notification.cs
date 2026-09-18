using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// In-app inbox notification for a tenant user (system events or one-shot user messages).
    /// </summary>
    [Table("Notifications")]
    public class Notification
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        /// <summary>Recipient <see cref="UserDetail.User_UniqueID"/>.</summary>
        public int RecipientUserId { get; set; }

        /// <summary>Actor user id; null for system-generated notices.</summary>
        public int? ActorUserId { get; set; }

        /// <summary>e.g. NcrAssignment, UserMessage</summary>
        [MaxLength(64)]
        public string Type { get; set; } = "";

        [MaxLength(200)]
        public string Title { get; set; } = "";

        [MaxLength(4000)]
        public string Body { get; set; } = "";

        [MaxLength(64)]
        public string? EntityType { get; set; }

        public int? EntityId { get; set; }

        /// <summary>Optional UI route (e.g. /quality?open=123).</summary>
        [MaxLength(500)]
        public string? LinkPath { get; set; }

        public bool IsRead { get; set; }

        public DateTime? ReadAt { get; set; }

        public bool EmailSent { get; set; }

        public DateTime? EmailSentAt { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
