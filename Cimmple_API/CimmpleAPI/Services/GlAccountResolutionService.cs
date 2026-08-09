using System;
using System.Linq;
using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;
using Microsoft.EntityFrameworkCore;

namespace CimmpleAPI.Services;

/// <summary>
/// Deterministic GL account resolution for invoice / payment auto-posting.
/// Preference order: explicit override → party mapping → AccountingDefaults → fuzzy name match (legacy fallback).
/// </summary>
public static class GlAccountResolutionService
{
    public static bool IsActiveAccountForTenant(CimmpleDbContext db, int tenantId, int accountId)
    {
        if (accountId <= 0) return false;
        return db.ChartofAccounts
            .AsNoTracking()
            .Any(c => c.Tenantid == tenantId && c.AccountID == accountId && c.IsActive);
    }

    public static AccountingDefaults? GetDefaults(CimmpleDbContext db, int tenantId)
    {
        return db.AccountingDefaults
            .AsNoTracking()
            .FirstOrDefault(d => d.TenantId == tenantId);
    }

    public static int? ResolveAccountsReceivable(CimmpleDbContext db, int tenantId)
    {
        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultAccountsReceivableAccountId is int arId &&
            IsActiveAccountForTenant(db, tenantId, arId))
        {
            return arId;
        }

        return FindByKeywords(db, tenantId,
            preferExactName: "accounts receivable",
            typeKeywords: new[] { "receivable" },
            nameKeywords: new[] { "receivable" },
            groupKeywords: new[] { "receivable" });
    }

    public static int? ResolveRevenue(CimmpleDbContext db, int tenantId)
    {
        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultRevenueAccountId is int revId &&
            IsActiveAccountForTenant(db, tenantId, revId))
        {
            return revId;
        }

        return FindByKeywords(db, tenantId,
            preferExactName: null,
            typeKeywords: new[] { "revenue" },
            nameKeywords: new[] { "revenue", "sales" },
            groupKeywords: new[] { "revenue", "sales" });
    }

    public static int? ResolveAccountsPayable(CimmpleDbContext db, int tenantId, int vendorId)
    {
        if (vendorId > 0)
        {
            var vendorAp = db.VendorCOAMapping
                .AsNoTracking()
                .Where(v => v.vendorid == vendorId)
                .Select(v => (int?)v.accountid)
                .FirstOrDefault();
            if (vendorAp.HasValue && vendorAp.Value > 0 &&
                IsActiveAccountForTenant(db, tenantId, vendorAp.Value))
            {
                return vendorAp.Value;
            }
        }

        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultAccountsPayableAccountId is int apId &&
            IsActiveAccountForTenant(db, tenantId, apId))
        {
            return apId;
        }

        return FindByKeywords(db, tenantId,
            preferExactName: "accounts payable",
            typeKeywords: new[] { "payable" },
            nameKeywords: new[] { "payable" },
            groupKeywords: new[] { "payable" });
    }

    /// <summary>
    /// Company/vendor default expense (no line override).
    /// </summary>
    public static int? ResolveDefaultExpense(CimmpleDbContext db, int tenantId, int? vendorId = null)
    {
        if (vendorId.HasValue && vendorId.Value > 0)
        {
            var vendorExpense = db.VendorCOAMapping
                .AsNoTracking()
                .Where(v => v.vendorid == vendorId.Value)
                .Select(v => v.expenseAccountId)
                .FirstOrDefault();
            if (vendorExpense.HasValue && vendorExpense.Value > 0 &&
                IsActiveAccountForTenant(db, tenantId, vendorExpense.Value))
            {
                return vendorExpense.Value;
            }
        }

        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultExpenseAccountId is int expId &&
            IsActiveAccountForTenant(db, tenantId, expId))
        {
            return expId;
        }

        return FindByKeywords(db, tenantId,
            preferExactName: null,
            typeKeywords: new[] { "expense" },
            nameKeywords: new[] { "expense" },
            groupKeywords: new[] { "expense" });
    }

    /// <summary>
    /// Sales tax liability account for customer invoices. Defaults only — no fuzzy match.
    /// </summary>
    public static int? ResolveSalesTaxPayable(CimmpleDbContext db, int tenantId)
    {
        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultSalesTaxPayableAccountId is int taxId &&
            IsActiveAccountForTenant(db, tenantId, taxId))
        {
            return taxId;
        }

        return null;
    }

    /// <summary>
    /// Recoverable input tax asset for vendor bills. Defaults only — no fuzzy match.
    /// </summary>
    public static int? ResolveInputTax(CimmpleDbContext db, int tenantId)
    {
        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultInputTaxAccountId is int taxId &&
            IsActiveAccountForTenant(db, tenantId, taxId))
        {
            return taxId;
        }

        return null;
    }

    /// <summary>Customer shipping / freight-out account. Defaults only.</summary>
    public static int? ResolveFreightOut(CimmpleDbContext db, int tenantId)
    {
        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultFreightOutAccountId is int accountId &&
            IsActiveAccountForTenant(db, tenantId, accountId))
        {
            return accountId;
        }

        return null;
    }

    /// <summary>Customer other-charge income account. Defaults only.</summary>
    public static int? ResolveOtherCharge(CimmpleDbContext db, int tenantId)
    {
        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultOtherChargeAccountId is int accountId &&
            IsActiveAccountForTenant(db, tenantId, accountId))
        {
            return accountId;
        }

        return null;
    }

    /// <summary>Vendor freight-in expense account. Defaults only.</summary>
    public static int? ResolveFreightIn(CimmpleDbContext db, int tenantId)
    {
        var defaults = GetDefaults(db, tenantId);
        if (defaults?.DefaultFreightInAccountId is int accountId &&
            IsActiveAccountForTenant(db, tenantId, accountId))
        {
            return accountId;
        }

        return null;
    }

    /// <summary>
    /// Resolves tax amount from explicit amount and/or rate applied to net subtotal.
    /// </summary>
    public static decimal ResolveTaxAmount(decimal netSubtotal, decimal? taxRatePercent, decimal? taxAmount)
    {
        if (taxAmount.HasValue)
            return Math.Round(Math.Max(0m, taxAmount.Value), 2);

        var rate = taxRatePercent ?? 0m;
        if (rate <= 0m || netSubtotal <= 0m)
            return 0m;

        return Math.Round(netSubtotal * (rate / 100m), 2);
    }

    public static decimal NormalizeChargeAmount(decimal? amount)
    {
        if (!amount.HasValue)
            return 0m;
        return Math.Round(Math.Max(0m, amount.Value), 2);
    }

    public static int ResolveLineExpenseAccountId(
        CimmpleDbContext db,
        int tenantId,
        int? requestedAccountId,
        int defaultExpenseAccountId)
    {
        if (requestedAccountId.HasValue &&
            IsActiveAccountForTenant(db, tenantId, requestedAccountId.Value))
        {
            return requestedAccountId.Value;
        }

        return defaultExpenseAccountId;
    }

    public static int ResolveExpenseFromGlCode(
        CimmpleDbContext db,
        int tenantId,
        string? glCode,
        int defaultExpenseAccountId)
    {
        var code = (glCode ?? "").Trim();
        if (string.IsNullOrWhiteSpace(code))
            return defaultExpenseAccountId;

        if (int.TryParse(code, out var parsedId) &&
            IsActiveAccountForTenant(db, tenantId, parsedId))
        {
            return parsedId;
        }

        var byAccountCode = db.ChartofAccounts
            .AsNoTracking()
            .Where(c => c.Tenantid == tenantId && c.IsActive && c.AccountCode == code)
            .Select(c => (int?)c.AccountID)
            .FirstOrDefault();

        return byAccountCode ?? defaultExpenseAccountId;
    }

    public static int? ResolveBank(CimmpleDbContext db, int tenantId, int? bankId)
    {
        if (bankId.HasValue && bankId.Value > 0)
        {
            var mappedAccountId = db.BankCOAMapping
                .AsNoTracking()
                .Where(m => m.bankid == bankId.Value)
                .Select(m => (int?)m.accountid)
                .FirstOrDefault();

            if (mappedAccountId.HasValue && IsActiveAccountForTenant(db, tenantId, mappedAccountId.Value))
                return mappedAccountId.Value;

            var bank = db.BankMaster
                .AsNoTracking()
                .FirstOrDefault(b => b.Id == bankId.Value && b.TenantId == tenantId);
            if (bank != null && !string.IsNullOrWhiteSpace(bank.coa))
            {
                if (int.TryParse(bank.coa.Trim(), out var parsedAccountId) &&
                    IsActiveAccountForTenant(db, tenantId, parsedAccountId))
                {
                    return parsedAccountId;
                }

                var byCode = db.ChartofAccounts
                    .AsNoTracking()
                    .Where(c => c.Tenantid == tenantId && c.IsActive && c.AccountCode == bank.coa.Trim())
                    .Select(c => (int?)c.AccountID)
                    .FirstOrDefault();
                if (byCode.HasValue)
                    return byCode;
            }
        }

        return FindByKeywords(db, tenantId,
            preferExactName: null,
            typeKeywords: new[] { "bank", "cash" },
            nameKeywords: new[] { "bank", "cash" },
            groupKeywords: new[] { "bank", "cash" });
    }

    private static int? FindByKeywords(
        CimmpleDbContext db,
        int tenantId,
        string? preferExactName,
        string[] typeKeywords,
        string[] nameKeywords,
        string[] groupKeywords)
    {
        var accounts = db.ChartofAccounts
            .AsNoTracking()
            .Where(c => c.Tenantid == tenantId && c.IsActive)
            .Select(c => new
            {
                c.AccountID,
                c.AccountCode,
                Name = c.AccountName ?? "",
                Type = c.AccountType ?? "",
                Group = c.MainGroup ?? ""
            })
            .ToList();

        bool MatchesAny(string value, string[] keywords) =>
            keywords.Any(k => value.Contains(k, StringComparison.OrdinalIgnoreCase));

        var candidates = accounts
            .Where(c =>
                MatchesAny(c.Type, typeKeywords) ||
                MatchesAny(c.Name, nameKeywords) ||
                MatchesAny(c.Group, groupKeywords))
            .Select(c =>
            {
                var rank = 3;
                if (!string.IsNullOrWhiteSpace(preferExactName) &&
                    c.Name.Contains(preferExactName, StringComparison.OrdinalIgnoreCase))
                    rank = 0;
                else if (MatchesAny(c.Type, typeKeywords))
                    rank = 1;
                else if (MatchesAny(c.Name, nameKeywords) || MatchesAny(c.Group, groupKeywords))
                    rank = 2;

                return new { c.AccountID, c.AccountCode, Rank = rank };
            })
            .OrderBy(x => x.Rank)
            .ThenBy(x => x.AccountCode)
            .Select(x => (int?)x.AccountID)
            .FirstOrDefault();

        return candidates;
    }
}
