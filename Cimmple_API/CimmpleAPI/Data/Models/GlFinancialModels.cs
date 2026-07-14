using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    /// <summary>Marks an accounting period (YYYYMM) closed for posting / reversal / delete.</summary>
    public class GlAccountingPeriodLock
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        /// <summary>Six-digit period, e.g. 202604.</summary>
        [MaxLength(6)]
        public string PeriodKey { get; set; } = "";

        public DateTime ClosedUtc { get; set; }

        public int? ClosedByUserId { get; set; }
    }

    /// <summary>Append-only GL control audit trail (post, reverse, period close/open).</summary>
    public class GlAuditEvent
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        /// <summary>e.g. JournalCreate, JournalReverse, PeriodClose, PeriodOpen, JournalDelete.</summary>
        [MaxLength(64)]
        public string Action { get; set; } = "";

        public DateTime OccurredUtc { get; set; }

        public int? ActorUserId { get; set; }

        public int? JournalEntryId { get; set; }

        public int? RelatedJournalEntryId { get; set; }

        [MaxLength(6)]
        public string? PeriodKey { get; set; }

        [MaxLength(2000)]
        public string? Notes { get; set; }
    }
}
