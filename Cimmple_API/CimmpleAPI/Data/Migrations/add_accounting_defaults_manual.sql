-- Manual apply if EF migrations are not run against this database.
USE ERPv2Db
IF OBJECT_ID(N'dbo.AccountingDefaults', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AccountingDefaults
    (
        Id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AccountingDefaults PRIMARY KEY,
        TenantId INT NOT NULL,
        CompanyName NVARCHAR(200) NOT NULL CONSTRAINT DF_AccountingDefaults_CompanyName DEFAULT (N'Cimmple Corp'),
        FiscalYearStart NVARCHAR(10) NOT NULL CONSTRAINT DF_AccountingDefaults_FiscalYearStart DEFAULT (N'01-01'),
        DefaultCurrency NVARCHAR(10) NOT NULL CONSTRAINT DF_AccountingDefaults_DefaultCurrency DEFAULT (N'USD'),
        TaxRate DECIMAL(18,2) NOT NULL CONSTRAINT DF_AccountingDefaults_TaxRate DEFAULT (8.25),
        DefaultAccountsReceivableAccountId INT NULL,
        DefaultAccountsPayableAccountId INT NULL,
        DefaultRevenueAccountId INT NULL,
        DefaultExpenseAccountId INT NULL,
        DefaultInventoryAccountId INT NULL,
        DefaultSalesTaxPayableAccountId INT NULL,
        DefaultInputTaxAccountId INT NULL,
        CreatedDate DATETIME2 NULL,
        UpdatedDate DATETIME2 NULL
    );

    CREATE UNIQUE INDEX IX_AccountingDefaults_TenantId ON dbo.AccountingDefaults (TenantId);
END
GO

IF COL_LENGTH('dbo.VendorCOAMapping', 'expenseAccountId') IS NULL
BEGIN
    ALTER TABLE dbo.VendorCOAMapping ADD expenseAccountId INT NULL;
END
GO
