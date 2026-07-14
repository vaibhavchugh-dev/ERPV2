-- Migration script to add apartment and country columns to BankMaster table
-- Run this script against your database to add these columns
-- These columns exist in CustomerMaster but were missing from BankMaster

-- Check if columns don't exist before adding them
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[BankMaster]') AND name = 'apartment')
BEGIN
    ALTER TABLE [BankMaster] ADD [apartment] nvarchar(max) NULL;
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[BankMaster]') AND name = 'country')
BEGIN
    ALTER TABLE [BankMaster] ADD [country] nvarchar(max) NULL;
    -- Set default value for existing rows
    UPDATE [BankMaster] SET [country] = 'US' WHERE [country] IS NULL;
END

