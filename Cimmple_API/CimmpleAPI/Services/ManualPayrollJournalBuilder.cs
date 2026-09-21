using System;
using System.Collections.Generic;
using System.Linq;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services
{
    /// <summary>
    /// Builds a balanced payroll journal from summary bucket amounts + AccountingDefaults.
    /// Same debit/credit layout as CimmplePay's AccountingJournalService.
    /// </summary>
    public static class ManualPayrollJournalBuilder
    {
        public const decimal BalanceTolerance = 0.02m;

        public static ManualPayrollBuildResult Build(
            AccountingDefaults? defaults,
            ManualPayrollAmounts amounts,
            ManualPayrollMeta meta)
        {
            amounts ??= new ManualPayrollAmounts();
            meta ??= new ManualPayrollMeta();

            var gross = Round(amounts.GrossWages);
            var federal = Round(amounts.FederalTax);
            var state = Round(amounts.StateTax);
            var local = Round(amounts.LocalTax);
            var ss = Round(amounts.SocialSecurityTax);
            var medicare = Round(amounts.MedicareTax);
            var preTax = Round(amounts.PreTaxDeductions);
            var retirement = Round(amounts.RetirementDeductions);
            var postTax = Round(amounts.PostTaxDeductions);
            var garnishments = Round(amounts.Garnishments);
            var net = Round(amounts.NetPay);
            var employer = Round(amounts.EmployerTaxesBenefits);

            var expectedNet = Round(gross - federal - state - local - ss - medicare - preTax - retirement - postTax - garnishments);

            var lines = new List<ManualPayrollPreviewLine>();
            var missing = new List<string>();

            void AddDebit(string bucket, string label, int? accountId, decimal amount)
            {
                if (amount <= 0) return;
                if (accountId is not > 0)
                {
                    missing.Add(bucket);
                    return;
                }
                lines.Add(new ManualPayrollPreviewLine
                {
                    BucketKey = bucket,
                    Label = label,
                    AccountId = accountId.Value,
                    Debit = amount,
                    Credit = 0,
                    Description = label
                });
            }

            void AddCredit(string bucket, string label, int? accountId, decimal amount)
            {
                if (amount <= 0) return;
                if (accountId is not > 0)
                {
                    missing.Add(bucket);
                    return;
                }
                lines.Add(new ManualPayrollPreviewLine
                {
                    BucketKey = bucket,
                    Label = label,
                    AccountId = accountId.Value,
                    Debit = 0,
                    Credit = amount,
                    Description = label
                });
            }

            AddDebit("wageExpense", "Gross wages", defaults?.DefaultWageExpenseAccountId, gross);
            AddDebit("employerPayrollTaxExpense", "Employer payroll taxes / benefits expense",
                defaults?.DefaultEmployerPayrollTaxExpenseAccountId, employer);

            AddCredit("federalTaxPayable", "Federal tax withholding", defaults?.DefaultFederalTaxPayableAccountId, federal);
            AddCredit("stateTaxPayable", "State tax withholding", defaults?.DefaultStateTaxPayableAccountId, state);
            AddCredit("localTaxPayable", "Local tax withholding", defaults?.DefaultLocalTaxPayableAccountId, local);
            AddCredit("socialSecurityTaxPayable", "Social Security withholding",
                defaults?.DefaultSocialSecurityTaxPayableAccountId, ss);
            AddCredit("medicareTaxPayable", "Medicare withholding", defaults?.DefaultMedicareTaxPayableAccountId, medicare);
            AddCredit("preTaxDeductionsPayable", "Pre-tax deductions",
                defaults?.DefaultPreTaxDeductionsPayableAccountId, preTax);
            AddCredit("retirementDeductionsPayable", "Retirement deductions",
                defaults?.DefaultRetirementDeductionsPayableAccountId, retirement);
            AddCredit("postTaxDeductionsPayable", "Post-tax deductions",
                defaults?.DefaultPostTaxDeductionsPayableAccountId, postTax);
            AddCredit("garnishmentsPayable", "Garnishments", defaults?.DefaultGarnishmentsPayableAccountId, garnishments);
            AddCredit("netPayPayableOrCash", "Net pay / accrued payroll",
                defaults?.DefaultNetPayPayableAccountId, net);
            AddCredit("employerPayrollTaxPayable", "Employer payroll taxes / benefits payable",
                defaults?.DefaultEmployerPayrollTaxPayableAccountId, employer);

            var totalDr = lines.Sum(l => l.Debit);
            var totalCr = lines.Sum(l => l.Credit);
            var balanced = Math.Abs(totalDr - totalCr) <= BalanceTolerance && lines.Count >= 2;

            var source = string.IsNullOrWhiteSpace(meta.Source)
                ? PayrollJournalSources.Manual
                : meta.Source.Trim();
            if (source is not (PayrollJournalSources.CimmplePay or PayrollJournalSources.Manual or PayrollJournalSources.Import))
                source = PayrollJournalSources.Manual;

            var refPrefix = source == PayrollJournalSources.Import ? "IMPORT" : "MANUAL";
            var payDate = meta.PayDate?.Date ?? DateTime.Today;
            var periodStart = meta.PayPeriodStart?.Date;
            var periodEnd = meta.PayPeriodEnd?.Date;
            var entryDate = meta.EntryDate?.Date ?? payDate;
            var periodKey = $"{entryDate:yyyyMM}";

            var refNo = string.IsNullOrWhiteSpace(meta.ReferenceNumber)
                ? $"{refPrefix}-{payDate:yyyyMMdd}"
                : meta.ReferenceNumber.Trim();

            var desc = string.IsNullOrWhiteSpace(meta.Description)
                ? BuildDefaultDescription(source, periodStart, periodEnd, payDate, meta.ProviderName)
                : meta.Description.Trim();

            var externalRunId = string.IsNullOrWhiteSpace(meta.ExternalRunId)
                ? $"{refPrefix}-{(periodStart?.ToString("yyyyMMdd") ?? "NA")}-{(periodEnd?.ToString("yyyyMMdd") ?? "NA")}-{payDate:yyyyMMdd}"
                : meta.ExternalRunId.Trim();

            var providerDefault = source == PayrollJournalSources.Import ? "Import" : "Manual";

            return new ManualPayrollBuildResult
            {
                IsBalanced = balanced && missing.Count == 0,
                TotalDebits = totalDr,
                TotalCredits = totalCr,
                MissingAccountKeys = missing.Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
                ExpectedNetPay = expectedNet,
                EnteredNetPay = net,
                NetPayDifference = Round(net - expectedNet),
                Lines = lines,
                PostPayload = new ManualPayrollPostPayload
                {
                    TenantId = meta.TenantId,
                    LocationId = meta.LocationId,
                    Source = source,
                    ExternalRunId = externalRunId,
                    ProviderName = string.IsNullOrWhiteSpace(meta.ProviderName) ? providerDefault : meta.ProviderName.Trim(),
                    EntryDate = entryDate,
                    PayPeriodStart = periodStart,
                    PayPeriodEnd = periodEnd,
                    PayDate = payDate,
                    ReferenceNumber = refNo,
                    Description = desc,
                    AccountingPeriod = periodKey,
                    Lines = lines.Select(l => new ManualPayrollPostLine
                    {
                        AccountId = l.AccountId,
                        Debit = l.Debit,
                        Credit = l.Credit,
                        Description = $"{refNo}: {l.Description}"
                    }).ToList()
                }
            };
        }

        private static string BuildDefaultDescription(
            string source,
            DateTime? start,
            DateTime? end,
            DateTime payDate,
            string? providerName)
        {
            var kind = source == PayrollJournalSources.Import
                ? (string.IsNullOrWhiteSpace(providerName) ? "Imported payroll" : $"{providerName.Trim()} payroll")
                : "Manual payroll";
            if (start.HasValue && end.HasValue)
                return $"{kind} {start:yyyy-MM-dd}–{end:yyyy-MM-dd} (pay {payDate:yyyy-MM-dd})";
            return $"{kind} (pay {payDate:yyyy-MM-dd})";
        }

        private static decimal Round(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
    }

    public class ManualPayrollAmounts
    {
        public decimal GrossWages { get; set; }
        public decimal FederalTax { get; set; }
        public decimal StateTax { get; set; }
        public decimal LocalTax { get; set; }
        public decimal SocialSecurityTax { get; set; }
        public decimal MedicareTax { get; set; }
        /// <summary>Non-retirement pre-tax deductions only.</summary>
        public decimal PreTaxDeductions { get; set; }
        public decimal RetirementDeductions { get; set; }
        public decimal PostTaxDeductions { get; set; }
        public decimal Garnishments { get; set; }
        public decimal NetPay { get; set; }
        public decimal EmployerTaxesBenefits { get; set; }
    }

    public class ManualPayrollMeta
    {
        public int TenantId { get; set; }
        public int LocationId { get; set; }
        /// <summary>Manual | Import (CimmplePay uses PostJournal directly).</summary>
        public string? Source { get; set; }
        public DateTime? PayPeriodStart { get; set; }
        public DateTime? PayPeriodEnd { get; set; }
        public DateTime? PayDate { get; set; }
        public DateTime? EntryDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Description { get; set; }
        public string? ExternalRunId { get; set; }
        public string? ProviderName { get; set; }
    }

    public class ManualPayrollBuildResult
    {
        public bool IsBalanced { get; set; }
        public decimal TotalDebits { get; set; }
        public decimal TotalCredits { get; set; }
        public List<string> MissingAccountKeys { get; set; } = new();
        public decimal ExpectedNetPay { get; set; }
        public decimal EnteredNetPay { get; set; }
        public decimal NetPayDifference { get; set; }
        public List<ManualPayrollPreviewLine> Lines { get; set; } = new();
        public ManualPayrollPostPayload PostPayload { get; set; } = new();
    }

    public class ManualPayrollPreviewLine
    {
        public string BucketKey { get; set; } = "";
        public string Label { get; set; } = "";
        public int AccountId { get; set; }
        public string? AccountDisplay { get; set; }
        public decimal Debit { get; set; }
        public decimal Credit { get; set; }
        public string Description { get; set; } = "";
    }

    public class ManualPayrollPostPayload
    {
        public int TenantId { get; set; }
        public int LocationId { get; set; }
        public string Source { get; set; } = PayrollJournalSources.Manual;
        public string? ExternalRunId { get; set; }
        public string? ProviderName { get; set; }
        public DateTime? EntryDate { get; set; }
        public DateTime? PayPeriodStart { get; set; }
        public DateTime? PayPeriodEnd { get; set; }
        public DateTime? PayDate { get; set; }
        public string? ReferenceNumber { get; set; }
        public string? Description { get; set; }
        public string? AccountingPeriod { get; set; }
        public List<ManualPayrollPostLine> Lines { get; set; } = new();
    }

    public class ManualPayrollPostLine
    {
        public int AccountId { get; set; }
        public decimal Debit { get; set; }
        public decimal Credit { get; set; }
        public string? Description { get; set; }
    }
}
