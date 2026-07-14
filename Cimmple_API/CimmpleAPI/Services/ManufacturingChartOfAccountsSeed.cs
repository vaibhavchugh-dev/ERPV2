using CimmpleAPI.Data;
using CimmpleAPI.Data.Models;

namespace CimmpleAPI.Services;

/// <summary>
/// Idempotent seed: adds typical manufacturing / job-shop style chart-of-accounts rows
/// for a tenant when that account code is not already present.
/// </summary>
public static class ManufacturingChartOfAccountsSeed
{
    private sealed record SeedRow(string Code, string Name, string AccountType, string MainGroup);

    /// <summary>
    /// 4-digit style codes: 1xxx current assets, 15xx fixed assets, 2xxx payables & accruals,
    /// 3xxx equity, 4xxx revenue, 5xxx COGS, 6xxx shop & SG&A, 7xxx R&amp;D, 8xxx other.
    /// </summary>
    private static readonly SeedRow[] Rows =
    {
        new("1000", "Cash - Operating", "Asset", "Current Assets"),
        new("1010", "Petty Cash", "Asset", "Current Assets"),
        new("1020", "Accounts Receivable - Trade", "Asset", "Current Assets"),
        new("1030", "Allowance for Doubtful Accounts", "Asset", "Current Assets"),
        new("1100", "Raw Materials Inventory", "Asset", "Current Assets"),
        new("1110", "Work in Process Inventory", "Asset", "Current Assets"),
        new("1120", "Finished Goods Inventory", "Asset", "Current Assets"),
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
        new("2120", "Accrued Expenses", "Liability", "Current Liabilities"),
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
        var seedCodes = Rows.Select(r => r.Code).ToArray();
        var existingCodes = db.ChartofAccounts
            .Where(a => a.Tenantid == tenantId && seedCodes.Contains(a.AccountCode))
            .Select(a => a.AccountCode)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var inserted = 0;
        foreach (var row in Rows)
        {
            if (existingCodes.Contains(row.Code))
                continue;

            db.ChartofAccounts.Add(new ChartofAccounts
            {
                AccountCode = row.Code,
                AccountName = row.Name,
                AccountType = row.AccountType,
                IsActive = true,
                Tenantid = tenantId,
                MainGroup = row.MainGroup
            });
            existingCodes.Add(row.Code);
            inserted++;
        }

        if (inserted > 0)
            db.SaveChanges();

        var skipped = Rows.Length - inserted;
        return (inserted, skipped);
    }
}
