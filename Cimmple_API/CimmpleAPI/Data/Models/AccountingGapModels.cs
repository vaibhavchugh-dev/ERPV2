using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    /// <summary>Tenant payment terms master (Net 15/30/…). Soft-deactivate when referenced.</summary>
    public class PaymentTerm
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        [MaxLength(100)]
        public string Name { get; set; } = "";

        public int Days { get; set; }

        [MaxLength(500)]
        public string? Description { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime? CreatedDate { get; set; }

        public DateTime? UpdatedDate { get; set; }
    }

    /// <summary>AP approval amount limit by user role. Dual approval flag stored for future workflow.</summary>
    public class ApApprovalLimit
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int RoleId { get; set; }

        public decimal LimitAmount { get; set; }

        public bool RequiresDualApproval { get; set; }

        public bool IsActive { get; set; } = true;

        public DateTime? CreatedDate { get; set; }

        public DateTime? UpdatedDate { get; set; }
    }

    /// <summary>Audit log for AR payment reminder emails.</summary>
    public class ArReminderLog
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int InvoiceId { get; set; }

        public DateTime SentUtc { get; set; }

        [MaxLength(255)]
        public string? ToEmail { get; set; }

        [MaxLength(32)]
        public string Status { get; set; } = "Sent";

        [MaxLength(2000)]
        public string? Error { get; set; }

        public int? ActorUserId { get; set; }
    }
}
