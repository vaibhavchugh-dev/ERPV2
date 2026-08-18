using System;
using System.ComponentModel.DataAnnotations;

namespace CimmpleAPI.Data.Models
{
    /// <summary>
    /// One row per tenant: company accounting prefs and default GL accounts for invoice auto-posting.
    /// </summary>
    public class AccountingDefaults
    {
        [Key]
        public int Id { get; set; }

        public int TenantId { get; set; }

        [MaxLength(200)]
        public string CompanyName { get; set; } = "Cimmple Corp";

        [MaxLength(10)]
        public string FiscalYearStart { get; set; } = "01-01";

        [MaxLength(10)]
        public string DefaultCurrency { get; set; } = "USD";

        public decimal TaxRate { get; set; } = 8.25m;

        /// <summary>Control account for customer invoice / AR payments.</summary>
        public int? DefaultAccountsReceivableAccountId { get; set; }

        /// <summary>Control account for vendor bills / AP payments when vendor has no AP mapping.</summary>
        public int? DefaultAccountsPayableAccountId { get; set; }

        /// <summary>Default revenue account for customer invoices.</summary>
        public int? DefaultRevenueAccountId { get; set; }

        /// <summary>Default expense account for vendor bills when line/vendor override is absent.</summary>
        public int? DefaultExpenseAccountId { get; set; }

        /// <summary>Optional default inventory asset account (stocked purchases).</summary>
        public int? DefaultInventoryAccountId { get; set; }

        /// <summary>Optional sales tax liability account.</summary>
        public int? DefaultSalesTaxPayableAccountId { get; set; }

        /// <summary>Optional recoverable input tax asset account.</summary>
        public int? DefaultInputTaxAccountId { get; set; }

        /// <summary>Customer invoice shipping / freight-out income (or expense recovery) account.</summary>
        public int? DefaultFreightOutAccountId { get; set; }

        /// <summary>Customer invoice other charges income account.</summary>
        public int? DefaultOtherChargeAccountId { get; set; }

        /// <summary>Vendor bill freight-in expense account.</summary>
        public int? DefaultFreightInAccountId { get; set; }

        public DateTime? CreatedDate { get; set; }

        public DateTime? UpdatedDate { get; set; }
    }
}
