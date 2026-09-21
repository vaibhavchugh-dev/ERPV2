using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// Links a posted payroll period to a Flow journal entry.
    /// Sources: CimmplePay sync, manual wizard, or external import.
    /// </summary>
    public class PayrollJournalLink
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        public int LocationId { get; set; }

        /// <summary>CimmplePay | Manual | Import</summary>
        [Required, MaxLength(32)]
        public string Source { get; set; } = "Manual";

        /// <summary>External run id (e.g. CimmplePay PayrollRuns.Id as string).</summary>
        [MaxLength(64)]
        public string? ExternalRunId { get; set; }

        [MaxLength(64)]
        public string? ProviderName { get; set; }

        [Required, MaxLength(100)]
        public string ReferenceNumber { get; set; } = "";

        public DateTime? PayPeriodStart { get; set; }
        public DateTime? PayPeriodEnd { get; set; }
        public DateTime? PayDate { get; set; }

        public int JournalEntryId { get; set; }

        /// <summary>Posted | Reversed</summary>
        [Required, MaxLength(32)]
        public string Status { get; set; } = "Posted";

        [MaxLength(500)]
        public string? Description { get; set; }

        public decimal? TotalDebits { get; set; }

        public DateTime CreatedUtc { get; set; }

        public int? CreatedByUserId { get; set; }

        // --- P5: cash / remittance legs (optional after accrual JE) ---

        /// <summary>JE that pays net wages: Dr Accrued Payroll, Cr payroll bank.</summary>
        public int? PaymentJournalEntryId { get; set; }

        public DateTime? PaymentPostedUtc { get; set; }

        /// <summary>BankMaster.Id used for the net-pay disbursement.</summary>
        public int? PaymentBankId { get; set; }

        public decimal? PaymentAmount { get; set; }

        /// <summary>JE that remits tax withholdings / employer tax payables to agencies.</summary>
        public int? TaxRemittanceJournalEntryId { get; set; }

        public DateTime? TaxRemittancePostedUtc { get; set; }

        public decimal? TaxRemittanceAmount { get; set; }
    }

    public static class PayrollJournalSources
    {
        public const string CimmplePay = "CimmplePay";
        public const string Manual = "Manual";
        public const string Import = "Import";
    }

    public static class PayrollJournalStatuses
    {
        public const string Posted = "Posted";
        public const string Reversed = "Reversed";
    }
}
