-- Add COA column to CreditCardMaster if missing.
-- Live ERP tables use CimmpleFlow schema (not dbo).

IF COL_LENGTH('CimmpleFlow.CreditCardMaster', 'COA') IS NULL
BEGIN
    ALTER TABLE CimmpleFlow.CreditCardMaster
    ADD COA nvarchar(100) NULL;
    PRINT 'COA column added to CimmpleFlow.CreditCardMaster';
END
ELSE
BEGIN
    PRINT 'COA column already exists on CimmpleFlow.CreditCardMaster';
END
GO

IF OBJECT_ID(N'dbo.CreditCardMaster', N'U') IS NOT NULL
   AND COL_LENGTH('dbo.CreditCardMaster', 'COA') IS NULL
BEGIN
    ALTER TABLE dbo.CreditCardMaster
    ADD COA nvarchar(100) NULL;
    PRINT 'COA column added to dbo.CreditCardMaster';
END
GO
