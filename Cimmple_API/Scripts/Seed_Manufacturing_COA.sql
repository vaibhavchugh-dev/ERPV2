/*
  Manufacturing-style Chart of Accounts seed for dbo.ChartofAccounts.
  Idempotent: inserts only rows where (Tenantid, AccountCode) does not already exist.
  Matches ManufacturingChartOfAccountsSeed.cs — keep both in sync when editing.

  Usage (SSMS / sqlcmd):
    Set @TenantId to your tenant (e.g. 1), then execute the script.
*/
SET NOCOUNT ON;

DECLARE @TenantId INT = 1;

INSERT INTO dbo.ChartofAccounts (
    AccountCode,
    AccountName,
    AccountType,
    IsActive,
    Groupid,
    Subgroupid,
    Subgroupid2,
    Subgroupid3,
    Linegroupid,
    Tenantid,
    MainGroup
)
SELECT v.AccountCode, v.AccountName, v.AccountType, CAST(1 AS bit),
       NULL, NULL, NULL, NULL, NULL,
       @TenantId,
       v.MainGroup
FROM (VALUES
    (N'1000', N'Cash - Operating', N'Asset', N'Current Assets'),
    (N'1010', N'Petty Cash', N'Asset', N'Current Assets'),
    (N'1020', N'Accounts Receivable - Trade', N'Asset', N'Current Assets'),
    (N'1030', N'Allowance for Doubtful Accounts', N'Asset', N'Current Assets'),
    (N'1100', N'Raw Materials Inventory', N'Asset', N'Current Assets'),
    (N'1110', N'Work in Process Inventory', N'Asset', N'Current Assets'),
    (N'1120', N'Finished Goods Inventory', N'Asset', N'Current Assets'),
    (N'1200', N'Prepaid Expenses', N'Asset', N'Current Assets'),
    (N'1210', N'Prepaid Insurance', N'Asset', N'Current Assets'),
    (N'1300', N'Deposits & Other Current Assets', N'Asset', N'Current Assets'),
    (N'1500', N'Machinery & Equipment', N'Asset', N'Fixed Assets'),
    (N'1510', N'Accumulated Depreciation - Machinery', N'Asset', N'Fixed Assets'),
    (N'1520', N'Vehicles & Material Handling', N'Asset', N'Fixed Assets'),
    (N'1530', N'Leasehold Improvements', N'Asset', N'Fixed Assets'),
    (N'1540', N'Office Equipment & IT', N'Asset', N'Fixed Assets'),
    (N'1550', N'Accumulated Depreciation - Other PP&E', N'Asset', N'Fixed Assets'),
    (N'1600', N'Tooling & Fixtures (Capitalized)', N'Asset', N'Fixed Assets'),
    (N'2000', N'Accounts Payable - Trade', N'Liability', N'Current Liabilities'),
    (N'2010', N'Accounts Payable - Other', N'Liability', N'Current Liabilities'),
    (N'2100', N'Accrued Payroll', N'Liability', N'Current Liabilities'),
    (N'2110', N'Payroll Taxes Payable', N'Liability', N'Current Liabilities'),
    (N'2120', N'Accrued Expenses', N'Liability', N'Current Liabilities'),
    (N'2130', N'Sales & Use Tax Payable', N'Liability', N'Current Liabilities'),
    (N'2140', N'Customer Deposits / Deferred Revenue', N'Liability', N'Current Liabilities'),
    (N'2200', N'Notes Payable - Short Term', N'Liability', N'Current Liabilities'),
    (N'2300', N'Current Portion of Long-Term Debt', N'Liability', N'Current Liabilities'),
    (N'2500', N'Long-Term Debt', N'Liability', N'Long-term Liabilities'),
    (N'2600', N'Finance Lease Liability', N'Liability', N'Long-term Liabilities'),
    (N'3000', N'Opening Balance Equity', N'Equity', N'Equity'),
    (N'3010', N'Common Stock', N'Equity', N'Equity'),
    (N'3020', N'Additional Paid-In Capital', N'Equity', N'Equity'),
    (N'3030', N'Retained Earnings', N'Equity', N'Equity'),
    (N'3040', N'Distributions / Dividends', N'Equity', N'Equity'),
    (N'4000', N'Sales - Manufactured Products', N'Revenue', N'Operating Revenue'),
    (N'4010', N'Sales - Services / Jobbing', N'Revenue', N'Operating Revenue'),
    (N'4020', N'Scrap, Rework & Other Operating Income', N'Revenue', N'Operating Revenue'),
    (N'4030', N'Sales Discounts & Allowances', N'Revenue', N'Operating Revenue'),
    (N'5000', N'Direct Materials', N'Expense', N'Cost of Goods Sold'),
    (N'5010', N'Direct Labor - Production', N'Expense', N'Cost of Goods Sold'),
    (N'5020', N'Production Overhead Applied', N'Expense', N'Cost of Goods Sold'),
    (N'5030', N'Subcontract / Outside Processing', N'Expense', N'Cost of Goods Sold'),
    (N'5040', N'Freight-In (Inventory)', N'Expense', N'Cost of Goods Sold'),
    (N'5050', N'Inventory Shrinkage & Obsolescence', N'Expense', N'Cost of Goods Sold'),
    (N'6000', N'Indirect Materials - Shop', N'Expense', N'Manufacturing Overhead'),
    (N'6010', N'Production Supervision Salaries', N'Expense', N'Manufacturing Overhead'),
    (N'6020', N'Equipment Maintenance - Production', N'Expense', N'Manufacturing Overhead'),
    (N'6030', N'Utilities - Manufacturing', N'Expense', N'Manufacturing Overhead'),
    (N'6040', N'Depreciation - Production Equipment', N'Expense', N'Manufacturing Overhead'),
    (N'6050', N'Quality Control & Inspection', N'Expense', N'Manufacturing Overhead'),
    (N'6060', N'Shop Supplies - Production', N'Expense', N'Manufacturing Overhead'),
    (N'6100', N'Rent - Warehouse & Production', N'Expense', N'Operating Expenses'),
    (N'6200', N'Salaries - Sales & Administration', N'Expense', N'Operating Expenses'),
    (N'6210', N'Employee Benefits - SG&A', N'Expense', N'Operating Expenses'),
    (N'6300', N'Professional Fees', N'Expense', N'Operating Expenses'),
    (N'6310', N'Insurance - General', N'Expense', N'Operating Expenses'),
    (N'6400', N'Office Supplies', N'Expense', N'Operating Expenses'),
    (N'6500', N'Shipping & Freight Out', N'Expense', N'Operating Expenses'),
    (N'6600', N'Marketing & Advertising', N'Expense', N'Operating Expenses'),
    (N'6700', N'Travel & Entertainment', N'Expense', N'Operating Expenses'),
    (N'6800', N'Bank & Merchant Fees', N'Expense', N'Operating Expenses'),
    (N'7000', N'R&D - Materials & Supplies', N'Expense', N'Research & Development'),
    (N'7010', N'R&D - Labor', N'Expense', N'Research & Development'),
    (N'7020', N'R&D - Outside Services', N'Expense', N'Research & Development'),
    (N'8000', N'Interest Expense', N'Expense', N'Other Expense'),
    (N'8010', N'Interest Income', N'Revenue', N'Other Income'),
    (N'8020', N'Gain/Loss on Disposal of Assets', N'Revenue', N'Other Income')
) AS v(AccountCode, AccountName, AccountType, MainGroup)
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.ChartofAccounts c
    WHERE c.Tenantid = @TenantId
      AND c.AccountCode = v.AccountCode
);

PRINT CONCAT('Manufacturing COA seed finished for TenantId=', @TenantId, '. Rows inserted: ', @@ROWCOUNT);
