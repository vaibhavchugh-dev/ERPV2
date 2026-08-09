-- Manual apply if EF migrations are not run against this database.
USE ERPv2Db
IF COL_LENGTH('dbo.AccountingDefaults', 'DefaultFreightOutAccountId') IS NULL
BEGIN
    ALTER TABLE dbo.AccountingDefaults ADD DefaultFreightOutAccountId INT NULL;
END
GO

IF COL_LENGTH('dbo.AccountingDefaults', 'DefaultOtherChargeAccountId') IS NULL
BEGIN
    ALTER TABLE dbo.AccountingDefaults ADD DefaultOtherChargeAccountId INT NULL;
END
GO

IF COL_LENGTH('dbo.AccountingDefaults', 'DefaultFreightInAccountId') IS NULL
BEGIN
    ALTER TABLE dbo.AccountingDefaults ADD DefaultFreightInAccountId INT NULL;
END
GO

IF COL_LENGTH('dbo.VendorInvoiceMaster', 'FreightCharge') IS NULL
BEGIN
    ALTER TABLE dbo.VendorInvoiceMaster ADD FreightCharge DECIMAL(18,2) NOT NULL CONSTRAINT DF_VendorInvoiceMaster_FreightCharge DEFAULT (0);
END
GO
