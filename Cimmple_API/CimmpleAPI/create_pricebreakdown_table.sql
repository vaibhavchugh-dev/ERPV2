-- SQL Script to create PriceBreakdownMaster table
-- Run this script directly in your SQL Server database if the migration didn't work

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PriceBreakdownMaster]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[PriceBreakdownMaster] (
        [Id] int IDENTITY(1,1) NOT NULL,
        [ItemName] nvarchar(max) NOT NULL,
        [Srno] int NOT NULL,
        [Status] int NOT NULL,
        [Tenantid] int NOT NULL,
        CONSTRAINT [PK_PriceBreakdownMaster] PRIMARY KEY ([Id])
    );
END
GO

