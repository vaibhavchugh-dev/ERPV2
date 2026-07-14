-- Simple SQL script to add apartment and country columns to BankMaster table
-- Run this in SQL Server Management Studio against your database
-- Run each statement separately (one at a time)

-- Step 1: Add apartment column
ALTER TABLE [BankMaster] ADD [apartment] nvarchar(max) NULL;
GO

-- Step 2: Add country column
ALTER TABLE [BankMaster] ADD [country] nvarchar(max) NULL;
GO

-- Step 3: Set default value for existing rows (run this AFTER the columns are added)
UPDATE [BankMaster] SET [country] = 'US' WHERE [country] IS NULL;
GO

