using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// User-defined schedule to generate a report with saved filters and email the result.
    /// </summary>
    [Table("ReportSchedule")]
    public class ReportSchedule
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int CreatedByUserId { get; set; }

        /// <summary>operational | financial</summary>
        [MaxLength(32)]
        public string ReportCategory { get; set; } = "operational";

        [MaxLength(100)]
        public string ReportType { get; set; } = "";

        [MaxLength(200)]
        public string ReportName { get; set; } = "";

        [MaxLength(50)]
        public string DateRange { get; set; } = "This Month";

        [MaxLength(32)]
        public string? CustomStartDate { get; set; }

        [MaxLength(32)]
        public string? CustomEndDate { get; set; }

        public int? LocationId { get; set; }

        /// <summary>Optional JSON bag (e.g. customerId for customer-statements).</summary>
        public string? ParametersJson { get; set; }

        /// <summary>pdf | csv</summary>
        [MaxLength(16)]
        public string Format { get; set; } = "pdf";

        /// <summary>Daily | Weekly | Monthly</summary>
        [MaxLength(16)]
        public string Frequency { get; set; } = "Daily";

        /// <summary>0=Sunday … 6=Saturday (Weekly).</summary>
        public int? DayOfWeek { get; set; }

        /// <summary>1–28 (Monthly).</summary>
        public int? DayOfMonth { get; set; }

        /// <summary>Minutes from local midnight (0–1439).</summary>
        public int TimeOfDayMinutes { get; set; } = 480;

        [MaxLength(100)]
        public string TimeZoneId { get; set; } = "America/New_York";

        [MaxLength(1000)]
        public string ToEmails { get; set; } = "";

        [MaxLength(1000)]
        public string? CcEmails { get; set; }

        [MaxLength(300)]
        public string? Subject { get; set; }

        public bool IsEnabled { get; set; } = true;

        public DateTime? NextRunUtc { get; set; }

        public DateTime? LastRunUtc { get; set; }

        [MaxLength(32)]
        public string? LastRunStatus { get; set; }

        [MaxLength(2000)]
        public string? LastRunError { get; set; }

        public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
    }
}
