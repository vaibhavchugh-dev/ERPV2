using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services;

/// <summary>
/// Canonical Chart of Accounts for Cimmple. Idempotent: inserts manufacturing / job-shop
/// accounts for a tenant when that account code is not already present.
/// Existing tenant rows (including legacy codes) are never deleted or overwritten.
/// </summary>
public static class ManufacturingChartOfAccountsSeed
{
    private sealed record SeedRow(string Code, string Name, string AccountType, string MainGroup);

    /// <summary>
    /// 4-digit style codes: 1xxx current assets, 15xx fixed assets, 2xxx payables &amp; accruals,
    /// 3xxx equity, 4xxx revenue, 5xxx COGS, 6xxx shop &amp; SG&amp;A, 7xxx R&amp;D, 8xxx other.
    /// </summary>
    private static readonly SeedRow[] Rows =
    {
        new("1000", "Cash - Operating", "Asset", "Current Assets"),
        new("1005", "Cash in Bank - Operating", "Asset", "Current Assets"),
        new("1010", "Petty Cash", "Asset", "Current Assets"),
        new("1020", "Accounts Receivable - Trade", "Asset", "Current Assets"),
        new("1030", "Allowance for Doubtful Accounts", "Asset", "Current Assets"),
        new("1100", "Raw Materials Inventory", "Asset", "Current Assets"),
        new("1110", "Work in Process Inventory", "Asset", "Current Assets"),
        new("1120", "Finished Goods Inventory", "Asset", "Current Assets"),
        new("1140", "Input Tax Recoverable", "Asset", "Current Assets"),
        new("1200", "Prepaid Expenses", "Asset", "Current Assets"),
        new("1210", "Prepaid Insurance", "Asset", "Current Assets"),
        new("1300", "Deposits & Other Current Assets", "Asset", "Current Assets"),
        new("1500", "Machinery & Equipment", "Asset", "Fixed Assets"),
        new("1510", "Accumulated Depreciation - Machinery", "Asset", "Fixed Assets"),
        new("1520", "Vehicles & Material Handling", "Asset", "Fixed Assets"),
        new("1530", "Leasehold Improvements", "Asset", "Fixed Assets"),
        new("1540", "Office Equipment & IT", "Asset", "Fixed Assets"),
        new("1550", "Accumulated Depreciation - Other PP&E", "Asset", "Fixed Assets"),
        new("1600", "Tooling & Fixtures (Capitalized)", "Asset", "Fixed Assets"),
        new("2000", "Accounts Payable - Trade", "Liability", "Current Liabilities"),
        new("2010", "Accounts Payable - Other", "Liability", "Current Liabilities"),
        new("2100", "Accrued Payroll", "Liability", "Current Liabilities"),
        new("2110", "Payroll Taxes Payable", "Liability", "Current Liabilities"),
        new("2111", "Federal Income Tax Withheld Payable", "Liability", "Current Liabilities"),
        new("2112", "State Income Tax Withheld Payable", "Liability", "Current Liabilities"),
        new("2113", "Local Tax Withheld Payable", "Liability", "Current Liabilities"),
        new("2114", "Employee Social Security Payable", "Liability", "Current Liabilities"),
        new("2115", "Employee Medicare Payable", "Liability", "Current Liabilities"),
        new("2116", "Employer Payroll Taxes Payable", "Liability", "Current Liabilities"),
        new("2117", "Pre-Tax Deductions Payable", "Liability", "Current Liabilities"),
        new("2118", "Retirement Contributions Payable", "Liability", "Current Liabilities"),
        new("2119", "Post-Tax Deductions Payable", "Liability", "Current Liabilities"),
        new("2120", "Accrued Expenses", "Liability", "Current Liabilities"),
        new("2121", "Garnishments Payable", "Liability", "Current Liabilities"),
        new("2130", "Sales & Use Tax Payable", "Liability", "Current Liabilities"),
        new("2140", "Customer Deposits / Deferred Revenue", "Liability", "Current Liabilities"),
        new("2200", "Notes Payable - Short Term", "Liability", "Current Liabilities"),
        new("2300", "Current Portion of Long-Term Debt", "Liability", "Current Liabilities"),
        new("2500", "Long-Term Debt", "Liability", "Long-term Liabilities"),
        new("2600", "Finance Lease Liability", "Liability", "Long-term Liabilities"),
        new("3000", "Opening Balance Equity", "Equity", "Equity"),
        new("3010", "Common Stock", "Equity", "Equity"),
        new("3020", "Additional Paid-In Capital", "Equity", "Equity"),
        new("3030", "Retained Earnings", "Equity", "Equity"),
        new("3040", "Distributions / Dividends", "Equity", "Equity"),
        new("4000", "Sales - Manufactured Products", "Revenue", "Operating Revenue"),
        new("4010", "Sales - Services / Jobbing", "Revenue", "Operating Revenue"),
        new("4020", "Scrap, Rework & Other Operating Income", "Revenue", "Operating Revenue"),
        new("4030", "Sales Discounts & Allowances", "Revenue", "Operating Revenue"),
        new("4050", "Shipping / Freight Income", "Revenue", "Operating Revenue"),
        new("4060", "Other Charges Income", "Revenue", "Operating Revenue"),
        new("5000", "Direct Materials", "Expense", "Cost of Goods Sold"),
        new("5010", "Direct Labor - Production", "Expense", "Cost of Goods Sold"),
        new("5020", "Production Overhead Applied", "Expense", "Cost of Goods Sold"),
        new("5030", "Subcontract / Outside Processing", "Expense", "Cost of Goods Sold"),
        new("5040", "Freight-In (Inventory)", "Expense", "Cost of Goods Sold"),
        new("5050", "Inventory Shrinkage & Obsolescence", "Expense", "Cost of Goods Sold"),
        new("6000", "Indirect Materials - Shop", "Expense", "Manufacturing Overhead"),
        new("6010", "Production Supervision Salaries", "Expense", "Manufacturing Overhead"),
        new("6020", "Equipment Maintenance - Production", "Expense", "Manufacturing Overhead"),
        new("6030", "Utilities - Manufacturing", "Expense", "Manufacturing Overhead"),
        new("6040", "Depreciation - Production Equipment", "Expense", "Manufacturing Overhead"),
        new("6050", "Quality Control & Inspection", "Expense", "Manufacturing Overhead"),
        new("6060", "Shop Supplies - Production", "Expense", "Manufacturing Overhead"),
        new("6100", "Rent - Warehouse & Production", "Expense", "Operating Expenses"),
        new("6200", "Salaries - Sales & Administration", "Expense", "Operating Expenses"),
        new("6210", "Employee Benefits - SG&A", "Expense", "Operating Expenses"),
        new("6220", "Employer Payroll Taxes Expense", "Expense", "Operating Expenses"),
        new("6300", "Professional Fees", "Expense", "Operating Expenses"),
        new("6310", "Insurance - General", "Expense", "Operating Expenses"),
        new("6400", "Office Supplies", "Expense", "Operating Expenses"),
        new("6500", "Shipping & Freight Out", "Expense", "Operating Expenses"),
        new("6600", "Marketing & Advertising", "Expense", "Operating Expenses"),
        new("6700", "Travel & Entertainment", "Expense", "Operating Expenses"),
        new("6800", "Bank & Merchant Fees", "Expense", "Operating Expenses"),
        new("7000", "R&D - Materials & Supplies", "Expense", "Research & Development"),
        new("7010", "R&D - Labor", "Expense", "Research & Development"),
        new("7020", "R&D - Outside Services", "Expense", "Research & Development"),
        new("8000", "Interest Expense", "Expense", "Other Expense"),
        new("8010", "Interest Income", "Revenue", "Other Income"),
        new("8020", "Gain/Loss on Disposal of Assets", "Revenue", "Other Income"),
    };

    /// <returns>Counts of newly inserted rows and rows skipped because the code already exists.</returns>
    public static (int Inserted, int Skipped) Apply(CimmpleDbContext db, int tenantId)
    {
        var groupIds = EnsureMainGroups(db, tenantId);

        var seedCodes = Rows.Select(r => r.Code).ToArray();
        var existingByCode = new Dictionary<string, ChartofAccounts>(StringComparer.OrdinalIgnoreCase);
        foreach (var account in db.ChartofAccounts.Where(a => a.Tenantid == tenantId && seedCodes.Contains(a.AccountCode)))
        {
            if (!existingByCode.ContainsKey(account.AccountCode))
                existingByCode[account.AccountCode] = account;
        }

        var inserted = 0;
        var linked = false;
        foreach (var row in Rows)
        {
            groupIds.TryGetValue(row.MainGroup, out var groupId);

            if (existingByCode.TryGetValue(row.Code, out var account))
            {
                if (groupId > 0
                    && (account.Groupid is null or 0)
                    && (string.IsNullOrWhiteSpace(account.MainGroup)
                        || string.Equals(account.MainGroup.Trim(), row.MainGroup, StringComparison.OrdinalIgnoreCase)))
                {
                    account.Groupid = groupId;
                    if (string.IsNullOrWhiteSpace(account.MainGroup))
                        account.MainGroup = row.MainGroup;
                    linked = true;
                }
                continue;
            }

            db.ChartofAccounts.Add(new ChartofAccounts
            {
                AccountCode = row.Code,
                AccountName = row.Name,
                AccountType = row.AccountType,
                IsActive = true,
                Tenantid = tenantId,
                MainGroup = row.MainGroup,
                Groupid = groupId > 0 ? groupId : null
            });
            inserted++;
        }

        if (inserted > 0 || linked || db.ChangeTracker.HasChanges())
            db.SaveChanges();

        var skipped = Rows.Length - inserted;
        return (inserted, skipped);
    }

    /// <summary>
    /// One MainGroup row per distinct seed group name. Returns MainGroup name → MainGroupID.
    /// MainGroupID is allocated per tenant, matching ChartofAccountsController.SaveMainGroup.
    /// </summary>
    private static Dictionary<string, int> EnsureMainGroups(CimmpleDbContext db, int tenantId)
    {
        var names = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in Rows)
        {
            if (seen.Add(row.MainGroup))
                names.Add(row.MainGroup);
        }

        var existing = db.MainGroup.Where(m => m.tenantid == tenantId).ToList();
        var byName = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var group in existing)
        {
            var name = group.MainGroupName?.Trim();
            if (!string.IsNullOrEmpty(name) && !byName.ContainsKey(name))
                byName[name] = group.MainGroupID;
        }

        var maxId = existing.Count == 0 ? 0 : existing.Max(m => m.MainGroupID);
        foreach (var name in names)
        {
            if (byName.ContainsKey(name))
                continue;

            maxId++;
            db.MainGroup.Add(new MainGroup
            {
                MainGroupID = maxId,
                MainGroupName = name,
                accountId = 0,
                tenantid = tenantId
            });
            byName[name] = maxId;
        }

        return byName;
    }
}
