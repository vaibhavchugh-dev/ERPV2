using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// A self-service trial signup waiting to be provisioned. The public endpoint only records the
    /// request; a hosted worker creates the client in the background.
    /// </summary>
    [Table("SignupRequest")]
    public class SignupRequest
    {
        public const string StatusPending = "Pending";
        public const string StatusProcessing = "Processing";
        public const string StatusCompleted = "Completed";
        public const string StatusFailed = "Failed";

        [Key]
        public int Id { get; set; }

        [MaxLength(100)]
        public string FirstName { get; set; } = "";

        [MaxLength(100)]
        public string LastName { get; set; } = "";

        [MaxLength(200)]
        public string CompanyName { get; set; } = "";

        [MaxLength(200)]
        public string Email { get; set; } = "";

        [MaxLength(45)]
        public string? IpAddress { get; set; }

        [MaxLength(32)]
        public string Status { get; set; } = StatusPending;

        public int Attempts { get; set; }

        /// <summary>Set as soon as the client row exists, so a retry resumes it instead of creating a second one.</summary>
        public int? TenantId { get; set; }

        [MaxLength(2000)]
        public string? LastError { get; set; }

        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

        /// <summary>Earliest time the worker may retry after a failed attempt.</summary>
        public DateTime? NextAttemptUtc { get; set; }

        /// <summary>A worker owns the row until this time; a crashed worker's claim lapses and the row is picked up again.</summary>
        public DateTime? LockedUntilUtc { get; set; }

        public DateTime? CompletedUtc { get; set; }
    }
}
