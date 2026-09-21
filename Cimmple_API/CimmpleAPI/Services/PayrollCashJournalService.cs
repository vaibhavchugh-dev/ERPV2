using System;
using System.Collections.Generic;
using System.Linq;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// P5 cash legs: net-pay disbursement and tax remittance journals against an accrual payroll link.
    /// </summary>
    public static class PayrollCashJournalService
    {
        public static decimal GetAccruedNetPayCredit(CimmpleDbContext db, int journalEntryId, int accruedPayrollAccountId)
        {
            if (journalEntryId <= 0 || accruedPayrollAccountId <= 0) return 0m;
            return db.JournalEntryTo.AsNoTracking()
                .Where(t => t.JournalEntryId == journalEntryId && t.AccountId == accruedPayrollAccountId)
                .Sum(t => (decimal?)t.Amount) ?? 0m;
        }

        public static List<PayrollTaxPayableLine> GetTaxPayableCreditsFromAccrual(
            CimmpleDbContext db,
            int journalEntryId,
            AccountingDefaults? defaults)
        {
            var result = new List<PayrollTaxPayableLine>();
            if (journalEntryId <= 0 || defaults == null) return result;

            void Add(string key, string label, int? accountId)
            {
                if (accountId is not > 0) return;
                var amt = db.JournalEntryTo.AsNoTracking()
                    .Where(t => t.JournalEntryId == journalEntryId && t.AccountId == accountId.Value)
                    .Sum(t => (decimal?)t.Amount) ?? 0m;
                if (amt <= 0) return;
                result.Add(new PayrollTaxPayableLine
                {
                    BucketKey = key,
                    Label = label,
                    AccountId = accountId.Value,
                    Amount = Math.Round(amt, 2, MidpointRounding.AwayFromZero)
                });
            }

            Add("federalTaxPayable", "Federal tax payable", defaults.DefaultFederalTaxPayableAccountId);
            Add("stateTaxPayable", "State tax payable", defaults.DefaultStateTaxPayableAccountId);
            Add("localTaxPayable", "Local tax payable", defaults.DefaultLocalTaxPayableAccountId);
            Add("socialSecurityTaxPayable", "Social Security payable", defaults.DefaultSocialSecurityTaxPayableAccountId);
            Add("medicareTaxPayable", "Medicare payable", defaults.DefaultMedicareTaxPayableAccountId);
            Add("employerPayrollTaxPayable", "Employer payroll tax payable", defaults.DefaultEmployerPayrollTaxPayableAccountId);
            Add("preTaxDeductionsPayable", "Pre-tax deductions payable", defaults.DefaultPreTaxDeductionsPayableAccountId);
            Add("retirementDeductionsPayable", "Retirement deductions payable", defaults.DefaultRetirementDeductionsPayableAccountId);
            Add("postTaxDeductionsPayable", "Post-tax deductions payable", defaults.DefaultPostTaxDeductionsPayableAccountId);
            Add("garnishmentsPayable", "Garnishments payable", defaults.DefaultGarnishmentsPayableAccountId);

            return result;
        }
    }

    public class PayrollTaxPayableLine
    {
        public string BucketKey { get; set; } = "";
        public string Label { get; set; } = "";
        public int AccountId { get; set; }
        public decimal Amount { get; set; }
    }
}
