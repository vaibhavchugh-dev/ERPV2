using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>DM conversation container (1:1 for Option A).</summary>
    [Table("Conversations")]
    public class Conversation
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int CreatedByUserId { get; set; }

        [MaxLength(200)]
        public string? Subject { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime? LastMessageAt { get; set; }
    }

    /// <summary>User membership + read cursor for a conversation.</summary>
    [Table("ConversationParticipants")]
    public class ConversationParticipant
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int ConversationId { get; set; }

        /// <summary><see cref="UserDetail.User_UniqueID"/>.</summary>
        public int UserId { get; set; }

        public int? LastReadMessageId { get; set; }

        public DateTime? LastReadAt { get; set; }

        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>Single chat message in a conversation.</summary>
    [Table("ConversationMessages")]
    public class ConversationMessage
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int ConversationId { get; set; }

        public int SenderUserId { get; set; }

        [MaxLength(4000)]
        public string Body { get; set; } = "";

        public int? ParentMessageId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
